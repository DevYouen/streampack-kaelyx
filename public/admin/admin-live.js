/* Admin Kaelyx — onglets « Interactif » (sondage, message du chat, joueur du match, replay OBS), « Tournoi » et « Check-list ».
   Chargé après admin-plus.js : utilise S, TABS, ACTIONS, field, toggle, head, esc, save, push, renderTab, toast, api… */

const runAction = async (name, arg) => { await push(); return api('/api/action', { name, arg }); }; // envoie d'abord les derniers réglages
KX.on('toast', t => { if (t?.error) toast(t.error); });

/* ---------- Chat en direct (pour choisir un message à mettre à l'écran) ---------- */
let chatMsgs = [];
fetch('/api/twitch').then(r => r.json()).then(d => { chatMsgs = (d.recent || []).slice(-30).reverse(); if (tab === 'live') paintChat(); }).catch(() => {});
KX.on('chat', m => { chatMsgs.unshift(m); chatMsgs.length = Math.min(chatMsgs.length, 30); if (tab === 'live') paintChat(); });
KX.on('chat-clear', c => { chatMsgs = chatMsgs.filter(m => !((c.id && m.id === c.id) || (c.login && m.login === c.login) || (!c.id && !c.login))); if (tab === 'live') paintChat(); });
const msgText = m => (m.parts || []).map(p => p.t).join('');
function paintChat() {
  const box = document.getElementById('chatList'); if (!box) return;
  box.innerHTML = chatMsgs.length ? chatMsgs.map((m, i) => `<div class="cm"><b style="color:${/^#[0-9a-f]{6}$/i.test(m.color) ? m.color : 'var(--kx-white)'}">${esc(m.user)}</b>
    <span>${esc(msgText(m))}</span><button type="button" class="btn ghost" data-act="pin-msg" data-i="${i}">À l’écran</button></div>`).join('')
    : `<p class="note">${S.settings.twitch?.channel ? 'Aucun message pour l’instant.' : 'Règle la chaîne dans l’onglet Twitch pour voir le chat ici.'}</p>`;
}

/* ---------- OBS (replay) ---------- */
let obsSt = null;
const loadObs = () => api('/api/obs').then(s => { obsSt = s; if (tab === 'live') renderSoon(); }).catch(() => {});
KX.on('obs', s => { obsSt = s; if (tab === 'live') renderSoon(); paintNav?.(); });
KX.on('open', loadObs); loadObs();
function obsPill() {
  const s = obsSt || { state: 'off' };
  const lab = { connected: 'OBS connecté', connecting: 'Connexion à OBS…', error: s.error || 'Erreur', off: 'Non connecté' }[s.state] || 'Non connecté';
  return `<span class="pill ${s.state === 'connected' ? 'ok' : s.state === 'error' ? 'err' : ''}"><i></i>${esc(lab)}</span>`;
}

