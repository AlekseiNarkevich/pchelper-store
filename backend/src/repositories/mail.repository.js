/**
 * PCHelper — журнал писем для администратора.
 *
 * Письма хранятся в таблице «Письма»: туда попадает каждое уведомление,
 * даже если SMTP не настроен. Администратор видит статус, ошибку
 * и может отправить письмо повторно после настройки почты.
 */

import { apiError } from '../domain/errors.js';
import { mailConfigured, sendRawEmail } from '../services/mail.service.js';
import { isDatabaseConnected, supabase } from '../services/supabase.service.js';

/**
 * Превращает строку таблицы в письмо для интерфейса.
 *
 * @param {object} row Строка «Письма».
 * @returns {object}
 */
function toLetter(row) {
  return {
    id: String(row.id),
    orderId: row['заказ_id'] != null ? String(row['заказ_id']) : null,
    email: row.email,
    subject: row['тема'],
    sent: Boolean(row['отправлено']),
    error: row['ошибка'] || '',
    createdAt: row['создан_в'],
  };
}

/**
 * Список писем, новые сверху.
 *
 * @param {number} [limit=100] Сколько писем вернуть.
 * @returns {Promise<{items: object[], total: number, configured: boolean}>}
 */
export async function listEmails(limit = 100) {
  if (!isDatabaseConnected()) {
    return { items: [], total: 0, configured: mailConfigured() };
  }

  const size = Math.min(Math.max(Number(limit) || 100, 1), 500);
  const { data, error, count } = await supabase
    .from('Письма')
    .select('id,заказ_id,email,тема,отправлено,ошибка,создан_в', {
      count: 'exact',
    })
    .order('создан_в', { ascending: false })
    .limit(size);
  if (error) {
    console.error('[mail] список писем:', error.message);
    throw apiError(502, 'DATABASE_ERROR', 'Не удалось получить письма');
  }

  const items = (data || []).map(toLetter);
  return {
    items,
    total: count ?? items.length,
    configured: mailConfigured(),
  };
}

/**
 * Отправляет письмо из журнала повторно и обновляет его статус.
 *
 * @param {number|string} id Идентификатор письма.
 * @returns {Promise<{id: string, sent: boolean, error: string}>}
 */
export async function resendEmail(id) {
  if (!isDatabaseConnected()) {
    throw apiError(503, 'DATABASE_ERROR', 'Supabase не настроен');
  }

  const { data: row, error } = await supabase
    .from('Письма')
    .select('*')
    .eq('id', Number(id))
    .maybeSingle();
  if (error) {
    console.error('[mail] чтение письма:', error.message);
    throw apiError(502, 'DATABASE_ERROR', 'Не удалось прочитать письмо');
  }
  if (!row) throw apiError(404, 'LETTER_NOT_FOUND', 'Письмо не найдено');

  const result = await sendRawEmail({
    to: row.email,
    subject: row['тема'],
    text: row['текст'],
    orderId: row['заказ_id'],
  });

  const updated = await supabase
    .from('Письма')
    .update({ отправлено: result.sent, ошибка: result.error || null })
    .eq('id', row.id);
  if (updated.error) {
    console.error('[mail] обновление письма:', updated.error.message);
    throw apiError(502, 'DATABASE_ERROR', 'Письмо отправлено, но статус не сохранился');
  }

  return { id: String(row.id), sent: result.sent, error: result.error };
}

/**
 * Удаляет письмо из журнала.
 *
 * Удаляется только запись журнала: уже отправленное письмо у получателя
 * не отзывается. Это удобно для чистки старых проверочных отправок.
 *
 * @param {string|number} id Идентификатор письма.
 * @returns {Promise<{id: string}>}
 */
export async function deleteEmail(id) {
  const letterId = Number(id);
  if (!Number.isInteger(letterId) || letterId <= 0) {
    throw apiError(400, 'VALIDATION_ERROR', 'Некорректный номер письма');
  }

  if (!isDatabaseConnected()) {
    throw apiError(503, 'DATABASE_ERROR', 'Supabase не настроен');
  }

  const { data: row, error } = await supabase
    .from('Письма')
    .select('id')
    .eq('id', letterId)
    .maybeSingle();
  if (error) {
    console.error('[mail] поиск письма:', error.message);
    throw apiError(502, 'DATABASE_ERROR', 'Не удалось прочитать письмо');
  }
  if (!row) throw apiError(404, 'LETTER_NOT_FOUND', 'Письмо не найдено');

  const removal = await supabase.from('Письма').delete().eq('id', letterId);
  if (removal.error) {
    console.error('[mail] удаление письма:', removal.error.message);
    throw apiError(502, 'DATABASE_ERROR', 'Не удалось удалить письмо');
  }
  return { id: String(row.id) };
}

/**
 * Удаляет несколько писем из журнала.
 *
 * Журнал — это история отправок, а не сами письма у получателей:
 * удаление записи не отзывает уже доставленное письмо.
 *
 * @param {Array<string|number>} ids Идентификаторы писем.
 * @returns {Promise<{deleted: number}>}
 */
export async function deleteEmails(ids) {
  const clean = (Array.isArray(ids) ? ids : [])
    .map(Number)
    .filter((id) => Number.isInteger(id) && id > 0);
  if (!clean.length) {
    throw apiError(400, 'VALIDATION_ERROR', 'Выберите хотя бы одно письмо');
  }

  if (!isDatabaseConnected()) {
    throw apiError(503, 'DATABASE_ERROR', 'Supabase не настроен');
  }

  const removal = await supabase.from('Письма').delete().in('id', clean);
  if (removal.error) {
    console.error('[mail] массовое удаление:', removal.error.message);
    throw apiError(502, 'DATABASE_ERROR', 'Не удалось удалить выбранные письма');
  }
  return { deleted: clean.length };
}

/**
 * Отправляет проверочное письмо на указанный адрес.
 *
 * @param {string} to Получатель.
 * @returns {Promise<{sent: boolean, error: string}>}
 */
export async function sendTestEmail(to) {
  const email = String(to || '').trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw apiError(400, 'VALIDATION_ERROR', 'Укажите корректный e-mail');
  }

  return await sendRawEmail({
    to: email,
    subject: 'PCHelper: проверка почты',
    text: [
      'Здравствуйте!',
      '',
      'Это проверочное письмо от магазина PCHelper.',
      'Если вы его видите, SMTP настроен правильно.',
      '',
      'PCHelper',
    ].join('\n'),
  });
}
