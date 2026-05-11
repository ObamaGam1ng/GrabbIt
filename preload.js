const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  fetchMetadata:    (url)  => ipcRenderer.invoke('fetch-metadata', url),
  getStreamUrl:     (url)  => ipcRenderer.invoke('get-stream-url', url),
  downloadVideo:    (opts) => ipcRenderer.invoke('download-video', opts),
  showInFolder:     (p)    => ipcRenderer.invoke('show-in-folder', p),
  cancelDownload:   ()     => ipcRenderer.send('cancel-download'),

  onProgress:       (cb)   => ipcRenderer.on('download-progress', (_e, d) => cb(d)),
  onSetupStatus:    (cb)   => ipcRenderer.on('setup-status', (_e, s) => cb(s)),

  winMinimize: () => ipcRenderer.send('win-minimize'),
  winMaximize: () => ipcRenderer.send('win-maximize'),
  winClose:    () => ipcRenderer.send('win-close'),
});
