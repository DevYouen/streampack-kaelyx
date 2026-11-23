/* ---------- Réinitialiser un module ou une scène ----------
   Chaque carte de réglages qui porte data-reset="clé" reçoit un bouton « Réinitialiser » : il remet les valeurs d'origine
   (envoyées par le serveur, donc toujours les mêmes que celles de l'application), avec « Annuler » pendant 10 secondes. */
let DEF = null;
const loadDefaults = () => fetch('/api/defaults').then(r => r.json()).then(d => { DEF = d; }).catch(() => {});
loadDefaults();

const SCENE_NAMES = { starting: 'Starting soon', brb: 'BRB / pause', ending: 'Fin de stream', tech: 'Difficultés techniques', chatting: 'Just chatting' };
const pick = (src, keys) => Object.fromEntries(keys.map(k => [k, clone(src[k])]));
// Pour chaque clé : nom affiché, chemins touchés (pour « Annuler ») et remise à zéro
function resetSpec(key) {
  const D = DEF.state, [kind, arg] = key.split(':');
  const defAt = path => clone(path.split('.').reduce((o, k) => o?.[k], D));
  const whole = (name, path) => ({ name, paths: [path], run: () => setP(path, defAt(path)) });
  const part = (name, obj, keys) => ({ name, paths: keys.map(k => obj + '.' + k), run: () => keys.forEach(k => setP(obj + '.' + k, defAt(obj + '.' + k))) });
  switch (kind) {
    case 'scene': return whole('Scène « ' + (SCENE_NAMES[arg] || arg) + ' »', 'scenes.' + arg);
    case 'lowerthird': return whole('Lower third', 'lowerthird');
    case 'ticker': return whole('Ticker', 'ticker');
    case 'scoreboard': return whole('Scoreboard', 'scoreboard');
    case 'casters': return whole('Casters', 'casters');
    case 'camframe': return whole('Cadre webcam', 'camframe');
    case 'schedule': return whole('Programme', 'schedule');
    case 'sponsors': return whole('Sponsors', 'sponsors');
    case 'goal': return whole('Objectif', 'goal');
    case 'poll': return whole('Sondage', 'poll');
    case 'chatpin': return whole('Message du chat', 'chatpin');
    case 'mvp': return whole('Joueur du match', 'mvp');
    case 'bracket': return whole('Tournoi', 'bracket');
    case 'alerts': return part('Alertes', 'settings', ['alertDuration']);
    case 'chat': return part('Chat', 'settings.twitch', ['chatHide', 'ignore', 'hideCommands']);
    case 'twalerts': return whole('Alertes Twitch', 'settings.twitch.alerts');
    case 'team': return part('Équipe', 'settings', ['teamName', 'teamSub', 'logo', 'tagline', 'neon']);
    case 'socials': return whole('Réseaux', 'settings.socials');
    case 'player': {
      // Réglages d'affichage seulement : pseudo, photo, chaîne et source de la POV sont gardés
      const i = Number(arg), keys = ['role', 'camVisible', 'camPos', 'camSize', 'showTag', 'showTicker', 'showSocial', 'povVolume', 'povMute'];
      return { name: 'Joueur « ' + (S.players[i]?.pseudo || '') + ' »', paths: keys.map(k => `players.${i}.${k}`),
        run: () => { if (S.players[i]) Object.assign(S.players[i], pick(DEF.player, keys)); } };
    }
    case 'pov-live': return {
      name: 'POV en direct', paths: ['pov.visible', 'pov.audio', 'pov.transition', 'pov.slots', 'pov.live', 'players'],
      run: () => {
        Object.assign(S.pov, pick(D.pov, ['visible', 'audio', 'transition', 'slots']));
        if (S.pov.layouts.some(l => l.id === D.pov.live)) S.pov.live = D.pov.live;
        S.players.forEach(p => { p.povVolume = DEF.player.povVolume; p.povMute = DEF.player.povMute; }); // volumes de la même carte
      } };
    case 'pov-layouts': return {
      name: 'Mises en page POV', paths: ['pov.layouts', 'pov.live'],
      run: () => { S.pov.layouts = clone(D.pov.layouts); S.pov.live = D.pov.live; if (typeof povEdit !== 'undefined') povEdit = D.pov.live; } };
  }
  return null;
}

const RESET_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/></svg>';
function addResetBtns() {
  document.querySelectorAll('#view [data-reset]').forEach(card => {
    if (card.querySelector('[data-act="reset"]')) return;
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'reset-btn'; b.dataset.act = 'reset'; b.dataset.k = card.dataset.reset;
    b.title = 'Remettre les valeurs par défaut de ce module (annulable pendant 10 secondes)';
    b.innerHTML = RESET_ICON + '<span>Réinitialiser</span>';
    const slot = card.querySelector(':scope > [data-reset-slot]'); // emplacement choisi (ex. carte joueur, en-tête déjà plein)
    const head = card.querySelector(':scope > .card-head');
    const row = head ? head.querySelector(':scope > .row') : card.querySelector(':scope > .row');
    if (slot) { b.classList.add('push'); slot.append(b); }
    else if (head && row) row.prepend(b);
    else if (head) head.append(b);
    else if (row) { b.classList.add('push'); row.append(b); }
    else card.prepend(b);
  });
}
{ const ar = window.afterRender; window.afterRender = () => { ar?.(); addResetBtns(); }; }

ACTIONS.reset = async d => {
  if (!DEF) await loadDefaults();
  const spec = DEF && resetSpec(d.k);
  if (!spec) return toast('Valeurs par défaut indisponibles : relance l’application');
  const before = spec.paths.map(p => [p, clone(getP(p))]);
  spec.run();
  save(true); renderTab();
  toast(spec.name + ' : valeurs par défaut', () => before.forEach(([p, v]) => setP(p, v)));
};
