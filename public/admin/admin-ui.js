/* Admin Kaelyx — interface : barre de titre, régie, multivue, palette Ctrl+K, pastilles du menu, états vides, animations.
   Chargé après admin.js et admin-pov.js : utilise S, TABS, ACTIONS, go, renderTab, setPreview, toast, esc, head, toggle… */
let obsList = [];   // sources ouvertes dans OBS : [{ path, active, visible }] (active = à l'antenne)

/* ---------- Application de bureau : barre de titre maison ---------- */
const wco = navigator.windowControlsOverlay;
const syncApp = () => document.documentElement.classList.toggle('kx-app', !!wco?.visible);
syncApp(); wco?.addEventListener?.('geometrychange', syncApp);

/* ---------- Mode compact (dock OBS étroit) ---------- */
const compactQ = matchMedia('(max-width: 640px)');
const syncCompact = () => document.documentElement.classList.toggle('kx-compact', compactQ.matches);
syncCompact(); compactQ.addEventListener('change', syncCompact);

/* ---------- Présence OBS ---------- */
const TAB_SRC = { pov: ['/pov'], scenes: ['/scene/'], lowerthird: ['/lowerthird'], ticker: ['/ticker'], scoreboard: ['/scoreboard'],
  alerts: ['/alerts', '/stinger'], players: ['/p/', '/roster'], casters: ['/caster', '/cam'], twitch: ['/chat'], infos: ['/programme', '/sponsors', '/objectif'], live: ['/sondage', '/message', '/mvp', '/replay'], tournoi: ['/tournoi'] };
const srcMatch = (src, prefixes) => prefixes.some(x => src.path === x || src.path.startsWith(x.endsWith('/') ? x : x + '/') || src.path.startsWith(x + '?'));
function srcLevel(prefixes) {
  const hit = obsList.filter(s => srcMatch(s, prefixes));
  return hit.some(s => s.active) ? 'air' : hit.length ? 'obs' : '';
}
const NAMES = { '/scene/starting': 'Starting soon', '/scene/brb': 'BRB', '/scene/ending': 'Fin de stream', '/scene/tech': 'Difficultés techniques',
  '/scene/chatting': 'Just chatting', '/pov': 'POV', '/caster': 'Casters (desk)', '/caster/pip': 'Casters (petites cams)', '/cam': 'Cadre webcam',
  '/lowerthird': 'Lower third', '/ticker': 'Ticker', '/scoreboard': 'Scoreboard', '/alerts': 'Alertes', '/stinger': 'Stinger', '/chat': 'Chat', '/roster': 'Roster',
  '/programme': 'Programme', '/sponsors': 'Sponsors', '/objectif': 'Objectif', '/sondage': 'Sondage', '/message': 'Message du chat',
  '/mvp': 'Joueur du match', '/tournoi': 'Tournoi', '/replay': 'Replay' };
function nameOf(path) {
  const p = path.split('?')[0].replace(/\/$/, '');
  if (p.startsWith('/p/')) { const pl = S?.players.find(x => x.id === p.slice(3)); return 'Joueur · ' + (pl ? pl.pseudo : p.slice(3)); }
  return NAMES[p] || p;
}
function liveInfo() {
  const air = obsList.filter(s => s.active).length, n = obsList.length;
  if (air) return { cls: 'air', text: `En direct · ${air} à l’antenne` };
  if (n) return { cls: 'obs', text: `OBS connecté · ${n} source${n > 1 ? 's' : ''}` };
  return { cls: '', text: 'OBS non connecté' };
}
const livePill = () => { const l = liveInfo(); return `<span class="live-pill ${l.cls}"><i></i>${esc(l.text)}</span>`; };

