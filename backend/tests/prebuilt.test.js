/**
 * PCHelper — тесты готовых сборок и удаления записей.
 *
 * Supabase в юнит-тестах не подключён: проверяем валидацию формы,
 * преобразование состава и понятные ответы, когда базы нет.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  adjustPrebuiltComponents,
  createPrebuilt,
  deleteOrdersBulk,
  deletePrebuilt,
  listPrebuiltAdmin,
  prebuiltValues,
  updatePrebuilt,
} from '../src/repositories/admin.repository.js';
import {
  createRequest,
  deleteRequest,
  deleteRequestsBulk,
  listRequests,
  updateRequest,
} from '../src/repositories/stock.repository.js';
import {
  deleteEmail,
  deleteEmails,
  sendTestEmail,
} from '../src/repositories/mail.repository.js';
import {
  createReview,
  deleteReview,
  getMyReview,
  moderate,
} from '../src/repositories/reviews.repository.js';

test('готовая сборка: форма превращается в поля таблицы', () => {
  const { row, storage } = prebuiltValues({
    name: ' Игровой ПК ',
    task: 'Игры и стримы',
    photoUrl: '/images/game.webp',
    stock: 2,
    components: {
      cpu: '1',
      motherboard: 2,
      ram: 3,
      gpu: 4,
      psu: 5,
      case: 6,
      cooling: 7,
      // Повтор и мусор в накопителях не должны попасть в связи.
      storage: ['8', 8, 9, 0, 'нет'],
    },
  });

  assert.equal(row['название'], 'Игровой ПК');
  assert.equal(row['задачи'], 'Игры и стримы');
  assert.equal(row['фото_url'], '/images/game.webp');
  assert.equal(row['количество'], 2);
  assert.equal(row['процессор_id'], 1);
  assert.equal(row['материнская_плата_id'], 2);
  assert.equal(row['озу_id'], 3);
  assert.equal(row['видеокарта_id'], 4);
  assert.equal(row['блокпитания_id'], 5);
  assert.equal(row['корпус_id'], 6);
  assert.equal(row['охлаждение_id'], 7);
  assert.deepEqual(storage, [8, 9]);
});

test('готовая сборка: пустой состав сохраняется как null', () => {
  const { row, storage } = prebuiltValues({ name: 'Офисный ПК', stock: 0 });

  assert.equal(row['задачи'], null);
  assert.equal(row['фото_url'], null);
  assert.equal(row['процессор_id'], null);
  assert.deepEqual(storage, []);
});

test('готовая сборка: без названия вернётся 400', () => {
  assert.throws(() => prebuiltValues({ name: '   ' }), {
    status: 400,
    code: 'VALIDATION_ERROR',
  });
});

test('готовая сборка: отрицательный остаток не принимается', () => {
  assert.throws(() => prebuiltValues({ name: 'ПК', stock: -1 }), {
    status: 400,
    code: 'VALIDATION_ERROR',
  });
});

test('готовая сборка: слишком длинное название не принимается', () => {
  assert.throws(() => prebuiltValues({ name: 'x'.repeat(256) }), {
    status: 400,
    code: 'VALIDATION_ERROR',
  });
});

test('готовая сборка: слишком длинное описание не принимается', () => {
  assert.throws(() => prebuiltValues({ name: 'ПК', task: 'x'.repeat(256) }), {
    status: 400,
    code: 'VALIDATION_ERROR',
  });
});

test('готовая сборка: один накопитель можно передать числом', () => {
  const { storage } = prebuiltValues({
    name: 'ПК',
    components: { storage: 12 },
  });
  assert.deepEqual(storage, [12]);
});

test('запрос на поступление: неизвестный статус не принимается', async () => {
  await assert.rejects(updateRequest('1', 'готов'), {
    status: 400,
    code: 'VALIDATION_ERROR',
  });
});

test('запрос на поступление: без базы список пуст', async () => {
  assert.deepEqual(await listRequests(), { items: [], total: 0, newCount: 0 });
});

test('запрос на поступление: без базы создание возвращает 503', async () => {
  await assert.rejects(createRequest('cpu:1', { email: 'user@example.com' }), {
    status: 503,
    code: 'DATABASE_ERROR',
  });
});

test('запрос на поступление: без базы смена статуса возвращает 503', async () => {
  await assert.rejects(updateRequest('1', 'обработан'), {
    status: 503,
    code: 'DATABASE_ERROR',
  });
});

test('письмо: некорректный адрес проверочного письма', async () => {
  await assert.rejects(sendTestEmail('не-почта'), {
    status: 400,
    code: 'VALIDATION_ERROR',
  });
});

test('письмо: демо-адрес не отправляется реально', async () => {
  const result = await sendTestEmail('user@example.com');
  assert.equal(result.sent, false);
  assert.match(result.error, /Тестовый адрес/);
});

test('готовая сборка: без базы список пуст', async () => {
  assert.deepEqual(await listPrebuiltAdmin(), { items: [], total: 0 });
});

test('готовая сборка: без базы создание возвращает 503', async () => {
  await assert.rejects(createPrebuilt({ name: 'ПК' }), {
    status: 503,
    code: 'DATABASE_ERROR',
  });
});

test('готовая сборка: без базы изменение возвращает 503', async () => {
  await assert.rejects(updatePrebuilt('1', { name: 'ПК' }), {
    status: 503,
    code: 'DATABASE_ERROR',
  });
});

test('готовая сборка: без базы удаление возвращает 503', async () => {
  await assert.rejects(deletePrebuilt('1'), {
    status: 503,
    code: 'DATABASE_ERROR',
  });
});

test('готовая сборка: без базы остатки комплектующих не меняются', async () => {
  assert.equal(await adjustPrebuiltComponents('1', -1, 1), undefined);
});

test('запрос на поступление: некорректный номер не принимается', async () => {
  await assert.rejects(deleteRequest('abc'), {
    status: 400,
    code: 'VALIDATION_ERROR',
  });
});

test('запрос на поступление: без базы удаление возвращает 503', async () => {
  await assert.rejects(deleteRequest('1'), {
    status: 503,
    code: 'DATABASE_ERROR',
  });
});

test('письмо: некорректный номер не принимается', async () => {
  await assert.rejects(deleteEmail('abc'), {
    status: 400,
    code: 'VALIDATION_ERROR',
  });
});

test('письмо: без базы удаление возвращает 503', async () => {
  await assert.rejects(deleteEmail('1'), {
    status: 503,
    code: 'DATABASE_ERROR',
  });
});

test('массовое удаление писем: пустой выбор не принимается', async () => {
  await assert.rejects(deleteEmails([]), {
    status: 400,
    code: 'VALIDATION_ERROR',
  });
});

test('массовое удаление писем: без базы возвращает 503', async () => {
  await assert.rejects(deleteEmails(['1', '2']), {
    status: 503,
    code: 'DATABASE_ERROR',
  });
});

test('массовое удаление запросов: пустой выбор не принимается', async () => {
  await assert.rejects(deleteRequestsBulk(['нет']), {
    status: 400,
    code: 'VALIDATION_ERROR',
  });
});

test('массовое удаление запросов: без базы возвращает 503', async () => {
  await assert.rejects(deleteRequestsBulk(['1']), {
    status: 503,
    code: 'DATABASE_ERROR',
  });
});

test('массовое удаление заказов: пустой выбор не принимается', async () => {
  await assert.rejects(deleteOrdersBulk([]), {
    status: 400,
    code: 'VALIDATION_ERROR',
  });
});

test('массовое удаление заказов: без базы возвращает 503', async () => {
  await assert.rejects(deleteOrdersBulk(['1']), {
    status: 503,
    code: 'DATABASE_ERROR',
  });
});

test('свой отзыв: без базы возвращает null', async () => {
  assert.equal(await getMyReview('1', 'cpu:1'), null);
});

test('отзыв: без базы создание возвращает 503', async () => {
  await assert.rejects(createReview('1', 'cpu:1', { rating: 5 }), {
    status: 503,
    code: 'DATABASE_ERROR',
  });
});

test('отзыв: без базы модерация возвращает 503', async () => {
  await assert.rejects(moderate('1', 'опубликован'), {
    status: 503,
    code: 'DATABASE_ERROR',
  });
});

test('отзыв: без базы удаление возвращает 503', async () => {
  await assert.rejects(deleteReview('1'), {
    status: 503,
    code: 'DATABASE_ERROR',
  });
});