TABS.live = function () {
  const po = S.poll, total = po.votes.reduce((a, b) => a + b, 0);
  const s = obsSt || {}, m = S.mvp;
  return head('Avec les viewers', 'Interactif', 'Sondage par le chat, message du chat à l’écran, joueur du match et replay instantané.') + `
  <div class="card ${pvPath === '/sondage' ? 'is-active' : ''}" data-reset="poll">
    <div class="card-head"><div class="grow"><h3>Sondage par le chat</h3><code>${esc(origin)}/sondage</code></div>
      ${toggle('Visible', 'poll.visible')}<button type="button" class="btn ghost" data-act="preview" data-path="/sondage">Aperçu</button></div>
    <div class="grid">${field('Question', 'poll.question', { wide: true, ph: 'Qui gagne la prochaine game ?' })}
      ${po.options.map((o, i) => `<label class="field"><span>Choix ${i + 1} · les viewers tapent « ${i + 1} »</span><span class="up-row"><input type="text" data-b="poll.options.${i}" value="${esc(o)}" placeholder="Réponse ${i + 1}">${po.options.length > 2 ? `<button type="button" class="btn ghost sq danger" data-act="poll-rm" data-i="${i}" aria-label="Retirer le choix ${i + 1}">×</button>` : ''}</span></label>`).join('')}
      ${field('Durée (secondes, 0 = sans limite)', 'poll.duration', { num: true, min: 0 })}</div>
    <div class="row" style="margin-top:14px">
      ${po.open ? '<button type="button" class="btn big" data-act="poll-stop">Arrêter le vote</button>' : '<button type="button" class="btn big" data-act="poll-start">Lancer le vote</button>'}
      ${po.options.length < 4 ? '<button type="button" class="btn ghost" data-act="poll-add">Ajouter un choix</button>' : ''}
      <span class="state-tag ${po.open ? 'on' : ''}">${po.open ? 'Vote ouvert' : total ? 'Terminé' : 'Prêt'}</span><span class="note">${total} vote${total > 1 ? 's' : ''} · un vote par compte</span></div>
    <div class="poll-res">${po.options.map((o, i) => o ? `<div class="pr"><span>${i + 1}. ${esc(o)}</span><div class="goal-bar"><i style="width:${total ? po.votes[i] / total * 100 : 0}%"></i></div><b>${po.votes[i]}</b></div>` : '').join('')}</div>
  </div>

  <div class="card ${pvPath === '/message' ? 'is-active' : ''}" data-reset="chatpin">
    <div class="card-head"><div class="grow"><h3>Message du chat à l’écran</h3><code>${esc(origin)}/message</code></div>
      <button type="button" class="btn ghost" data-act="preview" data-path="/message">Aperçu</button>
      <button type="button" class="btn ghost" data-act="pin-hide" ${S.chatpin.visible ? '' : 'disabled'}>Masquer</button></div>
    <div class="grid">${field('Masquer après (secondes, 0 = jamais)', 'chatpin.hide', { num: true, min: 0 })}</div>
    <p class="note" style="margin:10px 0">Clique sur « À l’écran » à côté d’un message : il s’affiche joliment à l’antenne avec le pseudo.</p>
    <div class="chat-list" id="chatList"></div>
  </div>

  <div class="card ${pvPath === '/mvp' ? 'is-active' : ''}" data-reset="mvp">
    <div class="card-head"><div class="grow"><h3>Joueur du match</h3><code>${esc(origin)}/mvp</code></div>
      ${toggle('Visible', 'mvp.visible')}<button type="button" class="btn ghost" data-act="preview" data-path="/mvp">Aperçu</button></div>
    <div class="grid">${field('Joueur', 'mvp.player', { options: [['', '— choisir —'], ...S.players.map(p => [p.id, p.pseudo])] })}${field('Titre', 'mvp.title')}</div>
    <div class="grid" style="margin-top:12px">${m.stats.map((st, i) => `${field('Stat ' + (i + 1), `mvp.stats.${i}.label`, { ph: 'Élims' })}${field('Valeur', `mvp.stats.${i}.value`, { ph: '12' })}`).join('')}</div>
    <div class="row" style="margin-top:12px">${m.stats.length < 4 ? '<button type="button" class="btn ghost" data-act="mvp-add">Ajouter une stat</button>' : ''}
      ${m.stats.length ? '<button type="button" class="btn ghost" data-act="mvp-rm">Retirer la dernière stat</button>' : ''}</div>
  </div>

  <div class="card">
    <div class="card-head"><div class="grow"><h3>Replay instantané (OBS)</h3><code>Scène créée : Kaelyx · Replay</code></div>${obsPill()}</div>
    <div class="row" style="margin-bottom:14px">
      <button type="button" class="btn big" data-act="replay" ${s.state === 'connected' ? '' : 'disabled'} title="Ctrl + Alt + R">Replay</button>
      <button type="button" class="btn big deep" data-act="replay-slow" ${s.state === 'connected' ? '' : 'disabled'} title="Ctrl + Alt + Maj + R">Replay ralenti</button>
      ${s.replaying ? '<button type="button" class="btn big ghost" data-act="replay-stop">Revenir au live</button>' : ''}
      <span class="note">Tampon de relecture : <b>${s.replayBuffer === true ? 'démarré' : s.replayBuffer === false ? 'arrêté' : '—'}</b></span></div>
    <form data-form="obs" class="grid" autocomplete="off">
      <label class="field"><span>Adresse du WebSocket OBS</span><input type="text" name="url" value="${esc(s.url || 'ws://127.0.0.1:4455')}"></label>
      <label class="field"><span>Mot de passe ${s.hasPassword ? '(enregistré)' : ''}</span><input type="password" name="password" placeholder="${s.hasPassword ? 'inchangé' : 'Mot de passe du serveur WebSocket'}"></label>
      <label class="switch"><input type="checkbox" name="enabled" ${s.enabled ? 'checked' : ''}><span class="tr"></span><span>Se connecter à OBS</span></label>
      <div class="row"><button type="submit" class="btn deep">Enregistrer</button><button type="button" class="btn ghost" data-act="obs-setup" ${s.state === 'connected' ? '' : 'disabled'}>Préparer OBS</button></div>
    </form>
    <ol class="steps" style="margin-top:14px">
      <li>OBS › <b>Outils › Paramètres du serveur WebSocket</b> : coche « Activer », copie le mot de passe ici, puis <b>Enregistrer</b>.</li>
      <li>OBS › <b>Paramètres › Sortie › Tampon de relecture</b> : coche « Activer » et règle la durée (30 s ou plus).</li>
      <li>Clique sur <b>Préparer OBS</b> : la scène « Kaelyx · Replay » est créée (vidéo + bandeau REPLAY) et le tampon démarre.</li>
      <li>Pendant le live : <b>Replay</b> (ou <kbd>Ctrl</kbd> + <kbd>Alt</kbd> + <kbd>R</kbd>) montre les dernières secondes, puis OBS revient tout seul à la scène d’avant.</li>
    </ol>
  </div>`;
};
DEFAULT_PV.live = () => '/sondage';
{ const ar = window.afterRender; window.afterRender = () => { ar?.(); if (tab === 'live') paintChat(); }; }
Object.assign(ACTIONS, {
  'poll-start': async () => { try { await runAction('poll-start'); toast('Vote lancé'); setPreview('/sondage'); } catch (e) { toast(e.message); } },
  'poll-stop': async () => { try { await runAction('poll-stop'); toast('Vote terminé'); } catch (e) { toast(e.message); } },
  'poll-add': () => { if (S.poll.options.length >= 4) return; S.poll.options.push(''); S.poll.votes.push(0); save(); renderTab(); },
  'poll-rm': d => { const i = +d.i; S.poll.options.splice(i, 1); S.poll.votes.splice(i, 1); save(true); renderTab(); },
  'pin-msg': d => {
    const m = chatMsgs[+d.i]; if (!m) return;
    S.chatpin = { ...S.chatpin, visible: true, user: m.user, color: m.color || '', badges: m.badges || [], parts: m.parts || [], at: Date.now() };
    save(true); setPreview('/message'); toast('Message de ' + m.user + ' à l’écran');
  },
  'pin-hide': () => { S.chatpin.visible = false; save(true); renderTab(); },
  'mvp-add': () => { if (S.mvp.stats.length < 4) S.mvp.stats.push({ label: '', value: '' }); save(); renderTab(); },
  'mvp-rm': () => { S.mvp.stats.pop(); save(true); renderTab(); },
  replay: async () => { try { await api('/api/obs/replay', { slow: false }); toast('Replay lancé'); } catch (e) { toast('Replay impossible : ' + e.message); } },
  'replay-slow': async () => { try { await api('/api/obs/replay', { slow: true }); toast('Replay ralenti lancé'); } catch (e) { toast('Replay impossible : ' + e.message); } },
  'replay-stop': async () => { try { await api('/api/obs/stop', {}); } catch (e) { toast(e.message); } },
  'obs-setup': async () => { try { await api('/api/obs/setup', {}); toast('OBS est prêt : scène « Kaelyx · Replay » créée'); loadObs(); } catch (e) { toast('Préparation impossible : ' + e.message); } }
});
document.addEventListener('submit', async e => {
  if (e.target.dataset?.form !== 'obs') return;
  const f = new FormData(e.target), body = { url: f.get('url'), enabled: f.get('enabled') === 'on' };
  if (f.get('password')) body.password = f.get('password');
  try { obsSt = await api('/api/obs/config', body); toast('Réglages OBS enregistrés'); renderTab(); } catch (err) { toast(err.message); }
});

