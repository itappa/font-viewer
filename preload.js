const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getFonts: () => ipcRenderer.invoke('get-fonts')
});