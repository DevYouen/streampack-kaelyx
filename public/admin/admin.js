/* Admin Kaelyx — chaque modification est envoyée au serveur, qui la pousse en direct aux overlays */
let S = null;      // état local (ce que l'admin affiche et modifie)
let base = null;   // dernier état confirmé par le serveur (sert à fusionner avec un autre admin)
let tab = (() => { try { return localStorage.getItem('kx-tab'); } catch { return null; } })() || 'regie';
let pvPath = '';
let photos = [];
let tickTimer;
let tw = { chat: 'off', follows: 'off' }; // état de la connexion Twitch (envoyé par le serveur)

const $ = s => document.querySelector(s);
const { esc, slug, initials } = KX; // fonctions partagées avec les overlays (public/js/kx.js)
const origin = location.origin;
const clone = o => o === undefined ? o : JSON.parse(JSON.stringify(o));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
// Même contenu à l'écran : « rev » (numéro de version) change à chaque envoi sans rien changer à afficher
const sameView = (a, b) => same({ ...a, rev: 0 }, { ...b, rev: 0 });

/* ---------- Connexion à l'admin (mot de passe) ----------
   Le serveur renvoie un jeton de session gardé seulement dans la page ouverte : le mot de passe est redemandé à chaque
   ouverture de l'admin (rechargement, nouvelle fenêtre, dock OBS relancé). Les overlays n'en ont pas besoin. */
const store = {
  get: k => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch {} },
  del: k => { try { localStorage.removeItem(k); } catch {} }
};
let kxToken = '';
store.del('kx-token'); // anciennes versions : le jeton était retenu 30 jours, on l'efface
const headers = () => ({ 'Content-Type': 'application/json', 'X-Kx-Token': kxToken });
let loginWait = null;
// Affiche l'écran de connexion ; se résout une fois connecté (un seul écran même si plusieurs envois échouent)
function needLogin() {
  if (loginWait) return loginWait;
  kxToken = '';
  loginWait = new Promise(done => {
    const box = document.createElement('div');
    box.className = 'login'; box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true'); box.setAttribute('aria-labelledby', 'loginTitle');
    box.innerHTML = `<form class="login-card" novalidate>
      <div class="login-logo" aria-hidden="true"><i class="ring"></i><img src="/logo/logo.svg" alt=""></div>
      <p class="login-kicker">Streampack</p>
      <h1 id="loginTitle">Admin Kaelyx</h1>
      <p>Entre le mot de passe du streampack. Il est demandé à chaque connexion.</p>
      <label class="field"><span>Mot de passe</span><input type="password" name="password" autocomplete="current-password" required></label>
      <p class="login-err" role="alert"></p>
      <button type="submit" class="btn">Se connecter</button>
    </form>`;
    document.body.appendChild(box);
    const form = box.querySelector('form'), input = form.password, err = box.querySelector('.login-err'), btn = form.querySelector('button');
    setTimeout(() => input.focus(), 0);
    let timer;
    const lock = s => {
      clearInterval(timer); btn.disabled = true;
      const tick = () => { if (s <= 0) { clearInterval(timer); btn.disabled = false; btn.textContent = 'Se connecter'; return; } btn.textContent = `Patiente ${s--} s`; };
      tick(); timer = setInterval(tick, 1000);
    };
    form.addEventListener('submit', async e => {
      e.preventDefault();
      if (!input.value.trim() || btn.disabled) return;
      btn.disabled = true; err.textContent = '';
      try {
        const r = await fetch('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: input.value }) });
        const d = await r.json().catch(() => ({}));
        if (r.ok && d.token) { kxToken = d.token; box.remove(); loginWait = null; return done(true); }
        err.textContent = d.error || 'Connexion impossible.';
        input.select();
        if (d.wait) return lock(d.wait);
      } catch { err.textContent = 'Serveur injoignable.'; }
      btn.disabled = false;
    });
  });
  return loginWait;
}

/* Fusion à trois : garde les changements faits ici ET ceux faits sur un autre admin depuis "b" */
function merge3(b, local, remote) {
  if (same(local, b)) return clone(remote);
  if (same(remote, b) || same(local, remote)) return local;
  const objs = [b, local, remote].every(v => v && typeof v === 'object');
  if (objs && Array.isArray(local) === Array.isArray(remote)) {
    if (Array.isArray(local)) {
      // Listes de même longueur (ex. scores modifiés des deux côtés) : fusion élément par élément
      if (Array.isArray(b) && b.length === local.length && b.length === remote.length) return local.map((v, i) => merge3(b[i], v, remote[i]));
      return local; // ajout / suppression ici : notre version l'emporte
    }
    const out = {};
    for (const k of new Set([...Object.keys(remote), ...Object.keys(local)])) {
      const v = merge3(b?.[k], local[k], remote[k]);
      if (v !== undefined) out[k] = v;
    }
    return out;
  }
  return local; // même valeur modifiée des deux côtés : la dernière action ici gagne
}

/* ---------- Données ---------- */
function getP(path) { return path.split('.').reduce((o, k) => o?.[k], S); }
function setP(path, v) {
  const ks = path.split('.'); let o = S;
  for (let i = 0; i < ks.length - 1; i++) o = o[ks[i]] ??= {};
  o[ks.at(-1)] = v;
}
let saveT, inflight = false, again = false;
// save(true) = tout de suite ; délai plus long pour une saisie qui relancerait une animation à chaque touche
function save(delay = 180) { clearTimeout(saveT); status('saving'); saveT = setTimeout(push, delay === true ? 0 : delay); }
async function push() {
  clearTimeout(saveT);
  if (inflight) { again = true; return; } // un envoi à la fois, dans l'ordre
  inflight = true; again = false;
  const sent = clone(S);
  try {
    const r = await fetch('/api/state', { method: 'POST', headers: headers(), body: JSON.stringify({ ...sent, rev: base.rev }) });
    if (r.status === 409) {
      // Un autre admin a modifié entre-temps : on fusionne puis on renvoie
      adopt(await r.json()); again = true;
    } else if (r.status === 401) {
      status('auth');
      inflight = false; await needLogin(); return push(); // les modifications faites entre-temps sont gardées
    } else if (r.ok) {
      const { rev, state } = await r.json();
      if (rev >= base.rev) {
        const before = clone(S);
        S = merge3(sent, S, state); base = state;
        if (!sameView(before, S)) renderSoon(); // le serveur a complété l'état (ex. import incomplet)
      }
      status('ok');
    } else status('err');
  } catch { status('err'); }
  inflight = false;
  if (again) push();
}
// Nouvel état venu du serveur (autre admin, ou réponse 409)
function adopt(remote) {
  if (!base || remote.rev <= base.rev) return; // écho de notre propre envoi, ou plus ancien
  const before = clone(S);
  S = merge3(base, S, remote); base = remote;
  // Sans ça, l'écho de notre propre envoi (seul « rev » diffère) redessinait tout l'onglet après chaque clic
  if (!sameView(before, S)) renderSoon();
}
// Re-rendre sans casser une saisie en cours : on attend que le champ perde le focus
let renderPending = false;
const editing = () => { if (typeof povDrag !== 'undefined' && povDrag) return true; const a = document.activeElement; return !!(a && a.closest('#main') && a.matches('input, textarea, select')); };
function renderSoon() { if (editing()) renderPending = true; else renderTab(); }
document.addEventListener('focusout', () => setTimeout(() => { if (renderPending && !editing()) { renderPending = false; renderTab(); } }, 0));

async function trigger(payload) {
  try {
    const r = await fetch('/api/trigger', { method: 'POST', headers: headers(), body: JSON.stringify(payload) });
    if (r.status === 401) { status('auth'); await needLogin(); status('ok'); return trigger(payload); }
  } catch { toast('Serveur injoignable'); }
}
let lastStatus = '';
function status(kind) {
  const el = $('#status'); el.className = 'status ' + (kind === 'auth' ? 'err' : kind);
  // Petit « ✓ Enregistré » en bas à droite après chaque envoi réussi
  const sv = $('#saved');
  if (sv && kind === 'ok' && lastStatus === 'saving') { sv.classList.remove('on'); void sv.offsetWidth; sv.classList.add('on'); clearTimeout(sv._t); sv._t = setTimeout(() => sv.classList.remove('on'), 1400); }
  lastStatus = kind;
  el.querySelector('span').textContent = { ok: 'En direct · enregistré', saving: 'Envoi…', err: 'Serveur injoignable', auth: 'Mot de passe requis' }[kind] || kind;
}
// undo : si fourni, le toast propose « Annuler » pendant 10 secondes
function toast(msg, undo) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.toggle('has-btn', !!undo);
  if (undo) {
    const b = document.createElement('button'); b.type = 'button'; b.textContent = 'Annuler';
    b.onclick = () => { undo(); t.classList.remove('on', 'has-btn'); renderTab(); save(true); };
    t.append(b);
  }
  t.classList.add('on'); clearTimeout(t._t);
  t._t = setTimeout(() => t.classList.remove('on', 'has-btn'), undo ? 10000 : 1800);
}

