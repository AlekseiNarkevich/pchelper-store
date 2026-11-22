/**
 * PCHelper — письма о заказах.
 *
 * Если SMTP настроен, письмо уходит покупателю. Если нет, оно всё равно
 * сохраняется в таблице «Письма» со статусом «не отправлено», чтобы факт
 * уведомления не потерялся. Ошибка почты не отменяет заказ.
 */

import nodemailer from 'nodemailer';
import tls from 'node:tls';

import { isDatabaseConnected, supabase } from './supabase.service.js';

/**
 * Сертификаты для проверки TLS.
 *
 * Антивирусы (Avast, Kaspersky) подменяют сертификат SMTP своим,
 * и Node не доверяет ему: в журнале появляется «self-signed certificate
 * in certificate chain». Поэтому к встроенным сертификатам добавляем
 * системные — в них есть корневой сертификат антивируса.
 *
 * @returns {string[]|undefined}
 */
function trustedCertificates() {
  try {
    const bundled = tls.getCACertificates('bundled') || [];
    const system = tls.getCACertificates('system') || [];
    const merged = [...new Set([...bundled, ...system])];
    return merged.length ? merged : undefined;
  } catch {
    // Старая версия Node: остаются встроенные сертификаты.
    return undefined;
  }
}

/** Признак настроенного SMTP. */
function smtpConfigured() {
  if (!process.env.SMTP_HOST || !process.env.SMTP_PORT) return false;
  // Gmail принимает только пароль приложения. Если логин указан,
  // без пароля отправка всё равно не пройдёт — считаем почту не настроенной.
  if (process.env.SMTP_USER && !process.env.SMTP_PASS) return false;
  return true;
}

/**
 * Настроена ли отправка писем. Нужно админке, чтобы показать статус.
 *
 * @returns {boolean}
 */
export function mailConfigured() {
  return smtpConfigured();
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
            // Gmail показывает пароль приложения с пробелами —
            // для входа они не нужны.
            pass: String(process.env.SMTP_PASS || '').replace(/\s+/g, ''),
          }
        : undefined,
    tls: { ca: trustedCertificates() },
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
    lines.push('Получение: самовывоз, г. Минск, пер. Корженевского, 6, пом. 1');
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

  // Демонстрационные адреса (pchelper.by, example.com, *.local) —
  // не настоящие ящики: Gmail принимает письмо, а потом возвращает bounce.
  // Такие письма только пишем в журнал с понятной причиной.
  const isTestAddress =
    /@pchelper\.by$/i.test(String(to || '').trim()) ||
    /@example\.(com|org|net)$/i.test(String(to || '').trim()) ||
    /\.(local|test|invalid)$/i.test(String(to || '').trim());
  if (isTestAddress) {
    await logEmail({
      orderId,
      to,
      subject,
      text,
      sent: false,
      error: 'Тестовый адрес: реальная отправка не выполняется',
    });
    return { sent: false, error: 'Тестовый адрес: реальная отправка не выполняется' };
  }

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
 * Отправляет готовое письмо и пишет его в журнал.
 *
 * Используется повторной отправкой и проверкой SMTP из админки.
 *
 * @param {{to: string, subject: string, text: string, orderId?: string|null}} data Письмо.
 * @returns {Promise<{sent: boolean, error: string}>}
 */
export async function sendRawEmail({ to, subject, text, orderId = null }) {
  return await deliver({ to, subject, text, orderId });
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
