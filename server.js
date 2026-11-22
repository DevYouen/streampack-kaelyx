// Streampack Kaelyx — serveur local sans dépendance (Node 22+ pour Twitch)
// Lancer : node server.js   puis ouvrir http://localhost:3000/admin
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '127.0.0.1'; // HOST=0.0.0.0 pour piloter depuis un téléphone du même réseau
const ROOT = path.join(__dirname, 'public');
// Dans l'application de bureau, les données et les fichiers perso vivent hors du dossier d'installation :
// une mise à jour remplace le code sans jamais toucher à l'état, au token Twitch ni aux photos.
const DATA_DIR = process.env.KX_DATA_DIR || path.join(__dirname, 'data');
const USER_DIR = process.env.KX_USER_DIR || ''; // dossier perso : photos/ et sounds/ (prioritaires sur ceux fournis)
try { fs.mkdirSync(DATA_DIR, { recursive: true }); } catch {}
const DATA = path.join(DATA_DIR, 'state.json');
const BACKUP = path.join(DATA_DIR, 'state.backup.json');
const crypto = require('crypto');

// Valeurs par défaut : complètent un état incomplet (vieux fichier, import partiel) pour que les overlays ne plantent pas
const SCENE = { kicker: '', title: '', subtitle: '', endAt: 0, next: '' };
const DEFAULTS = {
  settings: { teamName: 'KAELYX', teamSub: 'ESPORT', logo: '/logo/logo.svg', tagline: '',
    socials: { x: '', twitch: '', tiktok: '', instagram: '', youtube: '', discord: '', site: '' }, alertDuration: 6, neon: true,
    twitch: { channel: '', clientId: '', chatHide: 0, hideCommands: true, ignore: ['nightbot', 'streamelements', 'streamlabs', 'moobot', 'fossabot'],
      alerts: { follow: true, sub: true, gift: true, bits: true, raid: true } } },
  players: [],
  scenes: {
    starting: { ...SCENE, kicker: 'Le live commence', title: 'Starting soon' },
    brb: { ...SCENE, kicker: 'Petite pause', title: 'On revient' },
    ending: { ...SCENE, kicker: "Merci d'avoir suivi", title: 'Stream terminé' },
    tech: { ...SCENE, kicker: 'Problème technique', title: 'On règle ça' },
    chatting: { ...SCENE, kicker: 'En direct', title: 'Just chatting', chat: true }
  },
  lowerthird: { visible: false, name: '', title: '', autoHide: 8, showAt: 0 },
  ticker: { visible: false, speed: 60, items: [] },
  scoreboard: { visible: false, mode: 'classement', event: '', game: 1, games: 6, rows: [],
    vs: { a: '', b: '', scoreA: 0, scoreB: 0, label: 'BO3' } },
  // Desk caster : 1 à 3 casters, plein écran (/caster) ou petites cams sur le jeu (/caster/pip)
  casters: { kicker: 'Desk', title: 'Analyse', showScore: true, pipPos: 'tr', pipSize: 'm', list: [] },
  // Cadre webcam seul (/cam) : la source OBS fait la taille du cadre
  camframe: { w: 640, h: 360, name: '', sub: '' },
  // POV joueurs (/pov) : mises en page libres (éditeur glisser-déposer) + joueurs affectés aux emplacements
  pov: { visible: true, live: 'duo', audio: 'main', slots: [], layouts: [] }
};
const PLAYER = { id: '', pseudo: '', role: 'Joueur', game: '', photo: '', twitch: '', x: '',
  camVisible: true, camPos: 'bl', camSize: 'm', showTag: true, showTicker: false, showSocial: true,
  povSource: 'twitch', povChannel: '', povVdo: '' };
