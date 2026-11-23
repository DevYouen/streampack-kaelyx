// Replay des POV : garde en continu les dernières secondes de chaque POV joueur (application de bureau seulement)
// - une fenêtre cachée par POV (/povrec/src.html) joue le live du joueur, son coupé sur le PC ;
// - une fenêtre cachée (/povrec/rec.html) capture ces fenêtres (image + son) et garde les N dernières secondes encodées ;
// - sur demande (bouton, raccourci, Stream Deck), elle renvoie un MP4 que le serveur sert à l'overlay /pov.
// Uniquement le lecteur officiel Twitch (ou VDO.Ninja) tel qu'il s'affiche dans les POV : aucune autre source.
const { BrowserWindow, session, ipcMain } = require('electron');
const path = require('path');

const QUALITY = { 720: { width: 1280, height: 720, fps: 30, bitrate: 4.5e6 }, 1080: { width: 1920, height: 1080, fps: 30, bitrate: 8e6 } };
const MAX = 8;

const channelOf = p => (p.povChannel || p.twitch || '').trim().replace(/^@/, '').replace(/^https?:\/\/(www\.)?twitch\.tv\//i, '').split(/[/?#]/)[0].toLowerCase();
const sourceKey = p => p.povSource === 'vdo' ? (p.povVdo ? 'vdo:' + p.povVdo : '') : p.povSource === 'obs' ? '' : (channelOf(p) ? 'tw:' + channelOf(p) : '');

module.exports = function createPovRec({ server }) {
  const base = `http://127.0.0.1:${server.port}`;
  const recSes = session.fromPartition('kx-povrec');
  const srcSes = session.fromPartition('kx-povsrc');
  let rec = null, recReady = null, pendingSrc = null, lock = Promise.resolve();
  const srcs = new Map();     // id -> { win, key, kick }
  let statuses = new Map();   // id -> état envoyé par l'enregistreur
  const failed = new Map();   // id -> erreur au démarrage de la capture (l'enregistreur ne la connaît pas)
  const clipWait = new Map(); // n° de demande -> resolve
  let reqN = 0, cfgKey = '', destroyed = false;

  // getDisplayMedia de l'enregistreur : on lui donne la fenêtre de POV en attente, rien d'autre
  recSes.setDisplayMediaRequestHandler((req, cb) => {
    const w = pendingSrc; pendingSrc = null;
    const me = rec && !rec.isDestroyed() && rec.webContents.mainFrame, f = req.frame;
    if (!w || w.isDestroyed() || !me || !f || f.processId !== me.processId || f.routingId !== me.routingId) return cb({});
    cb({ video: w.webContents.mainFrame, audio: w.webContents.mainFrame });
  });
  // Permissions : l'enregistreur peut seulement capturer (fenêtre choisie ci-dessus) ; les fenêtres de POV n'ont droit à rien
  recSes.setPermissionRequestHandler((wc, perm, cb) => cb(!!rec && !rec.isDestroyed() && wc === rec.webContents && (perm === 'media' || perm === 'display-capture')));
  srcSes.setPermissionRequestHandler((wc, perm, cb) => cb(false));

  const fromRec = e => rec && !rec.isDestroyed() && e.sender === rec.webContents;
  ipcMain.on('kxrec:status', (e, list) => {
    if (!fromRec(e) || !Array.isArray(list)) return;
    statuses = new Map(list.map(s => [s.id, s]));
    for (const s of list) failed.delete(s.id);
    report();
  });
  ipcMain.on('kxrec:clip', (e, req, buf, meta) => {
    if (!fromRec(e)) return;
    const done = clipWait.get(req); if (!done) return;
    clipWait.delete(req); done({ buf, meta: meta || {} });
  });

  function report() {
    const st = server.getState();
    const list = [...srcs.keys()].map(id => {
      const p = st.players.find(x => x.id === id) || {};
      const s = statuses.get(id) || failed.get(id) || { state: 'starting', seconds: 0 };
      return { id, pseudo: p.pseudo || id, state: s.state, seconds: s.seconds || 0, fps: s.fps || 0, audio: !!s.audio, error: s.error || '' };
    });
    server.povrecStatus({ list });
  }

  function ensureRec() {
    if (rec && !rec.isDestroyed()) return recReady;
    rec = new BrowserWindow({ show: false, width: 320, height: 240, title: 'Kaelyx · enregistreur des POV',
      webPreferences: { partition: 'kx-povrec', preload: path.join(__dirname, 'povrec-preload.js'), sandbox: true, contextIsolation: true, backgroundThrottling: false } });
    rec.webContents.setAudioMuted(true);
    rec.on('closed', () => { rec = null; });
    // L'enregistreur a planté : on repart de zéro (toutes les captures sont relancées)
    rec.webContents.on('render-process-gone', () => { if (destroyed) return; try { rec.destroy(); } catch {} rec = null; restartAll(); });
    recReady = rec.loadURL(base + '/povrec/rec.html').catch(() => {});
    return recReady;
  }
  const recJs = (code, gesture = true) => ensureRec().then(() => rec && !rec.isDestroyed() ? rec.webContents.executeJavaScript(code, gesture) : null);
  // Une capture à la fois (le gestionnaire ci-dessus sert la fenêtre en attente)
  const serial = fn => (lock = lock.then(fn, fn));

  function cfg() {
    const c = server.getState().povrec || {};
    return { ...(QUALITY[c.quality] || QUALITY[720]), seconds: Math.max(10, Math.min(60, Number(c.seconds) || 30)) };
  }

  function startSrc(p) {
    const c = cfg();
    const win = new BrowserWindow({ show: false, width: c.width, height: c.height, useContentSize: true, title: 'Kaelyx · POV ' + p.pseudo,
      webPreferences: { partition: 'kx-povsrc', sandbox: true, contextIsolation: true, backgroundThrottling: false } });
    win.webContents.setAudioMuted(true); // jamais de son sur le PC : seule la capture l'entend
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    const entry = { win, key: sourceKey(p) + '|' + c.height, kick: null };
    srcs.set(p.id, entry);
    statuses.delete(p.id); failed.delete(p.id);
    win.on('closed', () => { if (srcs.get(p.id) === entry) srcs.delete(p.id); });
    win.webContents.on('render-process-gone', () => { if (srcs.get(p.id) === entry) { stopSrc(p.id); setTimeout(sync, 2000); } });
    win.loadURL(`${base}/povrec/src.html?p=${encodeURIComponent(p.id)}&h=${c.height}`).catch(() => {});
    win.webContents.once('did-finish-load', () => serial(async () => {
      if (srcs.get(p.id) !== entry || win.isDestroyed()) return;
      pendingSrc = win;
      // Le résultat revient en texte simple (une erreur du navigateur ne traverse pas telle quelle)
      let r;
      try { r = await recJs(`KXR.start(${JSON.stringify(p.id)}, ${JSON.stringify(c)}).then(() => '', e => (e && (e.name + ' : ' + e.message)) || String(e))`); }
      catch (e) { r = String((e && e.message) || e); }
      if (r) { failed.set(p.id, { id: p.id, state: 'error', error: r.replace(/^Error : /, '') }); report(); }
      pendingSrc = null;
    }));
    // Son et lecture relancés régulièrement (le lecteur Twitch peut se remettre en pause ou en sourdine)
    entry.kick = setInterval(() => { if (!win.isDestroyed()) win.webContents.executeJavaScript('window.kxKick && kxKick()', true).catch(() => {}); }, 5000);
    report();
  }
  function stopSrc(id) {
    const e = srcs.get(id); if (!e) return;
    srcs.delete(id); statuses.delete(id); failed.delete(id);
    clearInterval(e.kick);
    if (rec && !rec.isDestroyed()) rec.webContents.executeJavaScript(`KXR.stop(${JSON.stringify(id)})`).catch(() => {});
    if (!e.win.isDestroyed()) e.win.destroy();
  }
  function restartAll() { for (const id of [...srcs.keys()]) stopSrc(id); cfgKey = ''; sync(); }

  // Joueurs à enregistrer : ceux placés sur les POV de la mise en page en direct, ou tous (réglage)
  function wanted(st) {
    const c = st.povrec || {};
    if (!c.enabled) return [];
    const ok = p => !!sourceKey(p);
    if (c.who === 'all') return st.players.filter(ok).slice(0, MAX);
    const L = (st.pov.layouts || []).find(l => l.id === st.pov.live) || (st.pov.layouts || [])[0];
    const slots = new Set(((L && L.items) || []).filter(i => i.kind === 'pov').map(i => i.slot));
    const ids = [...slots].map(s => (st.pov.slots || [])[s]).filter(Boolean);
    return st.players.filter(p => ids.includes(p.id) && ok(p)).slice(0, MAX);
  }
  function sync() {
    if (destroyed) return;
    const st = server.getState(), c = cfg();
    const k = c.height + '|' + c.seconds;
    if (k !== cfgKey) { // qualité changée : tout est relancé ; durée : appliquée à l'enregistreur
      const qualityChanged = cfgKey && cfgKey.split('|')[0] !== String(c.height);
      cfgKey = k;
      if (rec && !rec.isDestroyed()) recJs(`KXR.setSeconds(${c.seconds})`, false).catch(() => {});
      if (qualityChanged) { for (const id of [...srcs.keys()]) stopSrc(id); }
    }
    const want = wanted(st), ids = new Set(want.map(p => p.id));
    for (const id of [...srcs.keys()]) if (!ids.has(id)) stopSrc(id);
    for (const p of want) {
      const e = srcs.get(p.id), key = sourceKey(p) + '|' + c.height;
      if (e && e.key !== key) stopSrc(p.id);
      if (!srcs.has(p.id)) startSrc(p);
    }
    if (!srcs.size && rec && !rec.isDestroyed()) { rec.destroy(); rec = null; } // plus rien à enregistrer : on libère tout
    report();
  }
  let syncT;
  server.on('state', () => { clearTimeout(syncT); syncT = setTimeout(sync, 800); });
  setTimeout(sync, 1500);

  // Les `seconds` dernières secondes d'un joueur, en MP4
  function clip(id, seconds) {
    if (!srcs.has(id)) return Promise.reject(new Error('cette POV n’est pas enregistrée'));
    const req = ++reqN;
    return new Promise((ok, ko) => {
      const t = setTimeout(() => { clipWait.delete(req); ko(new Error('l’enregistreur ne répond pas')); }, 15000);
      clipWait.set(req, r => { clearTimeout(t); r.buf ? ok({ buf: Buffer.from(r.buf), ...r.meta }) : ko(new Error(r.meta.error || 'clip impossible')); });
      recJs(`KXR.clip(${JSON.stringify(id)}, ${Number(seconds) || 30}, ${req})`, false).catch(e => { clearTimeout(t); clipWait.delete(req); ko(e); });
    });
  }

  function destroy() {
    destroyed = true;
    for (const id of [...srcs.keys()]) stopSrc(id);
    if (rec && !rec.isDestroyed()) rec.destroy();
  }
  return { clip, destroy, recording: id => srcs.has(id) };
};
