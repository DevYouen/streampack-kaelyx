/* Admin Kaelyx — envoi d'images (photo recadrée, logos), onglet « Infos & sponsors » (programme, sponsors, objectif),
   Stream Deck et raccourcis globaux, configurations enregistrées, aperçu privé.
   Chargé après admin-guide.js : utilise S, TABS, ACTIONS, field, toggle, head, esc, save, renderTab, toast, setPreview, headers… */

const api = async (url, body) => {
  const r = await fetch(url, { method: body === undefined ? 'GET' : 'POST', headers: headers(), body: body === undefined ? undefined : JSON.stringify(body) });
  if (unauth(r)) { status('auth'); await needLogin(); status('ok'); return api(url, body); }
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || 'erreur ' + r.status);
  return d;
};

/* ---------- Images : photo recadrée (carré) ou logo (proportions gardées, transparence conservée) ---------- */
function chooseFile() {
  return new Promise(ok => {
    const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'image/png,image/jpeg,image/webp';
    inp.onchange = () => ok(inp.files[0] || null); inp.click();
  });
}
const loadImg = file => new Promise((ok, ko) => { const i = new Image(); i.onload = () => ok(i); i.onerror = ko; i.src = URL.createObjectURL(file); });
// Logo : réduit à 800 px maximum, en PNG (transparence gardée)
async function logoData(file) {
  const img = await loadImg(file), k = Math.min(1, 800 / Math.max(img.width, img.height));
  const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL('image/png');
}
// Photo : fenêtre de recadrage carrée (glisser pour placer, curseur pour zoomer), export 512 × 512
function cropData(file) {
  return loadImg(file).then(img => new Promise(ok => {
    const box = document.createElement('div');
    box.className = 'crop'; box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true'); box.setAttribute('aria-label', 'Recadrer la photo');
    box.innerHTML = `<div class="crop-card"><h3>Recadrer la photo</h3>
      <div class="crop-view"><canvas width="420" height="420"></canvas><i class="crop-frame"></i></div>
      <label class="field"><span>Zoom</span><input type="range" min="1" max="4" step="0.01" value="1"></label>
      <p class="note">Glisse l’image pour la placer.</p>
      <div class="row end"><button type="button" class="btn ghost" data-c="cancel">Annuler</button><button type="button" class="btn" data-c="ok">Valider</button></div></div>`;
    document.body.appendChild(box);
    const cv = box.querySelector('canvas'), ctx = cv.getContext('2d'), zoom = box.querySelector('input');
    const V = 420, base = V / Math.min(img.width, img.height);
    let z = 1, x = 0, y = 0, drag = null;
    const clamp = () => { const s = base * z, w = img.width * s, h = img.height * s; x = Math.min(0, Math.max(V - w, x)); y = Math.min(0, Math.max(V - h, y)); };
    const draw = () => { clamp(); const s = base * z; ctx.fillStyle = '#2A2B2C'; ctx.fillRect(0, 0, V, V); ctx.drawImage(img, x, y, img.width * s, img.height * s); };
    x = (V - img.width * base) / 2; y = (V - img.height * base) / 2; draw();
    zoom.oninput = () => { const s0 = base * z, cx = (V / 2 - x) / s0, cy = (V / 2 - y) / s0; z = +zoom.value; const s = base * z; x = V / 2 - cx * s; y = V / 2 - cy * s; draw(); };
    cv.onpointerdown = e => { drag = { sx: e.clientX, sy: e.clientY, x, y }; cv.setPointerCapture(e.pointerId); };
    cv.onpointermove = e => { if (!drag) return; x = drag.x + e.clientX - drag.sx; y = drag.y + e.clientY - drag.sy; draw(); };
    cv.onpointerup = () => { drag = null; };
    cv.onwheel = e => { e.preventDefault(); zoom.value = Math.min(4, Math.max(1, z - e.deltaY / 600)); zoom.oninput(); };
    const done = v => { box.remove(); ok(v); };
    box.addEventListener('click', e => {
      const c = e.target.closest('[data-c]')?.dataset.c; if (!c) return;
      if (c === 'cancel') return done(null);
      const out = document.createElement('canvas'); out.width = out.height = 512;
      const s = base * z * 512 / V;
      out.getContext('2d').drawImage(img, x * 512 / V, y * 512 / V, img.width * s, img.height * s);
      done(out.toDataURL('image/jpeg', .9));
    });
    box.addEventListener('keydown', e => { if (e.key === 'Escape') done(null); });
    box.querySelector('[data-c="ok"]').focus();
  }));
}
// Choisit (ou reçoit) une image, la prépare et l'envoie ; renvoie le chemin à mettre dans l'état
async function uploadImage({ kind, name, file }) {
  file = file || await chooseFile(); if (!file) return null;
  if (!/^image\/(png|jpeg|webp)$/.test(file.type)) { toast('Image PNG, JPEG ou WebP uniquement'); return null; }
  try {
    const data = kind === 'photo' ? await cropData(file) : await logoData(file);
    if (!data) return null;
    const { path } = await api('/api/upload', { kind, name, data });
    return path;
  } catch (e) { toast('Envoi impossible : ' + e.message); return null; }
}
// Champ « chemin d'image » + bouton d'envoi + vignette (logos des sponsors, des équipes)
const logoField = (label, pathKey, name) => {
  const v = getP(pathKey) || '';
  return `<div class="field up-field"><span>${esc(label)}</span><div class="up-row">
    <span class="up-thumb">${v ? `<img src="${esc(v)}" alt="" onerror="this.remove()">` : ''}</span>
    <input type="text" data-b="${pathKey}" value="${esc(v)}" placeholder="Aucun logo">
    <button type="button" class="btn ghost" data-act="logo-up" data-path="${pathKey}" data-name="${esc(name)}">Choisir…</button></div></div>`;
};