// POV : 'twitch' (live du joueur : povChannel, sinon champ twitch), 'vdo' (envoi direct VDO.Ninja, identifiant povVdo) ou 'obs' (trou transparent)
// Élément d'une mise en page POV, en pixels du 1920 × 1080. kind : pov | plate | cam | logo ; slot : n° de POV (0 = principale)
const POV_ITEM = { id: '', kind: 'pov', slot: 0, x: 0, y: 0, w: 480, h: 270 };
const POV_LAYOUT = { id: '', name: 'Mise en page', items: [] };
const it = (kind, slot, x, y, w, h) => ({ id: kind + slot + '-' + x + '-' + y, kind, slot, x, y, w, h });
const POV_PRESETS = [
  { id: 'solo', name: 'Solo', items: [it('pov', 0, 0, 0, 1920, 1080), it('plate', 0, 48, 960, 620, 72), it('logo', 0, 1792, 32, 96, 96)] },
  { id: 'duo', name: 'Duo (grande + petite)', items: [it('pov', 0, 0, 0, 1920, 1080), it('pov', 1, 1392, 48, 480, 270),
    it('plate', 1, 1392, 318, 480, 48), it('plate', 0, 48, 960, 620, 72), it('logo', 0, 48, 48, 96, 96)] },
  { id: 'cote', name: 'Côte à côte', items: [it('pov', 0, 0, 270, 960, 540), it('pov', 1, 960, 270, 960, 540),
    it('plate', 0, 24, 834, 560, 64), it('plate', 1, 1336, 834, 560, 64), it('logo', 0, 912, 120, 96, 96)] },
  { id: 'quatuor', name: 'Quatuor (2 × 2)', items: [it('pov', 0, 0, 0, 960, 540), it('pov', 1, 960, 0, 960, 540),
    it('pov', 2, 0, 540, 960, 540), it('pov', 3, 960, 540, 960, 540),
    it('plate', 0, 16, 468, 460, 56), it('plate', 1, 976, 468, 460, 56), it('plate', 2, 16, 1008, 460, 56), it('plate', 3, 976, 1008, 460, 56),
    it('logo', 0, 912, 492, 96, 96)] }
];
const clampN = (v, a, b) => Math.min(b, Math.max(a, Math.round(Number(v) || 0)));
const ROW = { name: '', elims: 0, points: 0 };
const CASTER = { name: '', handle: '', role: 'Caster' };

const isObj = v => v && typeof v === 'object' && !Array.isArray(v);
function fill(def, v) {
  if (Array.isArray(def)) return Array.isArray(v) ? v : def.slice();
  if (!isObj(def)) return v === undefined || v === null || typeof v !== typeof def ? def : v;
  const out = isObj(v) ? { ...v } : {};
  for (const k of Object.keys(def)) out[k] = fill(def[k], out[k]);
  return out;
}
function normalize(s) {
  const out = fill(DEFAULTS, s);
  out.players = out.players.filter(isObj).map(p => fill(PLAYER, p)).filter(p => p.id);
  out.scoreboard.rows = out.scoreboard.rows.filter(isObj).map(r => fill(ROW, r));
  out.casters.list = out.casters.list.filter(isObj).map(c => fill(CASTER, c)).slice(0, 3);
  out.ticker.items = out.ticker.items.map(x => String(x ?? ''));
  const pv = out.pov;
  if (!pv.layouts.length) pv.layouts = JSON.parse(JSON.stringify(POV_PRESETS));
  pv.layouts = pv.layouts.filter(isObj).map(l => {
    const L = fill(POV_LAYOUT, l);
    L.items = L.items.filter(isObj).map(i => {
      const I = fill(POV_ITEM, i);
      if (!['pov', 'plate', 'cam', 'logo'].includes(I.kind)) I.kind = 'pov';
      I.slot = clampN(I.slot, 0, 7);
      I.w = clampN(I.w, 16, 1920); I.h = clampN(I.h, 16, 1080);
      I.x = clampN(I.x, -I.w + 16, 1920 - 16); I.y = clampN(I.y, -I.h + 16, 1080 - 16);
      return I;
    }).slice(0, 40);
    return L;
  }).filter(l => l.id).slice(0, 30);
  if (!pv.layouts.some(l => l.id === pv.live)) pv.live = pv.layouts[0]?.id || '';
  pv.slots = pv.slots.map(s => String(s ?? '')).slice(0, 8);
  if (!['main', 'none', 'all'].includes(pv.audio)) pv.audio = 'main';
  for (const p of out.players) {
    if (!['twitch', 'vdo', 'obs'].includes(p.povSource)) p.povSource = 'twitch';
    // Identifiant VDO.Ninja propre au joueur, impossible à deviner (quiconque le connaît peut voir son écran)
    if (!/^[a-z0-9]{12,40}$/.test(p.povVdo)) p.povVdo = 'kx' + crypto.randomBytes(9).toString('hex');
  }
  return out;
}

