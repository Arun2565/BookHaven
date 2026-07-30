const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  onUpdateAvailable: (callback) => {
    ipcRenderer.on('update-available', (_event, info) => callback(info));
  },
  installUpdate: () => ipcRenderer.send('install-update'),
  dismissUpdate: () => ipcRenderer.send('dismiss-update')
});
