/**
 * PCHelper (ЛР8) — репозиторий серверной корзины и заказов.
 *
 * Если в Supabase созданы таблицы из `db/09_supabase_commerce.sql`, данные
 * хранятся там. В CI (без ключей) и до накатки миграции используется
 * память процесса — контракт API от этого не меняется.
 */
import { CATEGORY_BY_ID } from '../domain/catalog.js';
import { getProduct } from './catalog.repository.js';
import { adjustOrderStock, adjustPrebuiltComponents } from './admin.repository.js';
import { isDatabaseConnected, supabase } from '../services/supabase.service.js';

/** @type {Map<string, Array<object>>} */
const carts = new Map();

/** @type {Map<string, Array<object>>} */
const orders = new Map();

let nextOrderId = 1;

/** Адрес пункта самовывоза. */
export const PICKUP_ADDRESS = 'г. Минск, пер. Корженевского, 6, пом. 1';

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
  prebuilt: 'готовая_конфигурация_id',
};

/** Таблица остатков для позиции корзины. */
const TABLE_BY_CATEGORY = {
  prebuilt: 'ГотовыеКонфигурации',
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
  return isDatabaseConnected();
}

/**
 * Превращает ошибку Supabase в понятную ошибку API.
 *
 * @param {string} action Действие.
 * @param {object} error Ошибка.
 * @returns {Error & {status: number, code: string}}
 */