/* ---------- Petits composants ---------- */
const field = (label, path, opts = {}) => {
  const v = getP(path);
  const attrs = `data-b="${path}" ${opts.num ? 'data-num' : ''} ${opts.rerender ? 'data-rerender' : ''} ${opts.list ? `list="${opts.list}"` : ''}`;
  let input;
  if (opts.options) input = `<select ${attrs}>${opts.options.map(o => { const [val, lab] = Array.isArray(o) ? o : [o, o]; return `<option value="${esc(val)}" ${String(v) === String(val) ? 'selected' : ''}>${esc(lab)}</option>`; }).join('')}</select>`;
  else if (opts.lines) input = `<textarea data-b="${path}" data-lines placeholder="${esc(opts.ph || '')}">${esc((v || []).join('\n'))}</textarea>`;
  else input = `<input type="${opts.num ? 'number' : 'text'}" ${attrs} value="${esc(v ?? '')}" placeholder="${esc(opts.ph || '')}" ${opts.min !== undefined ? `min="${opts.min}"` : ''}>`;
  return `<label class="field ${opts.wide ? 'wide' : ''}"><span>${esc(label)}</span>${input}</label>`;
};
const toggle = (label, path, rerender) => `<label class="switch"><input type="checkbox" data-b="${path}" ${rerender ? 'data-rerender' : ''} ${getP(path) ? 'checked' : ''}><span class="tr"></span><span>${esc(label)}</span></label>`;
// Score VS avec boutons −/+ (utilisé dans Scoreboard et Cam & casters)
const vsStep = (k, label) => `<label class="field"><span>${label}</span><span class="stepper row" style="gap:4px">
  <button type="button" class="btn ghost sq" data-act="step" data-path="scoreboard.vs.${k}" data-d="-1" aria-label="Moins">−</button>
  <input type="number" data-b="scoreboard.vs.${k}" data-num min="0" value="${Number(S.scoreboard.vs[k]) || 0}" style="width:80px;text-align:center">
  <button type="button" class="btn sq" data-act="step" data-path="scoreboard.vs.${k}" data-d="1" aria-label="Plus">+</button></span></label>`;
const head = (kicker, title, text, right = '') => `<div class="sec-head"><div><div class="kicker"><span class="claws"><i></i><i></i><i></i></span>${esc(kicker)}</div><h1>${esc(title)}</h1>${text ? `<p>${text}</p>` : ''}</div>${right}</div>`;
const thumb = p => `<div class="thumb">${esc(initials(p.pseudo))}${p.photo ? `<img src="${esc(p.photo)}" alt="" onerror="this.remove()">` : ''}</div>`;
const pvBtn = path => `<button type="button" class="btn ghost" data-act="preview" data-path="${esc(path)}">Aperçu</button>`;
const copyBtn = path => `<button type="button" class="btn ghost" data-act="copy" data-path="${esc(path)}">Copier l'URL</button>`;

// Le lower third se masque tout seul après « Cacher après » : l'admin l'affiche comme masqué une fois ce délai passé
function ltShown() {
  const l = S.lowerthird, auto = Number(l.autoHide) || 0;
  return !!l.visible && (!auto || Date.now() - (Number(l.showAt) || 0) < auto * 1000);
}

