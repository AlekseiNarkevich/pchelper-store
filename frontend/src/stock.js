/**
 * Клиент запроса на поступление товара.
 */

const BASE = (import.meta.env.VITE_API_URL || '/api/v1').replace(/\/+$/, '');

/**
 * Оставляет запрос на поступление.
 *
 * @param {string} productId Идентификатор «cpu:1».
 * @param {{email?: string, phone?: string}} data Контакты.
 * @returns {Promise<object>}
 */
export async function requestStock(productId, data) {
  const response = await fetch(
    `${BASE}/products/${encodeURIComponent(productId)}/stock-request`,
    {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    },
  );
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(body?.error?.message || 'Не удалось сохранить запрос');
  }
  return body.request;
}
