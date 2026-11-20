const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('pchelperDesktop', {
  platform: process.platform,
});