Object.assign(ACTIONS, {
  'photo-up': async d => {
    const p = S.players[+d.i]; if (!p) return;
    const path = await uploadImage({ kind: 'photo', name: p.id, file: d.file });
    if (!path) return;
    p.photo = path; save(true); renderTab(); toast('Photo de ' + p.pseudo + ' enregistrée');
  },
  'logo-up': async d => {
    const path = await uploadImage({ kind: 'logo', name: d.name, file: d.file });
    if (!path) return;
    setP(d.path, path); save(true); renderTab(); toast('Logo enregistré');
  }
});
// Glisser-déposer une image sur la carte d'un joueur (photo) ou sur un champ de logo
document.addEventListener('dragover', e => { if (e.target.closest?.('[data-drop-photo], .up-field')) { e.preventDefault(); e.target.closest('[data-drop-photo], .up-field').classList.add('drop-on'); } });
document.addEventListener('dragleave', e => e.target.closest?.('[data-drop-photo], .up-field')?.classList.remove('drop-on'));
document.addEventListener('drop', e => {
  const card = e.target.closest?.('[data-drop-photo]'), fld = e.target.closest?.('.up-field');
  if (!card && !fld) return;
  e.preventDefault(); (card || fld).classList.remove('drop-on');
  const file = e.dataTransfer.files[0]; if (!file) return;
  if (fld) { const b = fld.querySelector('[data-act="logo-up"]'); ACTIONS['logo-up']({ path: b.dataset.path, name: b.dataset.name, file }); }
  else ACTIONS['photo-up']({ i: card.dataset.dropPhoto, file });
});

