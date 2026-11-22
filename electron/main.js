// Application de bureau Streampack Kaelyx
// - lance le serveur des overlays (server.js) dans l'application : plus besoin d'installer Node
// - garde les données hors du dossier d'installation : les mises à jour ne les touchent jamais
// - se met à jour toute seule depuis GitHub Releases (téléchargement en fond, installation à la fermeture)
const { app, BrowserWindow, Tray, Menu, Notification, dialog, shell, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const { autoUpdater } = require('electron-updater');

const APP_NAME = 'Streampack Kaelyx';
// En développement (npm start) : dossiers séparés, pour ne pas mélanger avec l'application installée
const DEV = !app.isPackaged;
if (DEV) app.setPath('userData', app.getPath('userData') + '-dev');
if (!app.requestSingleInstanceLock()) { app.quit(); return; }

// Données (state.json, token Twitch) : %APPDATA%\Streampack Kaelyx\data, invisible pour le caster
const DATA_DIR = path.join(app.getPath('userData'), 'data');
// Fichiers du caster : Documents\Streampack Kaelyx (photos, son, masques et stinger pour OBS)
const USER_DIR = path.join(app.getPath('documents'), APP_NAME + (DEV ? ' (dev)' : ''));
// Fichiers livrés avec l'application (hors asar pour pouvoir les copier)
const RES = app.isPackaged ? process.resourcesPath : path.join(__dirname, '..');

let win, tray, server, quitting = false, updateReady = null;
const ICON = path.join(__dirname, 'icon.png');
const icon = () => fs.existsSync(ICON) ? nativeImage.createFromPath(ICON) : nativeImage.createEmpty();

// --- Dossier perso -------------------------------------------------------
function copyIfChanged(src, dst) {
  try {
    const s = fs.statSync(src);
    let d = null; try { d = fs.statSync(dst); } catch {}
    if (!d || d.size !== s.size) fs.copyFileSync(src, dst);
  } catch {}
}
function prepareUserDir() {
  for (const sub of ['photos', 'sounds', 'masques', 'stinger']) fs.mkdirSync(path.join(USER_DIR, sub), { recursive: true });
  // Masques et stinger : copiés à chaque version, pour que les chemins dans OBS ne changent jamais
  for (const sub of ['masques', 'stinger']) {
    const dir = path.join(RES, sub);
    try { for (const f of fs.readdirSync(dir)) copyIfChanged(path.join(dir, f), path.join(USER_DIR, sub, f)); } catch {}
  }
  const readme = path.join(USER_DIR, 'LISEZMOI.txt');
  if (!fs.existsSync(readme)) fs.writeFileSync(readme, [
    'Dossier du Streampack Kaelyx. Les mises à jour de l\'application ne suppriment rien ici.',
    '',
    'photos\\   Photos des joueurs (ex. pseudo.png), à choisir ensuite dans Admin > Joueurs.',
    'sounds\\   Mets ici un alert.mp3 pour remplacer le son d\'alerte.',
    'masques\\  Masques webcam pour OBS (filtre Masque d\'image/fusion).',
    'stinger\\  Transition OBS : kaelyx-stinger.webm, point de transition 1200 ms.',
    ''
  ].join('\r\n'));
}

// --- Premier lancement : reprendre les réglages de l'ancien pack (version .bat) ----------------
async function offerImport() {
  if (fs.existsSync(path.join(DATA_DIR, 'state.json'))) return;
  const { response } = await dialog.showMessageBox({
    type: 'question', title: APP_NAME, buttons: ['Reprendre mes réglages', 'Partir de zéro'], defaultId: 0, cancelId: 1,
    message: 'Tu utilisais déjà l\'ancien streampack (avec la fenêtre noire) ?',
    detail: 'Choisis son fichier data\\state.json : joueurs, scènes et réglages Twitch seront repris. Les photos de public\\photos sont copiées aussi.'
  });
  if (response !== 0) return;
  const { canceled, filePaths } = await dialog.showOpenDialog({
    title: 'Fichier state.json de l\'ancien streampack', properties: ['openFile'], filters: [{ name: 'state.json', extensions: ['json'] }]
  });
  if (canceled || !filePaths[0]) return;
  const src = filePaths[0];
  try {
    JSON.parse(fs.readFileSync(src, 'utf8'));
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.copyFileSync(src, path.join(DATA_DIR, 'state.json'));
    const token = path.join(path.dirname(src), 'twitch-token.json');
    if (fs.existsSync(token)) fs.copyFileSync(token, path.join(DATA_DIR, 'twitch-token.json'));
    const photos = path.join(path.dirname(src), '..', 'public', 'photos');
    try { for (const f of fs.readdirSync(photos)) if (/\.(png|jpe?g|webp|gif)$/i.test(f)) copyIfChanged(path.join(photos, f), path.join(USER_DIR, 'photos', f)); } catch {}
  } catch (e) {
    dialog.showErrorBox(APP_NAME, 'Ce fichier n\'est pas un state.json valide (' + e.message + '). Démarrage sans réglages.');
  }
}

// --- Serveur des overlays -----------------------------------------------
function startServer() {
  return new Promise((ok, ko) => {
    process.env.KX_DATA_DIR = DATA_DIR;
    process.env.KX_USER_DIR = USER_DIR;
    server = require(path.join(__dirname, '..', 'server.js'));
    server.once('ready', ok);
    server.once('error', ko);
  });
}

// --- Fenêtre admin + icône près de l'horloge ----------------------------------------
const adminUrl = () => `http://localhost:${server.port}/admin`;

function createWindow() {
  win = new BrowserWindow({
    width: 1280, height: 860, minWidth: 900, minHeight: 600, title: APP_NAME, icon: icon(),
    backgroundColor: '#2A2B2C', autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, sandbox: true }
  });
  win.loadURL(adminUrl());
  // Connexion Twitch : l'admin ouvre une petite fenêtre (about:blank -> id.twitch.tv -> localhost/twitch-auth)
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url === 'about:blank' || url.startsWith('http://localhost:') || url.startsWith('https://id.twitch.tv/'))
      return { action: 'allow', overrideBrowserWindowOptions: { autoHideMenuBar: true, icon: icon() } };
    shell.openExternal(url); // liens OBS, aperçus d'overlay… : navigateur par défaut
    return { action: 'deny' };
  });
  // Fermer la fenêtre ne coupe pas les overlays : l'application reste près de l'horloge
  let told = false;
  win.on('close', e => {
    if (quitting) return;
    e.preventDefault(); win.hide();
    if (!told && Notification.isSupported()) {
      told = true;
      new Notification({ title: APP_NAME, body: 'Les overlays tournent toujours. Pour quitter : clic droit sur l\'icône près de l\'horloge.', icon: icon() }).show();
    }
  });
}
function showWindow() { if (!win) createWindow(); win.show(); win.focus(); }

