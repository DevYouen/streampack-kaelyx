/* Admin Kaelyx — onglet POV : pilotage en direct, éditeur de mises en page (glisser-déposer) et sources des joueurs.
   Chargé après admin.js : utilise S, save, renderTab, field, toggle, head, esc, toast, setPreview… */
let povEdit = null;   // id de la mise en page ouverte dans l'éditeur
let povSel = null;    // id de l'élément sélectionné
let povDrag = null;   // glissement en cours (bloque les re-rendus pendant le geste)

const POV_KINDS = { pov: 'POV', plate: 'Plaque', cam: 'Cam', logo: 'Logo' };
const POV_NEW = { pov: [480, 270], plate: [480, 56], cam: [400, 225], logo: [96, 96] };
const povUid = p => p + Math.random().toString(36).slice(2, 8);
const povLayouts = () => S.pov.layouts;
const povLi = () => Math.max(0, povLayouts().findIndex(l => l.id === povEdit));
const povLayout = () => povLayouts()[povLi()];
const povLive = () => povLayouts().find(l => l.id === S.pov.live) || povLayouts()[0];
const povSlotCount = l => Math.max(1, ...(l?.items || []).filter(i => i.kind === 'pov').map(i => i.slot + 1));
const povPlayer = slot => S.players.find(p => p.id === S.pov.slots[slot]);
function povLabel(i) {
  if (i.kind === 'cam' || i.kind === 'logo') return POV_KINDS[i.kind];
  const p = povPlayer(i.slot);
  return `${POV_KINDS[i.kind]} ${i.slot + 1}${p ? ' · ' + p.pseudo : ''}`;
}
const pct = (v, t) => (v / t * 100) + '%';
const povBox = i => `left:${pct(i.x, 1920)};top:${pct(i.y, 1080)};width:${pct(i.w, 1920)};height:${pct(i.h, 1080)}`;

