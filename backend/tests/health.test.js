/**
 * Юнит-тесты backend-сервиса (ЛР4, задание 6, пункт 6).
 *
 * Запускаются командой `node --test tests/` ДО сборки Docker-образа.
 * Тесты используют встроенный раннер node:test и глобальный fetch,
 * поэтому внешних зависимостей (vitest, supertest) не требуется —
 * образ с тестами собирается быстро и весит мало.
 *
 * Приложение поднимается на случайном свободном порту прямо в процессе
 * теста, поэтому проверяется ровно тот код, который попадёт в образ.
 */

import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';
import {
  deleteReview,
  listAll,
  listApproved,
  moderate,
  parseProductId,
} from '../src/repositories/reviews.repository.js';
import {
  sendAccountBlockedEmail,
  sendAccountDeletedEmail,
  sendAccountUnblockedEmail,
  sendOrderConfirmation,
  sendOrderStatusEmail,
  sendRawEmail,
  sendRestockEmail,
  sendReviewDeletedEmail,
  sendReviewModeratedEmail,
  sendRoleChangedEmail,
} from '../src/services/mail.service.js';
import { sendTestEmail } from '../src/repositories/mail.repository.js';

// Порт и базовый URL заполняются в before(), когда сервер уже поднят.
let server;
let BASE;
const ADMIN_TOKEN = 'test-admin-token';

// Токен подставляется до создания приложения: middleware читает его
// из переменной окружения при каждом запросе.
process.env.ADMIN_TOKEN = ADMIN_TOKEN;

before(async () => {
  // Слушаем порт 0 — операционная система выдаст свободный автоматически.
  server = createApp().listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  BASE = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
});

/** Вспомогательная функция: GET-запрос с разбором JSON-ответа. */
async function get(path, headers = {}) {
  const res = await fetch(`${BASE}${path}`, { headers });
  const text = await res.text();
  // Тело может оказаться не-JSON (например, HTML-страница nginx),
  // поэтому разбор не должен ронять тест.
  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { status: res.status, body };
}

test('проверка работоспособности: GET /api/v1/health возвращает 200 и status=ok', async () => {
  const { status, body } = await get('/api/v1/health');
  assert.equal(status, 200);
  assert.equal(body.status, 'ok');
  assert.equal(typeof body.version, 'string');
});

test('пункт 9 задания 6: GET /api/v1/hello возвращает приветствие PCHelper', async () => {
  const { status, body } = await get('/api/v1/hello');
  assert.equal(status, 200);
  assert.match(body.message, /Hello, PCHelper!/);
  assert.equal(body.service, 'pchelper-api');
});

test('пункт 9 задания 6: ответ содержит сведения о переменных окружения', async () => {
  const { body } = await get('/api/v1/hello');
  assert.equal(typeof body.capabilities.databaseConfigured, 'boolean');
  assert.equal(typeof body.capabilities.cacheConfigured, 'boolean');
  assert.equal(typeof body.capabilities.authConfigured, 'boolean');
});

test('проверка БД: без DATABASE_URL маршрут /hello/db отвечает 503', async () => {
  const previous = process.env.DATABASE_URL;
  delete process.env.DATABASE_URL;
  try {
    const { status, body } = await get('/api/v1/hello/db');
    assert.equal(status, 503, 'ожидался статус 503 при отсутствии DATABASE_URL');
    assert.equal(body.status, 'degraded');
  } finally {
    if (previous !== undefined) process.env.DATABASE_URL = previous;
  }
});

test('требование FR-08: админ-маршрут без токена возвращает 401', async () => {
  const { status, body } = await get('/api/v1/admin/orders');
  assert.equal(status, 401);
  assert.equal(body.error.code, 'UNAUTHORIZED');
});

test('требование FR-08: админ-маршрут с неверным токеном тоже возвращает 401', async () => {
  const { status } = await get('/api/v1/admin/orders', {
    Authorization: 'Bearer wrong-token-value',
  });
  assert.equal(status, 401);
});

test('требование FR-08: админ-маршрут с токеном покупателя возвращает 403', async () => {
  const login = await fetch(`${BASE}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'demo@pchelper.by', password: 'demo1234' }),
  });
  const { accessToken } = await login.json();

  const response = await fetch(`${BASE}/api/v1/admin/orders`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const body = await response.json();
  assert.equal(response.status, 403);
  assert.equal(body.error.code, 'FORBIDDEN');
});

test('требование FR-08: админ-маршрут с верным токеном возвращает 200', async () => {
  const { status, body } = await get('/api/v1/admin/orders', {
    Authorization: `Bearer ${ADMIN_TOKEN}`,
  });
  assert.equal(status, 200);
  assert.ok(Array.isArray(body.items));
  assert.equal(body.total, 0);
});

test('удаление пользователя без базы возвращает 503 с текстом', async () => {
  const response = await fetch(`${BASE}/api/v1/admin/users/2`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${ADMIN_TOKEN}` },
  });
  const body = await response.json();
  assert.equal(response.status, 503);
  assert.equal(body.error.code, 'DATABASE_ERROR');
});

