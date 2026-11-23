/* Admin Kaelyx — onglet Guide : mise en place dans OBS, toutes les URL, raccourcis clavier, dépannage.
   Chargé après admin-ui.js : utilise S, TABS, ACTIONS, head, esc, origin, copy, toast, trigger… */

/* ---------- Raccourcis « live » (en plus de Ctrl+K et Alt+1…9) ---------- */
const LIVE_KEYS = [
  { k: 's', label: 'Lancer le stinger', run: () => { ACTIONS.stinger(); toast('Stinger lancé'); } },
  { k: 'p', label: 'Animation logo des POV', run: () => { ACTIONS['pov-sting'](); toast('Animation logo lancée'); } },
  { k: 'l', label: 'Afficher / masquer le lower third', run: () => { ltShown() ? ACTIONS['lt-hide']() : ACTIONS['lt-show'](); toast(ltShown() ? 'Lower third affiché' : 'Lower third masqué'); } },
  { k: 'd', label: 'Afficher / masquer le ticker (bandeau défilant)', run: () => { S.ticker.visible = !S.ticker.visible; save(true); renderTab(); toast(S.ticker.visible ? 'Ticker affiché' : 'Ticker masqué'); } },
  { k: 'b', label: 'Afficher / masquer le scoreboard', run: () => { S.scoreboard.visible = !S.scoreboard.visible; save(true); renderTab(); toast(S.scoreboard.visible ? 'Scoreboard affiché' : 'Scoreboard masqué'); } }
];
document.addEventListener('keydown', e => {
  if (e.key === 'F1') { e.preventDefault(); go('guide'); return; }
  if (!(e.ctrlKey || e.metaKey) || !e.shiftKey || e.altKey || !S || $('.login') || $('.pal')) return;
  const hit = LIVE_KEYS.find(x => x.k === e.key.toLowerCase());
  if (hit) { e.preventDefault(); hit.run(); }
});
const keys = s => s.split('+').map(k => `<kbd>${esc(k.trim())}</kbd>`).join('<i class="plus">+</i>');

/* ---------- Petites briques de mise en page ---------- */
const G_ICONS = {
  start: '<path d="M5 3l14 9-14 9z"/>',
  obs: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="7.5" r="2.2"/><circle cx="8" cy="14.5" r="2.2"/><circle cx="16" cy="14.5" r="2.2"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  scenes: '<rect x="3" y="4" width="18" height="13" rx="1"/><path d="M8 21h8M12 17v4"/>',
  dock: '<rect x="3" y="4" width="18" height="16" rx="1"/><path d="M15 4v16"/>',
  sting: '<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>',
  cam: '<rect x="2.5" y="6" width="13" height="12" rx="1"/><path d="m15.5 10 6-3.5v11l-6-3.5"/>',
  pov: '<rect x="2.5" y="4" width="19" height="14" rx="1"/><rect x="12.5" y="6.5" width="7" height="5"/>',
  keys: '<rect x="2" y="6" width="20" height="12" rx="1.5"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10"/>',
  shield: '<path d="M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6z"/><path d="m9 12 2 2 4-4"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1 .9-1 1.7M12 17h.01"/>'
};
const gIcon = k => `<svg viewBox="0 0 24 24" aria-hidden="true">${G_ICONS[k] || ''}</svg>`;
const GUIDE = [
  ['start', 'start', 'Démarrage rapide'], ['obs', 'obs', 'Ajouter une URL dans OBS'], ['urls', 'link', 'Toutes les URL'],
  ['scenes', 'scenes', 'Scènes OBS conseillées'], ['dock', 'dock', 'Admin dans OBS (dock)'], ['sting', 'sting', 'Transition stinger'],
  ['cam', 'cam', 'Webcam et masques'], ['pov', 'pov', 'POV des joueurs'], ['keys', 'keys', 'Raccourcis clavier'], ['deck', 'keys', 'Stream Deck'],
  ['secu', 'shield', 'Mises à jour et mot de passe'], ['faq', 'help', 'Dépannage']
];
const gSec = (id, n, title, body) => {
  const g = GUIDE.find(x => x[0] === id);
  return `<section class="card g-sec" id="g-${id}"><div class="card-head"><span class="g-num">${String(n).padStart(2, '0')}</span>
    <span class="g-ico">${gIcon(g?.[1])}</span><h2 class="grow">${title}</h2><button type="button" class="link-btn" data-act="guide-top">Sommaire ↑</button></div>${body}</section>`;
};
const steps = list => `<ol class="g-steps">${list.map(s => `<li><div>${s}</div></li>`).join('')}</ol>`;
const tip = (t, kind = '') => `<p class="g-tip ${kind}"><b>${kind === 'warn' ? 'Attention' : 'Astuce'}</b>${t}</p>`;