/* ---------- Onglets ---------- */
const TABS = {
  players() {
    return head('Overlays joueurs', 'Joueurs', 'Un overlay par joueur : pseudo, photo, cam et réseaux.') + `
    <div class="card">
      <form class="add" data-form="add-player">
        <label class="field"><span>Pseudo</span><input type="text" name="pseudo" placeholder="Pseudo du joueur" required autocomplete="off"></label>
        <label class="field" style="flex:0 1 180px"><span>Jeu</span><select name="game"><option>Fortnite</option><option>League of Legends</option><option value="">Autre</option></select></label>
        <button class="btn big" type="submit">Créer l’overlay</button>
      </form>
    </div>
    ${S.players.length ? '' : empty('players', 'Aucun joueur pour l’instant', 'Écris un pseudo ci-dessus puis clique sur « Créer l’overlay ». Il apparaîtra aussi dans les POV, le lower third et le roster.')}
    ${S.players.map((p, i) => `
      <div class="card ${pvPath === '/p/' + p.id ? 'is-active' : ''}" data-drop-photo="${i}" data-reset="player:${i}">
        <div class="card-head">
          ${thumb(p)}
          <div class="grow"><h3>${esc(p.pseudo)}</h3><code>${esc(origin)}/p/${esc(p.id)}</code></div>
          <div class="row"><button type="button" class="btn" data-act="photo-up" data-i="${i}" title="Ou glisse une image sur la carte">Photo…</button>${pvBtn('/p/' + p.id)}${copyBtn('/p/' + p.id)}
            <button type="button" class="btn ghost sq danger" data-act="del-player" data-i="${i}" aria-label="Supprimer ${esc(p.pseudo)}">×</button></div>
        </div>
        <div class="grid">
          ${field('Pseudo affiché', `players.${i}.pseudo`)}
          ${field('Rôle', `players.${i}.role`, { ph: 'Joueur, Coach, Caster…' })}
          ${field('Jeu', `players.${i}.game`, { options: [['Fortnite', 'Fortnite'], ['League of Legends', 'League of Legends'], ['', 'Autre / aucun']] })}
          ${field('Photo', `players.${i}.photo`, { list: 'photoList', ph: '/photos/' + p.id + '.png' })}
          ${field('Twitch', `players.${i}.twitch`, { ph: 'pseudo_twitch' })}
          ${field('X', `players.${i}.x`, { ph: '@compte' })}
          ${field('Position cam', `players.${i}.camPos`, { options: [['bl', 'Bas gauche'], ['br', 'Bas droite'], ['tl', 'Haut gauche'], ['tr', 'Haut droite']] })}
          ${field('Taille cam', `players.${i}.camSize`, { options: [['s', 'Petite'], ['m', 'Moyenne'], ['l', 'Grande'], ['xl', 'Très grande']] })}
        </div>
        <div class="row" style="margin-top:14px;gap:22px" data-reset-slot>
          ${toggle('Cadre webcam', `players.${i}.camVisible`)}
          ${toggle('Tag équipe', `players.${i}.showTag`)}
          ${toggle('Réseau du joueur', `players.${i}.showSocial`)}
          ${toggle('Ticker en bas', `players.${i}.showTicker`, true)}
        </div>
        ${p.showTicker && !S.ticker.visible ? '<p class="note" style="margin-top:8px">Le ticker est éteint : active « Ticker visible » dans l’onglet Ticker pour qu’il apparaisse.</p>' : ''}
      </div>`).join('')}`;
  },

  scenes() {
    const NAMES = { starting: 'Starting soon', brb: 'BRB / pause', ending: 'Fin de stream', tech: 'Difficultés techniques', chatting: 'Just chatting' };
    return head('Écrans plein format', 'Scènes', '') +
      Object.keys(NAMES).map(k => `
      <div class="card ${pvPath === '/scene/' + k ? 'is-active' : ''}" data-reset="scene:${k}">
        <div class="card-head"><div class="grow"><h3>${NAMES[k]}</h3><code>${esc(origin)}/scene/${k}</code></div>
          <div class="row">${pvBtn('/scene/' + k)}${copyBtn('/scene/' + k)}</div></div>
        <div class="grid">
          ${field('Petit titre', `scenes.${k}.kicker`)}
          ${field('Titre', `scenes.${k}.title`)}
          ${k !== 'chatting' ? field('Sous-titre', `scenes.${k}.subtitle`, { ph: 'Optionnel' }) : ''}
          ${k !== 'chatting' ? field('À suivre', `scenes.${k}.next`, { ph: 'ex. Scrim FNCS · 21h' }) : ''}
        </div>
        ${k !== 'chatting' ? `<div class="row" style="margin-top:16px">
          <span class="field" style="flex:none"><span>Compte à rebours</span></span>
          <span class="count-live" data-count="${k}">--:--</span>
          ${[2, 5, 10, 15].map(m => `<button type="button" class="btn deep" data-act="count" data-k="${k}" data-m="${m}">${m} min</button>`).join('')}
          <button type="button" class="btn ghost" data-act="count" data-k="${k}" data-m="1" data-add>+1 min</button>
          <button type="button" class="btn ghost" data-act="count" data-k="${k}" data-m="0">Stop</button>
        </div>` : `<div class="row" style="margin-top:16px">${toggle('Chat Twitch intégré', 'scenes.chatting.chat', true)}</div>
        ${S.scenes.chatting.chat !== false && !S.settings.twitch?.channel ? '<p class="note" style="margin-top:8px">Aucune chaîne Twitch réglée : le cadre du chat restera vide. Renseigne-la dans l’onglet Twitch.</p>' : ''}`}
      </div>`).join('');
  },

  casters() {
    const C = S.casters;
    const camUrl = '/cam';
    return head('Webcams', 'Cam & casters', '',
      `<div class="row"><button type="button" class="btn ghost" data-act="preview" data-path="/caster">Aperçu desk</button><button type="button" class="btn ghost" data-act="preview" data-path="/caster/pip">Aperçu petites cams</button></div>`) + `
    <div class="card ${pvPath === '/caster' || pvPath === '/caster/pip' ? 'is-active' : ''}" data-reset="casters">
      <div class="card-head"><div class="grow"><h3>Casters</h3><code>${esc(origin)}/caster</code> · <code>/caster/pip</code></div>
        <div class="row"><button type="button" class="btn ghost" data-act="copy" data-path="/caster">URL desk</button><button type="button" class="btn ghost" data-act="copy" data-path="/caster/pip">URL petites cams</button></div></div>
      <div class="grid">
        ${field('Petit titre', 'casters.kicker')}
        ${field('Titre', 'casters.title')}
        ${field('Petites cams : position', 'casters.pipPos', { options: [['tr', 'Haut droite'], ['tl', 'Haut gauche'], ['br', 'Bas droite'], ['bl', 'Bas gauche']] })}
        ${field('Petites cams : taille', 'casters.pipSize', { options: [['s', 'Petite'], ['m', 'Moyenne'], ['l', 'Grande']] })}
      </div>
      <div class="row" style="margin-top:14px">${toggle('Score du VS sur le desk', 'casters.showScore', true)}</div>
      ${C.showScore ? `<div class="grid" style="margin-top:14px">
        ${field('Équipe A', 'scoreboard.vs.a')}${vsStep('scoreA', 'Score A')}${field('Équipe B', 'scoreboard.vs.b')}${vsStep('scoreB', 'Score B')}${field('Format', 'scoreboard.vs.label', { ph: 'BO3' })}
      </div>
      <p class="note" style="margin-top:8px">Même score que le Scoreboard en mode VS. Les deux noms d’équipe doivent être remplis pour qu’il s’affiche.</p>` : ''}
      ${C.list.map((c, i) => `<div class="grid" style="margin-top:14px;align-items:end;grid-template-columns:1fr 1fr 1fr auto">
        ${field('Caster ' + (i + 1), `casters.list.${i}.name`, { ph: 'Pseudo' })}
        ${field('Twitch', `casters.list.${i}.handle`, { ph: 'pseudo_twitch' })}
        ${field('Rôle', `casters.list.${i}.role`, { ph: 'Caster, Analyste…' })}
        <button type="button" class="btn ghost sq danger" data-act="del-caster" data-i="${i}" aria-label="Retirer ${esc(c.name || 'ce caster')}">×</button>
      </div>`).join('')}
      ${C.list.length < 3 ? '<div class="row" style="margin-top:14px"><button type="button" class="btn deep" data-act="add-caster">Ajouter un caster</button></div>' : ''}
    </div>
    <div class="card ${pvPath === camUrl ? 'is-active' : ''}" data-reset="camframe">
      <div class="card-head"><div class="grow"><h3>Cadre webcam</h3><code>${esc(origin)}${camUrl}</code></div>
        <div class="row">${pvBtn(camUrl)}${copyBtn(camUrl)}</div></div>
      <div class="grid">
        ${field('Largeur', 'camframe.w', { num: true, min: 80 })}
        ${field('Hauteur', 'camframe.h', { num: true, min: 80 })}
        ${field('Nom', 'camframe.name', { ph: 'Optionnel' })}
        ${field('Sous-titre', 'camframe.sub', { ph: 'Optionnel' })}
      </div>
      <p class="note" style="margin-top:12px">Source navigateur OBS de la même largeur et hauteur, posée sur la webcam. Un joueur : <code>/cam?player=id</code></p>
    </div>`;
  },

  lowerthird() {
    const l = S.lowerthird;
    return head('Bandeau nom', 'Lower third', '',
      `<div class="row">${pvBtn('/lowerthird')}${copyBtn('/lowerthird')}</div>`) + `
    <div class="card" data-reset="lowerthird">
      <div class="row" style="margin-bottom:18px">
        <button type="button" class="btn big" data-act="lt-show">Afficher</button>
        <button type="button" class="btn big ghost" data-act="lt-hide">Masquer</button>
        <button type="button" class="btn big deep" data-act="private-lt" title="Le lower third s'affiche seulement dans l'aperçu, pas à l'antenne">Tester en privé</button>
        <span class="note" data-lt-note>${ltShown() ? 'Affiché à l’écran' : 'Masqué'}</span>
      </div>
      <div class="grid">
        ${field('Nom', 'lowerthird.name')}
        ${field('Titre', 'lowerthird.title')}
        ${field('Cacher après (secondes)', 'lowerthird.autoHide', { num: true, min: 0 })}
      </div>
    </div>
    <div class="card"><div class="card-head"><h3>Remplir depuis un joueur</h3></div>
      ${S.players.length ? `<div class="chips">${S.players.map((p, i) => `<button type="button" class="chip" data-act="lt-fill" data-i="${i}">${esc(p.pseudo)}</button>`).join('')}</div>` : empty('players', 'Pas encore de joueur', 'Crée un joueur pour remplir le bandeau en un clic.', '<button type="button" class="btn" data-act="go" data-tab="players">Ajouter un joueur</button>')}</div>`;
  },

  ticker() {
    return head('Bandeau défilant', 'Ticker', '',
      `<div class="row">${pvBtn('/ticker')}${copyBtn('/ticker')}</div>`) + `
    <div class="card" data-reset="ticker">
      <div class="row" style="margin-bottom:16px">${toggle('Ticker visible', 'ticker.visible')}</div>
      <div class="grid">
        ${field('Messages', 'ticker.items', { lines: true, wide: true, ph: 'Code créateur…\nProchain match…' })}
        ${field('Vitesse (px / seconde)', 'ticker.speed', { num: true, min: 20 })}
      </div>
    </div>`;
  },

  scoreboard() {
    const s = S.scoreboard;
    return head('Compétition', 'Scoreboard', '',
      `<div class="row">${pvBtn('/scoreboard')}${copyBtn('/scoreboard')}</div>`) + `
    <div class="card" data-reset="scoreboard">
      <div class="row" style="margin-bottom:16px">${toggle('Scoreboard visible', 'scoreboard.visible')}</div>
      <div class="grid">
        ${field('Mode', 'scoreboard.mode', { options: [['classement', 'Classement (Fortnite)'], ['vs', 'VS (LoL)']], rerender: true })}
        ${s.mode !== 'vs' ? field('Événement', 'scoreboard.event') + field('Game en cours', 'scoreboard.game', { num: true, min: 0 }) + field('Nombre de games', 'scoreboard.games', { num: true, min: 1 }) : field('Format', 'scoreboard.vs.label', { ph: 'BO3' })}
      </div>
    </div>
    ${s.mode === 'vs' ? `<div class="card"><div class="grid">
      ${field('Équipe A', 'scoreboard.vs.a')}${vsStep('scoreA', 'Score A')}${field('Équipe B', 'scoreboard.vs.b')}${vsStep('scoreB', 'Score B')}</div>
      <div class="grid" style="margin-top:14px">${logoField('Logo équipe A', 'scoreboard.vs.logoA', 'equipe-' + (s.vs.a || 'a'))}${logoField('Logo équipe B', 'scoreboard.vs.logoB', 'equipe-' + (s.vs.b || 'b'))}</div></div>` : `
    <div class="card">
      ${s.rows.length ? '' : empty('score', 'Classement vide', 'Ajoute une ligne par équipe ou par joueur, puis utilise les boutons + pour compter les élims et les points.')}
      <table class="tbl" ${s.rows.length ? '' : 'hidden'}><thead><tr><th></th><th>Équipe / joueur</th><th>Élims</th><th>Points</th><th></th></tr></thead><tbody>
      ${s.rows.map((r, i) => `<tr>
        <td class="rank">${i + 1}</td>
        <td class="n"><input type="text" data-b="scoreboard.rows.${i}.name" value="${esc(r.name)}" aria-label="Nom ligne ${i + 1}"></td>
        <td><div class="stepper"><button type="button" class="btn ghost sq" data-act="step" data-path="scoreboard.rows.${i}.elims" data-d="-1" aria-label="Moins une élim">−</button>
          <input type="number" data-b="scoreboard.rows.${i}.elims" data-num min="0" value="${Number(r.elims) || 0}" aria-label="Élims">
          <button type="button" class="btn sq" data-act="step" data-path="scoreboard.rows.${i}.elims" data-d="1" aria-label="Plus une élim">+</button></div></td>
        <td><div class="stepper"><button type="button" class="btn ghost sq" data-act="step" data-path="scoreboard.rows.${i}.points" data-d="-1" aria-label="Moins un point">−</button>
          <input type="number" data-b="scoreboard.rows.${i}.points" data-num min="0" value="${Number(r.points) || 0}" aria-label="Points">
          <button type="button" class="btn sq" data-act="step" data-path="scoreboard.rows.${i}.points" data-d="1" aria-label="Plus un point">+</button></div></td>
        <td><button type="button" class="btn ghost sq danger" data-act="del-row" data-i="${i}" aria-label="Supprimer la ligne">×</button></td></tr>`).join('')}
      </tbody></table>
      <div class="row" style="margin-top:14px">
        <button type="button" class="btn deep" data-act="add-row">Ajouter une ligne</button>
        <button type="button" class="btn ghost" data-act="sort-rows">Trier par points</button>
        <button type="button" class="btn ghost" data-act="reset-rows">Remettre à zéro</button>
      </div>
    </div>`}`;
  },

  alerts() {
    const types = [['follow', 'Follow'], ['sub', 'Sub'], ['gift', 'Gift sub'], ['bits', 'Bits'], ['raid', 'Raid'], ['don', 'Don']];
    return head('Animations', 'Alertes & stinger', '') + `
    <div class="card ${pvPath === '/alerts' ? 'is-active' : ''}" data-reset="alerts">
      <div class="card-head"><div class="grow"><h3>Alertes</h3><code>${esc(origin)}/alerts</code></div><div class="row">${pvBtn('/alerts')}${copyBtn('/alerts')}</div></div>
      <form data-form="alert">
        <div class="grid">
          <label class="field"><span>Type</span><select name="type">${types.map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select></label>
          <label class="field"><span>Pseudo</span><input type="text" name="user" value="Viewer" autocomplete="off"></label>
          <label class="field"><span>Montant</span><input type="number" name="amount" value="5" min="0"></label>
          <label class="field"><span>Message</span><input type="text" name="message" placeholder="Optionnel" autocomplete="off"></label>
        </div>
        <div class="row" style="margin-top:16px"><button class="btn big" type="submit">Envoyer l’alerte</button>
          <button type="button" class="btn big deep" data-act="private-alert" title="L'alerte s'affiche seulement dans l'aperçu, pas à l'antenne">Tester en privé</button>
          <span class="sep-v"></span>${types.map(([v, l]) => `<button type="button" class="chip" data-act="quick-alert" data-type="${v}">${l}</button>`).join('')}</div>
      </form>
      <div class="grid" style="margin-top:18px">${field('Durée d’une alerte (secondes)', 'settings.alertDuration', { num: true, min: 2 })}</div>
    </div>
    <div class="card ${pvPath === '/stinger' ? 'is-active' : ''}">
      <div class="card-head"><div class="grow"><h3>Stinger</h3><code>${esc(origin)}/stinger</code></div><div class="row">${pvBtn('/stinger')}${copyBtn('/stinger')}</div></div>
      <div class="row"><button type="button" class="btn big" data-act="stinger">Lancer le stinger</button></div>
    </div>`;
  },

  twitch() {
    const t = S.settings.twitch || {}, s = tw || {};
    const pill = (state, err, ok) => {
      const lab = { connected: ok, connecting: 'Connexion…', waiting: 'Chaîne à renseigner', expired: 'Autorisation expirée', error: err || 'Erreur', off: 'Non connecté' }[state] || 'Non connecté';
      return `<span class="pill ${state === 'connected' ? 'ok' : state === 'error' || state === 'expired' ? 'err' : ''}"><i></i>${esc(lab)}</span>`;
    };
    const redirect = `http://localhost:${location.port || 80}/twitch-auth`;
    return head('Connexion', 'Twitch', '', `<div class="row">${pvBtn('/chat')}${copyBtn('/chat')}</div>`) + `
    <div class="card"><div class="card-head"><h3>Chaîne</h3>${pill(s.chat, s.chatError, 'Chat connecté · #' + (s.channel || ''))}</div>
      <div class="grid">${field('Chaîne Twitch', 'settings.twitch.channel', { ph: 'kaelyx' })}</div></div>
    <div class="card ${pvPath === '/chat' ? 'is-active' : ''}" data-reset="chat"><div class="card-head"><div class="grow"><h3>Chat</h3><code>${esc(origin)}/chat</code></div></div>
      <div class="grid">
        ${field('Masquer après (secondes)', 'settings.twitch.chatHide', { num: true, min: 0 })}
        ${field('Comptes ignorés', 'settings.twitch.ignore', { lines: true, ph: 'nightbot' })}
      </div>
      <div class="row" style="margin-top:16px">${toggle('Masquer les commandes (!)', 'settings.twitch.hideCommands')}</div></div>
    <div class="card" data-reset="twalerts"><div class="card-head"><h3 class="grow">Alertes Twitch</h3></div>
      <div class="row">${[['follow', 'Follow'], ['sub', 'Sub'], ['gift', 'Gift sub'], ['bits', 'Bits'], ['raid', 'Raid']].map(([k, l]) => toggle(l, 'settings.twitch.alerts.' + k)).join('')}</div></div>
    <div class="card"><div class="card-head"><h3>Follows</h3>${pill(s.follows, s.followsError, 'Connecté · ' + (s.login || ''))}</div>
      <div class="grid">${field('Client ID', 'settings.twitch.clientId', { ph: 'Application dev.twitch.tv' })}</div>
      <div class="row" style="margin-top:16px">
        ${s.login || s.follows === 'connected' ? '<button type="button" class="btn ghost" data-act="tw-logout">Déconnecter</button>'
          : `<button type="button" class="btn" data-act="tw-connect" ${t.clientId ? '' : 'disabled'}>Connecter Twitch</button>`}
      </div>
      <ol class="steps" style="margin-top:16px"><li><b>dev.twitch.tv/console</b> › Register Your Application</li><li>OAuth Redirect URL : <b>${esc(redirect)}</b> · Catégorie : <b>Broadcaster Suite</b></li><li>Client ID ci-dessus, puis <b>Connecter Twitch</b> avec le compte de la chaîne ou d’un modérateur</li></ol></div>`;
  },

  links() {
    const L = [
      ...S.players.map(p => ['Joueur · ' + p.pseudo, '/p/' + p.id]),
      ['Starting soon', '/scene/starting'], ['BRB', '/scene/brb'], ['Fin de stream', '/scene/ending'], ['Difficultés techniques', '/scene/tech'], ['Just chatting', '/scene/chatting'],
      ['Lower third', '/lowerthird'], ['Ticker', '/ticker'], ['Chat', '/chat'], ['Scoreboard', '/scoreboard'], ['Alertes', '/alerts'], ['Stinger', '/stinger'],
      ['POV joueurs', '/pov'], ['Casters (desk)', '/caster'], ['Casters (petites cams)', '/caster/pip'], ['Cadre webcam', '/cam'],
      ['Programme (scène)', '/programme'], ['Programme (bandeau)', '/programme?bandeau'], ['Sponsors', '/sponsors'], ['Objectif', '/objectif'],
      ['Sondage', '/sondage'], ['Message du chat', '/message'], ['Joueur du match', '/mvp'], ['Tournoi', '/tournoi'], ['Replay (scène OBS créée par l’admin)', '/replay'],
      ['Roster', '/roster'], ['Roster Fortnite', '/roster?game=Fortnite'], ['Roster LoL', '/roster?game=League of Legends']
    ];
    return head('Pour OBS', 'Liens OBS', '') + `
    <div class="card"><div class="links">${L.map(([n, p]) => `<div class="link-row"><b>${esc(n)}</b><code>${esc(origin + p)}</code>${pvBtn(p)}${copyBtn(p)}</div>`).join('')}</div></div>
    <div class="card"><div class="card-head"><h3>Piloter depuis OBS</h3></div>
      <ol class="steps"><li>OBS › <b>Docks › Docks de navigateur personnalisés</b></li><li>Nom : <b>Kaelyx</b>, URL : <b>${esc(origin)}/admin</b></li></ol></div>`;
  },

  settings() {
    const soc = [['x', 'X'], ['twitch', 'Twitch'], ['tiktok', 'TikTok'], ['instagram', 'Instagram'], ['youtube', 'YouTube'], ['discord', 'Discord'], ['site', 'Site']];
    return head('Identité', 'Réglages', '') + `
    <div class="card" data-reset="team"><div class="card-head"><h3 class="grow">Équipe</h3></div><div class="grid">
      ${field('Nom', 'settings.teamName')}${field('Sous-titre', 'settings.teamSub')}
      ${field('Logo', 'settings.logo', { ph: '/logo/logo.svg' })}
    </div>
    <div class="row" style="margin-top:16px">${toggle('Effet néon (lumière qui tourne autour des cadres)', 'settings.neon')}</div></div>
    <div class="card" data-reset="socials"><div class="card-head"><h3 class="grow">Réseaux</h3></div><div class="grid">
      ${soc.map(([k, l]) => field(l, `settings.socials.${k}`, { ph: k === 'site' ? 'kaelyx.gg' : '@compte' })).join('')}
    </div></div>
    <div class="card"><div class="card-head"><h3>Sauvegarde</h3></div>
      <div class="row"><button type="button" class="btn deep" data-act="export">Exporter (JSON)</button>
      <label class="btn ghost" style="cursor:pointer">Importer<input type="file" accept="application/json" data-import hidden></label></div></div>
    ${updateCard()}
    <div class="card"><div class="card-head"><h3>Sécurité</h3></div>
      <form data-form="password" autocomplete="off"><div class="grid">
        <label class="field"><span>Mot de passe actuel</span><input type="password" name="current" autocomplete="current-password" required></label>
        <label class="field"><span>Nouveau (10 caractères min.)</span><input type="password" name="next" autocomplete="new-password" minlength="10" required></label>
        <label class="field"><span>Confirme le nouveau</span><input type="password" name="confirm" autocomplete="new-password" minlength="10" required></label>
      </div>
      <p class="hint" style="margin:12px 0 0;color:var(--kx-silver)">Changer le mot de passe déconnecte tous les autres appareils (dock OBS, téléphone…).</p>
      <div class="row" style="margin-top:14px"><button type="submit" class="btn deep">Changer le mot de passe</button>
        <button type="button" class="btn ghost" data-act="logout">Se déconnecter</button></div></form></div>`;
  }
};

