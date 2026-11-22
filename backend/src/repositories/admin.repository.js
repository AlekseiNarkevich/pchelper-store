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
import { deleteAccount, findById } from './users.repository.js';
import { notifyPendingRequests } from './stock.repository.js';

/** Допустимые статусы заказа. */
export const ORDER_STATUSES = [
  'Новый',
  'В обработке',
  'Собран',
  'Готов к выдаче',
  'Отправлен',
  'Доставлен',
  'Завершён',
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
 * Приводит строку «Заказ_Позиции» к виду для интерфейса.
 *
 * @param {object} row Строка Supabase.
 * @returns {object}
 */
function mapOrderPosition(row) {
  return {
    id: String(row.id),
    category: row['тип_компонента'],
    productId: Number(row['идентификатор']),
    name: row['название'],
    price: Number(row['цена_за_единицу'] || 0),
    qty: Number(row['количество'] || 1),
    sum: Number(row['сумма'] || 0),
  };
}

/**
 * Список всех заказов с данными покупателя и составом.
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
    supabase.from('Заказ_Позиции').select('*').order('id'),
  ]);
  if (users.error) throw databaseError('получить пользователей', users.error);
  if (positions.error) throw databaseError('получить позиции заказов', positions.error);

  const userMap = new Map((users.data || []).map((row) => [Number(row.id), row]));
  const byOrder = new Map();
  for (const row of positions.data || []) {
    const id = Number(row['заказ_id']);
    if (!byOrder.has(id)) byOrder.set(id, []);
    byOrder.get(id).push(mapOrderPosition(row));
  }

  const items = (data || []).map((row) => {
    const user = userMap.get(Number(row['пользователь_id'])) || {};
    const deliveryCost = Number(row['стоимость_доставки'] || 0);
    const orderPositions = byOrder.get(Number(row.id)) || [];
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
      email: row['эл_почта'] || user.email || '',
      positionsCount: orderPositions.length,
      positions: orderPositions,
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
  return (data || []).map(mapOrderPosition);
}

/**
 * Меняет статус и служебные поля заказа.
 *
 * @param {string} orderId Идентификатор.
 * @param {{status?: string, track?: string, comment?: string}} data Данные.
 * @returns {Promise<object>}
 */
export async function updateOrder(orderId, data, adminId) {
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

  const comment = String(data.comment || '').trim();
  const history = await supabase.from('ИсторияЗаказов').insert({
    заказ_id: Number(orderId),
    статус: row['статус'],
    комментарий: comment || null,
    администратор_id: Number(adminId) || null,
  });
  if (history.error) {
    console.error('[admin] история заказа:', history.error.message);
  }

  const user = await supabase
    .from('Пользователи')
    .select('email')
    .eq('id', Number(row['пользователь_id']))
    .maybeSingle();
  if (user.error) {
    console.error('[admin] email заказа:', user.error.message);
  }

  return {
    id: String(row.id),
    number: row['номер'],
    status: row['статус'],
    comment: row['комментарий_менеджера'] || '',
    email: user.data?.email || row['эл_почта'] || '',
    total: Number(row['итоговая_сумма'] || 0),
  };
}

/**
 * Удаляет отменённый заказ вместе с позициями и историей.
 *
 * Неотменённый заказ сначала нужно отменить: это защищает от случайной
 * потери активного заказа. Письмо при удалении не отправляется.
 *
 * @param {string} orderId Идентификатор.
 * @returns {Promise<{id: string, number: string}>}
 */
export async function deleteOrder(orderId) {
  requireDatabase();
  const { data: row, error } = await supabase
    .from('Заказы')
    .select('id,номер,статус')
    .eq('id', Number(orderId))
    .maybeSingle();
  if (error) throw databaseError('получить заказ', error);
  if (!row) throw apiError(404, 'ORDER_NOT_FOUND', 'Заказ не найден');
  if (row['статус'] !== 'Отменён') {
    throw apiError(409, 'ORDER_NOT_CANCELLED', 'Удалить можно только отменённый заказ');
  }

  const removal = await supabase.from('Заказы').delete().eq('id', Number(orderId));
  if (removal.error) throw databaseError('удалить заказ', removal.error);

  return { id: String(row.id), number: row['номер'] };
}

/**
 * История статусов заказа.
 *
 * @param {string} orderId Идентификатор.
 * @returns {Promise<{items: object[], total: number}>}
 */
export async function listOrderHistory(orderId) {
  if (!isDatabaseConnected()) return { items: [], total: 0 };
  const { data, error } = await supabase
    .from('ИсторияЗаказов')
    .select('*')
    .eq('заказ_id', Number(orderId))
    .order('создан_в', { ascending: false });
  if (error) throw databaseError('получить историю заказа', error);
  const items = (data || []).map((row) => ({
    id: String(row.id),
    status: row['статус'],
    comment: row['комментарий'] || '',
    createdAt: row['создан_в'],
  }));
  return { items, total: items.length };
}

/**
 * Список пользователей.
 *
 * @returns {Promise<{items: object[], total: number}>}
 */
export async function listUsers() {
  if (!isDatabaseConnected()) return { items: [], total: 0 };
  const { data, error } = await supabase.from('Пользователи').select('*').order('id');
  if (error) throw databaseError('получить пользователей', error);

  const items = (data || [])
    .filter((row) => !row['удалён'])
    .map((row) => ({
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

  const target = await supabase
    .from('Пользователи')
    .select('id,роль,удалён')
    .eq('id', Number(userId))
    .maybeSingle();
  if (target.error) throw databaseError('прочитать пользователя', target.error);
  if (!target.data || target.data['удалён']) {
    throw apiError(404, 'USER_NOT_FOUND', 'Пользователь не найден');
  }
  if (target.data['роль'] === 'admin') {
    if (data.blocked) {
      throw apiError(400, 'ADMIN_PROTECTED', 'Администратора нельзя заблокировать');
    }
    // Понизить другого администратора можно: себя изменить нельзя
    // (проверка выше), поэтому хотя бы один администратор остаётся.
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
    .select('id,email,имя,роль,заблокирован,причина_блокировки')
    .maybeSingle();
  if (error) throw databaseError('обновить пользователя', error);
  if (!row) throw apiError(404, 'USER_NOT_FOUND', 'Пользователь не найден');
  return {
    id: String(row.id),
    email: row.email,
    name: row['имя'] || '',
    role: row['роль'],
    blocked: Boolean(row['заблокирован']),
    blockReason: row['причина_блокировки'] || '',
  };
}

/**
 * Удаляет пользователя из админки.
 *
 * @param {string} userId Кого удаляем.
 * @param {string} currentAdminId Кто удаляет.
 * @param {string} [reason] Причина для письма.
 * @returns {Promise<{id: string, deleted: true, email: string, name: string, reason: string}>}
 */
export async function deleteUser(userId, currentAdminId, reason) {
  requireDatabase();
  if (String(userId) === String(currentAdminId)) {
    throw apiError(400, 'SELF_DELETE', 'Нельзя удалить свой аккаунт');
  }

  // Данные нужны для письма: после удаления запись обезличивается.
  const target = await findById(userId);
  if (!target) throw apiError(404, 'USER_NOT_FOUND', 'Пользователь не найден');

  const result = await deleteAccount(userId);
  return {
    ...result,
    email: target.email,
    name: target.name || '',
    reason: String(reason || 'Решение администрации').trim(),
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
    if (key === 'количество' && (value === '' || value == null)) {
      clean[key] = 0;
      continue;
    }
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

  const previous = await supabase
    .from(found.table)
    .select('id,количество')
    .eq('id', Number(productId))
    .maybeSingle();
  if (previous.error) throw databaseError('прочитать товар', previous.error);

  const { data: row, error } = await supabase
    .from(found.table)
    .update(clean)
    .eq('id', Number(productId))
    .select('*')
    .maybeSingle();
  if (error) throw databaseError('обновить товар', error);
  if (!row) throw apiError(404, 'PRODUCT_NOT_FOUND', 'Товар не найден');

  // Товар снова появился: сообщаем тем, кто оставил запрос. Ошибка
  // уведомления не отменяет сохранение остатка.
  const wasOut = Number(previous.data?.['количество'] ?? 0) <= 0;
  const isIn = Number(row['количество'] ?? 0) > 0;
  if (wasOut && isIn) {
    await notifyPendingRequests(category, productId);
  }

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
    if (error.code === '23503') {
      throw apiError(
        409,
        'PRODUCT_IN_USE',
        'Товар входит в сборку или готовый ПК. Сначала уберите его оттуда, потом удаляйте.',
      );
    }
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
 * Остатки готовых конфигураций.
 *
 * @returns {Promise<{items: object[], total: number}>}
 */
export async function listPrebuiltStock() {
  if (!isDatabaseConnected()) return { items: [], total: 0 };
  const { data, error } = await supabase
    .from('ГотовыеКонфигурации')
    .select('id,название,количество')
    .order('id');
  if (error) throw databaseError('получить остатки готовых ПК', error);
  const items = (data || []).map((row) => ({
    id: String(row.id),
    name: row['название'],
    stock: Number(row['количество'] || 0),
  }));
  return { items, total: items.length };
}

/**
 * Меняет остаток готовой конфигурации.
 *
 * @param {string} id Идентификатор.
 * @param {number} stock Количество.
 * @returns {Promise<object>}
 */
export async function updatePrebuiltStock(id, stock) {
  requireDatabase();
  const quantity = Number(stock);
  if (!Number.isInteger(quantity) || quantity < 0) {
    throw apiError(400, 'VALIDATION_ERROR', 'Количество должно быть неотрицательным');
  }

  const previous = await supabase
    .from('ГотовыеКонфигурации')
    .select('id,количество')
    .eq('id', Number(id))
    .maybeSingle();
  if (previous.error)
    throw databaseError('прочитать остаток готового ПК', previous.error);

  const { data: row, error } = await supabase
    .from('ГотовыеКонфигурации')
    .update({ количество: quantity })
    .eq('id', Number(id))
    .select('id,название,количество')
    .maybeSingle();
  if (error) throw databaseError('обновить остаток готового ПК', error);
  if (!row) throw apiError(404, 'PREBUILT_NOT_FOUND', 'Сборка не найдена');

  if (Number(previous.data?.['количество'] ?? 0) <= 0 && quantity > 0) {
    await notifyPendingRequests('prebuilt', id);
  }

  return {
    id: String(row.id),
    name: row['название'],
    stock: Number(row['количество']),
  };
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