/* ---------- Onglet « Infos & sponsors » : programme, sponsors, objectif ---------- */
TABS.infos = function () {
  const sc = S.schedule, sp = S.sponsors, g = S.goal;
  const pct = Math.min(100, Math.round(g.current / Math.max(1, g.target) * 100));
  return head('Habillage du live', 'Infos & sponsors', 'Le programme de la soirée, les logos des partenaires et une barre d’objectif. Chacun a son overlay (URL dans le Guide et Liens OBS).') + `
  <div class="card ${pvPath.startsWith('/programme') ? 'is-active' : ''}" data-reset="schedule">
    <div class="card-head"><div class="grow"><h3>Programme</h3><code>${esc(origin)}/programme</code> · <code>/programme?bandeau</code></div>
      <div class="row"><button type="button" class="btn ghost" data-act="preview" data-path="/programme">Aperçu</button><button type="button" class="btn ghost" data-act="preview" data-path="/programme?bandeau">Aperçu bandeau</button></div></div>
    <div class="grid">${field('Petit titre', 'schedule.kicker')}${field('Titre', 'schedule.title')}</div>
    <div class="sched">${sc.items.map((it, i) => `<div class="sched-row">
      ${field('Heure', `schedule.items.${i}.time`, { ph: '20:30' })}${field('Match', `schedule.items.${i}.label`, { ph: 'Scrim FNCS' })}${field('Détail', `schedule.items.${i}.sub`, { ph: 'Optionnel' })}
      <div class="row sched-act"><button type="button" class="btn ghost sq" data-act="sched-mv" data-i="${i}" data-d="-1" aria-label="Monter" ${i ? '' : 'disabled'}>↑</button>
        <button type="button" class="btn ghost sq" data-act="sched-mv" data-i="${i}" data-d="1" aria-label="Descendre" ${i < sc.items.length - 1 ? '' : 'disabled'}>↓</button>
        <button type="button" class="btn ghost sq danger" data-act="sched-del" data-i="${i}" aria-label="Supprimer">×</button></div></div>`).join('')
      || '<p class="note">Aucun match. Le match en cours est mis en avant tout seul, d’après l’heure.</p>'}</div>
    <div class="row" style="margin-top:14px"><button type="button" class="btn deep" data-act="sched-add">Ajouter un match</button></div>
  </div>

  <div class="card ${pvPath.startsWith('/sponsors') ? 'is-active' : ''}" data-reset="sponsors">
    <div class="card-head"><div class="grow"><h3>Sponsors</h3><code>${esc(origin)}/sponsors</code></div>
      ${toggle('Visible', 'sponsors.visible')}<button type="button" class="btn ghost" data-act="preview" data-path="/sponsors">Aperçu</button></div>
    <div class="grid">${field('Titre du panneau', 'sponsors.title')}${field('Secondes par logo', 'sponsors.every', { num: true, min: 2 })}</div>
    <div class="row" style="margin:12px 0">${toggle('Aussi dans le ticker', 'sponsors.inTicker')}</div>
    <div class="spons">${sp.items.map((it, i) => `<div class="spons-row">
      ${field('Nom', `sponsors.items.${i}.name`, { ph: 'Partenaire' })}${logoField('Logo', `sponsors.items.${i}.logo`, 'sponsor-' + (it.name || i + 1))}
      <button type="button" class="btn ghost sq danger" data-act="spons-del" data-i="${i}" aria-label="Retirer">×</button></div>`).join('')
      || '<p class="note">Aucun partenaire. Glisse un logo sur le champ, ou clique sur « Choisir… ».</p>'}</div>
    <div class="row" style="margin-top:14px"><button type="button" class="btn deep" data-act="spons-add">Ajouter un partenaire</button></div>
  </div>

  <div class="card ${pvPath.startsWith('/objectif') ? 'is-active' : ''}" data-reset="goal">
    <div class="card-head"><div class="grow"><h3>Objectif</h3><code>${esc(origin)}/objectif</code></div>
      ${toggle('Visible', 'goal.visible')}<button type="button" class="btn ghost" data-act="preview" data-path="/objectif">Aperçu</button></div>
    <div class="grid">${field('Texte', 'goal.label')}
      ${field('Compté automatiquement', 'goal.kind', { options: [['subs', 'Subs (Twitch)'], ['follows', 'Follows (Twitch)'], ['bits', 'Bits (Twitch)'], ['manuel', 'À la main']] })}
      ${field('Objectif', 'goal.target', { num: true, min: 1 })}</div>
    <div class="goal-now"><div class="stepper row"><button type="button" class="btn ghost sq" data-act="goal-step" data-d="-1" aria-label="Moins un">−</button>
      <b class="rg-num">${g.current}</b><button type="button" class="btn sq" data-act="goal-step" data-d="1" aria-label="Plus un">+</button></div>
      <div class="goal-bar"><i style="width:${pct}%"></i></div><span class="note">${pct} %</span>
      <button type="button" class="btn ghost" data-act="goal-reset">Remettre à zéro</button></div>
    <div class="row" style="margin-top:12px;gap:22px">${toggle('Sur les scènes (sous les réseaux)', 'goal.inScenes', true)}${toggle('Dans le ticker', 'goal.inTicker')}</div>
  </div>`;
};
DEFAULT_PV.infos = () => '/programme';
Object.assign(ACTIONS, {
  'sched-add': () => { S.schedule.items.push({ time: '', label: '', sub: '' }); save(); renderTab(); },
  'sched-del': d => { const i = +d.i, [it] = S.schedule.items.splice(i, 1); save(true); renderTab(); toast('Match retiré', () => S.schedule.items.splice(i, 0, it)); },
  'sched-mv': d => { const a = S.schedule.items, i = +d.i, j = i + +d.d; if (j < 0 || j >= a.length) return; [a[i], a[j]] = [a[j], a[i]]; save(true); renderTab(); },
  'spons-add': () => { S.sponsors.items.push({ name: '', logo: '' }); save(); renderTab(); },
  'spons-del': d => { const i = +d.i, [it] = S.sponsors.items.splice(i, 1); save(true); renderTab(); toast('Partenaire retiré', () => S.sponsors.items.splice(i, 0, it)); },
  'goal-step': d => { S.goal.current = Math.max(0, (Number(S.goal.current) || 0) + +d.d); save(true); renderTab(); },
  'goal-reset': () => { const old = S.goal.current; S.goal.current = 0; save(true); renderTab(); toast('Objectif remis à zéro', () => { S.goal.current = old; }); }
});
// Carte de la Régie
function rgInfos() {
  const g = S.goal;
  return `<section class="card">
    <div class="card-head"><h3 class="grow">Sponsors & objectif</h3><button type="button" class="link-btn" data-act="go" data-tab="infos">Réglages →</button></div>
    <div class="row" style="gap:22px">${toggle('Sponsors visibles', 'sponsors.visible')}${toggle('Objectif visible', 'goal.visible')}</div>
    <div class="rg-step" style="margin-top:12px"><span>${esc(g.label)} · ${g.current} / ${g.target}</span><div class="stepper row">
      <button type="button" class="btn ghost sq" data-act="goal-step" data-d="-1" aria-label="Moins un">−</button>
      <button type="button" class="btn sq" data-act="goal-step" data-d="1" aria-label="Plus un">+</button></div></div>
  </section>`;
}

