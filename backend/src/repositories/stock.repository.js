/**
 * PCHelper — запросы на поступление товара.
 *
 * Покупатель может оставить e-mail или телефон, если товара нет на складе.
 * Запросы видит администратор в разделе «Запросы».
 */

import { apiError } from '../domain/errors.js';
import { sendRestockEmail } from '../services/mail.service.js';
import { isDatabaseConnected, supabase } from '../services/supabase.service.js';
import { getProduct } from './catalog.repository.js';

/**
 * Создаёт запрос на поступление.
 *
 * @param {string} productId Идентификатор «cpu:1».
 * @param {{email?: string, phone?: string}} data Контакты.
 * @returns {Promise<object>}
 */
export async function createRequest(productId, data) {
  if (!isDatabaseConnected()) {
    throw apiError(503, 'DATABASE_ERROR', 'Supabase не настроен');
  }

  const [category, rawId] = String(productId || '').split(':');
  const id = Number(rawId);
  if (!category || !Number.isInteger(id) || id <= 0) {
    throw apiError(400, 'VALIDATION_ERROR', 'Некорректный идентификатор товара');
  }

  const email = String(data.email || '').trim();
  const phone = String(data.phone || '').trim();
  if (!email && !phone) {
    throw apiError(400, 'VALIDATION_ERROR', 'Оставьте e-mail или телефон');
  }
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw apiError(400, 'VALIDATION_ERROR', 'Некорректный e-mail');
  }

  const { data: row, error } = await supabase
    .from('ЗапросыНаПоступление')
    .insert({
      товар_категория: category,
      товар_id: id,
      email: email || null,
      телефон: phone || null,
      статус: 'новый',
    })
    .select('id,статус,создан_в')
    .single();
  if (error) {
    console.error('[stock] запрос на поступление:', error.message);
    throw apiError(502, 'DATABASE_ERROR', 'Не удалось сохранить запрос');
  }
  return {
    id: String(row.id),
    status: row['статус'],
    createdAt: row['создан_в'],
  };
}

/**
 * Список запросов для администратора.
 *
 * @returns {Promise<{items: object[], total: number, newCount: number}>}
 */
export async function listRequests() {
  if (!isDatabaseConnected()) {
    return { items: [], total: 0, newCount: 0 };
  }
  const { data, error } = await supabase
    .from('ЗапросыНаПоступление')
    .select('*')
    .order('создан_в', { ascending: false });
  if (error) {
    console.error('[stock] список запросов:', error.message);
    throw apiError(502, 'DATABASE_ERROR', 'Не удалось получить запросы');
  }

  const items = [];
  for (const row of data || []) {
    const product = await getProduct(`${row['товар_категория']}:${row['товар_id']}`);
    items.push({
      id: String(row.id),
      productId: `${row['товар_категория']}:${row['товар_id']}`,
      productName: product?.name || 'Товар удалён',
      email: row.email || '',
      phone: row['телефон'] || '',
      status: row['статус'],
      createdAt: row['создан_в'],
    });
  }

  return {
    items,
    total: items.length,
    newCount: items.filter((item) => item.status === 'новый').length,
  };
}

/**
 * Меняет статус запроса.
 *
 * @param {string} requestId Идентификатор.
 * @param {string} status Новый статус.
 * @returns {Promise<object>}
 */
export async function updateRequest(requestId, status) {
  if (!['новый', 'обработан'].includes(status)) {
    throw apiError(400, 'VALIDATION_ERROR', 'Неизвестный статус запроса');
  }
  if (!isDatabaseConnected()) {
    throw apiError(503, 'DATABASE_ERROR', 'Supabase не настроен');
  }
  const { data: row, error } = await supabase
    .from('ЗапросыНаПоступление')
    .update({ статус: status })
    .eq('id', Number(requestId))
    .select('id,статус')
    .maybeSingle();
  if (error) {
    throw apiError(502, 'DATABASE_ERROR', 'Не удалось обновить запрос');
  }
  if (!row) throw apiError(404, 'REQUEST_NOT_FOUND', 'Запрос не найден');
  return { id: String(row.id), status: row['статус'] };
}

/**
 * Удаляет запрос на поступление.
 *
 * Необработанный запрос удалять нельзя: покупатель ждёт ответа, поэтому
 * сначала нужно отметить запрос обработанным (или дождаться поступления
 * товара, когда письмо уйдёт автоматически).
 *
 * @param {string} requestId Идентификатор.
 * @returns {Promise<{id: string}>}
 */
