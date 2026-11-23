/* ---------- Replay des POV (application de bureau) ----------
   L'application garde en continu les dernières secondes de chaque POV ; ici : boutons de la Régie, réglages (Interactif),
   état en direct, palette Ctrl+K, Stream Deck et check-list. */
let prs = { supported: false, list: [], playing: null, busy: null };
let prsIds = '';
const prsLoad = () => fetch('/api/povrec').then(r => r.json()).then(onPrs).catch(() => {});
KX.on('open', prsLoad);
KX.on('povrec', onPrs);
function onPrs(d) {
  prs = d || prs;
  const ids = JSON.stringify([prs.supported, prs.list.map(x => [x.id, x.state, x.seconds >= 2, x.seconds >= ((S && S.povrec && S.povrec.seconds) || 30), x.error]), !!prs.playing, prs.busy]);
  // Nouvelle POV enregistrée, ou état qui change : on redessine ; sinon on met juste à jour les secondes
  if (!S) return; // admin pas encore connecté : l'état sera affiché au premier rendu
  if (ids !== prsIds) { prsIds = ids; if (tab === 'regie' || tab === 'live') renderSoon(); return; }
  paintPrs();
}
function paintPrs() {
  for (const x of prs.list) document.querySelectorAll(`[data-prs="${CSS.escape(x.id)}"]`).forEach(el => {
    el.textContent = x.state === 'rec' ? x.seconds + ' s' : x.state === 'error' ? 'erreur' : '…';
  });
}
const prsLabel = x => x.state === 'rec' ? (x.seconds >= (S.povrec.seconds || 30) ? 'Prêt' : 'Remplissage') : x.state === 'error' ? 'Erreur' : 'Démarrage';
const prsPill = () => {
  if (!prs.supported) return '<span class="pill"><i></i>Application de bureau</span>';
  if (!S.povrec.enabled) return '<span class="pill"><i></i>Désactivé</span>';
  const bad = prs.list.filter(x => x.state === 'error').length, n = prs.list.filter(x => x.state === 'rec').length;
  return `<span class="pill ${bad ? 'err' : n ? 'ok' : ''}"><i></i>${bad ? bad + ' en erreur' : n ? 'Enregistre ' + n + ' POV' : 'En attente de POV'}</span>`;
};

// Régie : un bouton par POV enregistrée
function rgPovrec() {
  const P = S.povrec, go = `<button type="button" class="link-btn" data-act="go" data-tab="live">Réglages →</button>`;
  let body;
  if (!prs.supported) body = '<p class="note">Disponible dans l’application de bureau : elle garde les dernières secondes de chaque POV pour les rejouer en un clic.</p>';
  else if (!P.enabled) body = `<p class="note">Garde en continu les ${P.seconds} dernières secondes de chaque POV, pour les rejouer en plein écran dans /pov.</p>
    <div class="row" style="margin-top:12px"><button type="button" class="btn" data-act="povrec-on">Activer le replay des POV</button></div>`;
  else if (!prs.list.length) body = '<p class="note">Aucune POV à enregistrer : place des joueurs (avec une chaîne Twitch ou VDO.Ninja) sur les POV de la mise en page en direct.</p>';
  else body = `<div class="rp-list">${prs.list.map(x => {
      const i = S.players.findIndex(p => p.id === x.id);
      const busy = prs.busy === x.id, playing = prs.playing && prs.playing.id === x.id;
      return `<button type="button" class="rp-btn ${x.state}${busy || playing ? ' live' : ''}" data-act="replay-pov" data-id="${esc(x.id)}" ${x.state !== 'rec' || x.seconds < 2 ? 'disabled' : ''}
        title="${esc(x.error || prsLabel(x))}${i >= 0 && i < 8 ? ' · Ctrl + Alt + Maj + F' + (i + 1) : ''}">
        <i class="rp-dot" aria-hidden="true"></i><b>${esc(x.pseudo)}</b><small data-prs="${esc(x.id)}">${x.state === 'rec' ? x.seconds + ' s' : x.state === 'error' ? 'erreur' : '…'}</small>
        <span class="rp-go">${busy ? 'Préparation…' : playing ? 'À l’écran' : 'Replay'}</span></button>`;
    }).join('')}</div>
    ${prs.list.some(x => x.state === 'error') ? `<p class="note" style="margin-top:8px">${prs.list.filter(x => x.error).map(x => esc(x.pseudo + ' : ' + x.error)).join('<br>')}</p>` : ''}
    <div class="row" style="margin-top:12px">${toggle('Ralenti', 'povrec.slow')}<button type="button" class="btn ghost" data-act="replay-pov-stop" ${prs.playing ? '' : 'disabled'}>Arrêter le replay</button></div>`;
  return `<section class="card"><div class="card-head"><h3 class="grow">Replay des POV</h3>${prsPill()}${go}</div>${body}</section>`;
}

