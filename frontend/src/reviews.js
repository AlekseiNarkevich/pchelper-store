/**
 * Клиент отзывов товара.
 */

import { readAuth, refreshAccessToken } from './auth.js';

const BASE = (import.meta.env.VITE_API_URL || '/api/v1').replace(/\/+$/, '');

/**
 * Опубликованные отзывы и средняя оценка.
 *
 * @param {string} productId Идентификатор «cpu:1».
 * @returns {Promise<object>}
 */
export async function getReviews(productId) {
  const response = await fetch(
    `${BASE}/products/${encodeURIComponent(productId)}/reviews`,
    { headers: { Accept: 'application/json' } },
  );
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(data?.error?.message || 'Не удалось загрузить отзывы');
  }
  return data;
}

/**
 * Отправляет отзыв на модерацию.
 *
 * @param {string} productId Идентификатор «cpu:1».
 * @param {{rating: number, text: string}} review Отзыв.
 * @returns {Promise<object>}
 */
export async function createReview(productId, review) {
  let token = readAuth().accessToken;
  if (!token) throw new Error('Войдите, чтобы оставить отзыв');

  const send = (accessToken) =>
    fetch(`${BASE}/products/${encodeURIComponent(productId)}/reviews`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(review),
    });

  let response = await send(token);
  if (response.status === 401) {
    const refreshed = await refreshAccessToken();
    if (refreshed?.accessToken) {
      token = refreshed.accessToken;
      response = await send(token);
    }
  }

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(data?.error?.message || 'Не удалось отправить отзыв');
  }
  return data.review;
}
