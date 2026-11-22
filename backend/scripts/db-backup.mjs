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
    'Нет SUPABASE_DB_URL. Добавьте строку подключения в backend/.env:\n' +
      'Dashboard -> Connect -> Session pooler -> URI',
  );
  process.exit(1);
}

const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const dir = path.join(ROOT, 'backups');
mkdirSync(dir, { recursive: true });

const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const run = (args, label) => {
  console.log(label);
  execFileSync(npx, ['--yes', 'supabase', 'db', 'dump', `--remote=${dbUrl}`, ...args], {
    cwd: ROOT,
    stdio: 'inherit',
  });
};

run(
  ['--schema', 'public', '--file', path.join(dir, `schema-${stamp}.sql`)],
  'Структура...',
);
run(
  ['--data-only', '--schema', 'public', '--file', path.join(dir, `data-${stamp}.sql`)],
  'Данные...',
);

console.log(`Готово: ${dir}`);
console.log('Папка backups/ не коммитится: там персональные данные.');
