/**
 * PCHelper — репозиторий администратора.
 *
 * Только серверные операции с Supabase: заказы, пользователи, товары.
 * Ошибки базы не подменяются памятью: администратор должен видеть,
 * что именно не сохранилось.
 */

import { CATEGORY_BY_ID, CATEGORIES } from '../domain/catalog.js';
import { apiError } from '../domain/errors.js';
import { isDatabaseConnected, supabase } from '../services/supabase.service.js';

/** Допустимые статусы заказа. */
export const ORDER_STATUSES = [
  'Новый',
  'В обработке',
  'Собран',
  'Отправлен',
  'Доставлен',
  'Отменён',
];

/** Допустимые роли. */
export const USER_ROLES = ['customer', 'manager', 'admin'];

/**
 * Проверяет, что база подключена.
 */
function requireDatabase() {
  if (!isDatabaseConnected()) {
    throw apiError(
      503,
      'DATABASE_ERROR',
      'Supabase не настроен: административные действия недоступны',
    );
  }
}

/**
 * Превращает ошибку Supabase в понятную ошибку API.
 *
 * @param {string} action Действие для сообщения.
 * @param {object} error Ошибка.
 * @returns {Error & {status: number, code: string}}
 */
function databaseError(action, error) {
  console.error(`[admin] ${action}:`, error?.message || error);
  return apiError(
    502,
    'DATABASE_ERROR',
    `Не удалось ${action}: ${error?.message || 'ошибка базы данных'}`,
  );
}

/**
 * Проверяет код категории.
 *
 * @param {string} category Код.
 * @returns {object}
 */
function categoryOf(category) {
  const found = CATEGORY_BY_ID.get(category);
  if (!found) throw apiError(400, 'VALIDATION_ERROR', 'Неизвестная категория');
  return found;
}

/**
 * Список всех заказов с данными покупателя.
 *
 * @returns {Promise<{items: object[], total: number}>}
 */
export async function listOrders() {
  if (!isDatabaseConnected()) return { items: [], total: 0 };
  const { data, error } = await supabase
    .from('Заказы')
    .select('*')
    .order('создан_в', { ascending: false });
  if (error) throw databaseError('получить заказы', error);

  const [users, positions] = await Promise.all([
    supabase.from('Пользователи').select('id,email,имя,телефон'),
    supabase.from('Заказ_Позиции').select('заказ_id'),
  ]);
  if (users.error) throw databaseError('получить пользователей', users.error);
  if (positions.error) throw databaseError('получить позиции заказов', positions.error);

  const userMap = new Map((users.data || []).map((row) => [Number(row.id), row]));
  const counts = new Map();
  for (const row of positions.data || []) {
    const id = Number(row['заказ_id']);
    counts.set(id, (counts.get(id) || 0) + 1);
  }

  const items = (data || []).map((row) => {
    const user = userMap.get(Number(row['пользователь_id'])) || {};
    const deliveryCost = Number(row['стоимость_доставки'] || 0);
    return {
      id: String(row.id),
      number: row['номер'],
      userId: String(row['пользователь_id']),
      userName: user['имя'] || '',
      userEmail: user.email || '',
      status: row['статус'],
      deliveryMethod: row['способ_доставки'],
      deliveryZone: row['зона_доставки'] || '',
      address: row['адрес_доставки'] || '',
      phone: row['телефон'] || '',
      paymentMethod: row['способ_оплаты'],
      total: Number(row['итоговая_сумма'] || 0),
      deliveryCost,
      itemsTotal: Number(row['итоговая_сумма'] || 0) - deliveryCost,
      distanceKm: row['расстояние_км'] != null ? Number(row['расстояние_км']) : null,
      track: row['трек_номер'] || '',
      managerComment: row['комментарий_менеджера'] || '',
      positionsCount: counts.get(Number(row.id)) || 0,
      createdAt: row['создан_в'],
    };
  });

  return { items, total: items.length };
}

/**
 * Позиции конкретного заказа.
 *
 * @param {string} orderId Идентификатор.
 * @returns {Promise<object[]>}
 */