function refreshTray() {
  if (!tray) return;
  const items = [
    { label: 'Ouvrir l\'admin', click: showWindow },
    { label: 'Ouvrir l\'admin dans le navigateur', click: () => shell.openExternal(adminUrl()) },
    { label: 'Dossier photos, masques et stinger', click: () => shell.openPath(USER_DIR) },
    { type: 'separator' },
    updateReady
      ? { label: `Redémarrer pour installer la version ${updateReady}`, click: () => { quitting = true; autoUpdater.quitAndInstall(); } }
      : { label: 'Rechercher une mise à jour', enabled: app.isPackaged, click: () => checkUpdates(true) },
    { label: `Version ${app.getVersion()}`, enabled: false },
    { type: 'separator' },
    { label: 'Quitter (coupe les overlays)', click: () => { quitting = true; app.quit(); } }
  ];
  tray.setContextMenu(Menu.buildFromTemplate(items));
  tray.setToolTip(updateReady ? `${APP_NAME} : mise à jour ${updateReady} prête` : APP_NAME);
}

// --- Mises à jour automatiques ---------------------------------------------
// Téléchargées en fond, installées à la fermeture de l'application : jamais de redémarrage en plein stream.
let manualCheck = false;
function checkUpdates(manual = false) {
  if (!app.isPackaged) return;
  manualCheck = manual;
  autoUpdater.checkForUpdates().catch(() => {});
}
function setupUpdates() {
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on('update-not-available', () => {
    if (manualCheck) dialog.showMessageBox({ type: 'info', title: APP_NAME, message: 'Tu as déjà la dernière version (' + app.getVersion() + ').' });
  });
  autoUpdater.on('error', err => {
    if (manualCheck) dialog.showMessageBox({ type: 'warning', title: APP_NAME, message: 'Impossible de vérifier les mises à jour.', detail: String(err && err.message || err) });
  });
  autoUpdater.on('update-downloaded', info => {
    updateReady = info.version; refreshTray();
    if (Notification.isSupported()) {
      const n = new Notification({ title: 'Mise à jour prête', body: `La version ${info.version} s'installera quand tu fermeras l'application. Clique pour redémarrer maintenant.`, icon: icon() });
      n.on('click', () => { quitting = true; autoUpdater.quitAndInstall(); });
      n.show();
    }
  });
  checkUpdates();
  setInterval(checkUpdates, 4 * 60 * 60 * 1000); // toutes les 4 h, pour les longues sessions
}

// --- Démarrage -----------------------------------------------------------
app.on('second-instance', showWindow);
app.on('window-all-closed', () => {}); // on reste près de l'horloge
app.on('before-quit', () => { quitting = true; try { server && server.close(); } catch {} });

app.whenReady().then(async () => {
  app.setAppUserModelId('fr.kaelyx.streampack'); // notifications Windows
  prepareUserDir();
  await offerImport();
  try { await startServer(); }
  catch (err) {
    const busy = err && err.code === 'EADDRINUSE';
    dialog.showErrorBox(APP_NAME, busy
      ? 'Le port 3000 est déjà utilisé.\n\nL\'ancien streampack (fenêtre noire) est sans doute encore ouvert : ferme-le, puis relance l\'application.'
      : 'Démarrage impossible : ' + (err && err.message || err));
    quitting = true; app.quit(); return;
  }
  tray = new Tray(icon());
  tray.on('click', showWindow);
  refreshTray();
  createWindow();
  setupUpdates();
});
