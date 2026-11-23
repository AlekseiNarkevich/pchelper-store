/**
 * PCHelper — мост между Electron и веб-клиентом.
 *
 * Отдаёт странице только платформу и режим сборки: доступа к Node
 * и файловой системе у интерфейса нет.
 */

const { contextBridge } = require('electron');

// Portable-сборка запускается из временной папки; установленная — из
// каталога программы. Режим помогает не переносить чужую сессию между ними.
const portable = Boolean(
  process.env.PORTABLE_EXECUTABLE_DIR || process.env.PORTABLE_EXECUTABLE_FILE,
);

contextBridge.exposeInMainWorld('pchelperDesktop', {
  platform: process.platform,
  mode: portable ? 'portable' : 'installed',
});