/* ---------- Mot de passe admin ----------
   Seule l'empreinte scrypt est stockée (le code est public) : le mot de passe lui-même n'apparaît nulle part.
   Mot de passe par défaut : donné par le mainteneur. Chaque caster peut le changer dans Admin > Réglages
   (enregistré dans data/auth.json, qui contient aussi les sessions ouvertes). */
const DEFAULT_HASH = 'scrypt$16384$8$1$2rD/O0x7t+mL++SJ5RSDFQ==$M5W/1N3vRTiG90lkCpF/ScpQW3LKip3MMVm735z2oiM=';
const AUTH = path.join(DATA_DIR, 'auth.json');
const SESSION_DAYS = 30;
let auth = { hash: '', sessions: {} };
try { auth = { ...auth, ...JSON.parse(fs.readFileSync(AUTH, 'utf8')) }; } catch {}
const saveAuth = () => { try { fs.writeFileSync(AUTH, JSON.stringify(auth, null, 2)); } catch (e) { console.error('  auth.json :', e.message); } };
const sha = t => crypto.createHash('sha256').update(String(t)).digest('hex');

function scrypt(pass, salt, N = 16384, r = 8, p = 1) {
  return new Promise((ok, ko) => crypto.scrypt(String(pass), salt, 32, { N, r, p, maxmem: 64 * 1024 * 1024 }, (e, k) => e ? ko(e) : ok(k)));
}
async function hashPassword(pass) {
  const salt = crypto.randomBytes(16);
  return `scrypt$16384$8$1$${salt.toString('base64')}$${(await scrypt(pass, salt)).toString('base64')}`;
}
async function checkPassword(pass) {
  const [, N, r, p, salt, hash] = (auth.hash || DEFAULT_HASH).split('$');
  const want = Buffer.from(hash, 'base64');
  const got = await scrypt(pass, Buffer.from(salt, 'base64'), +N, +r, +p);
  return got.length === want.length && crypto.timingSafeEqual(got, want);
}
function newSession() {
  const token = crypto.randomBytes(32).toString('hex');
  const now = Date.now();
  for (const [k, exp] of Object.entries(auth.sessions)) if (exp < now) delete auth.sessions[k]; // ménage
  auth.sessions[sha(token)] = now + SESSION_DAYS * 864e5;
  saveAuth();
  return token;
}
function loggedIn(req) {
  const t = req.headers['x-kx-token'];
  if (!t || typeof t !== 'string') return false;
  const exp = auth.sessions[sha(t)];
  return !!exp && exp > Date.now();
}
// Anti-forçage : après 5 essais ratés, attente qui double (1 min, 2 min… jusqu'à 15 min), par adresse
const fails = new Map();
function blockedFor(ip) { const f = fails.get(ip); return f && f.until > Date.now() ? Math.ceil((f.until - Date.now()) / 1000) : 0; }
function failed(ip) {
  const f = fails.get(ip) || { n: 0, until: 0 };
  f.n++;
  if (f.n >= 5) f.until = Date.now() + Math.min(60e3 * 2 ** (f.n - 5), 15 * 60e3);
  fails.set(ip, f);
}
const wait = ms => new Promise(r => setTimeout(r, ms));

let state;
try {
  const raw = fs.readFileSync(DATA, 'utf8');
  state = normalize(JSON.parse(raw));
  fs.writeFileSync(BACKUP, raw); // copie de l'état au démarrage (au cas où un import tourne mal)
} catch (e) {
  console.error('  state.json illisible (' + e.message + ') : démarrage avec les valeurs par défaut.');
  state = normalize({});
}
state.rev = Date.now(); // numéro de version (croissant même après redémarrage) : empêche deux admins de s'écraser
const clients = new Set();
let updater = null; // { status(), check(manual), install() } quand le serveur tourne dans l'application de bureau
const twitch = require('./twitch')({ dataDir: DATA_DIR, broadcast: (e, d) => broadcast(e, d), getConfig: () => state.settings.twitch });

