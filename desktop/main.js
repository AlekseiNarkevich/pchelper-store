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

const appIconPath = app.isPackaged
  ? path.join(process.resourcesPath, 'icon.ico')
  : path.resolve(__dirname, 'icon.ico');

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
  startBackend();

  try {
    await waitForServer(`http://127.0.0.1:${BACKEND_PORT}/api/v1/health`);
  } catch (error) {
    dialog.showErrorBox(
      'Ошибка запуска PCHelper',
      `Не удалось запустить локальный сервер.\n${error.message}`,
    );
    app.quit();
    return;
  }

  const win = new BrowserWindow({
    width: 1600,
    height: 1000,
    minWidth: 1100,
    minHeight: 700,
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

  win.loadURL(appUrl);
  // Магазин удобнее смотреть на всей площади экрана.
  win.maximize();
}

app.isQuitting = false;
app.whenReady().then(createWindow);

app.on('before-quit', () => {
  app.isQuitting = true;
  stopBackend();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
