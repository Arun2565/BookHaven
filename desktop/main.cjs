const { app, BrowserWindow, shell } = require('electron');
const path = require('node:path');
const { autoUpdater } = require('electron-updater');

const isDevelopment = process.argv.includes('--dev');

function createWindow() {
  const window = new BrowserWindow({
    width: 1320,
    height: 860,
    minWidth: 920,
    minHeight: 640,
    title: 'BookHaven',
    autoHideMenuBar: true,
    backgroundColor: '#f7f6f1',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https:')) shell.openExternal(url);
    return { action: 'deny' };
  });

  if (isDevelopment) {
    window.loadURL('http://127.0.0.1:5173');
    window.webContents.openDevTools({ mode: 'detach' });
  } else {
    window.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }
}

app.whenReady().then(() => {
  app.setAppUserModelId('com.bookhaven.desktop');
  createWindow();

  if (!isDevelopment) {
    autoUpdater.checkForUpdatesAndNotify().catch((err) => {
      console.log('Update check skipped or failed:', err.message);
    });
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