const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.webm': 'video/webm', '.mp4': 'video/mp4',
  '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.woff2': 'font/woff2', '.ico': 'image/x-icon'
};

// Pages "propres" -> fichiers
const ROUTES = [
  [/^\/admin\/?$/, 'admin/index.html'],
  [/^\/p\/[^/]+\/?$/, 'overlays/player.html'],
  [/^\/scene\/[a-z]+\/?$/, 'overlays/scene.html'],
  [/^\/lowerthird\/?$/, 'overlays/lowerthird.html'],
  [/^\/ticker\/?$/, 'overlays/ticker.html'],
  [/^\/scoreboard\/?$/, 'overlays/scoreboard.html'],
  [/^\/alerts\/?$/, 'overlays/alerts.html'],
  [/^\/stinger\/?$/, 'overlays/stinger.html'],
  [/^\/roster\/?$/, 'overlays/roster.html'],
  [/^\/cam\/?$/, 'overlays/cam.html'],
  [/^\/pov\/?$/, 'overlays/pov.html'],
  [/^\/caster(\/pip)?\/?$/, 'overlays/caster.html'],
  [/^\/chat\/?$/, 'overlays/chat.html'],
  [/^\/twitch-auth\/?$/, 'twitch-auth.html']
];

function send(res, code, body, type = 'application/json; charset=utf-8') {
  res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}

function broadcast(event, data) {
  const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const c of clients) { try { c.write(msg); } catch { clients.delete(c); } }
}

let saveTimer;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const { rev, ...data } = state;
    const json = JSON.stringify(data, null, 2);
    fs.writeFile(DATA + '.tmp', json, err => {
      if (err) return console.error('  Sauvegarde impossible :', err.message);
      // Sous Windows, le renommage échoue si state.json est ouvert ailleurs (antivirus, OneDrive…) : écriture directe
      fs.rename(DATA + '.tmp', DATA, e => {
        if (e) fs.writeFile(DATA, json, e2 => { if (e2) console.error('  Sauvegarde impossible :', e2.message); });
      });
    });
  }, 300);
}

function readBody(req) {
  return new Promise((ok, ko) => {
    let b = '';
    req.on('data', d => { b += d; if (b.length > 5e6) { ko(new Error('trop gros')); req.destroy(); } });
    req.on('end', () => { try { ok(JSON.parse(b || '{}')); } catch (e) { ko(e); } });
    req.on('error', ko);
  });
}

function listPhotos() {
  const dirs = [path.join(ROOT, 'photos')];
  if (USER_DIR) dirs.unshift(path.join(USER_DIR, 'photos'));
  const out = new Set();
  for (const dir of dirs) {
    try { for (const f of fs.readdirSync(dir)) if (/\.(png|jpe?g|webp|gif)$/i.test(f)) out.add('/photos/' + f); } catch {}
  }
  return [...out];
}

