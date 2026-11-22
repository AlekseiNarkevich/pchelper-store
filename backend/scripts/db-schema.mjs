/**
 * PCHelper — выгрузка структуры БД из Supabase.
 *
 * На Free-плане Supabase ежедневных бэкапов нет, поэтому схему нужно
 * сохранять вручную. Скрипт делает schema-only дамп через Supabase CLI:
 * таблицы, ключи, связи, индексы, триггеры, функции и RLS-политики.
 *
 * Перед запуском добавьте в backend/.env строку:
 *   SUPABASE_DB_URL=postgresql://...  (Dashboard -> Connect -> Session pooler)
 *
 * Запуск:
 *   cd backend
 *   npm run db:schema
 */

import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const dbUrl = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL;

if (!dbUrl) {
  console.error(
    'Нет SUPABASE_DB_URL. Добавьте строку подключения в backend/.env:\n' +
      'Dashboard -> Connect -> Session pooler -> URI',
  );
  process.exit(1);
}

const output = path.join(ROOT, 'db', 'schema_live.sql');
mkdirSync(path.dirname(output), { recursive: true });

const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
console.log('Снимаем структуру public...');
execFileSync(
  npx,
  [
    '--yes',
    'supabase',
    'db',
    'dump',
    `--remote=${dbUrl}`,
    '--schema',
    'public',
    '--file',
    output,
  ],
  { cwd: ROOT, stdio: 'inherit' },
);

console.log(`Готово: ${output}`);
console.log('Файл не содержит данных и его можно коммитить.');