export async function deleteRequest(requestId) {
  const id = Number(requestId);
  if (!Number.isInteger(id) || id <= 0) {
    throw apiError(400, 'VALIDATION_ERROR', 'Некорректный номер запроса');
  }

  if (!isDatabaseConnected()) {
    throw apiError(503, 'DATABASE_ERROR', 'Supabase не настроен');
  }

  const { data: row, error } = await supabase
    .from('ЗапросыНаПоступление')
    .select('id,статус')
    .eq('id', id)
    .maybeSingle();
  if (error) {
    throw apiError(502, 'DATABASE_ERROR', 'Не удалось прочитать запрос');
  }
  if (!row) throw apiError(404, 'REQUEST_NOT_FOUND', 'Запрос не найден');

  if (row['статус'] !== 'обработан') {
    throw apiError(
      409,
      'REQUEST_NOT_PROCESSED',
      'Запрос ещё не обработан. Сначала отметьте его обработанным — покупатель должен получить ответ.',
    );
  }

  const removal = await supabase.from('ЗапросыНаПоступление').delete().eq('id', id);
  if (removal.error) {
    throw apiError(502, 'DATABASE_ERROR', 'Не удалось удалить запрос');
  }
  return { id: String(row.id) };
}

/**
 * Удаляет несколько обработанных запросов.
 *
 * Необработанные запросы пропускаются: покупатель ждёт ответа, поэтому
 * сначала запрос нужно отметить обработанным. Возвращаем статистику,
 * чтобы админка показала, сколько записей осталось.
 *
 * @param {Array<string|number>} ids Номера запросов.
 * @returns {Promise<{deleted: number, skipped: number}>}
 */
export async function deleteRequestsBulk(ids) {
  const clean = (Array.isArray(ids) ? ids : [])
    .map(Number)
    .filter((id) => Number.isInteger(id) && id > 0);
  if (!clean.length) {
    throw apiError(400, 'VALIDATION_ERROR', 'Выберите хотя бы один запрос');
  }

  if (!isDatabaseConnected()) {
    throw apiError(503, 'DATABASE_ERROR', 'Supabase не настроен');
  }

  const { data, error } = await supabase
    .from('ЗапросыНаПоступление')
    .select('id,статус')
    .in('id', clean);
  if (error) {
    throw apiError(502, 'DATABASE_ERROR', 'Не удалось прочитать запросы');
  }

  const processed = (data || [])
    .filter((row) => row['статус'] === 'обработан')
    .map((row) => Number(row.id));
  const skipped = clean.length - processed.length;
  if (!processed.length) return { deleted: 0, skipped };

  const removal = await supabase
    .from('ЗапросыНаПоступление')
    .delete()
    .in('id', processed)
    .select('id');
  if (removal.error) {
    throw apiError(502, 'DATABASE_ERROR', 'Не удалось удалить выбранные запросы');
  }
  return { deleted: (removal.data || []).length, skipped };
}

/**
 * Письма тем, кто просил сообщить о поступлении.
 *
 * Вызывается, когда администратор поднимает остаток с нуля. Запрос
 * помечается обработанным только после реальной отправки: если SMTP
 * не настроен, письмо остаётся в журнале, а запрос — в списке новых.
 *
 * @param {string} category Категория товара.
 * @param {number} productId Номер товара.
 * @returns {Promise<number>} Сколько писем отправлено.
 */
export async function notifyPendingRequests(category, productId) {
  if (!isDatabaseConnected()) return 0;

  try {
    const { data, error } = await supabase
      .from('ЗапросыНаПоступление')
      .select('id,email')
      .eq('товар_категория', category)
      .eq('товар_id', Number(productId))
      .eq('статус', 'новый')
      .not('email', 'is', null);
    if (error) throw error;
    if (!data?.length) return 0;

    const product = await getProduct(`${category}:${productId}`);
    if (!product) return 0;

    let sent = 0;
    for (const row of data) {
      if (!row.email) continue;
      const result = await sendRestockEmail({ to: row.email, product });
      if (!result.sent) continue;
      const updated = await supabase
        .from('ЗапросыНаПоступление')
        .update({ статус: 'обработан' })
        .eq('id', row.id);
      if (updated.error) throw updated.error;
      sent += 1;
    }
    return sent;
  } catch (error) {
    console.error('[stock] уведомление о поступлении:', error?.message || error);
    return 0;
  }
}