// Interactif : réglages
function povrecCard() {
  const P = S.povrec;
  const rows = prs.list.map(x => `<div class="rp-row ${x.state}"><i class="rp-dot" aria-hidden="true"></i><b>${esc(x.pseudo)}</b>
    <span>${esc(prsLabel(x))}${x.state === 'rec' ? ` · <span data-prs="${esc(x.id)}">${x.seconds} s</span> · ${x.fps} img/s · ${x.audio ? 'son' : 'sans son'}` : ''}${x.error ? ' · ' + esc(x.error) : ''}</span></div>`).join('');
  return `<div class="card" data-reset="povrec">
    <div class="card-head"><div class="grow"><h3>Replay des POV</h3><code>Rejoué dans /pov</code></div>${prsPill()}</div>
    <p class="note" style="margin-bottom:14px">L’application garde en continu les dernières secondes de chaque POV, telle qu’elle s’affiche (lecteur Twitch ou VDO.Ninja). Un clic dans la Régie, <kbd>Ctrl</kbd> + <kbd>Alt</kbd> + <kbd>Maj</kbd> + <kbd>F1</kbd>…<kbd>F8</kbd> (joueur 1 à 8) ou le Stream Deck la rejoue en plein écran, entre deux transitions logo.</p>
    ${prs.supported ? '' : '<p class="note" style="margin-bottom:14px"><b>Disponible dans l’application de bureau seulement.</b></p>'}
    <div class="row" style="margin-bottom:14px">${toggle('Enregistrer les POV', 'povrec.enabled', true)}</div>
    <div class="grid">
      ${field('Durée du replay', 'povrec.seconds', { options: [[10, '10 secondes'], [15, '15 secondes'], [20, '20 secondes'], [30, '30 secondes'], [45, '45 secondes'], [60, '60 secondes']], num: true })}
      ${field('POV enregistrées', 'povrec.who', { options: [['slots', 'Les POV à l’écran'], ['all', 'Tous les joueurs (8 max)']], rerender: true })}
      ${field('Qualité', 'povrec.quality', { options: [['720', '720p (recommandé)'], ['1080', '1080p (plus lourd)']] })}
      ${field('Volume du replay (0 à 100)', 'povrec.volume', { num: true, min: 0 })}
    </div>
    <div class="row" style="margin-top:14px;gap:22px">${toggle('Son du replay', 'povrec.sound')}${toggle('Garder une copie de chaque replay (Documents › Streampack Kaelyx › replays)', 'povrec.save')}</div>
    ${P.enabled && prs.supported ? `<div class="rp-rows">${rows || '<p class="note">Aucune POV à enregistrer pour l’instant : place des joueurs sur les POV de la mise en page en direct.</p>'}</div>` : ''}
    <p class="note" style="margin-top:12px">Chaque POV enregistrée ouvre le live du joueur une deuxième fois en arrière-plan (son coupé sur ton PC) : compte 3 à 6 Mb/s de connexion et un peu de carte graphique par POV. « Les POV à l’écran » enregistre seulement les joueurs placés sur les POV : un joueur qui arrive sur une POV a besoin de quelques secondes avant d’avoir un replay complet.</p>
  </div>`;
}
{ const l0 = TABS.live; TABS.live = () => l0() + povrecCard(); }

Object.assign(ACTIONS, {
  'replay-pov': d => { runAction('replay-pov', d.id).catch(() => toast('Serveur injoignable')); },
  'replay-pov-stop': () => { runAction('replay-pov-stop').catch(() => {}); },
  'povrec-on': () => { S.povrec.enabled = true; save(true); renderTab(); toast('Replay des POV activé : quelques secondes avant le premier replay'); }
});

// Palette Ctrl+K
{ const c0 = commands; commands = () => {
  const C = c0();
  if (S.povrec.enabled) {
    prs.list.forEach(x => C.push({ group: 'Replay POV', label: 'Replay : ' + x.pseudo, run: () => ACTIONS['replay-pov']({ id: x.id }), hint: '' }));
    if (prs.playing) C.push({ group: 'Replay POV', label: 'Arrêter le replay', run: () => ACTIONS['replay-pov-stop'](), hint: '' });
  }
  return C;
}; }