// Pastille de chaque onglet : violet qui pulse = à l'antenne ; violet = affiché ; contour = ouvert dans OBS
function tabOn(t) {
  if (!S) return false;
  if (t === 'lowerthird') return ltShown();
  if (t === 'ticker') return !!S.ticker.visible;
  if (t === 'scoreboard') return !!S.scoreboard.visible;
  if (t === 'scenes') return Object.values(S.scenes).some(sc => (sc.endAt || 0) > Date.now());
  if (t === 'infos') return !!(S.sponsors?.visible || S.goal?.visible);
  if (t === 'live') return !!(S.poll?.open || S.poll?.visible || S.chatpin?.visible || S.mvp?.visible);
  return false;
}
function paintNav() {
  document.querySelectorAll('#nav button').forEach(b => {
    const t = b.dataset.tab, d = b.querySelector('.dot'); if (!d) return;
    const lvl = t === 'regie' ? (obsList.some(s => s.active) ? 'air' : '') : TAB_SRC[t] ? srcLevel(TAB_SRC[t]) : '';
    d.className = 'dot ' + (lvl === 'air' ? 'air' : tabOn(t) ? 'on' : lvl === 'obs' ? 'obs' : '');
  });
  const l = liveInfo();
  for (const id of ['obsLive', 'tbLive']) { const el = $('#' + id); if (el) { el.className = el.className.split(' ')[0] + ' ' + l.cls; el.querySelector('span').textContent = l.text; } }
  const v = $('#tbVer'); if (v) v.textContent = upd.current ? 'v' + upd.current : '';
  const u = $('#tbUpd'); if (u) { u.hidden = upd.state !== 'ready'; u.querySelector('span').textContent = 'Mise à jour ' + (upd.next || '') + ' prête'; }
  paintMv();
}
setInterval(paintNav, 2000); // comptes à rebours, lower third qui se masque tout seul
KX.on('presence', list => { obsList = Array.isArray(list) ? list : []; paintNav(); if (tab === 'regie') renderSoon(); });
KX.on('open', () => fetch('/api/presence').then(r => r.json()).then(l => { obsList = l; paintNav(); }).catch(() => {}));
KX.on('state', () => setTimeout(paintNav, 0));
{ const su = showUpdate; showUpdate = u => { su(u); paintNav(); }; }

/* ---------- États vides illustrés ---------- */
const EMPTY_ICONS = {
  players: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.6 3.4-5.5 6.5-5.5s5.7 1.9 6.5 5.5M18 8v6M15 11h6"/>',
  pov: '<rect x="2.5" y="4" width="19" height="14" rx="1"/><rect x="12.5" y="6.5" width="7" height="5"/><path d="M8 21h8"/>',
  score: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  obs: '<circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 1 7.8 13.5M4.2 16.5A9 9 0 0 1 12 3M4.2 16.5h15.6"/>'
};
function empty(kind, title, text, action = '') {
  return `<div class="empty"><div class="empty-art" aria-hidden="true"><i></i><i></i><svg viewBox="0 0 24 24">${EMPTY_ICONS[kind] || EMPTY_ICONS.obs}</svg></div>
    <div class="empty-txt"><h3>${esc(title)}</h3><p>${esc(text)}</p>${action ? `<div class="row">${action}</div>` : ''}</div></div>`;
}

/* ---------- Onglet Régie : tout le live sur une page ---------- */
const stepBtns = (path, label) => `<div class="rg-step"><span>${label}</span><div class="stepper row">
  <button type="button" class="btn ghost sq" data-act="step" data-path="${path}" data-d="-1" aria-label="${label} moins un">−</button>
  <b class="rg-num">${Number(getP(path)) || 0}</b>
  <button type="button" class="btn sq" data-act="step" data-path="${path}" data-d="1" aria-label="${label} plus un">+</button></div></div>`;

