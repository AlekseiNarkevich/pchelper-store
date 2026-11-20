/**
 * Тесты конфигуратора, сохранённых сборок и калькулятора БП.
 *
 * Работают на демонстрационном каталоге: переменные Supabase не заданы,
 * поэтому репозитории используют память процесса.
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

/** Совместимый набор из демонстрационного каталога. */
const COMPATIBLE = {
  cpu: 'cpu:6',
  motherboard: 'motherboard:11',
  ram: 'ram:10',
  cooling: 'cooling:7',
  gpu: 'gpu:6',
  storage: ['storage:7'],
  psu: 'psu:9',
  case: 'case:7',
};

/** Набор с нарушением почти всех правил. */
const INCOMPATIBLE = {
  cpu: 'cpu:6',
  motherboard: 'motherboard:1',
  ram: 'ram:10',
  cooling: 'cooling:1',
  gpu: 'gpu:6',
  storage: ['storage:13'],
  psu: 'psu:1',
  case: 'case:1',
};

/**
 * Регистрирует пользователя и возвращает access-токен.
 *
 * @returns {Promise<string>}
 */
async function accessToken() {
  const address = `build-${Date.now()}-${Math.random().toString(16).slice(2)}@example.com`;
  const registered = await request('/api/v1/auth/register', {
    method: 'POST',
    body: { email: address, password: 'secret123', name: 'Сборщик' },
  });
  return registered.body.accessToken;
}

test('проверка совместимости принимает корректную сборку', async () => {
  const { status, body } = await request('/api/v1/builds/check', {
    method: 'POST',
    body: { components: COMPATIBLE },
  });

  assert.equal(status, 200);
  assert.equal(body.compatible, true);
  assert.deepEqual(body.errors, []);
  assert.ok(body.total > 0);
});

test('проверка совместимости объясняет несовместимые детали', async () => {
  const { status, body } = await request('/api/v1/builds/check', {
    method: 'POST',
    body: { components: INCOMPATIBLE },
  });

  assert.equal(status, 200);
  assert.equal(body.compatible, false);
  assert.ok(body.errors.some((text) => text.includes('Сокет')));
  assert.ok(body.errors.some((text) => text.includes('Тип памяти')));
  assert.ok(body.errors.some((text) => text.includes('TDP процессора')));
  assert.ok(body.errors.some((text) => text.includes('Мощность БП')));
  assert.ok(body.errors.some((text) => text.includes('SSD')));
});

test('проверка отклоняет неизвестный идентификатор компонента', async () => {
  const { status, body } = await request('/api/v1/builds/check', {
    method: 'POST',
    body: { components: { cpu: 'процессор' } },
  });
  assert.equal(status, 400);
  assert.equal(body.error.code, 'VALIDATION_ERROR');
});

test('калькулятор БП считает мощность с запасом 25%', async () => {
  const withGpu = await request('/api/v1/psu?cpu=cpu:6&gpu=gpu:6');
  assert.equal(withGpu.status, 200);
  assert.equal(withGpu.body.recommendation.cpuTdp, 200);
  assert.equal(withGpu.body.recommendation.gpuTdp, 600);
  assert.equal(withGpu.body.recommendation.recommendedWatts, 1000);
  assert.ok(withGpu.body.items.every((item) => item.watts >= 1000));

  const withoutGpu = await request('/api/v1/psu?cpu=cpu:6');
  assert.equal(withoutGpu.status, 200);
  assert.equal(withoutGpu.body.recommendation.recommendedWatts, 250);
  assert.ok(withoutGpu.body.items.length >= 1);
});

test('калькулятор БП проверяет параметры запроса', async () => {
  const missing = await request('/api/v1/psu');
  assert.equal(missing.status, 400);

  const unknown = await request('/api/v1/psu?cpu=cpu:9999');
  assert.equal(unknown.status, 404);
});

test('сохранённая сборка создаётся, читается, обновляется и удаляется', async () => {
  const token = await accessToken();

  const created = await request('/api/v1/builds', {
    method: 'POST',
    token,
    body: { name: 'Игровая сборка', note: 'Тест', components: COMPATIBLE },
  });
  assert.equal(created.status, 201);
  assert.equal(created.body.build.name, 'Игровая сборка');
  assert.equal(created.body.build.components.length, 8);
  assert.equal(created.body.build.compatibility.compatible, true);
  assert.ok(created.body.build.total > 0);

  const id = created.body.build.id;

  const list = await request('/api/v1/builds', { token });
  assert.equal(list.status, 200);
  assert.equal(list.body.total, 1);
  assert.equal(list.body.items[0].name, 'Игровая сборка');

  const one = await request(`/api/v1/builds/${id}`, { token });
  assert.equal(one.status, 200);
  assert.equal(one.body.build.id, id);

  const updated = await request(`/api/v1/builds/${id}`, {
    method: 'PUT',
    token,
    body: { name: 'Обновлённая сборка', note: 'Новая заметка', components: COMPATIBLE },
  });
  assert.equal(updated.status, 200);
  assert.equal(updated.body.build.name, 'Обновлённая сборка');
  assert.equal(updated.body.build.note, 'Новая заметка');

  const removed = await request(`/api/v1/builds/${id}`, { method: 'DELETE', token });
  assert.equal(removed.status, 204);

  const gone = await request(`/api/v1/builds/${id}`, { token });
  assert.equal(gone.status, 404);
  assert.equal(gone.body.error.code, 'BUILD_NOT_FOUND');
});

test('сборки изолированы по пользователям', async () => {
  const owner = await accessToken();
  const stranger = await accessToken();

  const created = await request('/api/v1/builds', {
    method: 'POST',
    token: owner,
    body: { name: 'Личная сборка', components: COMPATIBLE },
  });
  const id = created.body.build.id;

  const foreign = await request(`/api/v1/builds/${id}`, { token: stranger });
  assert.equal(foreign.status, 404);

  const foreignList = await request('/api/v1/builds', { token: stranger });
  assert.equal(foreignList.body.total, 0);
});

test('сохранение требует название, компоненты и вход', async () => {
  const token = await accessToken();

  const noName = await request('/api/v1/builds', {
    method: 'POST',
    token,
    body: { components: COMPATIBLE },
  });
  assert.equal(noName.status, 400);

  const noComponents = await request('/api/v1/builds', {
    method: 'POST',
    token,
    body: { name: 'Пустая' },
  });
  assert.equal(noComponents.status, 400);

  const anonymous = await request('/api/v1/builds', {
    method: 'POST',
    body: { name: 'Без входа', components: COMPATIBLE },
  });
  assert.equal(anonymous.status, 401);
});