TABS.pov = function () {
  if (!povLayouts().some(l => l.id === povEdit)) povEdit = S.pov.live;
  const live = povLive(), L = povLayout(), li = povLi();
  const slots = povSlotCount(live);
  const opts = [['', '— aucun —'], ...S.players.map(p => [p.id, p.pseudo])];
  const isLive = L.id === S.pov.live;
  const sel = L.items.find(i => i.id === povSel);
  const sj = sel ? L.items.indexOf(sel) : -1;

  return head('Joueurs en jeu', 'POV', 'Une seule source OBS : <b>' + esc(origin) + '/pov</b> (1920 × 1080). Clique sur un joueur pour le mettre en grand ; les autres passent sur les petites POV.') + `
  <div class="card"><div class="card-head"><h3 class="grow">En direct</h3>${toggle('Afficher les POV', 'pov.visible')}</div>
    <div class="pov-chips" role="group" aria-label="Mise en page en direct">${povLayouts().map(l =>
      `<button type="button" class="btn ${l.id === S.pov.live ? '' : 'ghost'}" data-act="pov-live" data-id="${esc(l.id)}" ${l.id === S.pov.live ? 'aria-pressed="true"' : 'aria-pressed="false"'}>${esc(l.name)}</button>`).join('')}</div>
    <p class="pov-sub">Mettre en grand (POV 1) :</p>
    <div class="pov-chips">${S.players.length ? S.players.map(p =>
      `<button type="button" class="btn ${S.pov.slots[0] === p.id ? '' : 'deep'}" data-act="pov-main" data-id="${esc(p.id)}">${esc(p.pseudo)}${S.pov.slots.indexOf(p.id) > 0 && S.pov.slots.indexOf(p.id) < slots ? ` <small>· POV ${S.pov.slots.indexOf(p.id) + 1}</small>` : ''}</button>`).join('')
      : ''}</div>
    ${S.players.length ? '' : empty('pov', 'Aucun joueur à mettre en grand', 'Les POV affichent les joueurs créés dans l’onglet Joueurs.', '<button type="button" class="btn" data-act="go" data-tab="players">Ajouter un joueur</button>')}
    ${S.players.length ? `<p class="pov-sub">Volume des POV :</p><div class="pov-vols">${S.players.map((p, i) => povVolRow(p, i)).join('')}</div>` : ''}
    <div class="grid" style="margin-top:16px">
      ${Array.from({ length: slots }, (_, s) => field(s ? `POV ${s + 1} (petite)` : 'POV 1 (principale)', `pov.slots.${s}`, { options: opts, rerender: true })).join('')}
      ${field('Son', 'pov.audio', { options: [['main', 'POV principale seulement'], ['none', 'Tout coupé'], ['all', 'Toutes les POV']] })}
      ${field('Transition entre mises en page', 'pov.transition', { options: [['logo', 'Logo Kaelyx (broadcast)'], ['sweep', 'Bande oblique'], ['fade', 'Fondu'], ['none', 'Aucune']] })}
    </div>
    <div class="row" style="margin-top:14px"><button type="button" class="btn deep" data-act="pov-sting">Jouer l’animation logo</button>
      <span class="pov-sub" style="margin:0">Par exemple avant un replay ou un moment fort.</span></div></div>

  <div class="card"><div class="card-head"><h3 class="grow">Éditeur de mise en page</h3>
      ${isLive ? '<span class="pov-live">● En direct : les changements sont visibles tout de suite</span>' : `<button type="button" class="btn" data-act="pov-live" data-id="${esc(L.id)}">Mettre en direct</button>`}</div>
    <div class="row pov-tools">
      <label class="field" style="min-width:200px"><span>Mise en page</span><select data-pov-edit>${povLayouts().map(l => `<option value="${esc(l.id)}" ${l.id === L.id ? 'selected' : ''}>${esc(l.name)}${l.id === S.pov.live ? ' (direct)' : ''}</option>`).join('')}</select></label>
      ${field('Nom', `pov.layouts.${li}.name`)}
      ${toggle('Fond animé', `pov.layouts.${li}.bg`)}
      <button type="button" class="btn ghost" data-act="pov-new">Nouvelle</button>
      <button type="button" class="btn ghost" data-act="pov-dup">Dupliquer</button>
      <button type="button" class="btn ghost danger" data-act="pov-del" ${povLayouts().length < 2 ? 'disabled' : ''}>Supprimer</button>
    </div>
    <div class="row pov-tools"><span class="pov-sub">Ajouter :</span>
      ${Object.entries(POV_KINDS).map(([k, n]) => `<button type="button" class="btn deep" data-act="pov-add" data-kind="${k}">+ ${n}</button>`).join('')}
    </div>
    <div class="pov-canvas" id="povCanvas" aria-label="Mise en page ${esc(L.name)} (1920 × 1080)">
      ${L.items.map((i, j) => `<div class="pov-item k-${i.kind} ${i.id === povSel ? 'sel' : ''}" data-j="${j}" data-id="${esc(i.id)}" tabindex="0" style="${povBox(i)}" aria-label="${esc(povLabel(i))}">
        <span>${esc(povLabel(i))}</span>${['nw', 'ne', 'sw', 'se'].map(c => `<i class="h ${c}" data-h="${c}"></i>`).join('')}</div>`).join('')}
    </div>
    <p class="pov-sub">Glisse pour déplacer, tire un coin pour redimensionner. Aimantation aux bords, au centre et aux autres éléments (<kbd>Alt</kbd> : sans aimant). Les POV, cams et logos gardent leurs proportions (<kbd>Maj</kbd> : libre). Flèches : 1 px (<kbd>Maj</kbd> : 10 px), <kbd>Suppr</kbd> : retirer.</p>
    ${sel ? `<div class="pov-props"><div class="grid">
      ${field('Type', `pov.layouts.${li}.items.${sj}.kind`, { options: Object.entries(POV_KINDS), rerender: true })}
      ${sel.kind === 'pov' || sel.kind === 'plate' ? field('Emplacement', `pov.layouts.${li}.items.${sj}.slot`, { options: Array.from({ length: 8 }, (_, s) => [s, `POV ${s + 1}${s ? '' : ' (principale)'}`]), rerender: true, num: true }) : ''}
      ${field('X', `pov.layouts.${li}.items.${sj}.x`, { num: true })}${field('Y', `pov.layouts.${li}.items.${sj}.y`, { num: true })}
      ${field('Largeur', `pov.layouts.${li}.items.${sj}.w`, { num: true, min: 16 })}${field('Hauteur', `pov.layouts.${li}.items.${sj}.h`, { num: true, min: 16 })}
    </div><div class="row" style="margin-top:14px">
      <button type="button" class="btn ghost" data-act="pov-z" data-d="1">Premier plan</button>
      <button type="button" class="btn ghost" data-act="pov-z" data-d="-1">Arrière-plan</button>
      <button type="button" class="btn ghost" data-act="pov-fit" data-f="full">Plein écran</button>
      <button type="button" class="btn ghost" data-act="pov-fit" data-f="center">Centrer</button>
      <button type="button" class="btn ghost danger" data-act="pov-rm">Retirer</button>
    </div></div>` : '<p class="pov-sub">Clique sur un élément pour régler sa position au pixel près.</p>'}
  </div>

  <div class="card"><div class="card-head"><h3>Sources des POV</h3></div>
    <ul class="pov-help">
      <li><b>Live Twitch</b> : le joueur streame comme d’habitude, rien à faire de son côté. Tu écris juste sa chaîne. Quelques secondes de décalage.</li>
      <li><b>Envoi direct</b> : le joueur ne streame pas. Il ouvre son lien personnel et sa POV arrive ici en direct, sans décalage. Envoie-lui le message avec le bouton.</li>
      <li><b>Source OBS</b> : tu places toi-même une capture dans OBS sous <code>/pov</code> (position indiquée dans l’aperçu).</li>
    </ul>
    ${S.players.length ? S.players.map((p, i) => `<div class="pov-src">
      <div class="grid">
        <div class="field"><span>Joueur</span><b class="pov-name">${esc(p.pseudo)}</b></div>
        ${field('Source', `players.${i}.povSource`, { options: [['twitch', 'Live Twitch'], ['vdo', 'Envoi direct (lien joueur)'], ['obs', 'Source OBS']], rerender: true })}
        ${p.povSource === 'twitch' ? field('Chaîne Twitch', `players.${i}.povChannel`, { ph: p.twitch || 'nom de la chaîne' }) : ''}
      </div>
      ${p.povSource === 'vdo' ? `<div class="pov-link"><code>${esc(povPushUrl(p))}</code>
        <div class="row"><button type="button" class="btn" data-act="pov-msg" data-i="${i}">Copier le message pour ${esc(p.pseudo)}</button>
        <button type="button" class="btn ghost" data-act="pov-link" data-i="${i}">Copier le lien seul</button>
        <button type="button" class="btn ghost" data-act="pov-reset" data-i="${i}">Nouveau lien</button></div></div>` : ''}
    </div>`).join('') : '<p class="pov-sub">Aucun joueur pour l’instant.</p>'}
  </div>`;
};

