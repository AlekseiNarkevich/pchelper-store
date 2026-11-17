/**
 * PCHelper (ЛР8) — репозиторий серверной корзины и заказов.
 *
 * Если в Supabase созданы таблицы из `db/09_supabase_commerce.sql`, данные
 * хранятся там. В CI (без ключей) и до накатки миграции используется
 * память процесса — контракт API от этого не меняется.
 */
import { getProduct } from './catalog.repository.js';
import { isDatabaseConnected, supabase } from '../services/supabase.service.js';

/** @type {Map<string, Array<object>>} */
const carts = new Map();

/** @type {Map<string, Array<object>>} */
const orders = new Map();

let nextOrderId = 1;
let supabaseUnavailable = false;

/** Поле ссылки на компонент в таблицах корзины. */
const FIELD_BY_CATEGORY = {
  cpu: 'процессор_id',
  motherboard: 'материнская_плата_id',
  ram: 'озу_id',
  gpu: 'видеокарта_id',
  psu: 'блокпитания_id',
  storage: 'накопитель_id',
  case: 'корпус_id',
  cooling: 'охлаждение_id',
};

/** Обратное соответствие поля категории. */
const CATEGORY_BY_FIELD = Object.fromEntries(
  Object.entries(FIELD_BY_CATEGORY).map(([category, field]) => [field, category]),
);

/**
 * Нужно ли пробовать Supabase.
 *
 * @returns {boolean}
 */
function useSupabase() {
  return isDatabaseConnected() && !supabaseUnavailable;
}

/**
 * Отмечает, что таблицы commerce в Supabase недоступны.
 */
function disableSupabase() {
  supabaseUnavailable = true;
}

/**
 * Ключ локального хранилища.
 *
 * @param {string} userId Идентификатор пользователя.
 * @returns {string}
 */
function key(userId) {
  return String(userId);
}

/**
 * Находит или создаёт корзину пользователя в Supabase.
 *
 * @param {string} userId Идентификатор.
 * @param {boolean} create Создать, если нет.
 * @returns {Promise<number|null>}
 */
async function ensureCartId(userId, create = true) {
  const { data, error } = await supabase
    .from('Корзины')
    .select('id')
    .eq('пользователь_id', Number(userId))
    .maybeSingle();
  if (error) throw error;
  if (data) return data.id;
  if (!create) return null;

  const inserted = await supabase
    .from('Корзины')
    .insert({ пользователь_id: Number(userId) })
    .select('id')
    .single();
  if (inserted.error) throw inserted.error;
  return inserted.data.id;
}

/**
 * Определяет категорию и id товара по строке позиции.
 *
 * @param {object} row Строка `Корзина_Позиции`.
 * @returns {{category: string, productId: number}|null}
 */
function categoryFromRow(row) {
  for (const [field, category] of Object.entries(CATEGORY_BY_FIELD)) {
    if (row[field] != null) {
      return { category, productId: Number(row[field]) };
    }
  }
  return null;
}

/**
 * Приводит строку Supabase к виду позиции корзины.
 *
 * @param {object} row Строка.
 * @returns {Promise<object|null>}
 */
async function mapPosition(row) {
  const found = categoryFromRow(row);
  if (!found) return null;
  const product = await getProduct(`${found.category}:${found.productId}`);
  return {
    id: `${found.category}:${found.productId}`,
    category: found.category,
    productId: found.productId,
    name: product?.name || 'Товар',
    price: Number(row['цена'] || 0),
    qty: Number(row['количество'] || 1),
  };
}

/**
 * Возвращает позиции корзины пользователя.
 *
 * @param {string} userId Идентификатор.
 * @returns {Promise<Array<object>>}
 */
export async function getCart(userId) {
  if (useSupabase()) {
    try {
      const cartId = await ensureCartId(userId, false);
      if (!cartId) return [];
      const { data, error } = await supabase
        .from('Корзина_Позиции')
        .select('*')
        .eq('корзина_id', cartId);
      if (error) throw error;
      return (await Promise.all(data.map(mapPosition))).filter(Boolean);
    } catch {
      disableSupabase();
    }
  }
  return carts.get(key(userId)) || [];
}

