/**
 * PCHelper — полный логический бэкап БД.
 *
 * Сохраняет отдельно структуру и данные в backups/. В данных есть
 * персональная информация (email, телефоны, адреса), поэтому папка
 * backups/ добавлена в .gitignore и в репозиторий не попадает.
 *
 * Запуск:
 *   cd backend
 *   npm run db:backup
 */

import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
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

const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const dir = path.join(ROOT, 'backups');
mkdirSync(dir, { recursive: true });
const relative = (name) => path.join('backups', name);

const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const run = (args, label) => {
  console.log(label);
  try {
    execFileSync(
      npx,
      ['--yes', 'supabase', 'db', 'dump', `--remote=${dbUrl}`, ...args],
      {
        cwd: ROOT,
        stdio: 'inherit',
        shell: process.platform === 'win32',
      },
    );
  } catch {
    console.error(
      'Не удалось выполнить supabase db dump. Проверьте пароль, сеть и доступ к Session pooler.',
    );
    process.exit(1);
  }
};

run(['--schema', 'public', '--file', relative(`schema-${stamp}.sql`)], 'Структура...');
run(
  ['--data-only', '--schema', 'public', '--file', relative(`data-${stamp}.sql`)],
  'Данные...',
);

console.log(`Готово: ${dir}`);
console.log('Папка backups/ не коммитится: там персональные данные.');