/* ---------- Volumes : un curseur par joueur, appliqué à sa POV quand elle est audible ---------- */
const POV_SVG = d => `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const POV_ICON_SOUND = POV_SVG('<path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"/>');
const POV_ICON_MUTE = POV_SVG('<path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M17 9l5 6M22 9l-5 6"/>');
function povAudible(p) {
  const at = S.pov.slots.indexOf(p.id);
  if (at < 0 || at >= povSlotCount(povLive()) || S.pov.audio === 'none' || p.povMute || !p.povVolume) return false;
  return S.pov.audio === 'all' || at === 0;
}
function povVolRow(p, i) {
  const v = Number(p.povVolume ?? 100), on = povAudible(p);
  return `<div class="pov-vol ${p.povMute ? 'muted' : ''}">
    <b class="pov-vol-name">${esc(p.pseudo)}</b>
    <span class="pov-vol-state ${on ? 'on' : ''}">${on ? 'en écoute' : p.povMute ? 'coupé' : 'muet ici'}</span>
    <button type="button" class="btn ghost sq" data-act="pov-mute" data-i="${i}" aria-pressed="${p.povMute ? 'true' : 'false'}" aria-label="${p.povMute ? 'Remettre le son de' : 'Couper le son de'} ${esc(p.pseudo)}">${p.povMute ? POV_ICON_MUTE : POV_ICON_SOUND}</button>
    <input type="range" min="0" max="100" step="1" value="${v}" data-b="players.${i}.povVolume" data-num aria-label="Volume de ${esc(p.pseudo)}" style="--v:${v}%">
    <output class="pov-vol-val">${v} %</output>
  </div>`;
}
// Le pourcentage et le remplissage du curseur suivent la souris (l'enregistrement passe par le gestionnaire commun data-b)
document.addEventListener('input', e => {
  const r = e.target.closest?.('.pov-vol input[type=range]'); if (!r) return;
  r.style.setProperty('--v', r.value + '%');
  const out = r.parentElement.querySelector('.pov-vol-val'); if (out) out.textContent = r.value + ' %';
});

/* ---------- Envoi direct (VDO.Ninja) : lien et message pour le joueur ---------- */
const povPushUrl = (p, screen) => `https://vdo.ninja/?push=${encodeURIComponent(p.povVdo)}&${screen ? 'screenshare' : 'webcam'}&quality=0&label=${encodeURIComponent(p.pseudo)}`;
function povMessage(p) {
  return `Salut ${p.pseudo} ! Pour envoyer ta POV au cast Kaelyx :
1. Dans OBS ou Streamlabs, clique sur « Démarrer la caméra virtuelle ».
2. Ouvre ce lien dans Chrome : ${povPushUrl(p)}
3. Choisis la caméra virtuelle (OBS Virtual Camera), puis clique sur « Start ». Laisse l'onglet ouvert pendant tout le match.

Pas d'OBS ni de Streamlabs ? Ouvre plutôt ce lien et partage ton écran de jeu : ${povPushUrl(p, true)}
Ne partage ce lien avec personne d'autre.`;
}
async function povCopy(text, msg) {
  try { await navigator.clipboard.writeText(text); }
  catch { const t = document.createElement('textarea'); t.value = text; document.body.appendChild(t); t.select(); document.execCommand('copy'); t.remove(); }
  toast(msg);
}

