/**
 * PCHelper — тесты загрузки фото товара в Supabase Storage.
 *
 * Настоящий Storage не нужен: подменяем клиент простым объектом
 * и проверяем проверки файла, путь, формат и публичную ссылку.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { uploadProductImage } from '../src/services/storage.service.js';

/** Файл, который обычно приходит из multer. */
const file = {
  buffer: Buffer.from('fake-image'),
  mimetype: 'image/png',
  originalname: 'photo.png',
};

/**
 * Поддельный клиент Supabase с записью вызовов.
 *
 * @param {{uploadError?: object|null}} options Ошибка загрузки.
 * @returns {object}
 */
function fakeClient({ uploadError = null } = {}) {
  const calls = {};
  return {
    calls,
    storage: {
      from(bucket) {
        calls.bucket = bucket;
        return {
          async upload(path, buffer, options) {
            calls.path = path;
            calls.buffer = buffer;
            calls.options = options;
            return { error: uploadError };
          },
          getPublicUrl(path) {
            calls.publicPath = path;
            return { data: { publicUrl: `https://cdn.example/${path}` } };
          },
        };
      },
    },
  };
}

test('фото: без клиента Storage возвращает 503', async () => {
  await assert.rejects(uploadProductImage(file, null), {
    status: 503,
    code: 'STORAGE_UNAVAILABLE',
  });
});

test('фото: без файла возвращает 400', async () => {
  await assert.rejects(uploadProductImage(null, fakeClient()), {
    status: 400,
    code: 'FILE_REQUIRED',
  });
});

test('фото: неподдерживаемый формат возвращает 415', async () => {
  await assert.rejects(
    uploadProductImage({ ...file, mimetype: 'image/svg+xml' }, fakeClient()),
    { status: 415, code: 'UNSUPPORTED_IMAGE' },
  );
});

test('фото: загружает файл и возвращает публичную ссылку', async () => {
  const client = fakeClient();
  const result = await uploadProductImage(file, client);

  assert.equal(client.calls.bucket, 'pchelper-images');
  assert.match(client.calls.path, /^products\/\d+-[\da-f-]+\.png$/);
  assert.equal(client.calls.options.contentType, 'image/png');
  assert.equal(client.calls.options.upsert, false);
  assert.equal(result.path, client.calls.path);
  assert.equal(result.url, `https://cdn.example/${client.calls.path}`);
});

test('фото: ошибка Storage возвращает 502 с понятным текстом', async () => {
  const client = fakeClient({ uploadError: { message: 'bucket недоступен' } });
  await assert.rejects(uploadProductImage(file, client), {
    status: 502,
    code: 'STORAGE_ERROR',
    message: /Не удалось загрузить фото: bucket недоступен/,
  });
});