function databaseFailure(action, error) {
  console.error(`[commerce] ${action}:`, error?.message || error);
  return apiError(
    502,
    'DATABASE_ERROR',
    `Не удалось ${action}: ${error?.message || 'ошибка базы данных'}`,
  );
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
    imageUrl: product?.imageUrl || null,
    stock: Number(product?.stock ?? 0),
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
    } catch (error) {
      throw databaseFailure('загрузить корзину', error);
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

  const stock = Number(product.stock ?? 10);
  if (stock <= 0) {
    throw apiError(400, 'OUT_OF_STOCK', `Товара «${product.name}» нет на складе`);
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
        const next = Number(existing.data['количество']) + qty;
        if (next > stock) {
          throw apiError(
            400,
            'OUT_OF_STOCK',
            `На складе только ${stock} шт. товара «${product.name}»`,
          );
        }
        const updated = await supabase
          .from('Корзина_Позиции')
          .update({ количество: next })
          .eq('id', existing.data.id);
        if (updated.error) throw updated.error;
      } else {
        if (qty > stock) {
          throw apiError(
            400,
            'OUT_OF_STOCK',
            `На складе только ${stock} шт. товара «${product.name}»`,
          );
        }
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
    } catch (error) {
      if (error.status) throw error;
      throw databaseFailure('добавить товар в корзину', error);
    }
  }

  const items = carts.get(key(userId)) || [];
  const id = `${product.category}:${product.productId}`;
  const found = items.find((item) => item.id === id);
  if (found) {
    if (found.qty + qty > stock) {
      throw apiError(
        400,
        'OUT_OF_STOCK',
        `На складе только ${stock} шт. товара «${product.name}»`,
      );
    }
    found.qty += qty;
  } else {
    items.push({
      id,
      category: product.category,
      productId: Number(product.productId),
      name: product.name,
      price: Number(product.price),
      stock,
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
  const product = await getProduct(itemId);
  if (!product) throw apiError(404, 'ITEM_NOT_FOUND', 'Товар не найден');
  if (amount > Number(product.stock ?? 10)) {
    throw apiError(
      400,
      'OUT_OF_STOCK',
      `На складе только ${product.stock} шт. товара «${product.name}»`,
    );
  }

  if (useSupabase() && field) {
    try {
      const cartId = await ensureCartId(userId, false);
      if (!cartId) return [];
      const query = supabase.from('Корзина_Позиции');
      if (amount === 0) {
        const removed = await query
          .delete()
          .eq('корзина_id', cartId)
          .eq(field, Number(rawId));
        if (removed.error) throw removed.error;
      } else {
        const updated = await query
          .update({ количество: amount })
          .eq('корзина_id', cartId)
          .eq(field, Number(rawId));
        if (updated.error) throw updated.error;
      }
      return getCart(userId);
    } catch (error) {
      throw databaseFailure('изменить количество в корзине', error);
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
    } catch (error) {
      throw databaseFailure('очистить корзину', error);
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
  if (!['pickup', 'courier'].includes(delivery)) {
    throw apiError(400, 'VALIDATION_ERROR', 'Неизвестный способ доставки');
  }

  const payment = String(data.paymentMethod || 'card');
  if (!['card', 'cash', 'invoice'].includes(payment)) {
    throw apiError(400, 'VALIDATION_ERROR', 'Неизвестный способ оплаты');
  }

  const address = String(data.address || '').trim();
  if (delivery === 'courier' && !address) {
    throw apiError(400, 'VALIDATION_ERROR', 'Укажите адрес доставки');
  }

  const phone = String(data.phone || '').trim();
  if (phone.length < 7) {
    throw apiError(400, 'VALIDATION_ERROR', 'Укажите телефон для связи');
  }

  // Комментарий покупателя храним в истории заказа: отдельного столбца
  // в «Заказах» нет, а история уже используется админкой.
  const customerComment = String(data.comment || '')
    .trim()
    .slice(0, 500);

  for (const item of items) {
    const product = await getProduct(item.id);
    if (!product) {
      throw apiError(400, 'PRODUCT_NOT_FOUND', `Товар «${item.name}» не найден`);
    }
    if (item.qty > Number(product.stock ?? 10)) {
      throw apiError(
        400,
        'OUT_OF_STOCK',
        `На складе только ${product.stock} шт. товара «${item.name}»`,
      );
    }
  }

  const itemsTotal = items.reduce((sum, item) => sum + item.price * item.qty, 0);

  // Доставка: самовывоз бесплатен; по Минску бесплатно от 500 BYN,
  // иначе 10 BYN; за МКАД — 15 BYN + 3 BYN за километр.
  let deliveryCost = 0;
  let deliveryZone = 'pickup';
  let distanceKm = null;
  if (delivery === 'courier') {
    deliveryZone = String(data.deliveryZone || 'minsk');
    if (deliveryZone === 'outside') {
      distanceKm = Number(data.distanceKm);
      if (!Number.isFinite(distanceKm) || distanceKm <= 0) {
        throw apiError(
          400,
          'VALIDATION_ERROR',
          'Укажите расстояние за МКАД в километрах',
        );
      }
      if (distanceKm > 50) {
        throw apiError(
          400,
          'VALIDATION_ERROR',
          'Доставка только по Минскому району: не более 50 км от МКАД',
        );
      }
      distanceKm = Math.round(distanceKm * 10) / 10;
      deliveryCost = 15 + 3 * Math.ceil(distanceKm);
    } else {
      deliveryCost = itemsTotal >= 500 ? 0 : 10;
    }
  }

  const total = itemsTotal + deliveryCost;
  const orderAddress = delivery === 'pickup' ? PICKUP_ADDRESS : address;
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
          адрес_доставки: orderAddress || null,
          телефон: phone,
          способ_оплаты: payment,
          итоговая_сумма: total,
          стоимость_доставки: deliveryCost,
          зона_доставки: deliveryZone,
          расстояние_км: distanceKm,
          эл_почта: String(data.email || '') || null,
        })
        .select('*')
        .single();
      if (created.error) throw created.error;

      const positions = await supabase.from('Заказ_Позиции').insert(
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
      if (positions.error) throw positions.error;

      const history = await supabase.from('ИсторияЗаказов').insert({
        заказ_id: created.data.id,
        статус: 'Новый',
        комментарий: customerComment || 'Заказ создан',
      });
      if (history.error) {
        console.error('[commerce] история заказа:', history.error.message);
      }

      // Списываем проданные товары со склада. Готовая сборка — отдельная
      // позиция со своим количеством, комплектующие списываются поштучно.
      // Ошибку списания не скрываем, но заказ уже создан: пишем в журнал.
      for (const item of items) {
        const table =
          TABLE_BY_CATEGORY[item.category] || CATEGORY_BY_ID.get(item.category)?.table;
        if (!table) continue;
        const product = await getProduct(item.id);
        const nextStock = Math.max(0, Number(product?.stock ?? 0) - Number(item.qty));
        const stockUpdate = await supabase
          .from(table)
          .update({ количество: nextStock })
          .eq('id', Number(item.productId));
        if (stockUpdate.error) {
          console.error(`[commerce] списание ${item.id}:`, stockUpdate.error.message);
        }

        // Готовая сборка уносит со склада и свои комплектующие.
        if (item.category === 'prebuilt') {
          await adjustPrebuiltComponents(item.productId, -1, Number(item.qty) || 1);
        }
      }

      await clearCart(userId);
      return {
        id: String(created.data.id),
        number: created.data.номер,
        status: created.data.статус,
        deliveryMethod: delivery,
        deliveryZone,
        address: orderAddress || null,
        itemsTotal,
        deliveryCost,
        distanceKm,
        total,
        items,
        createdAt: created.data.создан_в,
      };
    } catch (error) {
      console.error('[commerce] сохранить заказ:', error?.message || error);
      throw apiError(
        502,
        'DATABASE_ERROR',
        `Не удалось сохранить заказ: ${error?.message || 'ошибка базы данных'}`,
      );
    }
  }

  const order = {
    id: String(nextOrderId++),
    number: `PCH-2026-${String(nextOrderId - 1).padStart(6, '0')}`,
    userId: String(userId),
    status: 'Новый',
    deliveryMethod: delivery,
    deliveryZone,
    distanceKm,
    deliveryCost,
    itemsTotal,
    address: orderAddress || null,
    phone,
    paymentMethod: payment,
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
export async function listOrderHistory(userId, orderId) {
  if (!useSupabase()) {
    return { items: [], total: 0 };
  }
  try {
    const owner = await supabase
      .from('Заказы')
      .select('id')
      .eq('id', Number(orderId))
      .eq('пользователь_id', Number(userId))
      .maybeSingle();
    if (owner.error) throw owner.error;
    if (!owner.data) throw apiError(404, 'ORDER_NOT_FOUND', 'Заказ не найден');

    const { data, error } = await supabase
      .from('ИсторияЗаказов')
      .select('id,статус,комментарий,создан_в')
      .eq('заказ_id', Number(orderId))
      .order('создан_в', { ascending: false });
    if (error) throw error;
    const items = (data || []).map((row) => ({
      id: String(row.id),
      status: row['статус'],
      comment: row['комментарий'] || '',
      createdAt: row['создан_в'],
    }));
    return { items, total: items.length };
  } catch (error) {
    if (error.code === 'ORDER_NOT_FOUND') throw error;
    throw databaseFailure('загрузить историю заказа', error);
  }
}

/**
 * Покупатель подтверждает получение заказа.
 *
 * Завершить можно только заказ, готовый к выдаче или уже доставленный.
 *
 * @param {string} userId Пользователь.
 * @param {string} orderId Заказ.
 * @returns {Promise<object>}
 */
export async function completeOrder(userId, orderId) {
  if (useSupabase()) {
    try {
      const { data: row, error } = await supabase
        .from('Заказы')
        .select('*')
        .eq('id', Number(orderId))
        .eq('пользователь_id', Number(userId))
        .maybeSingle();
      if (error) throw error;
      if (!row) throw apiError(404, 'ORDER_NOT_FOUND', 'Заказ не найден');
      if (!['Готов к выдаче', 'Доставлен'].includes(row.статус)) {
        throw apiError(400, 'ORDER_NOT_READY', 'Заказ ещё не готов к получению');
      }

      const updated = await supabase
        .from('Заказы')
        .update({
          статус: 'Завершён',
          обновлён_в: new Date().toISOString(),
        })
        .eq('id', Number(orderId))
        .select('*')
        .single();
      if (updated.error) throw updated.error;

      const history = await supabase.from('ИсторияЗаказов').insert({
        заказ_id: Number(orderId),
        статус: 'Завершён',
        комментарий: 'Получение подтверждено покупателем',
      });
      if (history.error) {
        console.error('[commerce] история завершения:', history.error.message);
      }

      return {
        id: String(updated.data.id),
        number: updated.data.номер,
        status: updated.data.статус,
        total: Number(updated.data['итоговая_сумма'] || 0),
      };
    } catch (error) {
      if (error.status) throw error;
      throw databaseFailure('завершить заказ', error);
    }
  }

  const list = orders.get(key(userId)) || [];
  const order = list.find((item) => item.id === String(orderId));
  if (!order) throw apiError(404, 'ORDER_NOT_FOUND', 'Заказ не найден');
  if (!['Готов к выдаче', 'Доставлен'].includes(order.status)) {
    throw apiError(400, 'ORDER_NOT_READY', 'Заказ ещё не готов к получению');
  }
  order.status = 'Завершён';
  order.comment = 'Получение подтверждено покупателем';
  order.managerComment = order.comment;
  return {
    id: order.id,
    number: order.number,
    status: order.status,
    total: Number(order.total || 0),
  };
}

/**
 * Покупатель отказывается от получения заказа.
 *
 * Доступно для «Готов к выдаче» и «Доставлен». Заказ становится
 * «Отменён», товар возвращается на склад, причина сохраняется в истории
 * и комментарии менеджера.
 *
 * @param {string} userId Пользователь.
 * @param {string} orderId Заказ.
 * @param {string} reason Причина отказа.
 * @returns {Promise<object>}
 */
export async function refuseOrder(userId, orderId, reason) {
  const comment = String(reason || '').trim();
  if (!comment) {
    throw apiError(400, 'REASON_REQUIRED', 'Укажите причину отказа');
  }

  if (useSupabase()) {
    try {
      const { data: row, error } = await supabase
        .from('Заказы')
        .select('*')
        .eq('id', Number(orderId))
        .eq('пользователь_id', Number(userId))
        .maybeSingle();
      if (error) throw error;
      if (!row) throw apiError(404, 'ORDER_NOT_FOUND', 'Заказ не найден');
      if (!['Готов к выдаче', 'Доставлен'].includes(row.статус)) {
        throw apiError(
          400,
          'ORDER_NOT_READY',
          'Отказаться можно только после готовности заказа',
        );
      }

      // В базе есть защита: заказ нельзя отменить напрямую из «Доставлен».
      // Для отказа покупателя сначала возвращаем его в «Готов к выдаче»,
      // затем отменяем — это разрешённый переход.
      if (row.статус === 'Доставлен') {
        const step = await supabase
          .from('Заказы')
          .update({ статус: 'Готов к выдаче', обновлён_в: new Date().toISOString() })
          .eq('id', Number(orderId))
          .select('*')
          .single();
        if (step.error) throw step.error;
      }

      const updated = await supabase
        .from('Заказы')
        .update({
          статус: 'Отменён',
          комментарий_менеджера: `Отказ покупателя: ${comment}`,
          обновлён_в: new Date().toISOString(),
        })
        .eq('id', Number(orderId))
        .select('*')
        .single();
      if (updated.error) throw updated.error;

      // Товар не получен — возвращаем его на склад.
      await adjustOrderStock(orderId, 1);

      const history = await supabase.from('ИсторияЗаказов').insert({
        заказ_id: Number(orderId),
        статус: 'Отменён',
        комментарий: `Отказ покупателя: ${comment}`,
      });
      if (history.error) {
        console.error('[commerce] история отказа:', history.error.message);
      }

      return {
        id: String(updated.data.id),
        number: updated.data.номер,
        status: updated.data.статус,
        total: Number(updated.data['итоговая_сумма'] || 0),
      };
    } catch (error) {
      if (error.status) throw error;
      throw databaseFailure('отказаться от заказа', error);
    }
  }

  const list = orders.get(key(userId)) || [];
  const order = list.find((item) => item.id === String(orderId));
  if (!order) throw apiError(404, 'ORDER_NOT_FOUND', 'Заказ не найден');
  if (!['Готов к выдаче', 'Доставлен'].includes(order.status)) {
    throw apiError(
      400,
      'ORDER_NOT_READY',
      'Отказаться можно только после готовности заказа',
    );
  }
  order.status = 'Отменён';
  order.comment = `Отказ покупателя: ${comment}`;
  order.managerComment = order.comment;
  return {
    id: order.id,
    number: order.number,
    status: order.status,
    total: Number(order.total || 0),
  };
}

/**
 * Находит заказ пользователя или возвращает null.
 *
 * @param {string} userId Пользователь.
 * @param {string} orderId Заказ.
 * @returns {Promise<object|null>}
 */
async function findOrderForUser(userId, orderId) {
  if (useSupabase()) {
    const { data, error } = await supabase
      .from('Заказы')
      .select('*')
      .eq('id', Number(orderId))
      .eq('пользователь_id', Number(userId))
      .maybeSingle();
    if (error) throw databaseFailure('найти заказ', error);
    return data || null;
  }
  const list = orders.get(key(userId)) || [];
  return list.find((item) => item.id === String(orderId)) || null;
}

/**
 * Состав заказа покупателя (только для его собственного заказа).
 *
 * @param {string} userId Пользователь.
 * @param {string} orderId Заказ.
 * @returns {Promise<{items: object[], total: number}>}
 */
export async function listOrderItems(userId, orderId) {
  const order = await findOrderForUser(userId, orderId);
  if (!order) throw apiError(404, 'ORDER_NOT_FOUND', 'Заказ не найден');

  if (useSupabase()) {
    const { data, error } = await supabase
      .from('Заказ_Позиции')
      .select('*')
      .eq('заказ_id', Number(orderId));
    if (error) throw databaseFailure('загрузить состав заказа', error);
    const items = (data || []).map((row) => ({
      id: `${row['тип_компонента']}:${row['идентификатор']}`,
      category: row['тип_компонента'],
      name: row['название'] || 'Товар',
      price: Number(row['цена_за_единицу'] || 0),
      qty: Number(row['количество'] || 1),
      sum: Number(row['сумма'] || 0),
    }));
    return { items, total: items.length };
  }

  const items = (order.items || []).map((item) => ({
    id: `${item.category}:${item.productId}`,
    category: item.category,
    name: item.name,
    price: Number(item.price || 0),
    qty: Number(item.qty || 1),
    sum: Number(item.sum || 0),
  }));
  return { items, total: items.length };
}

/**
 * Повторяет завершённый или отменённый заказ.
 *
 * Позиции добавляются в серверную корзину с проверкой остатка. Товары,
 * которых больше нет на складе, пропускаются и возвращаются в skipped.
 *
 * @param {string} userId Пользователь.
 * @param {string} orderId Заказ.
 * @returns {Promise<{added: number, skipped: string[]}>}
 */
export async function repeatOrder(userId, orderId) {
  const order = await findOrderForUser(userId, orderId);
  if (!order) throw apiError(404, 'ORDER_NOT_FOUND', 'Заказ не найден');

  const status = useSupabase() ? order.статус : order.status;
  if (!['Завершён', 'Отменён'].includes(status)) {
    throw apiError(
      400,
      'ORDER_NOT_FINAL',
      'Повторить можно только завершённый или отменённый заказ',
    );
  }

  const { items } = await listOrderItems(userId, orderId);
  const skipped = [];
  let added = 0;

  for (const item of items) {
    const product = await getProduct(item.id);
    if (!product || Number(product.stock ?? 0) < item.qty) {
      skipped.push(item.name);
      continue;
    }
    try {
      // addItem ожидает числовой productId, а getProduct отдаёт составной id.
      const productId = Number(item.id.split(':')[1]);
      await addItem(userId, { ...product, productId, qty: item.qty });
      added += 1;
    } catch {
      skipped.push(item.name);
    }
  }

  return { added, skipped };
}

export async function listOrders(userId) {
  if (useSupabase()) {
    try {
      const { data, error } = await supabase
        .from('Заказы')
        .select('*')
        .eq('пользователь_id', Number(userId))
        .order('создан_в', { ascending: false });
      if (error) throw error;
      return data.map((row) => {
        const deliveryCost = Number(row.стоимость_доставки || 0);
        return {
          id: String(row.id),
          number: row.номер,
          status: row.статус,
          total: Number(row.итоговая_сумма || 0),
          itemsTotal: Number(row.итоговая_сумма || 0) - deliveryCost,
          deliveryCost,
          deliveryZone: row.зона_доставки || '',
          distanceKm: row.расстояние_км != null ? Number(row.расстояние_км) : null,
          managerComment: row.комментарий_менеджера || '',
          createdAt: row.создан_в,
        };
      });
    } catch (error) {
      throw databaseFailure('загрузить заказы', error);
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