TABS.regie = function () {
  const P = S.players, sb = S.scoreboard;
  const live = typeof povLive === 'function' ? povLive() : null;
  const goBtn = (t, l) => `<button type="button" class="link-btn" data-act="go" data-tab="${t}">${l} →</button>`;
  const scenes = [['starting', 'Starting soon'], ['brb', 'BRB / pause'], ['ending', 'Fin de stream']];
  return head('Pendant le live', 'Régie', 'Toutes les actions du stream au même endroit. <kbd>Ctrl</kbd> + <kbd>K</kbd> pour en lancer une au clavier.', livePill()) + `
  <div class="rg">
    <section class="card rg-hero">
      <div class="rg-hero-bg" aria-hidden="true"></div>
      <div class="card-head"><h3 class="grow">Transitions</h3>${goBtn('alerts', 'Réglages')}</div>
      <div class="rg-hero-btns">
        <button type="button" class="btn big rg-go" data-act="stinger" title="Raccourci : Ctrl + Maj + S"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13 2 4 14h7l-1 8 9-12h-7z"/></svg>Lancer le stinger<span class="kb">Ctrl Maj S</span></button>
        <button type="button" class="btn big deep" data-act="pov-sting" title="Raccourci : Ctrl + Maj + P">Animation logo (POV)<span class="kb">Ctrl Maj P</span></button>
      </div>
    </section>

    <section class="card">
      <div class="card-head"><h3 class="grow">POV</h3>${toggle('Visible', 'pov.visible')}</div>
      <p class="rg-label">Mise en page</p>
      <div class="pov-chips">${S.pov.layouts.map(l => `<button type="button" class="chip ${l.id === live?.id ? 'on' : ''}" data-act="pov-live" data-id="${esc(l.id)}" aria-pressed="${l.id === live?.id}">${esc(l.name)}</button>`).join('')}</div>
      <p class="rg-label">Mettre en grand</p>
      ${P.length ? `<div class="pov-chips">${P.map(p => `<button type="button" class="chip ${S.pov.slots[0] === p.id ? 'on' : ''}" data-act="pov-main" data-id="${esc(p.id)}">${esc(p.pseudo)}</button>`).join('')}</div>`
        : empty('pov', 'Aucun joueur', 'Crée tes joueurs pour les mettre en grand.', '<button type="button" class="btn" data-act="go" data-tab="players">Ajouter un joueur</button>')}
    </section>

    <section class="card">
      <div class="card-head"><h3 class="grow">Lower third</h3><span class="state-tag ${ltShown() ? 'on' : ''}" data-lt-note>${ltShown() ? 'Affiché à l’écran' : 'Masqué'}</span></div>
      <div class="row"><button type="button" class="btn" data-act="lt-show" title="Raccourci : Ctrl + Maj + L">Afficher</button><button type="button" class="btn ghost" data-act="lt-hide" title="Raccourci : Ctrl + Maj + L">Masquer</button>
        <span class="rg-lt">${esc(S.lowerthird.name || '—')}<small>${esc(S.lowerthird.title || '')}</small></span></div>
      ${P.length ? `<p class="rg-label">Remplir et afficher</p><div class="chips">${P.map((p, i) => `<button type="button" class="chip" data-act="lt-fill" data-i="${i}">${esc(p.pseudo)}</button>`).join('')}</div>` : ''}
    </section>

    <section class="card">
      <div class="card-head"><h3 class="grow">Comptes à rebours</h3>${goBtn('scenes', 'Scènes')}</div>
      <div class="rg-counts">${scenes.map(([k, n]) => `<div class="rg-count">
        <span class="rg-count-n">${n}</span><span class="count-live" data-count="${k}">--:--</span>
        <div class="row">${[5, 10].map(m => `<button type="button" class="btn deep" data-act="count" data-k="${k}" data-m="${m}">${m} min</button>`).join('')}
          <button type="button" class="btn ghost" data-act="count" data-k="${k}" data-m="1" data-add>+1</button>
          <button type="button" class="btn ghost sq" data-act="count" data-k="${k}" data-m="0" aria-label="Arrêter">■</button></div></div>`).join('')}</div>
    </section>

    <section class="card">
      <div class="card-head"><h3 class="grow">Score</h3>${toggle('Visible', 'scoreboard.visible')}</div>
      ${sb.mode === 'vs' ? `<div class="rg-vs">
          <div class="rg-team"><b>${esc(sb.vs.a || 'Équipe A')}</b>${stepBtns('scoreboard.vs.scoreA', 'Score A')}</div>
          <span class="rg-vs-sep">${esc(sb.vs.label || 'VS')}</span>
          <div class="rg-team"><b>${esc(sb.vs.b || 'Équipe B')}</b>${stepBtns('scoreboard.vs.scoreB', 'Score B')}</div></div>`
        : `<div class="rg-board">${stepBtns('scoreboard.game', 'Game en cours')}
          <ol class="rg-top">${[...sb.rows].sort((a, b) => b.points - a.points).slice(0, 3).map(r => `<li><span>${esc(r.name)}</span><b>${Number(r.points) || 0} pts</b></li>`).join('') || '<li class="note">Classement vide</li>'}</ol></div>`}
      <div class="row end">${goBtn('scoreboard', 'Tout le scoreboard')}</div>
    </section>

    <section class="card">
      <div class="card-head"><h3 class="grow">Bandeaux & alertes</h3></div>
      <div class="row" style="gap:22px" title="Raccourci : Ctrl + Maj + D">${toggle('Ticker visible', 'ticker.visible')}</div>
      <p class="rg-label">Alerte de test</p>
      <div class="chips">${[['follow', 'Follow'], ['sub', 'Sub'], ['gift', 'Gift sub'], ['bits', 'Bits'], ['raid', 'Raid'], ['don', 'Don']].map(([v, l]) => `<button type="button" class="chip" data-act="quick-alert" data-type="${v}">${l}</button>`).join('')}</div>
    </section>
    ${typeof rgPovrec === 'function' ? rgPovrec() : ''}
    ${typeof rgInfos === 'function' ? rgInfos() : ''}
  </div>
  <div class="sec-mini"><div class="kicker"><span class="claws"><i></i><i></i><i></i></span>Multivue</div>
    <p class="note">Clique sur une vignette pour l’ouvrir dans l’aperçu. Cadre violet : à l’antenne dans OBS.</p></div>`;
};