// Met à jour le canevas sans tout re-rendre (saisie au clavier, glissement)
function povSync() {
  const L = povLayout(), c = document.getElementById('povCanvas');
  if (!c || !L) return;
  c.querySelectorAll('.pov-item').forEach(el => {
    const i = L.items[+el.dataset.j]; if (!i) return;
    el.setAttribute('style', povBox(i));
    el.querySelector('span').textContent = povLabel(i);
  });
}
function povSyncProps() {
  const L = povLayout(), sel = L.items.find(i => i.id === povSel); if (!sel) return;
  const j = L.items.indexOf(sel), base = `pov.layouts.${povLi()}.items.${j}.`;
  for (const k of ['x', 'y', 'w', 'h']) { const el = document.querySelector(`[data-b="${base + k}"]`); if (el && el !== document.activeElement) el.value = sel[k]; }
}

/* ---------- Glisser-déposer ---------- */
const SNAP = 14; // px du 1920 × 1080
function povSnapTargets(L, skip) {
  const xs = [0, 960, 1920], ys = [0, 540, 1080];
  for (const i of L.items) if (i !== skip) { xs.push(i.x, i.x + i.w / 2, i.x + i.w); ys.push(i.y, i.y + i.h / 2, i.y + i.h); }
  return { xs, ys };
}
// Décalage à appliquer pour aimanter l'un des bords proposés (edges) sur une cible
function povSnap(edges, targets) {
  let best = null;
  for (const e of edges) for (const t of targets) { const d = t - e; if (Math.abs(d) <= SNAP && (best === null || Math.abs(d) < Math.abs(best))) best = d; }
  return best || 0;
}

