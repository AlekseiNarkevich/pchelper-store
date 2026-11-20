/**
 * PCHelper (ЛР8) — клиент аутентификации.
 *
 * Токены хранятся в localStorage. При изменении состояния выбрасывается
 * событие `pchelper-auth-change`, чтобы шапка и страницы обновлялись.
 */

const KEY = 'pchelper-auth';
const EVENT = 'pchelper-auth-change';
const BASE = (import.meta.env.VITE_API_URL || '/api/v1').replace(/\/+$/, '');

/**
 * Читает состояние аутентификации.
 *
 * @returns {{accessToken: string|null, refreshToken: string|null, user: object|null}}
 */
export function readAuth() {
  try {
    const data = JSON.parse(localStorage.getItem(KEY) || '{}');
    return {
      accessToken: data.accessToken || null,
      refreshToken: data.refreshToken || null,
      user: data.user || null,
    };
  } catch {
    return { accessToken: null, refreshToken: null, user: null };
  }
}

/**
 * Сохраняет состояние и уведомляет подписчиков.
 *
 * @param {object} state Новое состояние.
 */
function writeAuth(state) {
  localStorage.setItem(KEY, JSON.stringify(state));
  window.dispatchEvent(new Event(EVENT));
}

/**
 * Подписка на изменение состояния.
 *
 * @param {Function} listener Слушатель.
 * @returns {Function} Функция отписки.
 */
export function onAuthChange(listener) {
  window.addEventListener(EVENT, listener);
  window.addEventListener('storage', listener);
  return () => {
    window.removeEventListener(EVENT, listener);
    window.removeEventListener('storage', listener);
  };
}

/**
 * Выполняет запрос к API аутентификации.
 *
 * @param {string} path Путь относительно BASE.
 * @param {object} options Тело и метод.
 * @returns {Promise<object>}
 */
async function request(path, options = {}) {
  const { method = 'GET', body, token } = options;
  const headers = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;

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
 * Регистрирует пользователя.
 *
 * @param {{email: string, password: string, name?: string}} data Формы.
 */
export async function register(data) {
  const result = await request('/auth/register', { method: 'POST', body: data });
  writeAuth(result);
  return result;
}

/**
 * Выполняет вход.
 *
 * @param {{email: string, password: string}} data Формы.
 */
export async function login(data) {
  const result = await request('/auth/login', { method: 'POST', body: data });
  writeAuth(result);
  return result;
}

/**
 * Обновляет токены.
 */
export async function refresh() {
  const { refreshToken } = readAuth();
  if (!refreshToken) return null;
  const result = await request('/auth/refresh', {
    method: 'POST',
    body: { refreshToken },
  });
  writeAuth(result);
  return result;
}

/**
 * Выполняет выход.
 */
export async function logout() {
  const { refreshToken } = readAuth();
  if (refreshToken) {
    try {
      await request('/auth/logout', { method: 'POST', body: { refreshToken } });
    } catch {
      /* локальный выход всё равно выполняем */
    }
  }
  writeAuth({ accessToken: null, refreshToken: null, user: null });
}

/**
 * Обновляет профиль пользователя.
 *
 * @param {{name: string, phone?: string, address?: string}} data Поля профиля.
 */
export async function updateProfile(data) {
  const { accessToken } = readAuth();
  if (!accessToken) throw new Error('Требуется вход');
  const result = await request('/auth/profile', {
    method: 'PATCH',
    body: data,
    token: accessToken,
  });
  const state = readAuth();
  writeAuth({ ...state, user: result.user });
  return result.user;
}

/**
 * Возвращает профиль по токену.
 */
export async function fetchMe() {
  const { accessToken } = readAuth();
  if (!accessToken) return null;
  const data = await request('/auth/me', { token: accessToken });
  const state = readAuth();
  writeAuth({ ...state, user: data.user });
  return data.user;
}