/* ---------- Réglages : Stream Deck & raccourcis globaux, configurations enregistrées ---------- */
let deck = null, presets = null;
const DECK_ACTIONS = [
  ['stinger', '', 'Lancer le stinger'], ['pov-sting', '', 'Animation logo des POV'], ['lowerthird', '', 'Lower third : afficher / masquer'],
  ['ticker', '', 'Ticker : afficher / masquer'], ['scoreboard', '', 'Scoreboard : afficher / masquer'], ['sponsors', '', 'Sponsors : afficher / masquer'],
  ['goal', '', 'Objectif : afficher / masquer'], ['goal-plus', '', 'Objectif +1'], ['score-a', '', 'Score VS : équipe A +1'], ['score-b', '', 'Score VS : équipe B +1'],
  ['count', 'starting-5', 'Starting soon : 5 min'], ['count', 'brb-5', 'BRB : 5 min'], ['alert', 'follow', 'Alerte de test (follow)'],
  ['replay-pov', '', 'Replay de la POV principale'], ['replay-pov-slow', '', 'Replay de la POV principale (ralenti)'], ['replay-pov-stop', '', 'Arrêter le replay des POV']
];
function deckCard() {
  if (!deck) { api('/api/deck/info').then(d => { deck = d; if (tab === 'settings') renderSoon(); }).catch(() => {}); }
  const base = deck ? `${origin}/api/deck/` : '';
  const url = (a, arg) => deck ? `${base}${a}${arg ? '/' + encodeURIComponent(arg) : ''}?key=${deck.key}` : '…';
  const players = S.players.map((p, i) => ['pov-main', p.id, 'Mettre en grand : ' + p.pseudo + (i < 8 ? ` (Ctrl + Alt + F${i + 1})` : '')]);
  const layouts = S.pov.layouts.map(l => ['pov-layout', l.id, 'Mise en page POV : ' + l.name]);
  const replays = S.players.map((p, i) => ['replay-pov', p.id, 'Replay POV : ' + p.pseudo + (i < 8 ? ` (Ctrl + Alt + Maj + F${i + 1})` : '')]);
  return `<div class="card" id="deckCard"><div class="card-head"><h3 class="grow">Stream Deck & raccourcis globaux</h3></div>
    <div class="row" style="margin-bottom:12px">${toggle('Raccourcis clavier globaux (marchent même dans le jeu ou dans OBS)', 'settings.globalKeys')}</div>
    <p class="note" style="margin-bottom:12px">Application de bureau : <kbd>Ctrl</kbd> + <kbd>Alt</kbd> + <kbd>S</kbd> stinger · <kbd>P</kbd> animation logo · <kbd>L</kbd> lower third · <kbd>D</kbd> ticker · <kbd>B</kbd> scoreboard · <kbd>K</kbd> sponsors · <kbd>O</kbd> objectif · <kbd>F1</kbd>…<kbd>F8</kbd> mettre en grand le joueur 1 à 8 · <kbd>Maj</kbd> + <kbd>F1</kbd>…<kbd>F8</kbd> replay de sa POV. Sur un Stream Deck, l’action <b>Raccourci clavier</b> peut les envoyer.</p>
    <p class="note" style="margin-bottom:10px">Ou, avec l’extension <b>Web Requests</b> (ou <b>API Ninja</b>) du Stream Deck : une requête GET sur l’adresse du bouton. La clé est personnelle : en cas de fuite, renouvelle-la.</p>
    <div class="deck-list">${[...DECK_ACTIONS, ...players, ...replays, ...layouts].map(([a, arg, l]) => `<div class="deck-row"><b>${esc(l)}</b><code>${esc(url(a, arg))}</code>
      <button type="button" class="btn ghost" data-act="deck-copy" data-u="${esc(url(a, arg))}" ${deck ? '' : 'disabled'}>Copier</button></div>`).join('')}</div>
    <div class="row" style="margin-top:12px"><button type="button" class="btn ghost danger" data-act="deck-reset">Nouvelle clé</button></div></div>`;
}
function presetsCard() {
  if (!presets) { api('/api/presets', { action: 'list' }).then(d => { presets = d.list; if (tab === 'settings') renderSoon(); }).catch(() => {}); }
  return `<div class="card"><div class="card-head"><h3 class="grow">Configurations enregistrées</h3></div>
    <p class="note" style="margin-bottom:12px">Enregistre toute la configuration (joueurs, scènes, POV, scoreboard, programme…) pour un événement, et recharge-la en un clic.</p>
    <form class="add" data-form="preset-save"><label class="field"><span>Nom</span><input type="text" name="name" placeholder="ex. Scrim du mardi" autocomplete="off" required></label>
      <button class="btn" type="submit">Enregistrer la configuration actuelle</button></form>
    <div class="presets">${(presets || []).map(p => `<div class="deck-row"><b>${esc(p.name)}</b><span class="note">${p.at ? new Date(p.at).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) : ''}</span>
      <button type="button" class="btn" data-act="preset-load" data-n="${esc(p.name)}">Charger</button>
      <button type="button" class="btn ghost sq danger" data-act="preset-del" data-n="${esc(p.name)}" aria-label="Supprimer ${esc(p.name)}">×</button></div>`).join('')
      || (presets ? '<p class="note">Aucune configuration enregistrée.</p>' : '<p class="note">Chargement…</p>')}</div></div>`;
}
{ const s0 = TABS.settings; TABS.settings = () => s0() + deckCard() + presetsCard(); }
Object.assign(ACTIONS, {
  'deck-copy': async d => { try { await navigator.clipboard.writeText(d.u); toast('Adresse copiée'); } catch { toast('Copie impossible'); } },
  'deck-reset': async () => {
    if (!confirm('Créer une nouvelle clé ? Les boutons Stream Deck déjà réglés ne marcheront plus (il faudra recopier les adresses).')) return;
    try { deck = { ...deck, ...(await api('/api/deck/reset', {})) }; renderTab(); toast('Nouvelle clé créée'); } catch (e) { toast(e.message); }
  },
  'preset-load': async d => {
    if (!confirm(`Charger « ${d.n} » ? La configuration actuelle sera remplacée (bouton Annuler pendant 10 s).`)) return;
    try { const { state } = await api('/api/presets', { action: 'load', name: d.n }); const prev = S; S = { ...state, rev: base.rev }; save(true); renderTab(); toast(`« ${d.n} » chargée`, () => { S = prev; }); }
    catch (e) { toast(e.message); }
  },
  'preset-del': async d => {
    if (!confirm(`Supprimer la configuration « ${d.n} » ?`)) return;
    try { presets = (await api('/api/presets', { action: 'delete', name: d.n })).list; renderTab(); } catch (e) { toast(e.message); }
  }
});
document.addEventListener('submit', async e => {
  if (e.target.dataset?.form !== 'preset-save') return;
  const name = new FormData(e.target).get('name').trim(); if (!name) return;
  try { presets = (await api('/api/presets', { action: 'save', name, state: S })).list; renderTab(); toast(`Configuration « ${name} » enregistrée`); }
  catch (err) { toast(err.message); }
});

