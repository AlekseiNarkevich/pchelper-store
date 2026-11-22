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

/** Адрес поддержки во всех письмах об аккаунте. */
const SUPPORT_EMAIL = 'pchelper.shop@gmail.com';

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
 * Переводит частые ошибки SMTP на русский.
 *
 * Технический текст остаётся в консоли сервера, а в журнале админки
 * пользователь видит понятную причину, а не английское сообщение Node.
 *
 * @param {string} message Ошибка nodemailer.
 * @returns {string}
 */
function humanizeMailError(message) {
  const text = String(message || '');
  if (/self[- ]signed certificate|certificate in certificate chain/i.test(text)) {
    return 'Ошибка TLS: самоподписанный сертификат в цепочке. Проверьте антивирус или настройки SMTP.';
  }
  if (/certificate/i.test(text)) {
    return 'Ошибка сертификата TLS при подключении к серверу SMTP.';
  }
  if (/invalid login|username and password not accepted|badcredentials/i.test(text)) {
    return 'Сервер SMTP отклонил логин или пароль приложения.';
  }
  if (/etimedout|timeout|timed out/i.test(text)) {
    return 'Сервер SMTP не ответил вовремя. Попробуйте отправить письмо ещё раз.';
  }
  if (/enotfound|eai_again|getaddrinfo/i.test(text)) {
    return 'Не удалось найти сервер SMTP. Проверьте адрес в настройках.';
  }
  if (/econnection|econnrefused|esocket|connection/i.test(text)) {
    return 'Не удалось подключиться к серверу SMTP. Проверьте сеть и порт.';
  }
  return 'Не удалось отправить письмо. Подробности записаны в журнал сервера.';
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
      error = humanizeMailError(reason.message);
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
  return await deliver({
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
  const instructions = [];
  if (status === 'Готов к выдаче') {
    instructions.push(
      'Заказ ждёт вас в пункте выдачи: г. Минск, пер. Корженевского, 6, пом. 1.',
      'Если товар получен и всё в порядке, зайдите в личный кабинет → «Мои заказы» и нажмите «Всё устраивает, товар получен». Заказ станет «Завершён».',
      'Если товар не подошёл или вы решили отказаться, там же нажмите «Отказаться от получения» и укажите причину. Заказ будет отменён, товар вернётся на склад.',
    );
  } else if (status === 'Доставлен') {
    instructions.push(
      'Курьер передал заказ. Если всё в порядке, подтвердите получение в личном кабинете → «Мои заказы». Заказ станет «Завершён».',
      'Если товар не подошёл, нажмите там же «Отказаться от получения» и укажите причину. Заказ будет отменён, товар вернётся на склад.',
    );
  } else if (status === 'Завершён') {
    instructions.push('Спасибо, что забрали заказ. Будем рады видеть вас снова.');
  }

  const text = [
    'Здравствуйте!',
    '',
    `Статус заказа ${order.number} изменён: ${status}.`,
    comment ? `Комментарий менеджера: ${comment}` : '',
    '',
    `Сумма заказа: ${order.total} BYN`,
    '',
    ...instructions,
    instructions.length ? '' : 'Подробности — в личном кабинете.',
    'PCHelper',
  ].join('\n');

  return await deliver({
    to,
    orderId: order.id,
    subject: `PCHelper: заказ ${order.number} — ${status}`,
    text,
  });
}

/**
 * Сообщает магазину об отказе покупателя от заказа.
 *
 * Письмо уходит на адрес поддержки, чтобы администратор увидел отказ
 * не только в панели, но и на почте.
 *
 * @param {{order: object, reason: string, customerEmail: string}} data Данные.
 * @returns {Promise<void>}
 */
export async function sendOrderRefusedNotice({ order, reason, customerEmail }) {
  const text = [
    'Покупатель отказался от получения заказа.',
    '',
    `Заказ: ${order.number}`,
    `Сумма: ${order.total} BYN`,
    `Покупатель: ${customerEmail}`,
    `Причина: ${reason}`,
    '',
    'Заказ переведён в «Отменён», товар возвращён на склад.',
    '',
    'PCHelper',
  ].join('\n');

  return await deliver({
    to: SUPPORT_EMAIL,
    orderId: order.id,
    subject: `PCHelper: отказ от заказа ${order.number}`,
    text,
  });
}

/**
 * Сообщает о блокировке аккаунта.
 *
 * @param {{to: string, name?: string, reason: string}} data Данные.
 * @returns {Promise<void>}
 */
export async function sendAccountBlockedEmail({ to, name, reason }) {
  const text = [
    name ? `Здравствуйте, ${name}!` : 'Здравствуйте!',
    '',
    'Ваш аккаунт в PCHelper заблокирован.',
    `Причина: ${reason || 'Нарушение правил магазина'}.`,
    '',
    'Вход в аккаунт временно невозможен.',
    `Если считаете блокировку ошибкой, напишите в поддержку: ${SUPPORT_EMAIL}.`,
    '',
    'PCHelper',
  ].join('\n');

  return await deliver({ to, subject: 'PCHelper: аккаунт заблокирован', text });
}

/**
 * Сообщает о разблокировке аккаунта.
 *
 * @param {{to: string, name?: string, comment?: string}} data Данные.
 * @returns {Promise<void>}
 */
export async function sendAccountUnblockedEmail({ to, name, comment }) {
  const text = [
    name ? `Здравствуйте, ${name}!` : 'Здравствуйте!',
    '',
    'Ваш аккаунт в PCHelper снова активен — вход разрешён.',
    comment ? `Комментарий администратора: ${comment}` : '',
    '',
    'PCHelper',
  ].join('\n');

  return await deliver({ to, subject: 'PCHelper: аккаунт разблокирован', text });
}

/**
 * Сообщает об удалении аккаунта.
 *
 * Письмо отправляется до обезличивания записи, поэтому адрес ещё известен.
 *
 * @param {{to: string, name?: string, reason: string}} data Данные.
 * @returns {Promise<void>}
 */
export async function sendAccountDeletedEmail({ to, name, reason }) {
  const text = [
    name ? `Здравствуйте, ${name}!` : 'Здравствуйте!',
    '',
    'Ваш аккаунт в PCHelper удалён.',
    `Причина: ${reason || 'Решение администрации'}.`,
    '',
    'Вход в этот аккаунт невозможен.',
    `Если это ошибка, напишите в поддержку: ${SUPPORT_EMAIL}.`,
    '',
    'PCHelper',
  ].join('\n');

  return await deliver({ to, subject: 'PCHelper: аккаунт удалён', text });
}

/** Русские названия ролей для писем. */
const ROLE_LABELS = {
  customer: 'Покупатель',
  manager: 'Менеджер',
  admin: 'Администратор',
};

/**
 * Сообщает о смене роли аккаунта.
 *
 * @param {{to: string, name?: string, role: string, comment?: string}} data Данные.
 * @returns {Promise<void>}
 */
export async function sendRoleChangedEmail({ to, name, role, comment }) {
  const text = [
    name ? `Здравствуйте, ${name}!` : 'Здравствуйте!',
    '',
    `Роль вашего аккаунта изменена: ${ROLE_LABELS[role] || role}.`,
    comment ? `Комментарий администратора: ${comment}` : '',
    '',
    'PCHelper',
  ].join('\n');

  return await deliver({ to, subject: 'PCHelper: изменена роль аккаунта', text });
}

/**
 * Сообщает о решении по отзыву.
 *
 * @param {{to: string, name?: string, productId: string, status: string, comment?: string}} data Данные.
 * @returns {Promise<void>}
 */
export async function sendReviewModeratedEmail({
  to,
  name,
  productId,
  productName,
  status,
  comment,
}) {
  const action = status === 'опубликован' ? 'опубликован' : 'отклонён';
  const product = productName ? `«${productName}»` : `«${productId}»`;
  const text = [
    name ? `Здравствуйте, ${name}!` : 'Здравствуйте!',
    '',
    `Ваш отзыв на товар ${product} ${action}.`,
    comment ? `Комментарий модератора: ${comment}` : '',
    '',
    `Если у вас есть вопросы, напишите в поддержку: ${SUPPORT_EMAIL}.`,
    '',
    'PCHelper',
  ].join('\n');

  return await deliver({ to, subject: `PCHelper: отзыв ${action}`, text });
}

/**
 * Сообщает об удалении отзыва.
 *
 * @param {{to: string, name?: string, productId: string, comment?: string}} data Данные.
 * @returns {Promise<void>}
 */
export async function sendReviewDeletedEmail({
  to,
  name,
  productId,
  productName,
  comment,
}) {
  const product = productName ? `«${productName}»` : `«${productId}»`;
  const text = [
    name ? `Здравствуйте, ${name}!` : 'Здравствуйте!',
    '',
    `Ваш отзыв на товар ${product} удалён.`,
    comment ? `Причина: ${comment}` : '',
    '',
    `Если это ошибка, напишите в поддержку: ${SUPPORT_EMAIL}.`,
    '',
    'PCHelper',
  ].join('\n');

  return await deliver({ to, subject: 'PCHelper: отзыв удалён', text });
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
