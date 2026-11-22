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
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const dbUrl = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL;

if (!dbUrl) {
  console.error(
    'Нет SUPABASE_DB_URL. Задайте строку подключения в терминале:\n' +
      '$env:SUPABASE_DB_URL = "postgresql://..."\n' +
      'Dashboard -> Connect -> Session pooler -> URI',
  );
  process.exit(1);
}

const output = path.join(ROOT, 'db', 'schema_live.sql');
mkdirSync(path.dirname(output), { recursive: true });
const outputRelative = path.relative(ROOT, output);

const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
console.log('Снимаем структуру public...');
try {
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
      outputRelative,
    ],
    { cwd: ROOT, stdio: 'inherit', shell: process.platform === 'win32' },
  );
} catch {
  console.error(
    'Не удалось выполнить supabase db dump. Проверьте Docker Desktop, пароль, сеть и доступ к Session pooler.',
  );
  process.exit(1);
}

// Подписываем файл: так видно, когда и откуда снята схема.
const header = [
  '-- PCHelper: структура базы public из Supabase.',
  `-- Снято: ${new Date().toISOString()}`,
  '-- Команда: cd backend && npm run db:schema',
  '-- Данные не включены.',
  '',
  '',
].join('\n');
writeFileSync(output, header + readFileSync(output, 'utf8'), 'utf8');

console.log(`Готово: ${output}`);
console.log('Файл не содержит данных и его можно коммитить.');
