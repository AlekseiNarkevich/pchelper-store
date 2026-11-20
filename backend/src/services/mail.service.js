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
      заказ_id: data.orderId ? Number(data.orderId) : null,
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
 * Отправляет письмо и пишет его в журнал.
 *
 * @param {{to: string, subject: string, text: string, orderId: string}} data Письмо.
 * @returns {Promise<void>}
 */
async function deliver({ to, subject, text, orderId }) {
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

  await logEmail({ orderId, to, subject, text, sent, error });
  return { sent, error };
}

/**
 * Отправляет подтверждение заказа.
 *
 * @param {{to: string, order: object}} data Получатель и заказ.
 * @returns {Promise<void>}
 */
export async function sendOrderConfirmation({ to, order }) {
  await deliver({
    to,
    orderId: order.id,
    subject: `PCHelper: заказ ${order.number} оформлен`,
    text: orderText(order),
  });
}

/**
 * Отправляет письмо о смене статуса заказа.
 *
 * @param {{to: string, order: object, status: string, comment?: string}} data Данные.
 * @returns {Promise<void>}
 */
export async function sendOrderStatusEmail({ to, order, status, comment }) {
  const text = [
    'Здравствуйте!',
    '',
    `Статус заказа ${order.number} изменён: ${status}.`,
    comment ? `Комментарий менеджера: ${comment}` : '',
    '',
    `Сумма заказа: ${order.total} BYN`,
    '',
    'Подробности — в личном кабинете.',
    '',
    'PCHelper',
  ].join('\n');

  await deliver({
    to,
    orderId: order.id,
    subject: `PCHelper: заказ ${order.number} — ${status}`,
    text,
  });
}

/**
 * Сообщает покупателю, что товар снова появился на складе.
 *
 * @param {{to: string, product: object}} data Получатель и товар.
 * @returns {Promise<{sent: boolean, error: string}>}
 */
export async function sendRestockEmail({ to, product }) {
  const text = [
    'Здравствуйте!',
    '',
    `Товар «${product.name}» снова появился на складе.`,
    `Цена: ${product.price} BYN.`,
    '',
    'Заказ можно оформить на сайте PCHelper.',
    '',
    'PCHelper',
  ].join('\n');

  return await deliver({
    to,
    orderId: null,
    subject: `PCHelper: «${product.name}» снова в наличии`,
    text,
  });
}