export async function listOrderPositions(orderId) {
  if (!isDatabaseConnected()) return [];
  const { data, error } = await supabase
    .from('Заказ_Позиции')
    .select('*')
    .eq('заказ_id', Number(orderId))
    .order('id');
  if (error) throw databaseError('получить позиции заказа', error);
  return (data || []).map((row) => ({
    id: String(row.id),
    category: row['тип_компонента'],
    productId: Number(row['идентификатор']),
    name: row['название'],
    price: Number(row['цена_за_единицу'] || 0),
    qty: Number(row['количество'] || 1),
    sum: Number(row['сумма'] || 0),
  }));
}

/**
 * Меняет статус и служебные поля заказа.
 *
 * @param {string} orderId Идентификатор.
 * @param {{status?: string, track?: string, comment?: string}} data Данные.
 * @returns {Promise<object>}
 */
export async function updateOrder(orderId, data) {
  requireDatabase();
  const updates = { обновлён_в: new Date().toISOString() };

  if (data.status !== undefined) {
    if (!ORDER_STATUSES.includes(data.status)) {
      throw apiError(400, 'VALIDATION_ERROR', 'Неизвестный статус заказа');
    }
    updates['статус'] = data.status;
  }
  if (data.track !== undefined) updates['трек_номер'] = String(data.track).trim();
  if (data.comment !== undefined) {
    updates['комментарий_менеджера'] = String(data.comment).trim();
  }

  const { data: row, error } = await supabase
    .from('Заказы')
    .update(updates)
    .eq('id', Number(orderId))
    .select('*')
    .maybeSingle();
  if (error) throw databaseError('обновить заказ', error);
  if (!row) throw apiError(404, 'ORDER_NOT_FOUND', 'Заказ не найден');
  return { id: String(row.id), status: row['статус'], number: row['номер'] };
}

/**
 * Список пользователей.
 *
 * @returns {Promise<{items: object[], total: number}>}
 */
export async function listUsers() {
  if (!isDatabaseConnected()) return { items: [], total: 0 };
  const { data, error } = await supabase
    .from('Пользователи')
    .select(
      'id,email,имя,телефон,адрес_доставки,роль,заблокирован,причина_блокировки,создан_в',
    )
    .order('id');
  if (error) throw databaseError('получить пользователей', error);

  const items = (data || []).map((row) => ({
    id: String(row.id),
    email: row.email,
    name: row['имя'],
    phone: row['телефон'] || '',
    address: row['адрес_доставки'] || '',
    role: row['роль'],
    blocked: Boolean(row['заблокирован']),
    blockReason: row['причина_блокировки'] || '',
    createdAt: row['создан_в'],
  }));
  return { items, total: items.length };
}

/**
 * Блокировка, разблокировка и смена роли.
 *
 * @param {string} userId Идентификатор.
 * @param {{blocked?: boolean, reason?: string, role?: string}} data Данные.
 * @param {string} currentAdminId Идентификатор текущего администратора.
 * @returns {Promise<object>}
 */
export async function updateUser(userId, data, currentAdminId) {
  requireDatabase();
  if (String(userId) === String(currentAdminId)) {
    throw apiError(
      400,
      'VALIDATION_ERROR',
      'Нельзя менять роль или блокировать самого себя',
    );
  }

  const updates = { обновлён_в: new Date().toISOString() };
  if (data.blocked !== undefined) {
    updates['заблокирован'] = Boolean(data.blocked);
    updates['причина_блокировки'] = data.blocked
      ? String(data.reason || 'Нарушение правил магазина').trim()
      : null;
  }
  if (data.role !== undefined) {
    if (!USER_ROLES.includes(data.role)) {
      throw apiError(400, 'VALIDATION_ERROR', 'Неизвестная роль');
    }
    updates['роль'] = data.role;
  }

  const { data: row, error } = await supabase
    .from('Пользователи')
    .update(updates)
    .eq('id', Number(userId))
    .select('id,email,роль,заблокирован')
    .maybeSingle();
  if (error) throw databaseError('обновить пользователя', error);
  if (!row) throw apiError(404, 'USER_NOT_FOUND', 'Пользователь не найден');
  return {
    id: String(row.id),
    email: row.email,
    role: row['роль'],
    blocked: Boolean(row['заблокирован']),
  };
}