/* ---------- Tournoi ---------- */
TABS.tournoi = function () {
  const b = S.bracket, rounds = KX.bracket(b);
  return head('Compétition', 'Tournoi', 'Arbre de tournoi : écris les équipes du premier tour, puis les scores. Les vainqueurs passent tout seuls au tour suivant.',
    `<div class="row"><button type="button" class="btn ghost" data-act="preview" data-path="/tournoi">Aperçu</button><button type="button" class="btn ghost" data-act="copy" data-path="/tournoi">Copier l’URL</button></div>`) + `
  <div class="card" data-reset="bracket"><div class="grid">${field('Titre', 'bracket.title')}${field('Nombre d’équipes', 'bracket.size', { options: [[4, '4 équipes'], [8, '8 équipes'], [16, '16 équipes']], num: true, rerender: true })}</div>
    <div class="row" style="margin-top:12px"><button type="button" class="btn ghost" data-act="br-reset">Effacer les scores</button></div></div>
  ${rounds.map((r, c) => `<div class="card"><div class="card-head"><h3>${esc(r.name)}</h3></div><div class="br-list">${r.matches.map(m => `<div class="br-m ${m.done ? 'done' : ''}">
    ${c === 0 ? `<input type="text" data-b="bracket.matches.${m.i}.a" value="${esc(m.a)}" placeholder="Équipe">` : `<b class="${m.a ? '' : 'tbd'}">${esc(m.a || 'Vainqueur précédent')}</b>`}
    <div class="stepper row"><button type="button" class="btn ghost sq" data-act="br-step" data-i="${m.i}" data-k="sa" data-d="-1" aria-label="Moins">−</button><b class="rg-num">${m.sa}</b><button type="button" class="btn sq" data-act="br-step" data-i="${m.i}" data-k="sa" data-d="1" aria-label="Plus">+</button></div>
    <span class="br-vs">VS</span>
    <div class="stepper row"><button type="button" class="btn ghost sq" data-act="br-step" data-i="${m.i}" data-k="sb" data-d="-1" aria-label="Moins">−</button><b class="rg-num">${m.sb}</b><button type="button" class="btn sq" data-act="br-step" data-i="${m.i}" data-k="sb" data-d="1" aria-label="Plus">+</button></div>
    ${c === 0 ? `<input type="text" data-b="bracket.matches.${m.i}.b" value="${esc(m.b)}" placeholder="Équipe">` : `<b class="${m.b ? '' : 'tbd'}">${esc(m.b || 'Vainqueur précédent')}</b>`}
    ${toggle('Terminé', `bracket.matches.${m.i}.done`, true)}</div>`).join('')}</div></div>`).join('')}`;
};
DEFAULT_PV.tournoi = () => '/tournoi';
Object.assign(ACTIONS, {
  'br-step': d => { const m = S.bracket.matches[+d.i]; m[d.k] = Math.max(0, (Number(m[d.k]) || 0) + +d.d); save(); renderTab(); },
  'br-reset': () => { if (!confirm('Effacer tous les scores du tournoi ?')) return; const old = clone(S.bracket.matches); S.bracket.matches.forEach(m => { m.sa = 0; m.sb = 0; m.done = false; }); save(true); renderTab(); toast('Scores effacés', () => { S.bracket.matches = old; }); }
});