document.addEventListener('pointerdown', e => {
  const el = e.target.closest('.pov-item'); if (!el || e.button !== 0) return;
  const L = povLayout(), i = L.items[+el.dataset.j]; if (!i) return;
  e.preventDefault();
  const canvas = document.getElementById('povCanvas');
  const mode = e.target.dataset.h || 'move';
  // Déplacer une POV emmène les plaques de son emplacement qui la touchent (et inversement pour l'aimantation)
  const touch = (a, b) => a.x <= b.x + b.w + 4 && b.x <= a.x + a.w + 4 && a.y <= b.y + b.h + 4 && b.y <= a.y + a.h + 4;
  const followers = mode === 'move' && i.kind === 'pov' && !(i.w >= 1920 && i.h >= 1080)
    ? L.items.filter(o => o !== i && o.kind === 'plate' && o.slot === i.slot && touch(o, i)).map(o => ({ o, x: o.x, y: o.y })) : [];
  const skip = new Set([i, ...followers.map(f => f.o)]);
  povDrag = { el, i, mode, sx: e.clientX, sy: e.clientY, k: canvas.clientWidth / 1920, start: { ...i }, moved: false, followers,
    targets: povSnapTargets({ items: L.items.filter(o => !skip.has(o)) }, null) };
  try { el.setPointerCapture(e.pointerId); } catch {}
  if (povSel !== i.id) { povSel = i.id; document.querySelectorAll('.pov-item.sel').forEach(n => n.classList.remove('sel')); el.classList.add('sel'); }
  el.focus({ preventScroll: true });
});
document.addEventListener('pointermove', e => {
  const d = povDrag; if (!d) return;
  const dx = (e.clientX - d.sx) / d.k, dy = (e.clientY - d.sy) / d.k;
  if (!d.moved && Math.abs(dx) + Math.abs(dy) < 3) return;
  d.moved = true;
  const s = d.start, i = d.i, free = e.altKey, { xs, ys } = d.targets;
  if (d.mode === 'move') {
    let x = s.x + dx, y = s.y + dy;
    if (!free) { x += povSnap([x, x + s.w / 2, x + s.w], xs); y += povSnap([y, y + s.h / 2, y + s.h], ys); }
    i.x = Math.round(x); i.y = Math.round(y);
    for (const f of d.followers) { f.o.x = f.x + i.x - s.x; f.o.y = f.y + i.y - s.y; }
  } else {
    const west = d.mode.includes('w'), north = d.mode.includes('n');
    let x1 = s.x, y1 = s.y, x2 = s.x + s.w, y2 = s.y + s.h;
    if (west) x1 += dx; else x2 += dx;
    if (north) y1 += dy; else y2 += dy;
    if (!free) {
      if (west) x1 += povSnap([x1], xs); else x2 += povSnap([x2], xs);
      if (north) y1 += povSnap([y1], ys); else y2 += povSnap([y2], ys);
    }
    let w = Math.max(16, x2 - x1), h = Math.max(16, y2 - y1);
    if (i.kind !== 'plate' && !e.shiftKey) { const r = s.w / s.h; if (Math.abs(dx) >= Math.abs(dy)) h = w / r; else w = h * r; }
    i.w = Math.round(w); i.h = Math.round(h);
    i.x = Math.round(west ? s.x + s.w - w : s.x); i.y = Math.round(north ? s.y + s.h - h : s.y);
  }
  povSync(); povSyncProps();
  save(250); // l'aperçu suit pendant le geste
});
document.addEventListener('pointerup', () => {
  const d = povDrag; if (!d) return;
  povDrag = null;
  if (d.moved) save(true);
  renderTab(); // met à jour le panneau de réglages
  document.querySelector(`.pov-item[data-id="${CSS.escape(d.i.id)}"]`)?.focus({ preventScroll: true });
});

document.addEventListener('keydown', e => {
  const el = e.target.closest?.('.pov-item'); if (!el) return;
  const L = povLayout(), i = L.items[+el.dataset.j]; if (!i) return;
  const step = e.shiftKey ? 10 : 1;
  const mv = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
  if (mv) { e.preventDefault(); i.x += mv[0]; i.y += mv[1]; povSel = i.id; povSync(); povSyncProps(); save(); return; }
  if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); ACTIONS['pov-rm'](); }
  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); povSel = i.id; renderTab(); document.querySelector(`.pov-item[data-id="${CSS.escape(i.id)}"]`)?.focus(); }
});

// Saisie dans les champs X/Y/Largeur/Hauteur/Nom : le canevas suit sans re-rendu (le champ garde le focus)
document.addEventListener('input', e => { if (e.target.dataset?.b?.startsWith('pov.layouts.')) povSync(); });
document.addEventListener('change', e => {
  if (!e.target.matches('[data-pov-edit]')) return;
  povEdit = e.target.value; povSel = null; renderTab();
  setPreview(povEdit === S.pov.live ? '/pov' : '/pov?layout=' + encodeURIComponent(povEdit));
});

