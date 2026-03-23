const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { execSync } = require('child_process');

const isMac = process.platform === 'darwin';

function createWindow() {
  const winOptions = {
    width: 1280,
    height: 860,
    minWidth: 800,
    minHeight: 500,
    backgroundColor: '#f5f7fa',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  };

  if (isMac) {
    winOptions.titleBarStyle = 'hiddenInset';
    winOptions.trafficLightPosition = { x: 16, y: 18 };
  }

  const win = new BrowserWindow(winOptions);
  win.loadFile(path.join(__dirname, 'src/renderer/index.html'));
}

ipcMain.handle('get-fonts', async () => {
  // macOS: use Swift + NSFontManager for localized names
  if (isMac) {
    try {
      const scriptPath = path.join(__dirname, 'scripts/listFonts.swift');
      const output = execSync(`swift "${scriptPath}"`, {
        timeout: 15000,
        maxBuffer: 1024 * 1024
      }).toString();

      const fonts = output
        .split('\n')
        .filter(line => line.trim())
        .map(line => {
          const [name, localizedName] = line.split('\t');
          return { name: name.trim(), localizedName: (localizedName || '').trim() };
        })
        .sort((a, b) => a.name.localeCompare(b.name));

      return fonts;
    } catch (err) {
      console.error('Error getting fonts via Swift:', err);
    }
  }

  // Windows / Linux / fallback: use font-list package
  try {
    const fontList = require('font-list');
    const fonts = await fontList.getFonts();
    return fonts.sort().map(f => ({
      name: f.replace(/^"|"$/g, ''),
      localizedName: ''
    }));
  } catch (err) {
    console.error('Error getting fonts:', err);
    return [];
  }
});

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (!isMac) {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
