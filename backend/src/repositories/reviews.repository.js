/**
 * PCHelper — отзывы и рейтинги товаров.
 *
 * Отзыв пишется в Supabase со статусом «на модерации». На странице товара
 * показываются только опубликованные отзывы; администратор может одобрить
 * или отклонить отзыв.
 */

import { CATEGORY_BY_ID } from '../domain/catalog.js';
import { apiError } from '../domain/errors.js';
import { isDatabaseConnected, supabase } from '../services/supabase.service.js';

/**
 * Проверяет подключение базы.
 */
function requireDatabase() {
  if (!isDatabaseConnected()) {
    throw apiError(503, 'DATABASE_ERROR', 'Supabase не настроен');
  }
}

/**
 * Превращает ошибку Supabase в понятную ошибку API.
 *
 * @param {string} action Действие.
 * @param {object} error Ошибка.
 * @returns {Error & {status: number, code: string}}
 */
function databaseError(action, error) {
  console.error(`[reviews] ${action}:`, error?.message || error);
  return apiError(
    502,
    'DATABASE_ERROR',
    `Не удалось ${action}: ${error?.message || 'ошибка базы данных'}`,
  );
}

/**
 * Разбирает идентификатор товара «cpu:1».
 *
 * @param {string} productId Идентификатор.
 * @returns {{category: string, id: number}}
 */
export function parseProductId(productId) {
  const [category, rawId] = String(productId || '').split(':');
  const id = Number(rawId);
  if (!category || !Number.isInteger(id) || id <= 0) {
    throw apiError(400, 'VALIDATION_ERROR', 'Некорректный идентификатор товара');
  }
  return { category, id };
}

/**
 * Названия товаров для отзывов: «case:1» → «DeepCool CH360».
 *
 * @param {object[]} rows Строки отзывов.
 * @returns {Promise<Map<string, string>>}
 */
async function productNames(rows) {
  const grouped = new Map();
  for (const row of rows) {
    const category = row['товар_категория'];
    if (!grouped.has(category)) grouped.set(category, new Set());
    grouped.get(category).add(Number(row['товар_id']));
  }

  const names = new Map();
  await Promise.all(
    [...grouped.entries()].map(async ([categoryId, ids]) => {
      const category = CATEGORY_BY_ID.get(categoryId);
      if (!category) return;
      const { data, error } = await supabase
        .from(category.table)
        .select('id,название')
        .in('id', [...ids]);
      if (error) throw databaseError('получить названия товаров', error);
      for (const product of data || []) {
        names.set(`${categoryId}:${product.id}`, product['название']);
      }
    }),
  );
  return names;
}

/**
 * Опубликованные отзывы товара и средняя оценка.
 *
 * @param {string} productId Идентификатор «cpu:1».
 * @returns {Promise<{items: object[], average: number, count: number}>}
 */
export async function listApproved(productId) {
  if (!isDatabaseConnected()) return { items: [], average: 0, count: 0 };
  const { category, id } = parseProductId(productId);
  const { data, error } = await supabase
    .from('Отзывы')
    .select('id,пользователь_id,оценка,текст,создан_в')
    .eq('товар_категория', category)
    .eq('товар_id', id)
    .eq('статус', 'опубликован')
    .order('создан_в', { ascending: false });
  if (error) throw databaseError('получить отзывы', error);

  const users = await supabase.from('Пользователи').select('id,имя');
  if (users.error) throw databaseError('получить авторов отзывов', users.error);
  const names = new Map((users.data || []).map((row) => [Number(row.id), row['имя']]));

  const items = (data || []).map((row) => ({
    id: String(row.id),
    author: names.get(Number(row['пользователь_id'])) || 'Покупатель',
    rating: Number(row['оценка']),
    text: row['текст'] || '',
    createdAt: row['создан_в'],
  }));
  const count = items.length;
  const average = count
    ? Math.round((items.reduce((sum, item) => sum + item.rating, 0) / count) * 10) / 10
    : 0;

  return { items, average, count };
}

/**
 * Создаёт отзыв текущего пользователя.
 *
 * @param {string} userId Идентификатор пользователя.
 * @param {string} productId Идентификатор «cpu:1».
 * @param {{rating: number, text?: string}} data Оценка и текст.
 * @returns {Promise<object>}
 */
export async function createReview(userId, productId, data) {
  requireDatabase();
  const { category, id } = parseProductId(productId);
  const rating = Number(data.rating);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    throw apiError(400, 'VALIDATION_ERROR', 'Оценка должна быть от 1 до 5');
  }
  const text = String(data.text || '')
    .trim()
    .slice(0, 2000);

  // Один отзыв на товар от пользователя. Повторная отправка не блокируется,
  // а заменяет прошлый текст и снова отправляет отзыв на модерацию:
  // так пользователь может передумать и исправить оценку.
  const existing = await supabase
    .from('Отзывы')
    .select('id')
    .eq('пользователь_id', Number(userId))
    .eq('товар_категория', category)
    .eq('товар_id', id)
    .maybeSingle();
  if (existing.error) throw databaseError('проверить отзыв', existing.error);

  const payload = {
    оценка: rating,
    текст: text || null,
    статус: 'на модерации',
  };

  const query = existing.data
    ? supabase.from('Отзывы').update(payload).eq('id', existing.data.id)
    : supabase.from('Отзывы').insert({
        пользователь_id: Number(userId),
        товар_категория: category,
        товар_id: id,
        ...payload,
      });

  const { data: row, error } = await query
    .select('id,оценка,текст,статус,создан_в')
    .single();
  if (error) throw databaseError('сохранить отзыв', error);

  return {
    id: String(row.id),
    rating: Number(row['оценка']),
    text: row['текст'] || '',
    status: row['статус'],
    createdAt: row['создан_в'],
  };
}