const DEFAULT_PV = { regie: () => pvPath || '/pov', players: () => S.players[0] ? '/p/' + S.players[0].id : '/roster', scenes: () => '/scene/starting', lowerthird: () => '/lowerthird',
  ticker: () => '/ticker', casters: () => '/caster', pov: () => '/pov', scoreboard: () => '/scoreboard', alerts: () => '/alerts', links: () => pvPath || '/roster', settings: () => '/scene/starting', twitch: () => '/chat' };

function renderTab() {
  const y = scrollY;
  // L'arrivée en cascade des cartes est réservée au changement d'onglet (go) : un simple rafraîchissement ne la rejoue pas
  $('#view').classList.remove('enter');
  try { $('#view').innerHTML = (TABS[tab] || TABS.players)(); }
  catch (err) {
    console.error(err);
    // Souvent : serveur lancé avant une mise à jour des fichiers
    $('#view').innerHTML = head('Oups', 'Onglet indisponible', 'Ferme la fenêtre noire du streampack, relance <b>demarrer-windows.bat</b>, puis recharge cette page (F5).');
  }
  document.querySelectorAll('#nav button').forEach(b => b.dataset.tab === tab ? b.setAttribute('aria-current', 'page') : b.removeAttribute('aria-current'));
  window.scrollTo(0, y);
  // Animations en boucle (reflet, rotation) : même phase qu'avant le rafraîchissement, au lieu de repartir de zéro
  $('#view').getAnimations({ subtree: true }).forEach(a => { if (a.effect?.getTiming().iterations === Infinity) a.startTime = 0; });
  tickCounts();
  window.afterRender?.();
}
let enterT;
function go(t) {
  tab = t; localStorage.setItem('kx-tab', t);
  window.scrollTo(0, 0);
  setPreview(DEFAULT_PV[t]());
  renderTab();
  // Transition d'entrée de l'onglet (cartes qui arrivent en cascade), retirée une fois jouée pour ne plus se redéclencher
  const v = $('#view'); v.classList.remove('enter'); void v.offsetWidth; v.classList.add('enter');
  clearTimeout(enterT); enterT = setTimeout(() => v.classList.remove('enter'), 1000);
}

