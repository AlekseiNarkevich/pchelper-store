/**
 * Тесты аутентификации ЛР8: регистрация, вход, refresh и профиль.
 *
 * Используют встроенный node:test и fetch, поэтому не требуют supertest.
 */
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';

import { createApp } from '../src/app.js';

let server;
let BASE;

before(async () => {
  server = createApp().listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  BASE = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
});

/**
 * Отправляет JSON-запрос.
 *
 * @param {string} path Путь.
 * @param {object} options Метод, тело и заголовки.
 * @returns {Promise<{status: number, body: object|null}>}
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
  return { status: response.status, body: text ? JSON.parse(text) : null };
}

/**
 * Создаёт уникальный e-mail для теста.
 *
 * @returns {string}
 */
function email() {
  return `user-${Date.now()}-${Math.random().toString(16).slice(2)}@example.com`;
}

test('регистрация создаёт пользователя и выдаёт токены', async () => {
  const address = email();
  const { status, body } = await request('/api/v1/auth/register', {
    method: 'POST',
    body: { email: address, password: 'secret123', name: 'Тест' },
  });

  assert.equal(status, 201);
  assert.equal(body.user.email, address);
  assert.equal(body.user.role, 'user');
  assert.equal(body.user.passwordHash, undefined);
  assert.equal(typeof body.accessToken, 'string');
  assert.equal(typeof body.refreshToken, 'string');
});

test('повторная регистрация с тем же e-mail возвращает 409', async () => {
  const address = email();
  const payload = { email: address, password: 'secret123' };
  await request('/api/v1/auth/register', { method: 'POST', body: payload });
  const { status, body } = await request('/api/v1/auth/register', {
    method: 'POST',
    body: payload,
  });

  assert.equal(status, 409);
  assert.equal(body.error.code, 'EMAIL_EXISTS');
});

test('валидация формы возвращает 400', async () => {
  const badEmail = await request('/api/v1/auth/register', {
    method: 'POST',
    body: { email: 'not-an-email', password: 'secret123' },
  });
  assert.equal(badEmail.status, 400);
  assert.equal(badEmail.body.error.code, 'VALIDATION_ERROR');

  const shortPassword = await request('/api/v1/auth/register', {
    method: 'POST',
    body: { email: email(), password: '123' },
  });
  assert.equal(shortPassword.status, 400);
});

test('вход демо-пользователя и ошибки входа', async () => {
  const ok = await request('/api/v1/auth/login', {
    method: 'POST',
    body: { email: 'demo@pchelper.by', password: 'demo1234' },
  });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.user.email, 'demo@pchelper.by');

  const wrongPassword = await request('/api/v1/auth/login', {
    method: 'POST',
    body: { email: 'demo@pchelper.by', password: 'wrong' },
  });
  assert.equal(wrongPassword.status, 401);
  assert.equal(wrongPassword.body.error.code, 'INVALID_CREDENTIALS');

  const unknown = await request('/api/v1/auth/login', {
    method: 'POST',
    body: { email: email(), password: 'secret123' },
  });
  assert.equal(unknown.status, 401);
});

test('профиль доступен только с access-токеном', async () => {
  const login = await request('/api/v1/auth/login', {
    method: 'POST',
    body: { email: 'demo@pchelper.by', password: 'demo1234' },
  });

  const me = await request('/api/v1/auth/me', { token: login.body.accessToken });
  assert.equal(me.status, 200);
  assert.equal(me.body.user.email, 'demo@pchelper.by');

  const anonymous = await request('/api/v1/auth/me');
  assert.equal(anonymous.status, 401);
  assert.equal(anonymous.body.error.code, 'UNAUTHORIZED');

  const invalid = await request('/api/v1/auth/me', { token: 'garbage' });
  assert.equal(invalid.status, 401);
});

test('refresh обновляет пару токенов, access-токен не подходит', async () => {
  const login = await request('/api/v1/auth/login', {
    method: 'POST',
    body: { email: 'demo@pchelper.by', password: 'demo1234' },
  });

  const refreshed = await request('/api/v1/auth/refresh', {
    method: 'POST',
    body: { refreshToken: login.body.refreshToken },
  });
  assert.equal(refreshed.status, 200);
  assert.notEqual(refreshed.body.accessToken, login.body.accessToken);
  assert.notEqual(refreshed.body.refreshToken, login.body.refreshToken);

  const wrongType = await request('/api/v1/auth/refresh', {
    method: 'POST',
    body: { refreshToken: login.body.accessToken },
  });
  assert.equal(wrongType.status, 401);

  const missing = await request('/api/v1/auth/refresh', {
    method: 'POST',
    body: {},
  });
  assert.equal(missing.status, 400);
});

test('logout отзывает refresh-токен', async () => {
  const login = await request('/api/v1/auth/login', {
    method: 'POST',
    body: { email: 'demo@pchelper.by', password: 'demo1234' },
  });

  const logout = await request('/api/v1/auth/logout', {
    method: 'POST',
    body: { refreshToken: login.body.refreshToken },
  });
  assert.equal(logout.status, 204);

  const afterLogout = await request('/api/v1/auth/refresh', {
    method: 'POST',
    body: { refreshToken: login.body.refreshToken },
  });
  assert.equal(afterLogout.status, 401);
});