/* ---------- Check-list avant le live ---------- */
let checkInfo = null;
const loadCheck = () => api('/api/checklist').then(d => { checkInfo = d; if (tab === 'check') renderSoon(); paintCheckBanner(); }).catch(() => {});
function checks() {
  const ci = checkInfo || {}, tw = ci.twitch || {}, ob = ci.obs || {}, L = [];
  const add = (lvl, title, detail, tabName, btn) => L.push({ lvl, title, detail, tabName, btn });
  add(ci.passwordChanged ? 'ok' : 'warn', 'Mot de passe de l’admin', ci.passwordChanged ? 'Personnalisé.' : 'C’est encore le mot de passe d’origine : change-le.', 'settings', 'Réglages');
  add(obsList.length ? 'ok' : 'warn', 'Overlays ouverts dans OBS', obsList.length ? `${obsList.length} source${obsList.length > 1 ? 's' : ''} connectée${obsList.length > 1 ? 's' : ''}.` : 'Aucun overlay n’est ouvert dans OBS (ou OBS est fermé).', 'guide', 'Guide');
  const has = p => obsList.some(s => s.path.startsWith(p));
  add(has('/alerts') ? 'ok' : 'info', 'Alertes dans OBS', has('/alerts') ? 'Source /alerts présente.' : 'Pas de source /alerts dans OBS : les alertes ne s’afficheront pas.', 'links', 'Liens OBS');
  add(!S.settings.twitch?.channel ? 'warn' : tw.chat === 'connected' ? 'ok' : 'warn', 'Chat Twitch', !S.settings.twitch?.channel ? 'Aucune chaîne réglée (chat, alertes, sondage).' : tw.chat === 'connected' ? 'Connecté à #' + (tw.channel || S.settings.twitch.channel) + '.' : 'Pas encore connecté (' + (tw.chatError || tw.chat || 'hors ligne') + ').', 'twitch', 'Twitch');
  add(tw.follows === 'connected' ? 'ok' : 'info', 'Alertes de follow', tw.follows === 'connected' ? 'Compte Twitch connecté.' : 'Optionnel : connecte un compte Twitch pour afficher les follows.', 'twitch', 'Twitch');
  add(S.players.length ? 'ok' : 'warn', 'Joueurs', S.players.length ? S.players.length + ' joueur' + (S.players.length > 1 ? 's' : '') + '.' : 'Aucun joueur créé.', 'players', 'Joueurs');
  const noPh = S.players.filter(p => !p.photo).map(p => p.pseudo);
  if (S.players.length) add(noPh.length ? 'info' : 'ok', 'Photos des joueurs', noPh.length ? 'Sans photo : ' + noPh.join(', ') + '.' : 'Tous les joueurs ont une photo.', 'players', 'Joueurs');
  const live = S.pov.layouts.find(l => l.id === S.pov.live), n = live ? Math.max(0, ...live.items.filter(i => i.kind === 'pov').map(i => i.slot + 1)) : 0;
  const povBad = S.pov.slots.slice(0, n).map(id => S.players.find(p => p.id === id)).filter(p => p && p.povSource === 'twitch' && !(p.povChannel || p.twitch)).map(p => p.pseudo);
  const povEmpty = Array.from({ length: n }, (_, i) => S.pov.slots[i]).filter(x => !x).length;
  add(povBad.length || povEmpty ? 'warn' : 'ok', 'POV', povBad.length ? 'Chaîne Twitch manquante : ' + povBad.join(', ') + '.' : povEmpty ? povEmpty + ' emplacement' + (povEmpty > 1 ? 's' : '') + ' sans joueur dans la mise en page en direct.' : 'Toutes les POV de la mise en page en direct ont une source.', 'pov', 'POV');
  add(ob.state === 'connected' ? (ob.replayBuffer ? 'ok' : 'warn') : 'info', 'Replay (OBS)', ob.state === 'connected' ? (ob.replayBuffer ? 'OBS connecté, tampon de relecture démarré.' : 'OBS connecté mais tampon de relecture arrêté : clique sur « Préparer OBS ».') : 'Optionnel : connecte OBS pour le replay instantané.', 'live', 'Interactif');
  add(upd.state === 'ready' ? 'warn' : 'ok', 'Application', upd.state === 'ready' ? 'Une mise à jour est prête : installe-la avant le live.' : 'Version ' + (upd.current || '') + ' à jour.', 'settings', 'Réglages');
  add('info', 'Transition stinger dans OBS', 'À vérifier dans OBS : transition Stinger avec kaelyx-stinger.webm, point de transition 1200 ms.', 'guide', 'Guide');
  return L;
}
TABS.check = function () {
  if (!checkInfo) loadCheck();
  const L = checks(), warn = L.filter(x => x.lvl === 'warn').length;
  const ico = { ok: '<path d="m5 12.5 4.5 4.5L19 7"/>', warn: '<path d="M12 7v6M12 17h.01"/>', info: '<path d="M12 11v6M12 7h.01"/>' };
  return head('Avant le live', 'Check-list', 'Tout ce qu’il faut vérifier avant de lancer le stream. Mis à jour en direct.',
    `<button type="button" class="btn ghost" data-act="check-refresh">Actualiser</button>`) + `
  <div class="card ck-sum ${warn ? 'warn' : 'ok'}"><b>${warn ? warn + ' point' + (warn > 1 ? 's' : '') + ' à vérifier' : 'Tout est prêt pour le live'}</b><span class="note">${L.filter(x => x.lvl === 'ok').length} / ${L.length} vérifications au vert</span></div>
  <div class="card"><div class="ck-list">${L.map(x => `<div class="ck ${x.lvl}"><i><svg viewBox="0 0 24 24" aria-hidden="true">${ico[x.lvl]}</svg></i>
    <div><b>${esc(x.title)}</b><span>${esc(x.detail)}</span></div><button type="button" class="btn ghost" data-act="go" data-tab="${x.tabName}">${esc(x.btn)}</button></div>`).join('')}</div></div>`;
};
DEFAULT_PV.check = () => pvPath || '/scene/starting';
ACTIONS['check-refresh'] = () => { checkInfo = null; loadCheck(); renderTab(); };
// Bandeau dans la Régie : nombre de points à vérifier
function paintCheckBanner() { if (tab === 'regie') renderSoon(); }
{ const r0 = TABS.regie; TABS.regie = () => {
  if (!checkInfo) loadCheck();
  const warn = checks().filter(x => x.lvl === 'warn').length;
  const banner = `<button type="button" class="ck-banner ${warn ? 'warn' : 'ok'}" data-act="go" data-tab="check"><b>${warn ? 'Check-list : ' + warn + ' point' + (warn > 1 ? 's' : '') + ' à vérifier avant le live' : 'Check-list : tout est prêt'}</b><span>Voir →</span></button>`;
  return r0().replace('<div class="rg">', banner + '<div class="rg">');
}; }
KX.on('twitch', () => { if (checkInfo) loadCheck(); });
KX.on('presence', () => { if (tab === 'check') renderSoon(); });
