# PCHelper — desktop-версия

Electron-оболочка запускает локальный Express-сервер и открывает окно
с собранным веб-клиентом. В упакованной версии backend и `frontend/dist`
лежат в `resources`, поэтому окно работает без интернета.

## Что внутри

| Файл | Назначение |
|------|------------|
| `main.js` | запуск backend дочерним процессом, окно, внешние ссылки |
| `preload.js` | минимальный мост `pchelperDesktop.platform` |
| `icon.ico`, `logo.png` | иконка окна и исходник для сборки `.ico` |
| `package.json` | зависимости Electron и настройки `electron-builder` |

## Запуск в разработке

```powershell
cd frontend
npm run build

cd ..\backend
$env:SERVE_WEB = '1'
node --env-file=.env src/server.js

cd ..\desktop
npm install
npm run dev
```

`main.js` сам запускает backend, поэтому отдельный терминал для него
не обязателен. Переменные Supabase читаются из `backend/.env`.

## Сборка portable `.exe`

Из корня репозитория:

```powershell
.\СОБРАТЬ EXE.bat
```

Скрипт собирает веб-клиент, проверяет зависимости, запускает
`electron-builder --win portable` и копирует результат в `release/`.

Или вручную:

```powershell
cd desktop
npm run build:win
```

Результат: `desktop/dist/PCHelper-Portable-1.0.0-x64.exe`.

> Файл `backend/.env` попадает внутрь сборки. Не публикуйте готовый `.exe`
> с рабочими ключами Supabase: для передачи используйте сборку без `.env`
> или отдельный демонстрационный ключ.
