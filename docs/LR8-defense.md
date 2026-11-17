# ЛР8 — демонстрация на защите

## 1. Что показываем

| Участник | Экран / артефакт | Что говорит |
|---|---|---|
| Наркевич А. С. | GitHub → `develop`, API на Render, PR | «Завершил backend: JWT/сессии, серверная корзина и заказы, MCP подключён к Supabase. Показываю API и зелёный CI». |
| Бирюк И. А. | веб-витрина, `/login`, `/profile`, адаптив | «Сделал адаптивный веб: вход, регистрация, защищённый профиль, Lighthouse 100/100/100». |
| Бельский Т. Д. | мобильная PWA, иконки, `sw.js`, отчёт по тестам | «Сделал мобильное приложение как PWA: manifest, service worker, иконки из логотипа, a11y-правки». |

## 2. Порядок показа

1. GitHub: `develop`, зелёный Actions, PR #41–#48, коммиты трёх авторов.
2. Render API:
   - `/api/v1/categories` — 8;
   - `/api/v1/products?limit=1` — 96;
   - `/api/v1/prebuilt` — 7.
3. Веб (`http://localhost:5173/`):
   - главная → каталог → фильтр → карточка;
   - `/login` → демо-доступ → `/profile`;
   - добавить товар в корзину.
4. Мобильная (`http://localhost:5173/mobile.html`, 375×812):
   - каталог → поиск → карточка → корзина → сборки.
5. Отчёт ЛР8 и 8 скриншотов.

## 3. Демо-доступ

```
demo@pchelper.by
demo1234
```

## 4. Команды запуска

```powershell
cd "C:\Users\alesi\Desktop\4 КУРС\1 семестр\ПЧМИ\pchelper-store\backend"
npm ci
node --env-file=.env src/server.js
```

Второй терминал:

```powershell
cd "C:\Users\alesi\Desktop\4 КУРС\1 семестр\ПЧМИ\pchelper-store\frontend"
npm ci
npm run dev
```

Адреса:

- `http://localhost:5173/`
- `http://localhost:5173/mobile.html`
- `http://localhost:3001/api/v1/health`

## 5. Если спросят про Supabase

Веб и мобильное не читают фикстуры напрямую — они ходят в Express API, а backend с ключами читает реальный Supabase: 8 категорий, 96 товаров, 7 сборок. Для корзины и заказов подготовлена миграция `db/09_supabase_commerce.sql`.