// Liste complète des overlays : nom, chemin, taille de la source, scène conseillée, son
function guideUrls() {
  const cam = S.camframe || { w: 640, h: 360 };
  return [
    ...S.players.map(p => ['Joueur · ' + p.pseudo, '/p/' + p.id, '1920 × 1080', 'Scène de jeu du joueur', '']),
    ['Starting soon', '/scene/starting', '1920 × 1080', 'Avant le live', ''],
    ['BRB / pause', '/scene/brb', '1920 × 1080', 'Pause', ''],
    ['Fin de stream', '/scene/ending', '1920 × 1080', 'Fin', ''],
    ['Difficultés techniques', '/scene/tech', '1920 × 1080', 'Secours', ''],
    ['Just chatting', '/scene/chatting', '1920 × 1080', 'Discussion, sous la webcam', ''],
    ['POV joueurs', '/pov', '1920 × 1080', 'Scène POV / multi-POV', 'son'],
    ['Lower third', '/lowerthird', '1920 × 1080', 'Toutes les scènes de jeu', ''],
    ['Ticker', '/ticker', '1920 × 1080', 'Où tu veux le bandeau', ''],
    ['Scoreboard', '/scoreboard', '1920 × 1080', 'Scènes de compétition', ''],
    ['Alertes', '/alerts', '1920 × 1080', 'Toutes les scènes (tout en haut)', 'son'],
    ['Chat Twitch', '/chat', '≈ 500 × 800', 'Où tu veux le chat', ''],
    ['Stinger (déclenché depuis l’admin)', '/stinger', '1920 × 1080', 'Toutes les scènes (tout en haut)', ''],
    ['Casters (desk)', '/caster', '1920 × 1080', 'Scène casters', ''],
    ['Casters (petites cams)', '/caster/pip', '1920 × 1080', 'Sur le jeu', ''],
    ['Cadre webcam', '/cam', `${cam.w} × ${cam.h}`, 'Posé sur une webcam', ''],
    ['Roster', '/roster', '1920 × 1080', 'Présentation de l’équipe', ''],
    ['Programme (scène)', '/programme', '1920 × 1080', 'Avant le live, pauses', ''],
    ['Programme (bandeau)', '/programme?bandeau', '1920 × 1080', 'Sur le jeu (en cours / à suivre)', ''],
    ['Sponsors', '/sponsors', '1920 × 1080', 'Scènes de jeu (coin en bas à droite)', ''],
    ['Objectif', '/objectif', '1920 × 1080', 'Où tu veux (coin en haut à gauche)', ''],
    ['Sondage', '/sondage', '1920 × 1080', 'Scènes de jeu (à gauche)', ''],
    ['Message du chat', '/message', '1920 × 1080', 'Scènes de jeu', ''],
    ['Joueur du match', '/mvp', '1920 × 1080', 'Après un match (plein écran)', ''],
    ['Tournoi', '/tournoi', '1920 × 1080', 'Entre deux matchs (plein écran)', '']
  ];
}
// Pile de sources d'une scène OBS (de haut en bas, comme dans OBS)
const stack = (name, items) => `<div class="g-stack"><div class="g-stack-h">${gIcon('scenes')}<b>${esc(name)}</b></div>
  <ol>${items.map(([n, u, kind]) => `<li class="${kind || ''}"><span>${esc(n)}</span>${u ? `<code>${esc(u)}</code>` : ''}</li>`).join('')}</ol></div>`;

