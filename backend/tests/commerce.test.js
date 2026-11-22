/**
 * Тесты серверной корзины и заказов (ЛР8).
 */
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';

import { createApp } from '../src/app.js';
import { listOrders } from '../src/repositories/commerce.repository.js';
import { isDatabaseConnected } from '../src/services/supabase.service.js';

let server;
let BASE;
let token;
let userId;
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
  userId = login.body.user.id;

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

test('готовая сборка добавляется одной позицией', async () => {
  const builds = await request('/api/v1/prebuilt');
  const build = builds.body.items.find((item) => Number(item.stock) > 0);
  assert.ok(build, 'нужна хотя бы одна сборка в наличии');

  const id = `prebuilt:${build.id}`;
  const added = await request('/api/v1/cart/items', {
    method: 'POST',
    body: { id, qty: 1 },
  });
  assert.equal(added.status, 201);
  assert.equal(added.body.items.length, 1);
  assert.equal(added.body.items[0].id, id);
  assert.equal(added.body.items[0].name, build.name);
  assert.equal(added.body.items[0].price, build.price);
  assert.equal(added.body.items[0].qty, 1);

  const tooMany = await request('/api/v1/cart/items', {
    method: 'POST',
    body: { id, qty: 10 },
  });
  assert.equal(tooMany.status, 400);
  assert.equal(tooMany.body.error.code, 'OUT_OF_STOCK');

  const removed = await request(`/api/v1/cart/items/${encodeURIComponent(id)}`, {
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

test(
  'покупатель может отказаться от получения',
  { skip: isDatabaseConnected() },
  async () => {
    await request('/api/v1/cart/items', {
      method: 'POST',
      body: { id: productId, qty: 1 },
    });
    const created = await request('/api/v1/orders', {
      method: 'POST',
      body: {
        deliveryMethod: 'pickup',
        phone: '+375291234567',
        paymentMethod: 'cash',
      },
    });
    assert.equal(created.status, 201);

    // В памяти заказ хранится тем же объектом: переводим его в состояние,
    // в котором покупатель уже может забрать товар.
    const stored = await listOrders(userId);
    const order = stored.find((item) => item.id === created.body.id);
    assert.ok(order);
    order.status = 'Готов к выдаче';

    const refused = await request(`/api/v1/orders/${created.body.id}/refuse`, {
      method: 'POST',
      body: { reason: 'Товар не подошёл' },
    });
    assert.equal(refused.status, 200);
    assert.equal(refused.body.status, 'Отменён');

    const refreshed = await request('/api/v1/orders');
    const saved = refreshed.body.items.find((item) => item.id === created.body.id);
    assert.equal(saved.status, 'Отменён');
    assert.equal(saved.managerComment, 'Отказ покупателя: Товар не подошёл');
  },
);

test(
  'покупатель может подтвердить получение',
  { skip: isDatabaseConnected() },
  async () => {
    await request('/api/v1/cart/items', {
      method: 'POST',
      body: { id: productId, qty: 1 },
    });
    const created = await request('/api/v1/orders', {
      method: 'POST',
      body: {
        deliveryMethod: 'pickup',
        phone: '+375291234567',
        paymentMethod: 'cash',
      },
    });
    assert.equal(created.status, 201);

    const stored = await listOrders(userId);
    const order = stored.find((item) => item.id === created.body.id);
    assert.ok(order);
    order.status = 'Готов к выдаче';

    const completed = await request(`/api/v1/orders/${created.body.id}/complete`, {
      method: 'POST',
    });
    assert.equal(completed.status, 200);
    assert.equal(completed.body.status, 'Завершён');

    const refreshed = await request('/api/v1/orders');
    const saved = refreshed.body.items.find((item) => item.id === created.body.id);
    assert.equal(saved.status, 'Завершён');
    assert.equal(saved.managerComment, 'Получение подтверждено покупателем');
  },
);

test('доставка за МКАД считается по километрам', async () => {
  const email = `delivery-${Date.now()}@example.com`;
  const registered = await request('/api/v1/auth/register', {
    method: 'POST',
    auth: false,
    body: { email, password: 'secret123', name: 'Доставка' },
  });
  const userToken = registered.body.accessToken;
  const headers = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    Authorization: `Bearer ${userToken}`,
  };

  const catalog = await request('/api/v1/products?category=cpu&limit=1', {
    auth: false,
  });
  const product = catalog.body.items[0];

  await fetch(`${BASE}/api/v1/cart/items`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ id: product.id, qty: 1 }),
  });

  const response = await fetch(`${BASE}/api/v1/orders`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      deliveryMethod: 'courier',
      deliveryZone: 'outside',
      distanceKm: 10,
      address: 'Минский район, 10 км от МКАД',
      phone: '+375291234567',
      paymentMethod: 'card',
    }),
  });
  const order = await response.json();

  assert.equal(response.status, 201);
  assert.equal(order.deliveryCost, 45);
  assert.equal(order.total, product.price + 45);
  assert.equal(order.deliveryZone, 'outside');
  assert.equal(order.distanceKm, 10);
});

test('нельзя оформить пустую корзину', async () => {
  const order = await request('/api/v1/orders', {
    method: 'POST',
    body: { deliveryMethod: 'pickup', phone: '+375291234567' },
  });
  assert.equal(order.status, 400);
  assert.equal(order.body.error.code, 'EMPTY_CART');
});

test('заказ готовой сборки содержит одну позицию', async () => {
  const builds = await request('/api/v1/prebuilt');
  const build = builds.body.items.find((item) => Number(item.stock) > 0);
  assert.ok(build, 'нужна хотя бы одна сборка в наличии');

  const added = await request('/api/v1/cart/items', {
    method: 'POST',
    body: { id: `prebuilt:${build.id}`, qty: 1 },
  });
  assert.equal(added.status, 201);

  const order = await request('/api/v1/orders', {
    method: 'POST',
    body: { deliveryMethod: 'pickup', phone: '+375291234567', paymentMethod: 'cash' },
  });
  assert.equal(order.status, 201);
  assert.equal(order.body.items.length, 1);
  assert.equal(order.body.items[0].name, build.name);
  assert.equal(order.body.total, build.price);
});