test('удаление товара без базы возвращает 503 с текстом', async () => {
  const response = await fetch(`${BASE}/api/v1/admin/products/cpu/1`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${ADMIN_TOKEN}` },
  });
  const body = await response.json();
  assert.equal(response.status, 503);
  assert.equal(body.error.code, 'DATABASE_ERROR');
});

test('корневой адрес отдаёт визитку со списком маршрутов, а не 404', async () => {
  const { status, body } = await get('/');
  assert.equal(status, 200);
  assert.equal(body.service, 'PCHelper API');
  assert.equal(typeof body.endpoints.health, 'string');
});

test('несуществующий маршрут возвращает 404 в формате JSON, а не HTML', async () => {
  const { status, body } = await get('/api/v1/не-существует');
  assert.equal(status, 404);
  // Требование NFR-09: все ошибки в одном формате { error: { code, message } }
  assert.equal(body.error.code, 'NOT_FOUND');
  assert.match(body.error.message, /не найден/);
});

test('тестовые адреса не получают реальных писем', async () => {
  for (const to of [
    'student@pchelper.by',
    'test@example.com',
    'deleted-1@pchelper.local',
  ]) {
    const result = await sendRawEmail({
      to,
      subject: 'Проверка',
      text: 'Проверка',
    });
    assert.equal(result.sent, false);
    assert.match(result.error, /Тестовый адрес/);
  }
});

test('проверка почты отклоняет некорректный адрес', async () => {
  await assert.rejects(() => sendTestEmail('неверный-адрес'), /e-mail/);
});

test('проверка почты на тестовый адрес не отправляет письмо', async () => {
  const result = await sendTestEmail('test@example.com');
  assert.equal(result.sent, false);
  assert.match(result.error, /Тестовый адрес/);
});

test('письма об аккаунте пишутся в журнал для тестовых адресов', async () => {
  const results = await Promise.all([
    sendAccountBlockedEmail({
      to: 'blocked@example.com',
      name: 'Тест',
      reason: 'Нарушение правил',
    }),
    sendAccountUnblockedEmail({
      to: 'unblocked@example.com',
      name: 'Тест',
      comment: 'Проверка завершена',
    }),
    sendAccountDeletedEmail({
      to: 'deleted@example.com',
      name: 'Тест',
      reason: 'Аккаунт больше не нужен',
    }),
    sendRoleChangedEmail({
      to: 'role@example.com',
      name: 'Тест',
      role: 'manager',
      comment: 'Новая роль',
    }),
  ]);
  for (const result of results) {
    assert.equal(result.sent, false);
    assert.match(result.error, /Тестовый адрес/);
  }
});

test('письма об отзывах содержат название товара', async () => {
  const results = await Promise.all([
    sendReviewModeratedEmail({
      to: 'review@example.com',
      name: 'Тест',
      productId: 'case:1',
      productName: 'DeepCool CH360',
      status: 'опубликован',
      comment: 'Отзыв по делу',
    }),
    sendReviewModeratedEmail({
      to: 'review@example.com',
      name: 'Тест',
      productId: 'case:1',
      productName: 'DeepCool CH360',
      status: 'отклонён',
      comment: 'Не по правилам',
    }),
    sendReviewDeletedEmail({
      to: 'review@example.com',
      name: 'Тест',
      productId: 'case:1',
      productName: 'DeepCool CH360',
      comment: 'Удалён по просьбе',
    }),
  ]);
  for (const result of results) {
    assert.equal(result.sent, false);
    assert.match(result.error, /Тестовый адрес/);
  }
});

test('письма о заказе и поступлении тоже уходят в журнал', async () => {
  const order = {
    id: '1',
    number: 'PCH-TEST-1',
    items: [{ name: 'Тестовый товар', qty: 2, price: 10 }],
    itemsTotal: 20,
    deliveryCost: 10,
    deliveryMethod: 'courier',
    address: 'г. Минск, ул. Тестовая, 1',
    deliveryZone: 'minsk',
    distanceKm: 0,
    total: 30,
  };
  const results = await Promise.all([
    sendOrderConfirmation({ to: 'order@example.com', order }),
    sendOrderStatusEmail({
      to: 'order@example.com',
      order,
      status: 'Доставлен',
      comment: 'Передан в доставку',
    }),
    sendRestockEmail({
      to: 'restock@example.com',
      product: { name: 'Тестовый товар', price: 10 },
    }),
  ]);
  for (const result of results) {
    assert.equal(result.sent, false);
    assert.match(result.error, /Тестовый адрес/);
  }
});

test('без SMTP письмо не отправляется, но попадает в журнал', async () => {
  const saved = {
    SMTP_HOST: process.env.SMTP_HOST,
    SMTP_PORT: process.env.SMTP_PORT,
    SMTP_USER: process.env.SMTP_USER,
    SMTP_PASS: process.env.SMTP_PASS,
  };
  delete process.env.SMTP_HOST;
  delete process.env.SMTP_PORT;
  delete process.env.SMTP_USER;
  delete process.env.SMTP_PASS;
  try {
    const result = await sendRawEmail({
      to: 'noreply@pchelper-store.by',
      subject: 'Проверка без SMTP',
      text: 'Проверка без SMTP',
    });
    assert.equal(result.sent, false);
    assert.match(result.error, /SMTP не настроен/);
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test('идентификатор товара в отзыве разбирается и проверяется', () => {
  assert.deepEqual(parseProductId('case:12'), { category: 'case', id: 12 });
  assert.throws(() => parseProductId('case'), /Некорректный/);
  assert.throws(() => parseProductId('case:0'), /Некорректный/);
  assert.throws(() => parseProductId(''), /Некорректный/);
});

test('без базы отзывы пустые, а модерация недоступна', async () => {
  const approved = await listApproved('case:1');
  assert.deepEqual(approved, { items: [], average: 0, count: 0 });
  const all = await listAll('');
  assert.deepEqual(all, { items: [], total: 0 });
  await assert.rejects(() => moderate('1', 'опубликован'), /Supabase/);
  await assert.rejects(() => deleteReview('1'), /Supabase/);
});