/* ---------- Aperçu ---------- */
function setPreview(path) {
  if (!path || path === pvPath) return;
  pvPath = path;
  $('#pvFrame').src = path;
  $('#pvUrl').textContent = origin + path;
  $('#pvOpen').href = path;
  $('#pvCopy').dataset.path = path;
  document.querySelectorAll('.card').forEach(c => c.classList.toggle('is-active', !!c.querySelector(`[data-act="preview"][data-path="${CSS.escape(path)}"]`)));
}
function fitPreview() {
  const box = $('#pvScreen');
  $('#pvFrame').style.transform = `scale(${box.clientWidth / 1920})`;
}
new ResizeObserver(fitPreview).observe($('#pvScreen'));

/* ---------- Comptes à rebours ---------- */
function tickCounts() {
  clearInterval(tickTimer);
  const draw = () => {
    document.querySelectorAll('[data-count]').forEach(el => {
      const end = S.scenes[el.dataset.count]?.endAt || 0;
      const left = Math.max(0, Math.round((end - Date.now()) / 1000));
      el.textContent = left ? `${String(Math.floor(left / 60)).padStart(2, '0')}:${String(left % 60).padStart(2, '0')}` : '--:--';
    });
    const lt = document.querySelector('[data-lt-note]');
    if (lt) lt.textContent = ltShown() ? 'Affiché à l’écran' : 'Masqué';
  };
  draw(); tickTimer = setInterval(draw, 1000);
}

