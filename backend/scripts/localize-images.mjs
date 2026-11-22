/**
 * Переносит фото товаров из Supabase Storage в frontend/public.
 *
 * Зачем: каталог с локальными WebP не тратит egress Supabase. Админ
 * может загружать новые фото через админку (они сразу работают), а перед
 * релизом этот скрипт переносит их в статику и обновляет фото_url.
 *
 * Запуск:
 *   cd backend
 *   npm run images:localize
 *   npm run images:localize -- --push
 *
 * --push дополнительно добавляет файлы в git, коммитит и пушит develop.
 * Без флага ничего в git не трогается — только файлы и база.
 */

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { CATEGORIES } from '../src/domain/catalog.js';
import { isDatabaseConnected, supabase } from '../src/services/supabase.service.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const IMAGES_DIR = path.join(ROOT, 'frontend', 'public', 'images', 'products');
const IMAGES_RELATIVE = path.join('frontend', 'public', 'images', 'products');
const shouldPush = process.argv.includes('--push');

/** Расширение по MIME-типу картинки. */
const EXTENSIONS = {
  'image/webp': 'webp',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
};

if (!isDatabaseConnected()) {
  console.error('Supabase не настроен: проверьте backend/.env');
  process.exit(1);
}

await mkdir(IMAGES_DIR, { recursive: true });

const cache = new Map();
const savedFiles = [];
let updatedRows = 0;

for (const category of CATEGORIES) {
  const { data, error } = await supabase
    .from(category.table)
    .select('id,название,фото_url');
  if (error) {
    console.error(`[${category.table}] ${error.message}`);
    continue;
  }

  for (const row of data || []) {
    const source = row['фото_url'];
    if (!source || !source.includes('/storage/v1/object/public/pchelper-images/')) {
      continue;
    }

    let localUrl = cache.get(source);
    if (!localUrl) {
      const response = await fetch(source);
      if (!response.ok) {
        console.error(`  ! ${row['название']}: HTTP ${response.status}`);
        continue;
      }

      const extension =
        EXTENSIONS[response.headers.get('content-type')?.split(';')[0]] ||
        source.split('.').pop()?.split('?')[0] ||
        'webp';
      const hash = createHash('sha256').update(source).digest('hex').slice(0, 32);
      const fileName = `${hash}.${extension}`;
      const buffer = Buffer.from(await response.arrayBuffer());

      await writeFile(path.join(IMAGES_DIR, fileName), buffer);
      localUrl = `/images/products/${fileName}`;
      cache.set(source, localUrl);
      savedFiles.push(fileName);
      console.log(`+ ${row['название']} → ${fileName}`);
    }

    const update = await supabase
      .from(category.table)
      .update({ фото_url: localUrl })
      .eq('id', row.id);
    if (update.error) {
      console.error(`  ! обновить ${row['название']}: ${update.error.message}`);
      continue;
    }
    updatedRows += 1;
  }
}

console.log(`\nНовых файлов: ${savedFiles.length}`);
console.log(`Обновлено товаров: ${updatedRows}`);
console.log('Дальше: cd frontend && npm run build, затем пересобрать exe.');

if (shouldPush) {
  const changed = execFileSync(
    'git',
    ['status', '--porcelain', '--', IMAGES_RELATIVE],
    {
      cwd: ROOT,
      encoding: 'utf8',
    },
  ).trim();

  if (!changed) {
    console.log('В git нет новых фото — коммит не нужен.');
  } else {
    execFileSync('git', ['add', IMAGES_RELATIVE], { cwd: ROOT, stdio: 'inherit' });
    execFileSync(
      'git',
      ['commit', '-m', 'chore(images): локальные фото товаров', '--', IMAGES_RELATIVE],
      { cwd: ROOT, stdio: 'inherit' },
    );
    execFileSync('git', ['push', 'origin', 'develop'], {
      cwd: ROOT,
      stdio: 'inherit',
    });
    console.log('Фото закоммичены и отправлены в develop.');
  }
}
