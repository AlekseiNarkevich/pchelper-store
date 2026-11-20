/**
 * PCHelper — письма о заказах.
 *
 * Если SMTP настроен, письмо уходит покупателю. Если нет, оно всё равно
 * сохраняется в таблице «Письма» со статусом «не отправлено», чтобы факт
 * уведомления не потерялся. Ошибка почты не отменяет заказ.
 */

import nodemailer from 'nodemailer';

import { isDatabaseConnected, supabase } from './supabase.service.js';

/** Признак настроенного SMTP. */
function smtpConfigured() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_PORT);
}

/**
 * Создаёт транспорт nodemailer.
 *
 * @returns {object}
 */
function createTransport() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: Number(process.env.SMTP_PORT) === 465,
    auth:
      process.env.SMTP_USER || process.env.SMTP_PASS
        ? {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS,
          }
        : undefined,
  });
}

/**
 * Сохраняет письмо в журнал.
 *
 * @param {object} data Данные письма.
 * @returns {Promise<void>}
 */
async function logEmail(data) {
  if (!isDatabaseConnected()) return;
  try {
    await supabase.from('Письма').insert({
      заказ_id: Number(data.orderId),
      email: data.to,
      тема: data.subject,
      текст: data.text,
      отправлено: data.sent,
      ошибка: data.error || null,
    });
  } catch (error) {
    console.error('[mail] журнал писем:', error?.message || error);
  }
}

/**
 * Формирует текст письма о заказе.
 *
 * @param {object} order Заказ.
 * @returns {string}
 */
function orderText(order) {
  const lines = [
    'Здравствуйте!',
    '',
    `Заказ ${order.number} оформлен и принят в обработку.`,
    '',
    'Состав заказа:',
    ...order.items.map(
      (item) => `  ${item.name} × ${item.qty} — ${item.price * item.qty} BYN`,
    ),
    '',
    `Товары: ${order.itemsTotal} BYN`,
    `Доставка: ${order.deliveryCost === 0 ? 'бесплатно' : `${order.deliveryCost} BYN`}`,
  ];

  if (order.deliveryMethod === 'pickup') {
    lines.push('Получение: самовывоз, Г. Минск, пер. Корженевского, 6, пом. 1');
  } else {
    lines.push(
      `Адрес: ${order.address || 'уточнит менеджер'}`,
      order.deliveryZone === 'outside'
        ? `Зона: за МКАД, ${order.distanceKm} км`
        : 'Зона: в пределах МКАД',
    );
  }

  lines.push(
    `Итого: ${order.total} BYN`,
    '',
    'Статус заказа можно посмотреть в личном кабинете.',
    '',
    'PCHelper',
  );
  return lines.join('\n');
}

/**
 * Отправляет подтверждение заказа.
 *
 * @param {{to: string, order: object}} data Получатель и заказ.
 * @returns {Promise<void>}
 */
export async function sendOrderConfirmation({ to, order }) {
  const subject = `PCHelper: заказ ${order.number} оформлен`;
  const text = orderText(order);
  let sent = false;
  let error = '';

  if (smtpConfigured()) {
    try {
      await createTransport().sendMail({
        from: process.env.SMTP_FROM || process.env.SMTP_USER,
        to,
        subject,
        text,
      });
      sent = true;
    } catch (reason) {
      error = reason.message;
      console.error('[mail] отправка:', reason.message);
    }
  } else {
    error = 'SMTP не настроен';
  }

  await logEmail({
    orderId: order.id,
    to,
    subject,
    text,
    sent,
    error,
  });
}