/* ---------- Actions ---------- */
async function copy(path) {
  const url = origin + path;
  try { await navigator.clipboard.writeText(url); }
  catch { const t = document.createElement('textarea'); t.value = url; document.body.appendChild(t); t.select(); document.execCommand('copy'); t.remove(); }
  toast('URL copiée');
}
const ACTIONS = {
  preview: d => setPreview(d.path),
  copy: d => copy(d.path || pvPath),
  'reload-preview': () => { const f = $('#pvFrame'); f.src = pvPath; },
  'del-player': d => {
    const p = S.players[+d.i];
    if (!confirm(`Supprimer l’overlay de ${p.pseudo} ? L’URL /p/${p.id} ne s’affichera plus.`)) return;
    const i = +d.i;
    S.players.splice(i, 1); save(true);
    toast(`Overlay de ${p.pseudo} supprimé`, () => { if (!S.players.some(x => x.id === p.id)) S.players.splice(Math.min(i, S.players.length), 0, p); });
    if (pvPath === '/p/' + p.id) { pvPath = ''; setPreview(DEFAULT_PV.players()); }
    renderTab();
  },
  count: d => {
    const sc = S.scenes[d.k]; const m = +d.m;
    if (!m) sc.endAt = 0;
    else if (d.add !== undefined) { if ((sc.endAt || 0) < Date.now()) sc.startAt = Date.now(); sc.endAt = Math.max(Date.now(), sc.endAt || 0) + 60000; }
    else { sc.startAt = Date.now(); sc.endAt = Date.now() + m * 60000; } // startAt : barre de progression du compte à rebours
    save(true); tickCounts(); setPreview('/scene/' + d.k);
  },
  'lt-show': () => { S.lowerthird.visible = true; S.lowerthird.showAt = Date.now(); save(true); setPreview('/lowerthird'); renderTab(); },
  'lt-hide': () => { S.lowerthird.visible = false; save(true); renderTab(); },
  'lt-fill': d => {
    const p = S.players[+d.i];
    S.lowerthird.name = p.pseudo;
    S.lowerthird.title = [p.role, S.settings.teamName + ' ' + S.settings.teamSub].filter(Boolean).join(' · ');
    ACTIONS['lt-show']();
  },
  step: d => { setP(d.path, Math.max(0, (Number(getP(d.path)) || 0) + Number(d.d))); save(); renderTab(); }, // jamais de score négatif
  'add-row': () => { S.scoreboard.rows.push({ name: 'Équipe ' + (S.scoreboard.rows.length + 1), elims: 0, points: 0 }); save(); renderTab(); },
  'del-row': d => {
    const i = +d.i, [row] = S.scoreboard.rows.splice(i, 1); save(); renderTab();
    toast(`Ligne « ${row.name} » supprimée`, () => S.scoreboard.rows.splice(Math.min(i, S.scoreboard.rows.length), 0, row));
  },
  'add-caster': () => { if (S.casters.list.length >= 3) return; S.casters.list.push({ name: '', handle: '', role: 'Caster' }); save(); renderTab(); },
  'del-caster': d => {
    const i = +d.i, [c] = S.casters.list.splice(i, 1); save(true); renderTab();
    toast(`Caster « ${c.name || i + 1} » retiré`, () => S.casters.list.splice(Math.min(i, S.casters.list.length), 0, c));
  },
  'sort-rows': () => { S.scoreboard.rows.sort((a, b) => (b.points - a.points) || (b.elims - a.elims)); save(); renderTab(); },
  'reset-rows': () => {
    if (!confirm('Remettre tous les points et élims à zéro ?')) return;
    const old = clone({ rows: S.scoreboard.rows, game: S.scoreboard.game });
    S.scoreboard.rows.forEach(r => { r.points = 0; r.elims = 0; }); S.scoreboard.game = 1; save(true); renderTab();
    toast('Scores remis à zéro', () => { S.scoreboard.rows = old.rows; S.scoreboard.game = old.game; });
  },
  'quick-alert': d => { trigger({ kind: 'alert', type: d.type, user: 'Viewer', amount: { sub: 3, gift: 5, bits: 500, raid: 42, don: 10 }[d.type] || 0 }); setPreview('/alerts'); },
  stinger: () => { trigger({ kind: 'stinger' }); setPreview('/stinger'); },
  'tw-connect': async () => {
    const win = window.open('about:blank', 'kx-twitch', 'width=520,height=760');
    try {
      await push(); // le Client ID doit être enregistré avant
      const r = await fetch('/api/twitch/state', { method: 'POST', headers: headers() });
      if (r.status === 401) { win?.close(); status('auth'); await needLogin(); status('ok'); toast('Connecté : reclique sur « Connecter Twitch »'); return; }
      const { state } = await r.json();
      const u = new URL('https://id.twitch.tv/oauth2/authorize');
      u.search = new URLSearchParams({ client_id: S.settings.twitch.clientId.trim(), redirect_uri: `http://localhost:${location.port || 80}/twitch-auth`,
        response_type: 'token', scope: 'moderator:read:followers', state, force_verify: 'true' });
      if (win) win.location = u.href; else location.href = u.href;
    } catch { win?.close(); toast('Serveur injoignable'); }
  },
  'tw-logout': async () => {
    if (!confirm('Déconnecter le compte Twitch ? Les follows ne s’afficheront plus.')) return;
    const r = await fetch('/api/twitch/logout', { method: 'POST', headers: headers() });
    if (r.status === 401) { status('auth'); await needLogin(); status('ok'); return ACTIONS['tw-logout'](); }
    tw = await r.json(); renderTab();
  },
  'upd-check': async () => {
    try { const r = await updatePost('/api/update/check'); if (r.ok) showUpdate(await r.json()); } catch { toast('Serveur injoignable'); }
  },
  'upd-install': async () => {
    if (!confirm(`Installer la version ${upd.next} maintenant ? Les overlays seront coupés environ 10 secondes.`)) return;
    try {
      const r = await updatePost('/api/update/install');
      if (!r.ok) return toast('Aucune mise à jour prête');
      toast('Installation… l’application redémarre toute seule');
    } catch { toast('Serveur injoignable'); }
  },
  logout: async () => {
    try { await fetch('/api/logout', { method: 'POST', headers: headers() }); } catch {}
    kxToken = ''; location.reload();
  },
  export: () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(S, null, 2)], { type: 'application/json' }));
    a.download = 'kaelyx-streampack-' + new Date().toISOString().slice(0, 10) + '.json'; a.click();
  }
};

