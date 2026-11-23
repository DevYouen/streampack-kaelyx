// Application de bureau Streampack Kaelyx
// - lance le serveur des overlays (server.js) dans l'application : plus besoin d'installer Node
// - garde les données hors du dossier d'installation : les mises à jour ne les touchent jamais
// - se met à jour toute seule depuis GitHub Releases (téléchargement en fond, installation à la fermeture)
const { app, BrowserWindow, Tray, Menu, Notification, dialog, shell, nativeImage, globalShortcut } = require('electron');
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

let win, tray, server, quitting = false;
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
  for (const sub of ['photos', 'sounds', 'logos', 'masques', 'stinger']) fs.mkdirSync(path.join(USER_DIR, sub), { recursive: true });
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
    // Barre de titre aux couleurs Kaelyx (dessinée par l'admin) ; seuls les boutons réduire / agrandir / fermer restent natifs
    titleBarStyle: 'hidden', titleBarOverlay: { color: '#2A2B2C', symbolColor: '#C9CCD1', height: 38 },
    webPreferences: { contextIsolation: true, sandbox: true }
  });
  win.loadURL(adminUrl());
  // Connexion Twitch : l'admin ouvre une petite fenêtre (about:blank -> id.twitch.tv -> localhost/twitch-auth)
  win.webContents.setWindowOpenHandler(({ url }) => {
    // Seule la connexion Twitch s'ouvre dans une petite fenêtre de l'application (elle a besoin de window.opener)
    if (url === 'about:blank' || url.startsWith('https://id.twitch.tv/'))
      return { action: 'allow', overrideBrowserWindowOptions: { autoHideMenuBar: true, icon: icon() } };
    shell.openExternal(url); // « Ouvrir dans un onglet », liens OBS… : navigateur habituel
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
function showWindow() {
  if (!win) createWindow();
  else if (!win.isVisible()) win.webContents.reload(); // rouvrir la fenêtre = nouvelle connexion : le mot de passe est redemandé
  win.show(); win.focus();
}

function refreshTray() {
  if (!tray) return;
  const ready = upd.state === 'ready';
  const items = [
    { label: 'Ouvrir l\'admin', click: showWindow },
    { label: 'Ouvrir l\'admin dans le navigateur', click: () => shell.openExternal(adminUrl()) },
    { label: 'Dossier photos, masques et stinger', click: () => shell.openPath(USER_DIR) },
    { type: 'separator' },
    ready
      ? { label: `Installer la version ${upd.next} maintenant`, click: installUpdate }
      : { label: upd.state === 'downloading' ? `Téléchargement de la mise à jour… ${upd.percent} %` : 'Rechercher une mise à jour',
          enabled: app.isPackaged && upd.state !== 'downloading' && upd.state !== 'checking', click: () => checkUpdates(true) },
    { label: `Version ${app.getVersion()}`, enabled: false },
    { type: 'separator' },
    { label: 'Quitter (coupe les overlays)', click: () => { quitting = true; app.quit(); } }
  ];
  tray.setContextMenu(Menu.buildFromTemplate(items));
  tray.setToolTip(ready ? `${APP_NAME} : mise à jour ${upd.next} prête` : APP_NAME);
}

// --- Mises à jour automatiques ---------------------------------------------
// Recherche au lancement puis toutes les 30 min. Dès qu'une version est téléchargée, on propose de l'installer
// tout de suite (fenêtre + bandeau dans l'admin + Réglages). Sinon elle s'installe à la fermeture de l'application.
// L'état est partagé avec l'admin via le serveur (/api/update + événement « update »), y compris dans le dock OBS.
const upd = { supported: app.isPackaged, current: app.getVersion(), state: 'idle', next: '', percent: 0, error: '', checkedAt: 0 };
let manualCheck = false, asked = '';
function setUpd(patch) {
  Object.assign(upd, patch);
  refreshTray();
  try { server && server.broadcast('update', upd); } catch {}
}
function checkUpdates(manual = false) {
  if (!app.isPackaged) { setUpd({ state: 'error', error: 'Mises à jour indisponibles en mode développement.' }); return; }
  if (upd.state === 'checking' || upd.state === 'downloading' || upd.state === 'ready') return;
  manualCheck = manual;
  setUpd({ state: 'checking', error: '' });
  autoUpdater.checkForUpdates().catch(err => setUpd({ state: 'error', error: String(err && err.message || err) }));
}
function installUpdate() {
  if (upd.state !== 'ready') return;
  quitting = true;
  try { server && server.close(); } catch {}
  // Installation silencieuse puis relance automatique : ~10 s de coupure des overlays
  setImmediate(() => autoUpdater.quitAndInstall(true, true));
}
async function askInstall() {
  if (asked === upd.next) return; // une seule fenêtre par version
  asked = upd.next;
  const { response } = await dialog.showMessageBox(win && win.isVisible() ? win : null, {
    type: 'info', title: APP_NAME, buttons: ['Installer maintenant', 'Plus tard'], defaultId: 0, cancelId: 1,
    message: `La version ${upd.next} est prête.`,
    detail: 'L\'application redémarre toute seule (environ 10 secondes de coupure des overlays).\n\n« Plus tard » : elle s\'installera quand tu fermeras l\'application, ou depuis Admin > Réglages.'
  });
  if (response === 0) installUpdate();
}
function setupUpdates() {
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on('update-available', info => setUpd({ state: 'downloading', next: info.version, percent: 0 }));
  autoUpdater.on('download-progress', p => {
    const percent = Math.round(p.percent || 0);
    if (percent !== upd.percent) setUpd({ state: 'downloading', percent });
  });
  autoUpdater.on('update-not-available', () => {
    setUpd({ state: 'none', checkedAt: Date.now() });
    if (manualCheck) dialog.showMessageBox({ type: 'info', title: APP_NAME, message: 'Tu as déjà la dernière version (' + app.getVersion() + ').' });
  });
  autoUpdater.on('error', err => {
    setUpd({ state: 'error', error: String(err && err.message || err).split('\n')[0], checkedAt: Date.now() });
  });
  autoUpdater.on('update-downloaded', info => {
    setUpd({ state: 'ready', next: info.version, percent: 100, checkedAt: Date.now() });
    askInstall();
  });
  server.setUpdater({ status: () => upd, check: manual => checkUpdates(manual), install: installUpdate });
  checkUpdates();
  setInterval(() => { if (upd.state !== 'ready') checkUpdates(); }, 30 * 60 * 1000);
}

// --- Démarrage -----------------------------------------------------------
app.on('second-instance', showWindow);
app.on('window-all-closed', () => {}); // on reste près de l'horloge
app.on('before-quit', () => { quitting = true; try { server && server.close(); } catch {} });
app.on('will-quit', () => globalShortcut.unregisterAll());

// --- Raccourcis clavier globaux : marchent même quand le jeu ou OBS est au premier plan (et depuis un Stream Deck) ---
// Ctrl + Alt + lettre (aucun caractère AltGr sur ces touches en AZERTY) ; Ctrl + Alt + F1…F8 : mettre en grand le joueur 1…8
const GLOBAL_KEYS = [
  ['Control+Alt+S', 'stinger'], ['Control+Alt+P', 'pov-sting'], ['Control+Alt+L', 'lowerthird'],
  ['Control+Alt+D', 'ticker'], ['Control+Alt+B', 'scoreboard'], ['Control+Alt+K', 'sponsors'], ['Control+Alt+O', 'goal'],
  ...Array.from({ length: 8 }, (_, i) => [`Control+Alt+F${i + 1}`, 'pov-main', String(i + 1)])
];
let keysOn = null;
function applyGlobalKeys(on) {
  if (on === keysOn) return;
  keysOn = on;
  globalShortcut.unregisterAll();
  if (!on) return;
  for (const [acc, action, arg] of GLOBAL_KEYS) {
    try { globalShortcut.register(acc, () => server.action(action, arg)); } catch {}
  }
}

// --- Lancement façon Discord : fenêtre « Recherche de mises à jour… » avant d'ouvrir l'application -----------
// Le caster n'est pas encore en stream : si une version existe, on la télécharge et on l'installe tout de suite
// (relance automatique). Sans mise à jour, sans internet ou en cas d'erreur, l'application s'ouvre normalement.
function splashHtml() {
  let logo = '';
  try { logo = 'data:image/svg+xml;base64,' + fs.readFileSync(path.join(__dirname, '..', 'public', 'logo', 'logo.svg')).toString('base64'); }
  catch { try { logo = 'data:image/png;base64,' + fs.readFileSync(ICON).toString('base64'); } catch {} }
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><style>
  html,body{margin:0;height:100%;overflow:hidden;user-select:none;-webkit-app-region:drag}
  body{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;font:600 14px/1.3 'Segoe UI',system-ui,sans-serif;color:#F3F1F1;
    background:radial-gradient(420px 300px at 50% 30%,rgba(153,51,204,.45),rgba(86,28,115,.2) 50%,transparent 75%),#2A2B2C}
  body::before{content:'';position:absolute;inset:0;border:1px solid rgba(201,204,209,.18);pointer-events:none}
  img{width:120px;height:120px;animation:float 2.4s ease-in-out infinite;filter:drop-shadow(0 0 24px rgba(153,51,204,.6))}
  @keyframes float{50%{transform:translateY(-6px) scale(1.03)}}
  h1{margin:0;font:italic 800 22px/1 'Segoe UI',sans-serif;letter-spacing:.08em;text-transform:uppercase}
  #s{color:#C9CCD1;min-height:18px;text-align:center;padding:0 20px}
  .bar{width:220px;height:6px;background:rgba(243,241,241,.1);overflow:hidden;clip-path:polygon(3px 0,100% 0,calc(100% - 3px) 100%,0 100%)}
  .bar i{display:block;height:100%;width:30%;background:linear-gradient(90deg,#561C73,#9933CC);box-shadow:0 0 10px #9933CC;animation:indet 1.1s ease-in-out infinite}
  .bar.det i{animation:none;transition:width .3s}
  @keyframes indet{0%{transform:translateX(-100%)}100%{transform:translateX(340%)}}
  #k{display:none;-webkit-app-region:no-drag;background:none;border:0;color:#C9CCD1;font:600 12px 'Segoe UI',sans-serif;text-decoration:underline;cursor:pointer}
  </style></head><body><img src="${logo}" alt=""><h1>Streampack Kaelyx</h1><div id="s">Recherche de mises à jour…</div>
  <div class="bar" id="b"><i id="p"></i></div><button id="k" onclick="document.title='skip'">Lancer sans mettre à jour</button></body></html>`;
}

function updateAtLaunch() {
  if (!app.isPackaged) return Promise.resolve(); // pas de mises à jour en mode développement
  return new Promise(done => {
    const splash = new BrowserWindow({ width: 360, height: 400, frame: false, resizable: false, show: false, center: true,
      backgroundColor: '#2A2B2C', icon: icon(), skipTaskbar: false, title: APP_NAME, webPreferences: { sandbox: true, contextIsolation: true } });
    splash.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(splashHtml()));
    splash.once('ready-to-show', () => splash.show());
    const say = (text, percent) => splash.isDestroyed() ? null : splash.webContents.executeJavaScript(
      `document.getElementById('s').textContent=${JSON.stringify(text)};` +
      (percent === undefined ? '' : `document.getElementById('b').classList.add('det');document.getElementById('p').style.width='${percent}%';`)).catch(() => {});

    let finished = false, installing = false;
    const timers = [];
    const off = () => {
      autoUpdater.removeListener('update-available', onAvail);
      autoUpdater.removeListener('update-not-available', onNone);
      autoUpdater.removeListener('download-progress', onProgress);
      autoUpdater.removeListener('update-downloaded', onReady);
      autoUpdater.removeListener('error', onError);
      timers.forEach(clearTimeout);
    };
    const finish = () => { if (finished || installing) return; finished = true; off(); if (!splash.isDestroyed()) splash.destroy(); done(); };
    const onNone = () => { say('À jour ✓'); timers.push(setTimeout(finish, 450)); };
    const onError = () => finish(); // hors ligne, GitHub injoignable… : on lance quand même
    const onAvail = info => {
      clearTimeout(checkTimeout);
      say(`Téléchargement de la version ${info.version}…`, 0);
      // Connexion lente : après 20 s on propose de lancer quand même (la mise à jour s'installera à la fermeture)
      timers.push(setTimeout(() => !splash.isDestroyed() && splash.webContents.executeJavaScript(`document.getElementById('k').style.display='block'`).catch(() => {}), 20000));
    };
    const onProgress = p => say(`Téléchargement de la mise à jour… ${Math.round(p.percent || 0)} %`, Math.round(p.percent || 0));
    const onReady = info => {
      installing = true; off();
      say(`Installation de la version ${info.version}…`, 100);
      quitting = true;
      setTimeout(() => autoUpdater.quitAndInstall(true, true), 900); // installation silencieuse puis relance
    };
    autoUpdater.autoDownload = true;
    autoUpdater.on('update-available', onAvail);
    autoUpdater.on('update-not-available', onNone);
    autoUpdater.on('download-progress', onProgress);
    autoUpdater.on('update-downloaded', onReady);
    autoUpdater.on('error', onError);
    splash.on('page-title-updated', (e, title) => { if (title === 'skip') finish(); });
    splash.on('closed', () => { if (!installing) finish(); });
    // Pas de réponse en 10 s (réseau capricieux) : on lance l'application
    const checkTimeout = setTimeout(finish, 10000);
    timers.push(checkTimeout);
    autoUpdater.checkForUpdates().catch(onError);
  });
}

app.whenReady().then(async () => {
  app.setAppUserModelId('fr.kaelyx.streampack'); // notifications Windows
  await updateAtLaunch();
  if (quitting) return; // une mise à jour s'installe : l'application va redémarrer
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
  applyGlobalKeys(server.getState().settings.globalKeys !== false);
  server.on('state', st => applyGlobalKeys(st.settings?.globalKeys !== false));
});
