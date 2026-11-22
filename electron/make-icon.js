// Génère electron/icon.png (512 × 512) à partir du logo SVG : npm run icone
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

app.whenReady().then(async () => {
  const svg = fs.readFileSync(path.join(__dirname, '..', 'public', 'logo', 'logo.svg'), 'utf8');
  const html = `<html><body style="margin:0;width:512px;height:512px;display:grid;place-items:center;background:transparent">
    <div style="width:440px;height:440px;border-radius:96px;background:#2A2B2C;display:grid;place-items:center">
      <img style="width:340px;height:340px;object-fit:contain" src="data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}">
    </div></body></html>`;
  const win = new BrowserWindow({ width: 512, height: 512, show: false, frame: false, transparent: true, useContentSize: true });
  await win.loadURL('data:text/html;base64,' + Buffer.from(html).toString('base64'));
  await new Promise(r => setTimeout(r, 500));
  const img = await win.webContents.capturePage({ x: 0, y: 0, width: 512, height: 512 });
  fs.writeFileSync(path.join(__dirname, 'icon.png'), img.resize({ width: 512, height: 512 }).toPNG());
  console.log('icon.png créé');
  app.quit();
});
