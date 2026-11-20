/**
 * Клиент административной панели.
 */

import { readAuth, refreshAccessToken } from './auth.js';

const BASE = (import.meta.env.VITE_API_URL || '/api/v1').replace(/\/+$/, '');

/**
 * Авторизованный запрос с обновлением токена.
 *
 * @param {string} path Путь.
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
  if (response.status === 403) {
    throw new Error('Недостаточно прав: нужен администратор');
  }
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

export const getSummary = () => request('/admin/summary');
export const getOrders = () => request('/admin/orders');
export const getOrderPositions = (id) =>
  request(`/admin/orders/${encodeURIComponent(id)}/positions`);
export const updateOrder = (id, data) =>
  request(`/admin/orders/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: data,
  });

export const getUsers = () => request('/admin/users');
export const updateUser = (id, data) =>
  request(`/admin/users/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: data,
  });

export const getProducts = (category) =>
  request(`/admin/products?category=${encodeURIComponent(category)}`);
export const createProduct = (category, data) =>
  request('/admin/products', { method: 'POST', body: { category, data } });
export const updateProduct = (category, id, data) =>
  request(`/admin/products/${encodeURIComponent(category)}/${id}`, {
    method: 'PUT',
    body: { data },
  });
export const deleteProduct = (category, id) =>
  request(`/admin/products/${encodeURIComponent(category)}/${id}`, {
    method: 'DELETE',
  });

export const getPrebuiltStock = () => request('/admin/prebuilt-stock');
export const updatePrebuiltStock = (id, stock) =>
  request(`/admin/prebuilt-stock/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: { stock },
  });

export const getStockRequests = () => request('/admin/stock-requests');
export const updateStockRequest = (id, status) =>
  request(`/admin/stock-requests/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: { status },
  });

export const getReviews = (status = '') =>
  request(`/admin/reviews${status ? `?status=${encodeURIComponent(status)}` : ''}`);
export const moderateReview = (id, status) =>
  request(`/admin/reviews/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: { status },
  });