/* ---------- Multivue (vignettes persistantes, état relayé par l'admin) ---------- */
let mvKey = '';
const mvList = () => [
  ['Starting soon', '/scene/starting'], ['BRB', '/scene/brb'], ['Fin de stream', '/scene/ending'], ['Just chatting', '/scene/chatting'],
  ['POV', '/pov'], ['Casters', '/caster'], ['Lower third', '/lowerthird'], ['Scoreboard', '/scoreboard'],
  ['Ticker', '/ticker'], ['Roster', '/roster'], ...S.players.slice(0, 4).map(p => [p.pseudo, '/p/' + p.id])
];
const mvFrames = () => [...document.querySelectorAll('#mv iframe')];
function syncMv() {
  const mv = $('#mv');
  if (tab !== 'regie' || !S) { if (mvKey) { mv.innerHTML = ''; mvKey = ''; } mv.hidden = true; return; }
  mv.hidden = false;
  const list = mvList(), key = JSON.stringify(list);
  if (key !== mvKey) {
    mvKey = key;
    mv.innerHTML = list.map(([n, p]) => `<div class="mv-tile" role="button" tabindex="0" aria-label="Aperçu : ${esc(n)}" data-act="preview" data-path="${esc(p)}">
      <span class="mv-screen"><iframe src="${esc(p)}${p.includes('?') ? '&' : '?'}mv" tabindex="-1" title="" loading="lazy" scrolling="no"></iframe></span>
      <span class="mv-foot"><span class="mv-name">${esc(n)}</span><span class="mv-tag"></span></span></div>`).join('');
    fitMv();
  }
  paintMv();
}
function paintMv() {
  document.querySelectorAll('#mv .mv-tile').forEach(t => {
    const p = t.dataset.path, lvl = srcLevel([p]);
    t.classList.toggle('air', lvl === 'air'); t.classList.toggle('sel', p === pvPath);
    t.querySelector('.mv-tag').textContent = lvl === 'air' ? 'À l’antenne' : lvl === 'obs' ? 'Dans OBS' : '';
  });
}
function fitMv() { document.querySelectorAll('#mv .mv-screen').forEach(s => { const f = s.firstElementChild; if (f) f.style.transform = `scale(${s.clientWidth / 1920})`; }); }
new ResizeObserver(fitMv).observe($('#mv'));
addEventListener('message', e => {
  if (e.origin !== location.origin || !e.data?.kxReady || !KX.state) return;
  e.source?.postMessage({ kx: 'state', data: KX.state }, location.origin);
});
KX.on('state', st => mvFrames().forEach(f => f.contentWindow?.postMessage({ kx: 'state', data: st }, location.origin)));

