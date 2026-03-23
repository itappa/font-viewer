const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');

const isMac = process.platform === 'darwin';
const execFileAsync = promisify(execFile);
const FONT_CACHE_TTL_MS = 5 * 60 * 1000;

let fontCache = null;
let fontCacheAt = 0;

function isCacheValid() {
  return Array.isArray(fontCache) && Date.now() - fontCacheAt < FONT_CACHE_TTL_MS;
}

function normalizeFonts(fonts) {
  return fonts
    .filter(font => font && font.name)
    .map(font => ({
      name: font.name.trim(),
      localizedName: (font.localizedName || '').trim()
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function uniqueNonEmptyStrings(values) {
  return [...new Set(values.map(value => value.trim()).filter(Boolean))];
}

async function loadFontsViaSwift() {
  const scriptPath = path.join(__dirname, 'scripts/listFonts.swift');
  const { stdout } = await execFileAsync('swift', [scriptPath], {
    timeout: 15000,
    maxBuffer: 1024 * 1024
  });

  return stdout
    .split('\n')
    .filter(line => line.trim())
    .map(line => {
      const [name, localizedName] = line.split('\t');
      return {
        name: name || '',
        localizedName: localizedName || ''
      };
    });
}

async function loadFontsViaWindowsRegistry() {
  const command = "Get-ItemProperty -Path 'HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Fonts' | ConvertTo-Json -Compress";
  const { stdout } = await execFileAsync('powershell', ['-NoProfile', '-Command', command], {
    timeout: 15000,
    maxBuffer: 1024 * 1024
  });

  const raw = JSON.parse(stdout || '{}');
  const names = Object.keys(raw)
    .filter(key => !key.startsWith('PS'))
    .map(key => key.replace(/\s*\(.*\)\s*$/g, '').trim());

  return uniqueNonEmptyStrings(names).map(name => ({
    name,
    localizedName: ''
  }));
}

async function loadFontsViaFcList() {
  const { stdout } = await execFileAsync('fc-list', [':', 'family'], {
    timeout: 15000,
    maxBuffer: 2 * 1024 * 1024
  });

  const names = stdout
    .split('\n')
    .flatMap(line => line.split(','));

  return uniqueNonEmptyStrings(names).map(name => ({
    name,
    localizedName: ''
  }));
}

async function loadFontsViaSystemCommand() {
  if (process.platform === 'win32') {
    return loadFontsViaWindowsRegistry();
  }

  if (process.platform === 'linux') {
    return loadFontsViaFcList();
  }

  return [];
}

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
  if (isCacheValid()) {
    return fontCache;
  }

  // macOS: use Swift + NSFontManager for localized names
  if (isMac) {
    try {
      const fonts = normalizeFonts(await loadFontsViaSwift());
      fontCache = fonts;
      fontCacheAt = Date.now();
      return fonts;
    } catch (err) {
      console.error('Error getting fonts via Swift:', err);
    }
  }

  // Windows / Linux / fallback: use system commands
  try {
    const fonts = normalizeFonts(await loadFontsViaSystemCommand());
    fontCache = fonts;
    fontCacheAt = Date.now();
    return fonts;
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