/**
 * Добавляет товар в корзину.
 *
 * @param {string} userId Идентификатор.
 * @param {{category: string, productId: number, name: string, price: number, qty?: number}} product Товар.
 * @returns {Promise<Array<object>>}
 */
export async function addItem(userId, product) {
  const qty = Number(product.qty || 1);
  if (!Number.isInteger(qty) || qty < 1 || qty > 10) {
    throw apiError(400, 'VALIDATION_ERROR', 'Количество должно быть от 1 до 10');
  }

  if (useSupabase()) {
    try {
      const field = FIELD_BY_CATEGORY[product.category];
      if (!field) throw apiError(400, 'VALIDATION_ERROR', 'Неизвестная категория');
      const cartId = await ensureCartId(userId, true);
      const existing = await supabase
        .from('Корзина_Позиции')
        .select('*')
        .eq('корзина_id', cartId)
        .eq(field, Number(product.productId))
        .maybeSingle();
      if (existing.error) throw existing.error;

      if (existing.data) {
        const next = Math.min(10, Number(existing.data['количество']) + qty);
        const updated = await supabase
          .from('Корзина_Позиции')
          .update({ количество: next })
          .eq('id', existing.data.id);
        if (updated.error) throw updated.error;
      } else {
        const inserted = await supabase.from('Корзина_Позиции').insert({
          корзина_id: cartId,
          количество: qty,
          цена: Number(product.price),
          [field]: Number(product.productId),
        });
        if (inserted.error) throw inserted.error;
      }
      await supabase
        .from('Корзины')
        .update({ обновлена: new Date().toISOString() })
        .eq('id', cartId);
      return getCart(userId);
    } catch {
      disableSupabase();
    }
  }

  const items = carts.get(key(userId)) || [];
  const id = `${product.category}:${product.productId}`;
  const found = items.find((item) => item.id === id);
  if (found) {
    found.qty = Math.min(10, found.qty + qty);
  } else {
    items.push({
      id,
      category: product.category,
      productId: Number(product.productId),
      name: product.name,
      price: Number(product.price),
      qty,
    });
  }
  carts.set(key(userId), items);
  return items;
}

/**
 * Меняет количество позиции.
 *
 * @param {string} userId Идентификатор.
 * @param {string} itemId Идентификатор позиции.
 * @param {number} qty Новое количество.
 * @returns {Promise<Array<object>>}
 */
export async function updateItem(userId, itemId, qty) {
  const amount = Number(qty);
  if (!Number.isInteger(amount) || amount < 0 || amount > 10) {
    throw apiError(400, 'VALIDATION_ERROR', 'Количество должно быть от 0 до 10');
  }
  const [category, rawId] = String(itemId).split(':');
  const field = FIELD_BY_CATEGORY[category];

  if (useSupabase() && field) {
    try {
      const cartId = await ensureCartId(userId, false);
      if (!cartId) return [];
      const query = supabase
        .from('Корзина_Позиции')
        .eq('корзина_id', cartId)
        .eq(field, Number(rawId));
      if (amount === 0) {
        const removed = await query.delete();
        if (removed.error) throw removed.error;
      } else {
        const updated = await query.update({ количество: amount });
        if (updated.error) throw updated.error;
      }
      return getCart(userId);
    } catch {
      disableSupabase();
    }
  }

  let items = carts.get(key(userId)) || [];
  if (amount === 0) {
    items = items.filter((item) => item.id !== itemId);
  } else {
    const found = items.find((item) => item.id === itemId);
    if (!found) throw apiError(404, 'ITEM_NOT_FOUND', 'Позиция не найдена');
    found.qty = amount;
  }
  carts.set(key(userId), items);
  return items;
}

/**
 * Удаляет позицию из корзины.
 *
 * @param {string} userId Идентификатор.
 * @param {string} itemId Идентификатор позиции.
 * @returns {Promise<Array<object>>}
 */
export function removeItem(userId, itemId) {
  return updateItem(userId, itemId, 0);
}