TABS.guide = function () {
  const live = LIVE_KEYS.map(x => [`Ctrl + Maj + ${x.k.toUpperCase()}`, x.label]);
  const tabs = [...document.querySelectorAll('#nav button')].slice(0, 9).map((b, i) => [`Alt + ${i + 1}`, b.querySelector('.lab')?.textContent || b.dataset.tab]);
  const krow = ([k, l]) => `<div class="g-key"><span class="g-k">${keys(k)}</span><span>${esc(l)}</span></div>`;
  let n = 0;
  return head('Aide', 'Guide', 'Tout pour installer le pack dans OBS et piloter le live. <kbd>F1</kbd> ouvre ce guide depuis n’importe quel onglet.') + `
  <nav class="g-toc" id="g-toc" aria-label="Sommaire du guide">${GUIDE.map(([id, ic, t], i) =>
    `<button type="button" class="g-toc-i" data-act="guide-go" data-id="${id}"><span class="g-toc-n">${String(i + 1).padStart(2, '0')}</span>${gIcon(ic)}<span>${t}</span></button>`).join('')}</nav>

  ${gSec('start', ++n, 'Démarrage rapide', steps([
    '<b>Installe l’application</b> avec <code>Streampack-Kaelyx-Setup.exe</code>, puis lance-la avant OBS. Elle se met à jour toute seule.',
    '<b>Crée tes joueurs</b> dans l’onglet <a href="#" data-act="go" data-tab="players">Joueurs</a> : chaque joueur a son overlay <code>/p/pseudo</code>.',
    '<b>Ajoute les overlays dans OBS</b> : une <i>Source navigateur</i> par overlay, en 1920 × 1080 (étape suivante).',
    '<b>Pilote le live</b> depuis la <a href="#" data-act="go" data-tab="regie">Régie</a> ou au clavier (<kbd>Ctrl</kbd> + <kbd>K</kbd>).'
  ]) + tip('L’application doit rester ouverte pendant le stream (icône K près de l’horloge). Fermer la fenêtre ne coupe pas les overlays.'))}

  ${gSec('obs', ++n, 'Ajouter une URL dans OBS', `<div class="g-split">
    ${steps([
      'Dans OBS, sous <b>Sources</b>, clique sur <b>+</b> puis <b>Navigateur</b>. Donne un nom (ex. « Kaelyx · Alertes »).',
      'Copie l’URL de l’overlay (bouton <b>Copier</b> dans <a href="#" data-act="guide-go" data-id="urls">Toutes les URL</a>) et colle-la dans <b>URL</b>.',
      'Mets <b>Largeur 1920</b> et <b>Hauteur 1080</b> (sauf chat et cadre webcam, voir le tableau).',
      'Pour les <b>POV</b> et les <b>alertes</b>, coche <b>Contrôler l’audio via OBS</b> : le son arrive dans le mélangeur d’OBS.',
      'Laisse <b>décochées</b> « Arrêter la source quand elle n’est pas visible » et « Actualiser le navigateur quand la scène devient active ».',
      'Valide, puis place la source <b>au-dessus</b> de ta capture de jeu dans la liste des sources. Si elle n’occupe pas tout l’écran : clic droit › <b>Transformer › Ajuster à l’écran</b>.'
    ])}
    <figure class="g-obs" aria-label="Exemple de propriétés d’une source navigateur dans OBS">
      <div class="g-obs-bar"><span>Propriétés de « Kaelyx · Alertes »</span><i></i><i></i><i></i></div>
      <div class="g-obs-body">
        <label><span>URL</span><b class="g-obs-in">${esc(origin)}/alerts</b></label>
        <label><span>Largeur</span><b class="g-obs-in sm">1920</b></label>
        <label><span>Hauteur</span><b class="g-obs-in sm">1080</b></label>
        <p class="g-obs-ck on"><i></i>Contrôler l’audio via OBS</p>
        <p class="g-obs-ck"><i></i>Arrêter la source quand elle n’est pas visible</p>
        <p class="g-obs-ck"><i></i>Actualiser le navigateur quand la scène devient active</p>
        <div class="g-obs-btns"><span>Annuler</span><span class="ok">OK</span></div>
      </div>
      <figcaption>Exemple : l’overlay des alertes, avec le son activé.</figcaption>
    </figure></div>
    ${tip('Un overlay n’a jamais besoin du mot de passe : il marche dès que l’application est lancée. Un changement fait dans l’admin apparaît tout de suite, sans recharger OBS.')}`)}

  ${gSec('urls', ++n, 'Toutes les URL', `<div class="g-urls">
      ${guideUrls().map(([name, p, size, where, snd]) => `<div class="g-url">
        <b class="g-url-n">${esc(name)}${snd ? ' <em class="g-snd" title="Coche « Contrôler l’audio via OBS »">son</em>' : ''}</b>
        <code>${esc(origin + p)}</code>
        <span class="g-url-m"><span class="g-size">${esc(size)}</span>${esc(where)}</span>
        <span class="g-url-a"><button type="button" class="btn ghost" data-act="copy" data-path="${esc(p)}">Copier</button><button type="button" class="btn ghost sq" data-act="preview" data-path="${esc(p)}" aria-label="Aperçu : ${esc(name)}" title="Aperçu">${gIcon('scenes')}</button></span></div>`).join('')}
    </div>
    <p class="note" style="margin-top:12px">Variantes : <code>/pov?layout=&lt;id&gt;</code> force une mise en page POV · <code>/roster?game=Fortnite</code> filtre le roster · <code>/cam?player=pseudo</code> affiche le nom d’un joueur sur le cadre webcam.</p>`)}

  ${gSec('scenes', ++n, 'Scènes OBS conseillées', `<p class="note" style="margin-bottom:14px">Dans OBS, la source du <b>haut</b> de la liste s’affiche <b>par-dessus</b> les autres. Exemple de scènes :</p>
    <div class="g-stacks">
      ${stack('Starting soon', [['Alertes', '/alerts', 'ov'], ['Kaelyx · Starting soon', '/scene/starting', 'ov'], ['Musique', '', 'src']])}
      ${stack('Jeu (un joueur)', [['Alertes', '/alerts', 'ov'], ['Lower third', '/lowerthird', 'ov'], ['Scoreboard', '/scoreboard', 'ov'], ['Overlay joueur', '/p/pseudo', 'ov'], ['Webcam', '', 'src'], ['Capture du jeu', '', 'src']])}
      ${stack('POV / multi-POV', [['Alertes', '/alerts', 'ov'], ['Lower third', '/lowerthird', 'ov'], ['POV joueurs', '/pov', 'ov'], ['Captures « Source OBS » (si besoin)', '', 'src']])}
      ${stack('Pause', [['Alertes', '/alerts', 'ov'], ['Kaelyx · BRB', '/scene/brb', 'ov']])}
      ${stack('Just chatting', [['Alertes', '/alerts', 'ov'], ['Kaelyx · Just chatting', '/scene/chatting', 'ov'], ['Webcam (masque just chatting)', '', 'src']])}
      ${stack('Casters', [['Alertes', '/alerts', 'ov'], ['Casters (desk)', '/caster', 'ov'], ['Webcams des casters', '', 'src']])}
    </div>
    ${tip('Une même source navigateur peut être ajoutée dans plusieurs scènes : clic droit › <b>Copier</b>, puis <b>Coller (référence)</b> dans l’autre scène. Elle ne charge qu’une fois.')}`)}

  ${gSec('dock', ++n, 'Admin dans OBS (dock)', steps([
    'Dans OBS : menu <b>Docks › Docks de navigateur personnalisés</b>.',
    `Nom : <b>Kaelyx</b> · URL : <code>${esc(origin)}/admin</code> <button type="button" class="btn ghost g-inline" data-act="copy" data-path="/admin">Copier</button>`,
    'Clique sur <b>Appliquer</b> : l’admin s’ouvre dans OBS. Le mot de passe est demandé à chaque connexion (et à chaque redémarrage d’OBS).',
    'Si le dock est étroit, l’admin passe en <b>mode compact</b> : icônes seules, et le bouton <b>Aperçu</b> en bas à gauche affiche ou cache l’aperçu.'
  ]) + tip('Tu peux aussi piloter depuis un téléphone : voir « Piloter depuis un téléphone » dans le fichier LISEZMOI.'))}

  ${gSec('sting', ++n, 'Transition stinger', steps([
    'Dans OBS, panneau <b>Transitions de scène</b> : clique sur <b>+</b> puis <b>Stinger</b>.',
    'Fichier vidéo : <code>Documents\\Streampack Kaelyx\\stinger\\kaelyx-stinger.webm</code> (clic droit sur l’icône K › <i>Dossier photos, masques et stinger</i>).',
    'Type de point de transition : <b>Temps</b> · Point de transition : <b>1200 ms</b>.',
    'Choisis cette transition : chaque changement de scène passe par l’animation Kaelyx.'
  ]) + tip('Autre possibilité : l’overlay <code>/stinger</code> tout en haut de tes scènes, déclenché par le bouton <b>Lancer le stinger</b> ou <kbd>Ctrl</kbd> + <kbd>Maj</kbd> + <kbd>S</kbd>.'))}

  ${gSec('cam', ++n, 'Webcam et masques', steps([
    'Clic droit sur ta source webcam › <b>Filtres</b> › <b>+</b> › <b>Masque d’image/fusion</b>.',
    'Image : un fichier de <code>Documents\\Streampack Kaelyx\\masques</code> (cam 16:9, cam ou chat du Just chatting).',
    'Ajoute ensuite <code>/cam</code> par-dessus, à la taille réglée dans <a href="#" data-act="go" data-tab="casters">Cam &amp; casters</a> : le cadre violet entoure la webcam.'
  ]))}

  ${gSec('pov', ++n, 'POV des joueurs', `${steps([
    'Ajoute <code>/pov</code> en 1920 × 1080 avec <b>Contrôler l’audio via OBS</b> coché.',
    'Dans <a href="#" data-act="go" data-tab="pov">POV › Sources des POV</a>, choisis pour chaque joueur : <b>Live Twitch</b> (il streame, tu écris sa chaîne), <b>Envoi direct</b> (tu lui envoies son message, sans décalage) ou <b>Source OBS</b> (ta propre capture sous <code>/pov</code>).',
    'Choisis la mise en page et clique sur un joueur pour le <b>mettre en grand</b> : l’animation logo couvre le changement.',
    'Règle le volume de chaque joueur sous les boutons « Mettre en grand ».'
  ])}`)}

  ${gSec('keys', ++n, 'Raccourcis clavier', `<div class="g-keys">
      <div class="g-keyset"><h3>Partout dans l’admin</h3>
        ${[['Ctrl + K', 'Rechercher et lancer une action'], ['F1', 'Ouvrir ce guide'], ['Échap', 'Fermer la recherche']].map(krow).join('')}</div>
      <div class="g-keyset"><h3>Pendant le live</h3>${live.map(krow).join('')}</div>
      <div class="g-keyset"><h3>Globaux (même dans le jeu ou OBS)</h3>
        ${[['Ctrl + Alt + S', 'Stinger'], ['Ctrl + Alt + P', 'Animation logo des POV'], ['Ctrl + Alt + L', 'Lower third'], ['Ctrl + Alt + D', 'Ticker'], ['Ctrl + Alt + B', 'Scoreboard'],
           ['Ctrl + Alt + K', 'Sponsors'], ['Ctrl + Alt + O', 'Objectif'], ['Ctrl + Alt + R', 'Replay (Maj : ralenti)'], ['Ctrl + Alt + F1', 'Mettre en grand le joueur 1 (F2 : joueur 2… F8)'], ['Ctrl + Alt + Maj + F1', 'Replay de la POV du joueur 1 (F2 : joueur 2… F8)']].map(krow).join('')}
        <p class="note" style="margin-top:8px">Application de bureau uniquement. À couper dans Réglages si un jeu utilise déjà ces touches.</p></div>
      <div class="g-keyset"><h3>Changer d’onglet</h3>${tabs.map(krow).join('')}</div>
      <div class="g-keyset"><h3>Dans la recherche (Ctrl + K)</h3>
        ${[['↑ + ↓', 'Choisir une action'], ['Entrée', 'Lancer l’action'], ['Échap', 'Fermer']].map(([k, l]) => `<div class="g-key"><span class="g-k">${k === '↑ + ↓' ? '<kbd>↑</kbd><kbd>↓</kbd>' : keys(k)}</span><span>${esc(l)}</span></div>`).join('')}
        <p class="note" style="margin-top:8px">Exemples à taper : « stinger », « brb 5 », « grand yass », « lower moya », « quatuor », « copier pov ».</p></div>
      <div class="g-keyset wide"><h3>Éditeur de mise en page POV</h3>
        ${[['Glisser', 'Déplacer un élément'], ['Coin', 'Redimensionner'], ['Alt', 'Pendant le geste : sans aimantation'], ['Maj', 'Pendant le redimensionnement : proportions libres'],
           ['Flèches', 'Déplacer de 1 px'], ['Maj + Flèches', 'Déplacer de 10 px'], ['Suppr', 'Retirer l’élément'], ['Entrée', 'Sélectionner l’élément']].map(([k, l]) =>
          `<div class="g-key"><span class="g-k">${k === 'Glisser' || k === 'Coin' ? `<em>${k}</em>` : keys(k)}</span><span>${esc(l)}</span></div>`).join('')}</div>
    </div>
    ${tip('Les raccourcis <kbd>Ctrl</kbd> + <kbd>Maj</kbd> marchent dans l’application et dans le dock OBS, même quand un champ est sélectionné. Dans un navigateur, certains peuvent être pris par le navigateur.')}`)}

  ${gSec('deck', ++n, 'Stream Deck', `${steps([
    '<b>Le plus simple</b> : sur le Stream Deck, ajoute l’action <b>Système › Raccourci clavier</b> et tape le raccourci global voulu (ex. <kbd>Ctrl</kbd> + <kbd>Alt</kbd> + <kbd>S</kbd> pour le stinger). L’application doit être lancée.',
    '<b>Plus de boutons</b> (mettre un joueur précis en grand, changer de mise en page, +1 au score…) : installe l’extension gratuite <b>Web Requests</b> (ou <b>API Ninja</b>) depuis le Stream Deck Store.',
    'Dans <a href="#" data-act="go" data-tab="settings">Réglages › Stream Deck</a>, copie l’adresse du bouton voulu et colle-la dans l’action <b>HTTP GET</b> de l’extension.',
    'La clé dans l’adresse est personnelle : si quelqu’un la récupère, clique sur <b>Nouvelle clé</b> et recopie les adresses.'
  ])}`)}

  ${gSec('secu', ++n, 'Mises à jour et mot de passe', `<ul class="g-list">
      <li><b>Mises à jour</b> : l’application cherche une nouvelle version à chaque lancement et toutes les 30 min. Tes réglages, photos et URL ne changent pas. Tu peux vérifier dans <a href="#" data-act="go" data-tab="settings">Réglages › Application</a>.</li>
      <li><b>Mot de passe</b> : demandé à chaque connexion à l’admin (ouverture de la fenêtre, rechargement, dock OBS, téléphone). Pour le changer : <a href="#" data-act="go" data-tab="settings">Réglages › Sécurité</a> (les autres appareils sont déconnectés).</li>
      <li><b>Oublié</b> : quitte l’application, supprime <code>auth.json</code> dans <code>%APPDATA%\\Streampack Kaelyx\\data</code>, relance : le mot de passe d’origine redevient valable.</li>
      <li><b>Sauvegarde</b> : <a href="#" data-act="go" data-tab="settings">Réglages › Sauvegarde</a> exporte tout dans un fichier JSON.</li>
    </ul>`)}

  ${gSec('faq', ++n, 'Dépannage', `<div class="g-faq">
      ${[
        ['L’overlay reste vide dans OBS', 'Vérifie que l’application est lancée (icône K près de l’horloge) et que l’URL est exacte. Puis clic droit sur la source › <b>Actualiser</b>.'],
        ['L’overlay est coupé ou trop petit', 'La source doit faire <b>1920 × 1080</b>. Clic droit › Transformer › <b>Ajuster à l’écran</b>.'],
        ['Pas de son sur les POV ou les alertes', 'Coche <b>Contrôler l’audio via OBS</b> dans la source, puis règle le volume dans le mélangeur d’OBS. Vérifie aussi le choix « Son » et les volumes dans l’onglet POV.'],
        ['Une POV Twitch ne s’affiche pas', 'Vérifie le nom de la chaîne dans POV › Sources. La chaîne doit être en live. Quelques secondes de décalage sont normales.'],
        ['La barre affiche « OBS connecté » et pas « En direct »', 'OBS signale qu’un overlay est à l’antenne quand tu changes de scène. Change de scène une fois : l’état se met à jour.'],
        ['« Le streampack tourne déjà »', 'L’application est déjà ouverte : clique sur l’icône K près de l’horloge pour afficher la fenêtre.']
      ].map(([q, a]) => `<details class="g-q"><summary>${q}</summary><p>${a}</p></details>`).join('')}
    </div>`)}`;
};

Object.assign(ACTIONS, {
  'guide-go': d => { const el = document.getElementById('g-' + d.id); if (!el) return; el.scrollIntoView({ behavior: 'smooth', block: 'start' }); el.classList.remove('g-hl'); void el.offsetWidth; el.classList.add('g-hl'); },
  'guide-top': () => document.getElementById('g-toc')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
});
DEFAULT_PV.guide = () => pvPath || '/scene/starting';
