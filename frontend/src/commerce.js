/**
 * Клиент серверной корзины и заказов.
 *
 * Корзина в браузере остаётся удобной для гостя; при оформлении заказа
 * её состав синхронизируется с сервером, а заказ сохраняется в Supabase.
 */

import { readAuth, refreshAccessToken } from './auth.js';

const BASE = (import.meta.env.VITE_API_URL || '/api/v1').replace(/\/+$/, '');

/**
 * Выполняет авторизованный запрос с однократным обновлением токена.
 *
 * @param {string} path Путь относительно BASE.
 * @param {{method?: string, body?: object}} options Параметры.
 * @returns {Promise<object|null>}
 */
async function request(path, options = {}) {
  const { method = 'GET', body } = options;
  const headers = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  let token = readAuth().accessToken;
  if (!token) throw new Error('Требуется вход');

  const send = (accessToken) =>
    fetch(`${BASE}${path}`, {
      method,
      headers: { ...headers, Authorization: `Bearer ${accessToken}` },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

  let response = await send(token);
  if (response.status === 401) {
    const refreshed = await refreshAccessToken();
    if (refreshed?.accessToken) {
      token = refreshed.accessToken;
      response = await send(token);
    }
  }

  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(data?.error?.message || `Ошибка сервера ${response.status}`);
  }
  return data;
}

/**
 * Возвращает серверную корзину.
 *
 * @returns {Promise<{items: object[], total: number, count: number}>}
 */
export function getServerCart() {
  return request('/cart');
}

/**
 * Очищает серверную корзину.
 *
 * @returns {Promise<void>}
 */
export async function clearServerCart() {
  await request('/cart/clear', { method: 'POST' });
}

/**
 * Добавляет позицию в серверную корзину.
 *
 * @param {string} id Идентификатор вида «cpu:1».
 * @param {number} qty Количество.
 * @returns {Promise<object>}
 */
export function addServerItem(id, qty = 1) {
  return request('/cart/items', { method: 'POST', body: { id, qty } });
}

/**
 * Меняет количество позиции в серверной корзине.
 *
 * @param {string} id Идентификатор вида «cpu:1».
 * @param {number} qty Новое количество.
 * @returns {Promise<object>}
 */
export function updateServerItem(id, qty) {
  return request(`/cart/items/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: { qty },
  });
}

/**
 * Удаляет позицию из серверной корзины.
 *
 * @param {string} id Идентификатор вида «cpu:1».
 * @returns {Promise<object>}
 */
export function removeServerItem(id) {
  return request(`/cart/items/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}

/**
 * Переносит локальную корзину на сервер.
 *
 * Серверная корзина предварительно очищается: иначе после нескольких
 * оформлений в ней остались бы старые позиции.
 *
 * @param {Array<{id: string, qty: number}>} items Позиции локальной корзины.
 * @returns {Promise<void>}
 */
export async function syncCart(items) {
  await clearServerCart();
  for (const item of items) {
    await addServerItem(item.id, item.qty);
  }
}

/**
 * Создаёт заказ из серверной корзины.
 *
 * @param {{deliveryMethod: string, address: string, phone: string, paymentMethod: string}} data Данные доставки.
 * @returns {Promise<object>}
 */
export function createOrder(data) {
  return request('/orders', { method: 'POST', body: data });
}

/**
 * Список заказов пользователя.
 *
 * @returns {Promise<{items: object[], total: number}>}
 */
export function listOrders() {
  return request('/orders');
}