/**
 * Очищает корзину.
 *
 * @param {string} userId Идентификатор.
 */
export async function clearCart(userId) {
  if (useSupabase()) {
    try {
      const cartId = await ensureCartId(userId, false);
      if (cartId) {
        const removed = await supabase
          .from('Корзина_Позиции')
          .delete()
          .eq('корзина_id', cartId);
        if (removed.error) throw removed.error;
      }
      return;
    } catch {
      disableSupabase();
    }
  }
  carts.set(key(userId), []);
}

/**
 * Оформляет заказ из корзины.
 *
 * @param {string} userId Идентификатор.
 * @param {object} data Данные доставки и оплаты.
 * @returns {Promise<object>}
 */
export async function createOrder(userId, data) {
  const items = await getCart(userId);
  if (!items.length) {
    throw apiError(400, 'EMPTY_CART', 'Корзина пуста');
  }

  const delivery = String(data.deliveryMethod || 'pickup');
  const address = String(data.address || '').trim();
  if (delivery === 'courier' && !address) {
    throw apiError(400, 'VALIDATION_ERROR', 'Укажите адрес доставки');
  }

  const total = items.reduce((sum, item) => sum + item.price * item.qty, 0);
  const orderNumber = `PCH-2026-${Date.now().toString().slice(-6)}`;

  if (useSupabase()) {
    try {
      const created = await supabase
        .from('Заказы')
        .insert({
          номер: orderNumber,
          пользователь_id: Number(userId),
          статус: 'Новый',
          способ_доставки: delivery,
          адрес_доставки: address || null,
          телефон: String(data.phone || ''),
          способ_оплаты: String(data.paymentMethod || 'card'),
          итоговая_сумма: total,
        })
        .select('*')
        .single();
      if (created.error) throw created.error;

      await supabase.from('Заказ_Позиции').insert(
        items.map((item) => ({
          заказ_id: created.data.id,
          тип_компонента: item.category,
          идентификатор: item.productId,
          название: item.name,
          цена_за_единицу: item.price,
          количество: item.qty,
          сумма: item.price * item.qty,
        })),
      );
      await clearCart(userId);
      return {
        id: String(created.data.id),
        number: created.data.номер,
        status: created.data.статус,
        total,
        items,
        createdAt: created.data.создан_в,
      };
    } catch {
      disableSupabase();
    }
  }

  const order = {
    id: String(nextOrderId++),
    number: `PCH-2026-${String(nextOrderId - 1).padStart(6, '0')}`,
    userId: String(userId),
    status: 'Новый',
    deliveryMethod: delivery,
    address: address || null,
    phone: String(data.phone || ''),
    paymentMethod: String(data.paymentMethod || 'card'),
    total,
    comment: String(data.comment || ''),
    createdAt: new Date().toISOString(),
    items: items.map((item) => ({
      category: item.category,
      productId: item.productId,
      name: item.name,
      price: item.price,
      qty: item.qty,
      sum: item.price * item.qty,
    })),
  };

  const userOrders = orders.get(key(userId)) || [];
  userOrders.unshift(order);
  orders.set(key(userId), userOrders);
  await clearCart(userId);
  return order;
}

/**
 * Список заказов пользователя.
 *
 * @param {string} userId Идентификатор.
 * @returns {Promise<Array<object>>}
 */
export async function listOrders(userId) {
  if (useSupabase()) {
    try {
      const { data, error } = await supabase
        .from('Заказы')
        .select('*')
        .eq('пользователь_id', Number(userId))
        .order('создан_в', { ascending: false });
      if (error) throw error;
      return data.map((row) => ({
        id: String(row.id),
        number: row.номер,
        status: row.статус,
        total: Number(row.итоговая_сумма || 0),
        createdAt: row.создан_в,
      }));
    } catch {
      disableSupabase();
    }
  }
  return orders.get(key(userId)) || [];
}

/**
 * Ошибка API с заданным статусом.
 *
 * @param {number} status Статус.
 * @param {string} code Код.
 * @param {string} message Сообщение.
 * @returns {Error & {status: number, code: string}}
 */
function apiError(status, code, message) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}
