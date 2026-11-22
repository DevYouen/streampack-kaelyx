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
// Mot de passe facultatif pour l'admin (conseillé avec HOST=0.0.0.0) : ADMIN_TOKEN=monmotdepasse node server.js
const TOKEN = process.env.ADMIN_TOKEN || '';

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
  camframe: { w: 640, h: 360, name: '', sub: '' }
};
const PLAYER = { id: '', pseudo: '', role: 'Joueur', game: '', photo: '', twitch: '', x: '',
  camVisible: true, camPos: 'bl', camSize: 'm', showTag: true, showTicker: false, showSocial: true };
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
  return out;
}

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

  if (req.method === 'POST' && TOKEN && req.headers['x-kx-token'] !== TOKEN)
    return send(res, 401, { error: 'mot de passe admin manquant ou incorrect' });

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
module.exports.close = () => {
  clearTimeout(saveTimer);
  const { rev, ...data } = state;
  try { fs.writeFileSync(DATA, JSON.stringify(data, null, 2)); } catch {}
  for (const c of clients) try { c.end(); } catch {}
  server.close();
};

server.listen(PORT, HOST, () => {
  console.log('\n  KAELYX STREAMPACK');
  const q = TOKEN ? '?token=' + encodeURIComponent(TOKEN) : '';
  console.log(`  Admin   : http://localhost:${PORT}/admin${q}`);
  console.log(`  Accueil : http://localhost:${PORT}/`);
  if (HOST === '0.0.0.0') {
    for (const ifs of Object.values(os.networkInterfaces())) for (const i of ifs || [])
      if (i.family === 'IPv4' && !i.internal) console.log(`  Réseau  : http://${i.address}:${PORT}/admin${q}`);
    if (!TOKEN) console.log('  Attention : admin sans mot de passe. Lance avec ADMIN_TOKEN=... pour le protéger.');
  }
  console.log('\n  Laisse cette fenêtre ouverte pendant le stream.\n');
  twitch.configure();
  module.exports.emit('ready', PORT);
});