document.addEventListener('click', e => {
  const n = e.target.closest('#nav button'); if (n) return go(n.dataset.tab);
  const b = e.target.closest('[data-act]'); if (b) { e.preventDefault(); ACTIONS[b.dataset.act]?.(b.dataset, b); }
});

document.addEventListener('input', e => {
  const el = e.target.closest('[data-b]'); if (!el) return;
  let v;
  if (el.type === 'checkbox') v = el.checked;
  else if (el.dataset.num !== undefined) { v = el.value === '' ? 0 : Number(el.value); if (el.min !== '' && v < Number(el.min)) v = Number(el.min); }
  else if (el.dataset.lines !== undefined) v = el.value.split('\n');
  else v = el.value;
  setP(el.dataset.b, v);
  // Messages du ticker : on attend une pause dans la frappe (sinon le défilement repart à chaque touche)
  save(el.dataset.lines !== undefined ? 1200 : 180);
  if (el.dataset.rerender !== undefined) renderTab();
  // Le titre de la carte joueur suit le pseudo tapé
  const m = el.dataset.b.match(/^players\.(\d+)\.(pseudo|photo)$/);
  if (m) { const card = el.closest('.card'); const p = S.players[+m[1]]; card.querySelector('h3').textContent = p.pseudo; card.querySelector('.thumb').outerHTML = thumb(p); }
});