// /photos/... et /sounds/... : d'abord le dossier perso, puis les fichiers fournis avec le pack
function userFile(p) {
  if (!USER_DIR || !/^\/(photos|sounds)\//.test(p)) return null;
  const base = path.join(USER_DIR, p.split('/')[1]);
  const file = path.normalize(path.join(USER_DIR, p));
  if (!file.startsWith(base + path.sep)) return null;
  try { return fs.statSync(file).isFile() ? file : null; } catch { return null; }
}

// Une requête qui plante ne doit jamais arrêter le serveur pendant le stream
const server = http.createServer((req, res) => {
  handle(req, res).catch(err => {
    console.error('  Erreur sur ' + req.url + ' :', err.message);
    try { if (!res.headersSent) send(res, 500, { error: 'erreur serveur' }); else res.end(); } catch {}
  });
});

async function handle(req, res) {
  let url, p;
  try { url = new URL(req.url, 'http://localhost'); p = decodeURIComponent(url.pathname); } catch { return send(res, 400, { error: 'bad url' }); }
  if (p.includes('\0')) return send(res, 400, { error: 'bad url' });

  // Anti « DNS rebinding » : un site web ne peut pas se faire passer pour localhost afin de lire ou piloter le pack
  if (HOST === '127.0.0.1' || HOST === 'localhost') {
    const h = String(req.headers.host || '').replace(/:\d+$/, '').toLowerCase();
    if (h !== 'localhost' && h !== '127.0.0.1' && h !== '[::1]') return send(res, 403, 'Interdit', 'text/plain');
  }

  // Flux temps réel (Server-Sent Events)
  if (p === '/events') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    res.write(`retry: 1000\nevent: state\ndata: ${JSON.stringify(state)}\n\n`);
    clients.add(res);
    const ka = setInterval(() => { try { res.write(': ping\n\n'); } catch {} }, 15000);
    const bye = () => { clearInterval(ka); clients.delete(res); };
    req.on('close', bye); res.on('error', bye);
    return;
  }

  // Retour de l'autorisation Twitch : protégé par le code à usage unique créé depuis l'admin (pas par le mot de passe)
  if (p === '/api/twitch/token' && req.method === 'POST') {
    try { const b = await readBody(req); const ok = await twitch.setToken(b.token, b.state); return send(res, ok ? 200 : 403, ok ? twitch.status() : { error: 'lien expiré, relance la connexion depuis l’admin' }); }
    catch { return send(res, 400, { error: 'json invalide' }); }
  }

  // --- Connexion à l'admin ---
  if (p === '/api/auth' && req.method === 'GET') return send(res, 200, { ok: loggedIn(req) });
  if (p === '/api/login' && req.method === 'POST') {
    const ip = req.socket.remoteAddress || '?';
    const left = blockedFor(ip);
    if (left) return send(res, 429, { error: `Trop d'essais. Réessaie dans ${left} s.`, wait: left });
    let b; try { b = await readBody(req); } catch { return send(res, 400, { error: 'json invalide' }); }
    const pass = typeof b.password === 'string' ? b.password.trim() : '';
    if (pass && pass.length <= 200 && await checkPassword(pass)) { fails.delete(ip); return send(res, 200, { token: newSession() }); }
    failed(ip); await wait(600); // ralentit les essais en rafale
    const w = blockedFor(ip);
    return send(res, w ? 429 : 401, { error: w ? `Trop d'essais. Réessaie dans ${w} s.` : 'Mot de passe incorrect.', wait: w });
  }

  // Tout le reste qui modifie quelque chose exige une session ouverte (les overlays, eux, ne font que lire)
  if (req.method !== 'GET' && req.method !== 'HEAD' && !loggedIn(req))
    return send(res, 401, { error: 'connexion requise' });

  if (p === '/api/logout' && req.method === 'POST') {
    delete auth.sessions[sha(req.headers['x-kx-token'])]; saveAuth();
    return send(res, 200, { ok: true });
  }
  if (p === '/api/password' && req.method === 'POST') {
    let b; try { b = await readBody(req); } catch { return send(res, 400, { error: 'json invalide' }); }
    const cur = typeof b.current === 'string' ? b.current.trim() : '';
    const next = typeof b.next === 'string' ? b.next.trim() : '';
    if (!(await checkPassword(cur))) { await wait(600); return send(res, 403, { error: 'Mot de passe actuel incorrect.' }); }
    if (next.length < 10 || next.length > 200) return send(res, 400, { error: 'Le nouveau mot de passe doit faire au moins 10 caractères.' });
    auth.hash = await hashPassword(next);
    auth.sessions = {}; // déconnecte tous les autres appareils
    return send(res, 200, { token: newSession() });
  }

  if (p === '/api/state') {
    if (req.method === 'GET') return send(res, 200, state);
    if (req.method === 'POST') {
      try {
        const next = await readBody(req);
        if (!isObj(next) || !Array.isArray(next.players)) return send(res, 400, { error: 'state invalide' });
        // Envoyé depuis une version plus ancienne : un autre admin a modifié entre-temps
        if (next.rev !== undefined && next.rev !== state.rev) return send(res, 409, state);
        const rev = state.rev + 1;
        state = normalize(next); state.rev = rev;
        save(); broadcast('state', state); twitch.configure();
        return send(res, 200, { ok: true, rev, state });
      } catch { return send(res, 400, { error: 'json invalide' }); }
    }
  }

  if (p === '/api/trigger' && req.method === 'POST') {
    try { const t = await readBody(req); broadcast('trigger', { ...t, at: Date.now() }); return send(res, 200, { ok: true }); }
    catch { return send(res, 400, { error: 'json invalide' }); }
  }

  // Mises à jour de l'application de bureau (fournies par electron/main.js ; absentes avec « node server.js »)
  if (p === '/api/update' && req.method === 'GET') return send(res, 200, updater ? updater.status() : { supported: false });
  if (p === '/api/update/check' && req.method === 'POST') { if (updater) updater.check(true); return send(res, 200, updater ? updater.status() : { supported: false }); }
  if (p === '/api/update/install' && req.method === 'POST') {
    if (!updater || updater.status().state !== 'ready') return send(res, 409, { error: 'aucune mise à jour prête' });
    send(res, 200, { ok: true }); return updater.install();
  }

  if (p === '/api/photos') return send(res, 200, listPhotos());
  if (p === '/api/twitch' && req.method === 'GET') return send(res, 200, { status: twitch.status(), recent: twitch.recent() });
  if (p === '/api/twitch/state' && req.method === 'POST') return send(res, 200, { state: twitch.newState() });
  if (p === '/api/twitch/logout' && req.method === 'POST') { await twitch.logout(); return send(res, 200, twitch.status()); }

  // Fichiers statiques
  let rel = null;
  for (const [re, file] of ROUTES) if (re.test(p)) { rel = file; break; }
  if (!rel) rel = p === '/' ? 'index.html' : p.replace(/^\/+/, '');
  const own = userFile(p);
  let file = own || path.normalize(path.join(ROOT, rel));
  if (!own && file !== ROOT && !file.startsWith(ROOT + path.sep)) return send(res, 403, 'Interdit', 'text/plain');
  fs.stat(file, (err, st) => {
    if (!err && st.isDirectory()) file = path.join(file, 'index.html');
    fs.readFile(file, (e, buf) => {
      if (e) return send(res, 404, 'Introuvable', 'text/plain; charset=utf-8');
      send(res, 200, buf, MIME[path.extname(file).toLowerCase()] || 'application/octet-stream');
    });
  });
}