/**
 * Отзыв текущего пользователя на товар (любой статус).
 *
 * Нужен странице товара, чтобы показать «Ваш отзыв на модерации»
 * и дать исправить текст вместо повторной блокировки.
 *
 * @param {string} userId Идентификатор пользователя.
 * @param {string} productId Идентификатор «cpu:1».
 * @returns {Promise<object|null>}
 */
export async function getMyReview(userId, productId) {
  if (!isDatabaseConnected()) return null;
  const { category, id } = parseProductId(productId);
  const { data, error } = await supabase
    .from('Отзывы')
    .select('id,оценка,текст,статус,создан_в')
    .eq('пользователь_id', Number(userId))
    .eq('товар_категория', category)
    .eq('товар_id', id)
    .maybeSingle();
  if (error) throw databaseError('получить свой отзыв', error);
  if (!data) return null;
  return {
    id: String(data.id),
    rating: Number(data['оценка']),
    text: data['текст'] || '',
    status: data['статус'],
    createdAt: data['создан_в'],
  };
}

/**
 * Все отзывы для администратора.
 *
 * @param {string} [status] Фильтр по статусу.
 * @returns {Promise<{items: object[], total: number}>}
 */
export async function listAll(status) {
  if (!isDatabaseConnected()) return { items: [], total: 0 };
  let query = supabase.from('Отзывы').select('*').order('создан_в', {
    ascending: false,
  });
  if (status) query = query.eq('статус', status);
  const { data, error } = await query;
  if (error) throw databaseError('получить отзывы', error);

  const users = await supabase.from('Пользователи').select('id,email,имя');
  if (users.error) throw databaseError('получить авторов отзывов', users.error);
  const map = new Map((users.data || []).map((row) => [Number(row.id), row]));

  const items = (data || []).map((row) => {
    const user = map.get(Number(row['пользователь_id'])) || {};
    return {
      id: String(row.id),
      productId: `${row['товар_категория']}:${row['товар_id']}`,
      rating: Number(row['оценка']),
      text: row['текст'] || '',
      status: row['статус'],
      author: user['имя'] || 'Покупатель',
      email: user.email || '',
      createdAt: row['создан_в'],
    };
  });

  const names = await productNames(data || []);
  for (const item of items) {
    item.productName = names.get(item.productId) || '';
  }

  return { items, total: items.length };
}

/**
 * Данные отзыва вместе с автором для писем и уведомлений.
 *
 * @param {string} reviewId Идентификатор.
 * @returns {Promise<object|null>}
 */
async function reviewDetails(reviewId) {
  const { data: row, error } = await supabase
    .from('Отзывы')
    .select('*')
    .eq('id', Number(reviewId))
    .maybeSingle();
  if (error) throw databaseError('прочитать отзыв', error);
  if (!row) return null;

  const user = await supabase
    .from('Пользователи')
    .select('email,имя')
    .eq('id', Number(row['пользователь_id']))
    .maybeSingle();
  if (user.error) throw databaseError('прочитать автора отзыва', user.error);

  const productId = `${row['товар_категория']}:${row['товар_id']}`;
  const names = await productNames([row]);

  return {
    id: String(row.id),
    productId,
    productName: names.get(productId) || '',
    rating: Number(row['оценка']),
    text: row['текст'] || '',
    status: row['статус'],
    author: user.data?.['имя'] || 'Покупатель',
    email: user.data?.email || '',
  };
}

/**
 * Меняет статус отзыва.
 *
 * @param {string} reviewId Идентификатор.
 * @param {string} status Новый статус.
 * @returns {Promise<object>}
 */
export async function moderate(reviewId, status) {
  requireDatabase();
  if (!['опубликован', 'отклонён', 'на модерации'].includes(status)) {
    throw apiError(400, 'VALIDATION_ERROR', 'Неизвестный статус отзыва');
  }
  const details = await reviewDetails(reviewId);
  if (!details) throw apiError(404, 'REVIEW_NOT_FOUND', 'Отзыв не найден');

  const { data: row, error } = await supabase
    .from('Отзывы')
    .update({ статус: status })
    .eq('id', Number(reviewId))
    .select('id,статус')
    .maybeSingle();
  if (error) throw databaseError('изменить статус отзыва', error);
  if (!row) throw apiError(404, 'REVIEW_NOT_FOUND', 'Отзыв не найден');
  return { ...details, status: row['статус'] };
}

/**
 * Удаляет отзыв.
 *
 * @param {string} reviewId Идентификатор.
 * @returns {Promise<object>}
 */
export async function deleteReview(reviewId) {
  requireDatabase();
  const details = await reviewDetails(reviewId);
  if (!details) throw apiError(404, 'REVIEW_NOT_FOUND', 'Отзыв не найден');

  const { error } = await supabase.from('Отзывы').delete().eq('id', Number(reviewId));
  if (error) throw databaseError('удалить отзыв', error);
  return { ...details, deleted: true };
}
