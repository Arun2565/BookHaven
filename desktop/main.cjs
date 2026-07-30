const { app, BrowserWindow, shell, dialog, ipcMain } = require('electron');
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
      sandbox: true,
      preload: path.join(__dirname, 'preload.cjs')
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
    autoUpdater.disableSignatureVerification = true;
    const fs = require('node:fs');
    const logFile = path.join(app.getPath('userData'), 'updater-log.txt');
    
    function log(message) {
      const line = `[${new Date().toISOString()}] ${message}\n`;
      try {
        fs.appendFileSync(logFile, line);
      } catch (e) {}
    }

    log('--- App started (Auto-Updater initialized) ---');
    log(`App version: ${app.getVersion()}`);

    autoUpdater.on('checking-for-update', () => {
      log('Checking for updates on GitHub...');
    });

    autoUpdater.on('update-available', (info) => {
      log(`Update found: v${info.version}`);
    });

    autoUpdater.on('update-not-available', (info) => {
      log(`No update available. Current: ${app.getVersion()}`);
    });

    autoUpdater.on('error', (err) => {
      log(`Updater error: ${err.stack || err.message}`);
      dialog.showErrorBox('Auto-Update Error', `Updater failed: ${err.message}\nCheck updater-log.txt for details.`);
    });

    autoUpdater.on('download-progress', (progressObj) => {
      log(`Download progress: ${progressObj.percent.toFixed(2)}%`);
    });

    autoUpdater.on('update-downloaded', (info) => {
      log(`Update fully downloaded: v${info.version}`);
      const win = BrowserWindow.getAllWindows()[0];
      if (win) {
        win.webContents.send('update-available', {
          version: info.version,
          currentVersion: app.getVersion()
        });
      }
    });

    ipcMain.on('install-update', () => {
      log('IPC: install-update received — restarting app...');
      autoUpdater.quitAndInstall();
    });

    ipcMain.on('dismiss-update', () => {
      log('IPC: dismiss-update — user deferred update');
    });

    log('Triggering checkForUpdatesAndNotify()...');
    autoUpdater.checkForUpdatesAndNotify().catch((err) => {
      log(`Catch in checkForUpdatesAndNotify: ${err.message}`);
    });
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