/* ---------- Aperçu privé : l'overlay de l'aperçu reçoit un état de test, rien n'est envoyé à l'antenne ---------- */
let pvPrivate = null;
const pvFrameWin = () => document.getElementById('pvFrame').contentWindow;
function privatePreview(path, state, trigger) {
  pvPrivate = { state, trigger };
  pvPath = ''; setPreview(path + (path.includes('?') ? '&' : '?') + 'mv');
  document.getElementById('preview').classList.add('private');
  document.getElementById('pvUrl').textContent = 'Aperçu privé : rien n’est envoyé à l’antenne';
}
addEventListener('message', e => {
  if (e.origin !== location.origin || !e.data?.kxReady || !pvPrivate || e.source !== pvFrameWin()) return;
  const w = e.source, { state, trigger } = pvPrivate;
  setTimeout(() => { w.postMessage({ kx: 'state', data: state }, location.origin); if (trigger) setTimeout(() => w.postMessage({ kx: 'trigger', data: trigger }, location.origin), 350); }, 30);
});
{ const sp = setPreview; setPreview = p => { if (!String(p).includes('mv')) { pvPrivate = null; document.getElementById('preview')?.classList.remove('private'); } sp(p); }; }
Object.assign(ACTIONS, {
  'private-lt': () => { const st = clone(S); Object.assign(st.lowerthird, { visible: true, showAt: Date.now() }); privatePreview('/lowerthird', st); },
  'private-alert': () => {
    const f = document.querySelector('form[data-form="alert"]'); if (!f) return;
    const d = Object.fromEntries(new FormData(f));
    privatePreview('/alerts', clone(S), { kind: 'alert', type: d.type, user: d.user, amount: Number(d.amount) || 0, message: d.message, at: Date.now() });
  },
  'private-off': () => { pvPath = ''; setPreview(DEFAULT_PV[tab]()); }
});

/* ---------- Recherche Ctrl+K : nouvelles actions ---------- */
{ const c0 = commands; commands = () => [...c0(),
  { group: 'Action', label: (S.sponsors.visible ? 'Masquer' : 'Afficher') + ' les sponsors', run: () => { S.sponsors.visible = !S.sponsors.visible; save(true); renderTab(); }, hint: 'Ctrl Alt K' },
  { group: 'Action', label: (S.goal.visible ? 'Masquer' : 'Afficher') + ' l’objectif', run: () => { S.goal.visible = !S.goal.visible; save(true); renderTab(); }, hint: 'Ctrl Alt O' },
  { group: 'Action', label: 'Objectif +1', run: () => ACTIONS['goal-step']({ d: 1 }) },
  { group: 'Aperçu privé', label: 'Tester le lower third en privé', run: () => ACTIONS['private-lt']() }
]; }
