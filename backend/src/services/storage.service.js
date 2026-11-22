/**
 * PCHelper — загрузка изображений товаров в Supabase Storage.
 *
 * В базе у товара хранится только ссылка (фото_url). Сам файл лежит
 * в публичном бакете pchelper-images; админка загружает его через
 * backend, чтобы service-role ключ не попадал в браузер.
 */

import { randomUUID } from 'node:crypto';

import { apiError } from '../domain/errors.js';
import { supabase } from './supabase.service.js';

/** Публичный бакет с фотографиями товаров. */
const BUCKET = 'pchelper-images';

/** Допустимые форматы и расширения файлов. */
const EXTENSIONS = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

/**
 * Загружает фото товара и возвращает публичную ссылку.
 *
 * Клиент Storage передаётся параметром, чтобы функцию можно было
 * проверить тестами без реального Supabase.
 *
 * @param {{buffer: Buffer, mimetype: string, originalname: string}} file Файл из multer.
 * @param {object} [client] Клиент Supabase (по умолчанию настоящий).
 * @returns {Promise<{url: string, path: string}>}
 */
export async function uploadProductImage(file, client = supabase) {
  if (!client) {
    throw apiError(503, 'STORAGE_UNAVAILABLE', 'Хранилище изображений недоступно');
  }
  if (!file?.buffer?.length) {
    throw apiError(400, 'FILE_REQUIRED', 'Выберите файл изображения');
  }

  const extension = EXTENSIONS[file.mimetype];
  if (!extension) {
    throw apiError(
      415,
      'UNSUPPORTED_IMAGE',
      'Поддерживаются только JPG, PNG, WebP и GIF',
    );
  }

  // Уникальное имя: дата + UUID, чтобы файлы не перезаписывали друг друга.
  const path = `products/${Date.now()}-${randomUUID()}.${extension}`;
  const upload = await client.storage.from(BUCKET).upload(path, file.buffer, {
    contentType: file.mimetype,
    cacheControl: '31536000',
    upsert: false,
  });

  if (upload.error) {
    throw apiError(
      502,
      'STORAGE_ERROR',
      `Не удалось загрузить фото: ${upload.error.message}`,
    );
  }

  const publicUrl = client.storage.from(BUCKET).getPublicUrl(path);
  return { url: publicUrl.data.publicUrl, path };
}