document.addEventListener('submit', e => {
  const f = e.target; e.preventDefault();
  const data = Object.fromEntries(new FormData(f));
  if (f.dataset.form === 'add-player') {
    const pseudo = data.pseudo.trim(); if (!pseudo) return;
    let id = slug(pseudo), n = 2; while (S.players.some(p => p.id === id)) id = slug(pseudo) + '-' + n++;
    S.players.push({ id, pseudo, role: 'Joueur', game: data.game, photo: photos.find(x => x.toLowerCase().includes('/' + id + '.')) || '', twitch: '', x: '',
      camVisible: true, camPos: 'bl', camSize: 'm', showTag: true, showTicker: false, showSocial: true });
    save(true); toast(`Overlay de ${pseudo} créé : /p/${id}`);
    pvPath = ''; setPreview('/p/' + id); renderTab();
  }
  if (f.dataset.form === 'password') changePassword(f, data);
  if (f.dataset.form === 'alert') { trigger({ kind: 'alert', type: data.type, user: data.user, amount: Number(data.amount) || 0, message: data.message }); setPreview('/alerts'); }
});

document.addEventListener('change', async e => {
  if (e.target.matches('[data-lines]')) return push(); // sortie du champ : envoi immédiat
  if (!e.target.matches('[data-import]')) return;
  try {
    const next = JSON.parse(await e.target.files[0].text());
    if (!Array.isArray(next.players)) throw 0;
    const prev = S;
    S = next; save(true); renderTab();
    toast('Sauvegarde importée', () => { S = prev; });
  } catch { toast('Fichier invalide'); }
});

/* ---------- Mises à jour de l'application (état envoyé en direct par le serveur) ---------- */
let upd = { supported: false };
function updateCard() {
  const u = upd, cur = esc(u.current || '');
  const at = u.checkedAt ? ' · vérifié à ' + new Date(u.checkedAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '';
  const checkBtn = (label = 'Rechercher maintenant') => `<button type="button" class="btn deep" data-act="upd-check">${label}</button>`;
  let body;
  if (!u.supported) body = `<p class="upd-text">Les mises à jour automatiques fonctionnent dans l'application de bureau.${u.error ? ' ' + esc(u.error) : ''}</p>`;
  else if (u.state === 'checking') body = `<p class="upd-text">Recherche d'une nouvelle version…</p><div class="row">${checkBtn('Recherche…').replace('<button', '<button disabled')}</div>`;
  else if (u.state === 'downloading') body = `<p class="upd-text">Téléchargement de la version <b>${esc(u.next)}</b>… ${u.percent || 0} %</p>
      <div class="upd-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${u.percent || 0}"><i style="width:${u.percent || 0}%"></i></div>`;
  else if (u.state === 'ready') body = `<p class="upd-text">La version <b>${esc(u.next)}</b> est prête. L'application redémarre toute seule (environ 10 s de coupure des overlays).</p>
      <div class="row"><button type="button" class="btn" data-act="upd-install">Installer maintenant</button></div>`;
  else if (u.state === 'error') body = `<p class="upd-text">Vérification impossible : ${esc(u.error || 'erreur inconnue')}${at}</p><div class="row">${checkBtn('Réessayer')}</div>`;
  else body = `<p class="upd-text">${u.state === 'none' ? 'Tu as la dernière version.' : 'Recherche automatique au lancement puis toutes les 30 min.'}${at}</p><div class="row">${checkBtn()}</div>`;
  return `<div class="card" id="updCard"><div class="card-head"><h3>Application</h3><code>Version ${cur || '—'}</code></div>${body}</div>`;
}
function showUpdate(u) {
  upd = u || { supported: false };
  if (tab === 'settings') { const c = $('#updCard'); if (c) c.outerHTML = updateCard(); }
  // Bandeau visible dans tous les onglets dès qu'une version est prête
  let bar = $('#updBanner');
  if (upd.state === 'ready') {
    if (!bar) { bar = document.createElement('div'); bar.id = 'updBanner'; bar.className = 'upd-banner'; bar.setAttribute('role', 'status'); document.body.appendChild(bar); }
    bar.innerHTML = `<span>Mise à jour <b>${esc(upd.next)}</b> prête</span><button type="button" class="btn" data-act="upd-install">Installer maintenant</button>`;
  } else if (bar) bar.remove();
}
async function updatePost(url) {
  const r = await fetch(url, { method: 'POST', headers: headers() });
  if (r.status === 401) { await needLogin(); return updatePost(url); }
  return r;
}

async function changePassword(form, data) {
  if (data.next.trim().length < 10) return toast('Le nouveau mot de passe doit faire au moins 10 caractères');
  if (data.next !== data.confirm) return toast('Les deux nouveaux mots de passe ne sont pas identiques');
  try {
    const r = await fetch('/api/password', { method: 'POST', headers: headers(), body: JSON.stringify({ current: data.current, next: data.next }) });
    if (r.status === 401) { await needLogin(); return toast('Reconnecté : recommence le changement'); }
    const d = await r.json().catch(() => ({}));
    if (!r.ok) return toast(d.error || 'Changement impossible');
    kxToken = d.token; form.reset();
    toast('Mot de passe changé. Les autres appareils devront se reconnecter.');
  } catch { toast('Serveur injoignable'); }
}

/* ---------- Démarrage ---------- */
async function boot() {
  // Pas (ou plus) connecté : écran de mot de passe avant tout
  try {
    const a = await (await fetch('/api/auth', { headers: headers() })).json();
    if (!a.ok) await needLogin();
  } catch { status('err'); return setTimeout(boot, 1500); }
  try {
    S = await (await fetch('/api/state')).json();
    base = clone(S);
    photos = await (await fetch('/api/photos')).json().catch(() => []);
    $('#photoList').innerHTML = photos.map(p => `<option value="${esc(p)}">`).join('');
    status('ok');
  } catch { status('err'); return setTimeout(boot, 1500); }
  // Connexion temps réel partagée avec les overlays : reçoit les changements faits sur un autre admin
  KX.on('open', () => status('ok'));
  KX.on('error', () => status('err'));
  KX.on('state', st => adopt(clone(st)));
  KX.on('twitch', s => { tw = s; if (tab === 'twitch') renderSoon(); });
  KX.on('update', showUpdate);
  KX.on('open', () => fetch('/api/update').then(r => r.json()).then(showUpdate).catch(() => {})); // après un redémarrage
  fetch('/api/update').then(r => r.json()).then(showUpdate).catch(() => {});
  fetch('/api/twitch').then(r => r.json()).then(d => { tw = d.status; if (tab === 'twitch') renderSoon(); }).catch(() => {});
  if (!TABS[tab]) tab = 'regie';
  setPreview(DEFAULT_PV[tab]());
  renderTab();
  fitPreview();
}
boot();
