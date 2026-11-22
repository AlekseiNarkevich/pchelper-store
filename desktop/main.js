const { app, BrowserWindow, dialog, shell } = require('electron');
const fs = require('fs');
const http = require('http');
const path = require('path');
const { spawn } = require('child_process');

/**
 * Главный процесс desktop-версии PCHelper.
 *
 * Запускает локальный Express-сервер дочерним процессом и открывает окно
 * с собранным веб-клиентом. В упакованной версии backend и frontend/dist
 * лежат в resources, поэтому интернет для работы окна не нужен.
 *
 * @version 2.0
 */

const BACKEND_PORT = Number(process.env.PORT || 3001);
let backendProcess = null;
let splashWindow = null;
let splashStartedAt = 0;

const appIconPath = app.isPackaged
  ? path.join(process.resourcesPath, 'icon.ico')
  : path.resolve(__dirname, 'icon.ico');

/**
 * Показывает заставку на время запуска backend и загрузки интерфейса.
 *
 * Отдельное маленькое окно без рамки: пользователь сразу видит, что
 * приложение не зависло, пока локальный сервер поднимается.
 */
function createSplash() {
  splashStartedAt = Date.now();
  splashWindow = new BrowserWindow({
    width: 520,
    height: 320,
    frame: false,
    resizable: false,
    movable: false,
    show: false,
    center: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    backgroundColor: '#0b2a4a',
    icon: appIconPath,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  splashWindow.loadFile(path.join(__dirname, 'splash.html'));
  splashWindow.once('ready-to-show', () => {
    if (splashWindow && !splashWindow.isDestroyed()) splashWindow.show();
  });
  splashWindow.on('show', () => console.log('[splash] заставка показана'));
  splashWindow.on('closed', () => {
    console.log('[splash] заставка закрыта');
    splashWindow = null;
  });
}

/**
 * Меняет подпись на заставке.
 *
 * @param {string} text Новый статус.
 */
function setSplashStatus(text) {
  if (!splashWindow || splashWindow.isDestroyed()) return;
  splashWindow.webContents
    .executeJavaScript(
      `document.getElementById('status').textContent = ${JSON.stringify(text)};`,
    )
    .catch(() => {
      /* заставка могла уже закрыться */
    });
}

/**
 * Закрывает заставку после появления главного окна.
 */
function closeSplash() {
  const splash = splashWindow;
  splashWindow = null;
  if (splash && !splash.isDestroyed()) {
    splash.destroy();
  }
}

/**
 * Читает файл .env без сторонних зависимостей.
 *
 * @param {string} file Путь к файлу.
 * @returns {Record<string, string>}
 */
function readEnvFile(file) {
  try {
    const text = fs.readFileSync(file, 'utf8');
    const env = {};
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const separator = trimmed.indexOf('=');
      if (separator < 0) continue;
      env[trimmed.slice(0, separator).trim()] = trimmed.slice(separator + 1).trim();
    }
    return env;
  } catch {
    return {};
  }
}

/**
 * Ожидает, пока backend начнёт отвечать на health-check.
 *
 * @param {string} url Адрес проверки.
 * @param {number} [timeoutMs=30000] Максимальное время ожидания.
 * @returns {Promise<void>}
 */
function waitForServer(url, timeoutMs = 30000) {
  const started = Date.now();

  return new Promise((resolve, reject) => {
    function attempt() {
      const req = http.get(url, (res) => {
        res.resume();
        if (res.statusCode && res.statusCode < 500) {
          resolve();
          return;
        }
        retry();
      });

      req.on('error', retry);
      req.setTimeout(2000, () => {
        req.destroy();
        retry();
      });
    }

    function retry() {
      if (Date.now() - started > timeoutMs) {
        reject(new Error(`Backend не поднялся за ${timeoutMs} мс`));
        return;
      }
      setTimeout(attempt, 500);
    }

    attempt();
  });
}

/**
 * Запускает backend как дочерний процесс рядом с Electron.
 */
function startBackend() {
  const backendDir = app.isPackaged
    ? path.join(process.resourcesPath, 'backend')
    : path.resolve(__dirname, '../backend');

  const serverPath = path.join(backendDir, 'src', 'server.js');
  const fileEnv = readEnvFile(path.join(backendDir, '.env'));

  backendProcess = spawn(process.execPath, [serverPath], {
    cwd: backendDir,
    stdio: 'pipe',
    env: {
      ...process.env,
      ...fileEnv,
      PORT: String(BACKEND_PORT),
      SERVE_WEB: '1',
      ELECTRON_RUN_AS_NODE: '1',
    },
  });

  backendProcess.stdout.on('data', (data) => {
    console.log(`[backend] ${String(data).trimEnd()}`);
  });

  backendProcess.stderr.on('data', (data) => {
    console.error(`[backend] ${String(data).trimEnd()}`);
  });

  backendProcess.on('exit', (code) => {
    if (!app.isQuitting) {
      console.error(`[backend] Процесс завершился с кодом ${code}`);
    }
  });
}

/**
 * Останавливает дочерний backend перед завершением.
 */
function stopBackend() {
  if (backendProcess && !backendProcess.killed) {
    backendProcess.kill();
  }
  backendProcess = null;
}

/**
 * Создаёт главное окно и настраивает переходы по внешним ссылкам.
 *
 * @returns {Promise<void>}
 */
async function createWindow() {
  createSplash();
  startBackend();

  try {
    await waitForServer(`http://127.0.0.1:${BACKEND_PORT}/api/v1/health`);
    setSplashStatus('Загружаем интерфейс…');
  } catch (error) {
    closeSplash();
    dialog.showErrorBox(
      'Ошибка запуска PCHelper',
      `Не удалось запустить локальный сервер.\n${error.message}`,
    );
    app.quit();
    return;
  }

  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 960,
    minHeight: 640,
    show: false,
    autoHideMenuBar: true,
    icon: appIconPath,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  const appUrl = `http://127.0.0.1:${BACKEND_PORT}`;

  /**
   * Проверяет, относится ли адрес к локальному серверу.
   *
   * @param {string} target Адрес.
   * @returns {boolean}
   */
  function isInternalUrl(target) {
    try {
      return new URL(target).origin === new URL(appUrl).origin;
    } catch {
      return false;
    }
  }

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (!isInternalUrl(url)) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });

  win.webContents.on('will-navigate', (event, url) => {
    if (!isInternalUrl(url)) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  // Чистим кэш service worker до загрузки. Иначе после обновления
  // приложения Electron может открыть старую страницу из кэша: она
  // ссылается на уже удалённые файлы, и окно остаётся белым.
  await win.webContents.session
    .clearStorageData({ storages: ['serviceworkers', 'cachestorage'] })
    .catch((error) => console.error('[web] очистка кэша:', error.message));
  await win.webContents.session
    .clearCache()
    .catch((error) => console.error('[web] очистка HTTP-кэша:', error.message));

  win.webContents.on('did-fail-load', (_event, code, description, url) => {
    console.error(`[web] не загрузилось ${url}: ${code} ${description}`);
  });

  // Главное окно показываем после первого кадра или загрузки страницы,
  // заставку убираем принудительно. ready-to-show в Electron иногда
  // не приходит, поэтому did-finish-load — вторая страховка.
  let revealed = false;
  const revealMainWindow = () => {
    if (revealed || win.isDestroyed()) return;
    revealed = true;
    setSplashStatus('Готово');
    win.show();
    // Не даём заставке мигнуть, если backend поднялся очень быстро.
    const visibleFor = Date.now() - splashStartedAt;
    setTimeout(closeSplash, Math.max(150, 1300 - visibleFor));
  };

  win.once('ready-to-show', revealMainWindow);
  win.webContents.once('did-finish-load', revealMainWindow);

  win.webContents.once('did-finish-load', () => {
    setSplashStatus('Почти готово…');
  });

  // Страховка: если ready-to-show не придёт, всё равно показываем окно.
  const splashFallback = setTimeout(() => {
    revealMainWindow();
    closeSplash();
  }, 20000);
  win.on('closed', () => clearTimeout(splashFallback));

  win.loadURL(appUrl);
}

app.isQuitting = false;
app.whenReady().then(createWindow);

app.on('before-quit', () => {
  app.isQuitting = true;
  closeSplash();
  stopBackend();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
