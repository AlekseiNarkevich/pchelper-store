/**
 * Клиент конфигуратора, сохранённых сборок и калькулятора БП.
 *
 * Токен берётся из общего состояния аутентификации. Проверка совместимости
 * и расчёт БП доступны без входа; сохранение сборок требует токен.
 */

import { readAuth } from './auth.js';

const BASE = (import.meta.env.VITE_API_URL || '/api/v1').replace(/\/+$/, '');

/**
 * Выполняет запрос к API.
 *
 * @param {string} path Путь относительно BASE.
 * @param {{method?: string, body?: object, auth?: boolean}} options Параметры.
 * @returns {Promise<object>}
 */
async function request(path, options = {}) {
  const { method = 'GET', body, auth = false } = options;
  const headers = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (auth) {
    const { accessToken } = readAuth();
    if (!accessToken) throw new Error('Требуется вход');
    headers.Authorization = `Bearer ${accessToken}`;
  }

  const response = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(data?.error?.message || `Ошибка сервера ${response.status}`);
  }
  return data;
}

/**
 * Проверяет совместимость набора компонентов.
 *
 * @param {object} components Идентификаторы по категориям.
 * @returns {Promise<object>}
 */
export function checkCompatibility(components) {
  return request('/builds/check', { method: 'POST', body: { components } });
}

/**
 * Сохраняет сборку.
 *
 * @param {{name: string, note?: string, components: object}} payload Данные.
 * @returns {Promise<object>}
 */
export function saveBuild(payload) {
  return request('/builds', { method: 'POST', body: payload, auth: true });
}

/**
 * Список сборок пользователя.
 *
 * @returns {Promise<{items: object[], total: number}>}
 */
export function listBuilds() {
  return request('/builds', { auth: true });
}

/**
 * Одна сборка с составом.
 *
 * @param {string} id Идентификатор.
 * @returns {Promise<object>}
 */
export function getBuild(id) {
  return request(`/builds/${encodeURIComponent(id)}`, { auth: true });
}

/**
 * Удаляет сборку.
 *
 * @param {string} id Идентификатор.
 * @returns {Promise<void>}
 */
export async function removeBuild(id) {
  await request(`/builds/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    auth: true,
  });
}

/**
 * Рассчитывает рекомендуемую мощность блока питания.
 *
 * @param {string} cpuId Идентификатор процессора.
 * @param {string|null} gpuId Идентификатор видеокарты.
 * @returns {Promise<object>}
 */
export function calculatePsu(cpuId, gpuId) {
  const params = new URLSearchParams({ cpu: cpuId });
  if (gpuId) params.set('gpu', gpuId);
  return request(`/psu?${params.toString()}`);
}