/* ---------- Actions ---------- */
Object.assign(ACTIONS, {
  'pov-mute': d => { const p = S.players[+d.i]; if (!p) return; p.povMute = !p.povMute; save(true); renderTab(); },
  'pov-sting': () => { trigger({ kind: 'pov-sting' }); setPreview('/pov'); },
  'pov-msg': d => { const p = S.players[+d.i]; if (p) povCopy(povMessage(p), `Message copié : colle-le à ${p.pseudo} (Discord…)`); },
  'pov-link': d => { const p = S.players[+d.i]; if (p) povCopy(povPushUrl(p), 'Lien copié'); },
  'pov-reset': d => {
    const p = S.players[+d.i]; if (!p) return;
    if (!confirm(`Créer un nouveau lien pour ${p.pseudo} ? L'ancien ne marchera plus : il faudra lui renvoyer le message.`)) return;
    p.povVdo = ''; save(true); // le serveur génère un nouvel identifiant
    setTimeout(renderTab, 600);
  },
  'pov-live': d => { S.pov.live = d.id; povEdit = d.id; save(true); renderTab(); setPreview('/pov'); toast('Mise en page en direct : ' + (povLive()?.name || '')); },
  'pov-main': d => {
    const s = S.pov.slots, at = s.indexOf(d.id);
    if (at === 0) return;
    if (at > 0) [s[0], s[at]] = [s[at], s[0]];       // échange avec la POV principale
    else { s.unshift(d.id); s.length = Math.min(s.length, 8); } // l'ancienne principale passe en POV 2
    save(true); renderTab();
  },
  'pov-new': () => {
    const id = povUid('l');
    povLayouts().push({ id, name: 'Nouvelle mise en page', items: [{ id: povUid('i'), kind: 'pov', slot: 0, x: 0, y: 0, w: 1920, h: 1080 }] });
    povEdit = id; povSel = null; save(true); renderTab(); setPreview('/pov?layout=' + id);
  },
  'pov-dup': () => {
    const L = povLayout(), id = povUid('l');
    povLayouts().push({ id, name: L.name + ' (copie)', items: L.items.map(i => ({ ...i, id: povUid('i') })) });
    povEdit = id; povSel = null; save(true); renderTab(); setPreview('/pov?layout=' + id);
  },
  'pov-del': () => {
    const L = povLayout(); if (povLayouts().length < 2) return;
    const prev = clone(S.pov);
    S.pov.layouts = povLayouts().filter(l => l !== L);
    if (S.pov.live === L.id) S.pov.live = S.pov.layouts[0].id;
    povEdit = S.pov.live; povSel = null; save(true); renderTab(); setPreview('/pov');
    toast(`« ${L.name} » supprimée`, () => { S.pov = prev; });
  },
  'pov-add': d => {
    const L = povLayout(), [w, h] = POV_NEW[d.kind];
    const slot = d.kind === 'pov' ? povSlotCount(L) - (L.items.some(i => i.kind === 'pov') ? 0 : 1) : 0;
    const i = { id: povUid('i'), kind: d.kind, slot: Math.min(slot, 7), x: Math.round((1920 - w) / 2), y: Math.round((1080 - h) / 2), w, h };
    L.items.push(i); povSel = i.id; save(true); renderTab();
  },
  'pov-rm': () => {
    const L = povLayout(), at = L.items.findIndex(i => i.id === povSel); if (at < 0) return;
    const [gone] = L.items.splice(at, 1); povSel = null; save(true); renderTab();
    toast(`${POV_KINDS[gone.kind]} retiré`, () => { L.items.splice(at, 0, gone); });
  },
  'pov-z': d => {
    const L = povLayout(), at = L.items.findIndex(i => i.id === povSel); if (at < 0) return;
    const [i] = L.items.splice(at, 1);
    if (+d.d > 0) L.items.push(i); else L.items.unshift(i);
    save(true); renderTab();
  },
  'pov-fit': d => {
    const i = povLayout().items.find(x => x.id === povSel); if (!i) return;
    if (d.f === 'full') Object.assign(i, { x: 0, y: 0, w: 1920, h: 1080 });
    else Object.assign(i, { x: Math.round((1920 - i.w) / 2), y: Math.round((1080 - i.h) / 2) });
    save(true); renderTab();
  }
});