/**
 * Строки товаров категории.
 *
 * @param {string} category Код категории.
 * @returns {Promise<{items: object[], total: number}>}
 */
export async function listProducts(category) {
  if (!isDatabaseConnected()) return { items: [], total: 0 };
  const found = categoryOf(category);
  const { data, error } = await supabase.from(found.table).select('*').order('id');
  if (error) throw databaseError('получить товары', error);
  return { items: data || [], total: (data || []).length };
}

/**
 * Убирает служебные поля перед записью.
 *
 * @param {object} data Поля формы.
 * @returns {object}
 */
function cleanProductData(data) {
  const clean = {};
  for (const [key, value] of Object.entries(data || {})) {
    if (key === 'id' || key === 'создан_в') continue;
    clean[key] = value === '' ? null : value;
  }
  return clean;
}

/**
 * Создаёт товар.
 *
 * @param {string} category Код категории.
 * @param {object} data Поля.
 * @returns {Promise<object>}
 */
export async function createProduct(category, data) {
  requireDatabase();
  const found = categoryOf(category);
  const clean = cleanProductData(data);
  if (!clean['название'] || clean['цена'] === null || clean['цена'] === undefined) {
    throw apiError(400, 'VALIDATION_ERROR', 'Нужны название и цена товара');
  }

  const { data: row, error } = await supabase
    .from(found.table)
    .insert(clean)
    .select('*')
    .single();
  if (error) throw databaseError('создать товар', error);
  return row;
}

/**
 * Обновляет товар.
 *
 * @param {string} category Код категории.
 * @param {string} productId Идентификатор.
 * @param {object} data Поля.
 * @returns {Promise<object>}
 */
export async function updateProduct(category, productId, data) {
  requireDatabase();
  const found = categoryOf(category);
  const clean = cleanProductData(data);
  if (!Object.keys(clean).length) {
    throw apiError(400, 'VALIDATION_ERROR', 'Нет полей для изменения');
  }

  const { data: row, error } = await supabase
    .from(found.table)
    .update(clean)
    .eq('id', Number(productId))
    .select('*')
    .maybeSingle();
  if (error) throw databaseError('обновить товар', error);
  if (!row) throw apiError(404, 'PRODUCT_NOT_FOUND', 'Товар не найден');
  return row;
}

/**
 * Удаляет товар.
 *
 * @param {string} category Код категории.
 * @param {string} productId Идентификатор.
 * @returns {Promise<void>}
 */
export async function deleteProduct(category, productId) {
  requireDatabase();
  const found = categoryOf(category);
  const { data, error } = await supabase
    .from(found.table)
    .delete()
    .eq('id', Number(productId))
    .select('id');
  if (error) {
    throw databaseError(
      'удалить товар (возможно, он входит в заказ или сборку)',
      error,
    );
  }
  if (!(data || []).length) {
    throw apiError(404, 'PRODUCT_NOT_FOUND', 'Товар не найден');
  }
}

/**
 * Сводка для панели администратора.
 *
 * @returns {Promise<object>}
 */
export async function getSummary() {
  if (!isDatabaseConnected()) {
    return { orders: 0, users: 0, pendingReviews: 0, products: 0 };
  }
  const results = await Promise.all([
    supabase.from('Заказы').select('id', { count: 'exact', head: true }),
    supabase.from('Пользователи').select('id', { count: 'exact', head: true }),
    supabase
      .from('Отзывы')
      .select('id', { count: 'exact', head: true })
      .eq('статус', 'на модерации'),
    ...CATEGORIES.map((category) =>
      supabase.from(category.table).select('id', { count: 'exact', head: true }),
    ),
  ]);

  for (const result of results) {
    if (result.error) throw databaseError('получить сводку', result.error);
  }

  const products = results
    .slice(3)
    .reduce((sum, result) => sum + (result.count || 0), 0);

  return {
    orders: results[0].count || 0,
    users: results[1].count || 0,
    pendingReviews: results[2].count || 0,
    products,
  };
}