window.afterRender = () => { paintNav(); syncMv(); };
{ const sp = setPreview; setPreview = p => { sp(p); paintMv(); }; }

/* ---------- Actions ajoutées ---------- */
Object.assign(ACTIONS, {
  go: d => go(d.tab),
  palette: () => openPalette(),
  'pv-toggle': () => { document.documentElement.classList.toggle('pv-open'); setTimeout(fitPreview, 30); }
});

/* ---------- Palette de commandes (Ctrl+K) ---------- */
const norm = s => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
function commands() {
  const C = [], add = (group, label, run, hint = '') => C.push({ group, label, run, hint });
  const tabName = b => b.querySelector('.lab')?.textContent || b.dataset.tab;
  [...document.querySelectorAll('#nav button')].forEach((b, i) => add('Aller à', tabName(b), () => go(b.dataset.tab), i < 9 ? 'Alt ' + (i + 1) : ''));
  add('Action', 'Lancer le stinger', () => ACTIONS.stinger(), 'Ctrl Maj S');
  add('Action', 'Animation logo des POV', () => ACTIONS['pov-sting'](), 'Ctrl Maj P');
  add('Action', 'Afficher le lower third', () => ACTIONS['lt-show'](), 'Ctrl Maj L');
  add('Action', 'Masquer le lower third', () => ACTIONS['lt-hide'](), 'Ctrl Maj L');
  const flip = (label, path, hint = '') => add('Action', (getP(path) ? 'Masquer ' : 'Afficher ') + label, () => { setP(path, !getP(path)); save(true); renderTab(); toast(label[0].toUpperCase() + label.slice(1) + (getP(path) ? ' affiché' : ' masqué')); }, hint);
  flip('le ticker', 'ticker.visible', 'Ctrl Maj D'); flip('le scoreboard', 'scoreboard.visible', 'Ctrl Maj B'); flip('les POV', 'pov.visible');
  for (const [k, n] of [['starting', 'Starting soon'], ['brb', 'BRB'], ['ending', 'Fin de stream']]) {
    for (const m of [5, 10]) add('Compte à rebours', `${n} : ${m} min`, () => ACTIONS.count({ k, m }));
    add('Compte à rebours', `${n} : arrêter`, () => ACTIONS.count({ k, m: 0 }));
  }
  S.players.forEach((p, i) => {
    add('POV', 'Mettre en grand : ' + p.pseudo, () => { ACTIONS['pov-main']({ id: p.id }); toast(p.pseudo + ' en grand'); });
    add('Lower third', 'Lower third : ' + p.pseudo, () => ACTIONS['lt-fill']({ i }));
  });
  S.pov.layouts.forEach(l => add('POV', 'Mise en page : ' + l.name, () => ACTIONS['pov-live']({ id: l.id })));
  for (const [v, l] of [['follow', 'Follow'], ['sub', 'Sub'], ['gift', 'Gift sub'], ['bits', 'Bits'], ['raid', 'Raid'], ['don', 'Don']])
    add('Alerte de test', l, () => ACTIONS['quick-alert']({ type: v }));
  for (const [p, n] of Object.entries(NAMES)) add('Copier l’URL', n, () => copy(p));
  add('Application', 'Rechercher une mise à jour', () => { go('settings'); ACTIONS['upd-check'](); });
  return C;
}
function openPalette() {
  if ($('.pal') || $('.login')) return;
  const box = document.createElement('div');
  box.className = 'pal'; box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true'); box.setAttribute('aria-label', 'Rechercher une action');
  box.innerHTML = `<div class="pal-card"><label class="pal-in"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/></svg>
    <input type="text" placeholder="Stinger, BRB 5 min, mettre en grand…" autocomplete="off" spellcheck="false" role="combobox" aria-expanded="true" aria-controls="palList"><kbd>Échap</kbd></label>
    <ul class="pal-list" id="palList" role="listbox"></ul><p class="pal-foot"><kbd>↑</kbd><kbd>↓</kbd> choisir · <kbd>Entrée</kbd> lancer · <kbd>Alt</kbd>+<kbd>1</kbd>…<kbd>9</kbd> onglets</p></div>`;
  document.body.appendChild(box);
  const input = box.querySelector('input'), ul = box.querySelector('ul');
  const all = commands(); let shown = [], at = 0;
  const close = () => { box.classList.add('out'); setTimeout(() => box.remove(), 160); };
  const draw = () => {
    const q = norm(input.value).split(/\s+/).filter(Boolean);
    shown = all.filter(c => { const t = norm(c.group + ' ' + c.label); return q.every(w => t.includes(w)); }).slice(0, 60);
    at = Math.min(at, Math.max(0, shown.length - 1));
    let g = '';
    ul.innerHTML = shown.map((c, i) => (c.group !== g ? `<li class="pal-g" role="presentation">${esc(g = c.group)}</li>` : '') +
      `<li role="option" id="pal-${i}" data-i="${i}" class="${i === at ? 'on' : ''}" aria-selected="${i === at}"><span>${esc(c.label)}</span>${c.hint ? `<kbd>${esc(c.hint)}</kbd>` : ''}</li>`).join('')
      || '<li class="pal-none">Aucune action ne correspond</li>';
    input.setAttribute('aria-activedescendant', shown.length ? 'pal-' + at : '');
    ul.querySelector('li.on')?.scrollIntoView({ block: 'nearest' });
  };
  const run = i => { const c = shown[i]; if (!c) return; close(); c.run(); };
  input.addEventListener('input', () => { at = 0; draw(); });
  input.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown') { e.preventDefault(); at = (at + 1) % Math.max(1, shown.length); draw(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); at = (at - 1 + shown.length) % Math.max(1, shown.length); draw(); }
    else if (e.key === 'Enter') { e.preventDefault(); run(at); }
    else if (e.key === 'Escape') { e.preventDefault(); close(); }
  });
  ul.addEventListener('mousemove', e => { const li = e.target.closest('li[data-i]'); if (li && +li.dataset.i !== at) { at = +li.dataset.i; draw(); } });
  ul.addEventListener('click', e => { const li = e.target.closest('li[data-i]'); if (li) run(+li.dataset.i); });
  box.addEventListener('mousedown', e => { if (e.target === box) close(); });
  draw(); input.focus();
}
document.addEventListener('keydown', e => {
  if ((e.key === 'Enter' || e.key === ' ') && e.target.matches?.('.mv-tile')) { e.preventDefault(); e.target.click(); return; }
  if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'k') { e.preventDefault(); $('.pal') ? $('.pal input').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })) : openPalette(); return; }
  if (e.altKey && !e.ctrlKey && /^[1-9]$/.test(e.key) && !$('.login')) {
    const b = document.querySelectorAll('#nav button')[+e.key - 1]; if (b) { e.preventDefault(); go(b.dataset.tab); }
  }
});

/* ---------- Effet « onde » au clic sur les boutons ---------- */
document.addEventListener('pointerdown', e => {
  const b = e.target.closest('.btn, .chip, #nav button, .mv-tile, .kbar');
  if (!b || b.disabled || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const r = b.getBoundingClientRect(), s = Math.max(r.width, r.height) * 2.2;
  const w = document.createElement('span'); w.className = 'rip';
  w.style.cssText = `width:${s}px;height:${s}px;left:${e.clientX - r.left - s / 2}px;top:${e.clientY - r.top - s / 2}px`;
  b.appendChild(w); w.addEventListener('animationend', () => w.remove());
});