server.on('error', err => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n  Le streampack tourne déjà (port ${PORT} occupé).`);
    console.error(`  Utilise la fenêtre déjà ouverte, ou ferme-la avant de relancer.`);
    console.error(`  Admin : http://localhost:${PORT}/admin\n`);
  } else console.error('\n  Démarrage impossible :', err.message, '\n');
  // Lancé par l'application de bureau : c'est elle qui prévient l'utilisateur
  if (require.main === module) process.exit(1);
  else module.exports.emit('error', err);
});
// Filet de sécurité : une erreur imprévue (Twitch, réseau…) est affichée, mais le serveur continue
process.on('uncaughtException', err => console.error('  Erreur inattendue :', err && err.stack || err));
process.on('unhandledRejection', err => console.error('  Erreur inattendue :', err && err.stack || err));

// Utilisé par l'application de bureau (electron/main.js) : événements 'ready' et 'error', close() avant de quitter
module.exports = new (require('events'))();
module.exports.port = PORT;
module.exports.broadcast = broadcast;
module.exports.setUpdater = u => { updater = u; };
module.exports.close = () => {
  clearTimeout(saveTimer);
  const { rev, ...data } = state;
  try { fs.writeFileSync(DATA, JSON.stringify(data, null, 2)); } catch {}
  for (const c of clients) try { c.end(); } catch {}
  server.close();
};

server.listen(PORT, HOST, () => {
  console.log('\n  KAELYX STREAMPACK');
  const q = '';
  console.log(`  Admin   : http://localhost:${PORT}/admin${q}`);
  console.log(`  Accueil : http://localhost:${PORT}/`);
  if (HOST === '0.0.0.0') {
    for (const ifs of Object.values(os.networkInterfaces())) for (const i of ifs || [])
      if (i.family === 'IPv4' && !i.internal) console.log(`  Réseau  : http://${i.address}:${PORT}/admin${q}`);
  }
  console.log('\n  Laisse cette fenêtre ouverte pendant le stream.\n');
  twitch.configure();
  module.exports.emit('ready', PORT);
});
