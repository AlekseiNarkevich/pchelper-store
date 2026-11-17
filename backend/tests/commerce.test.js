/**
 * Тесты серверной корзины и заказов (ЛР8).
 */
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';

import { createApp } from '../src/app.js';

let server;
let BASE;
let token;
let productId;

before(async () => {
  server = createApp().listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  BASE = `http://127.0.0.1:${server.address().port}`;

  const login = await request('/api/v1/auth/login', {
    method: 'POST',
    body: { email: 'demo@pchelper.by', password: 'demo1234' },
  });
  token = login.body.accessToken;

  const catalog = await request('/api/v1/products?category=cpu&limit=1');
  productId = catalog.body.items[0].id;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
});

/**
 * Выполняет JSON-запрос.
 *
 * @param {string} path Путь.
 * @param {object} options Метод, тело, токен.
 * @returns {Promise<{status: number, body: object|null}>}
 */
async function request(path, options = {}) {
  const { method = 'GET', body, auth = true } = options;
  const headers = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (auth && token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null };
}

test('корзина требует авторизацию', async () => {
  const { status, body } = await request('/api/v1/cart', { auth: false });
  assert.equal(status, 401);
  assert.equal(body.error.code, 'UNAUTHORIZED');
});

test('добавление, изменение и удаление позиции', async () => {
  const added = await request('/api/v1/cart/items', {
    method: 'POST',
    body: { id: productId, qty: 1 },
  });
  assert.equal(added.status, 201);
  assert.equal(added.body.items.length, 1);
  assert.equal(added.body.items[0].id, productId);

  const cart = await request('/api/v1/cart');
  assert.equal(cart.status, 200);
  assert.equal(cart.body.count, 1);
  assert.ok(cart.body.total > 0);

  const updated = await request(`/api/v1/cart/items/${encodeURIComponent(productId)}`, {
    method: 'PATCH',
    body: { qty: 2 },
  });
  assert.equal(updated.status, 200);
  assert.equal(updated.body.items[0].qty, 2);

  const removed = await request(`/api/v1/cart/items/${encodeURIComponent(productId)}`, {
    method: 'DELETE',
  });
  assert.equal(removed.status, 200);
  assert.equal(removed.body.items.length, 0);
});

test('оформление заказа очищает корзину и создаёт позиции', async () => {
  await request('/api/v1/cart/items', {
    method: 'POST',
    body: { id: productId, qty: 2 },
  });

  const order = await request('/api/v1/orders', {
    method: 'POST',
    body: {
      deliveryMethod: 'courier',
      address: 'Минск, ул. Тестовая, 1',
      phone: '+375291234567',
      paymentMethod: 'card',
    },
  });
  assert.equal(order.status, 201);
  assert.match(order.body.number, /^PCH-2026-\d{6}$/);
  assert.equal(order.body.items.length, 1);
  assert.equal(order.body.items[0].qty, 2);
  assert.ok(order.body.total > 0);

  const cart = await request('/api/v1/cart');
  assert.equal(cart.body.items.length, 0);

  const orders = await request('/api/v1/orders');
  assert.equal(orders.status, 200);
  assert.equal(orders.body.items.length, 1);
});

test('нельзя оформить пустую корзину', async () => {
  const order = await request('/api/v1/orders', {
    method: 'POST',
    body: { deliveryMethod: 'pickup', phone: '+375291234567' },
  });
  assert.equal(order.status, 400);
  assert.equal(order.body.error.code, 'EMPTY_CART');
});
