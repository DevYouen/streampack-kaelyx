// Pont minimal entre l'enregistreur des POV (fenêtre cachée) et l'application : état et clips, rien d'autre
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('kxRec', {
  status: list => ipcRenderer.send('kxrec:status', list),
  clip: (req, buf, meta) => ipcRenderer.send('kxrec:clip', req, buf, meta)
});
