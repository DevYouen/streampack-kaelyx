# Streampack Kaelyx Esport

Overlays OBS aux couleurs de Kaelyx, avec une console admin pour tout modifier en direct.

## Démarrer (1 minute)
1. Télécharge **Streampack-Kaelyx-Setup.exe** (page *Releases* du projet) et double-clique dessus.
2. L'application s'ouvre sur l'admin. Au premier lancement, elle propose de reprendre les réglages de l'ancien pack : choisis son fichier `data\state.json`.
3. Fermer la fenêtre ne coupe pas les overlays : l'application reste près de l'horloge (icône K). Pour quitter : clic droit sur l'icône > *Quitter*.

**Mises à jour :** comme Discord, l'application cherche une nouvelle version à chaque lancement (petite fenêtre « Recherche de mises à jour… »). Si elle en trouve une, elle la télécharge, l'installe et se relance toute seule. Sans internet, elle s'ouvre normalement. Pendant l'utilisation, elle vérifie aussi toutes les 30 min et propose d'installer (jamais de redémarrage forcé en plein stream). Tes réglages, photos et URL OBS ne changent pas.

**Ton dossier :** `Documents\Streampack Kaelyx` (clic droit sur l'icône > *Dossier photos, masques et stinger*) :
- `photos\` : photos des joueurs ;
- `sounds\` : un `alert.mp3` placé ici remplace le son d'alerte ;
- `masques\` et `stinger\` : les fichiers à utiliser dans OBS.

Les réglages et le token Twitch sont rangés à part, dans `%APPDATA%\Streampack Kaelyx\data`.

> Windows peut afficher « Windows a protégé votre ordinateur » au premier lancement de l'installateur : clique sur *Informations complémentaires* > *Exécuter quand même*.

## L'admin en un coup d'œil
- **Régie** (premier onglet) : tout le live sur une page. Stinger, animation logo, POV (mise en page et joueur en grand), lower third, comptes à rebours, score, ticker et alertes de test. En dessous, la **multivue** montre tous les overlays en vignettes : clique sur une vignette pour l'ouvrir dans l'aperçu. Cadre violet = à l'antenne dans OBS.
- **Barre du haut / bas du menu** : « OBS non connecté », « OBS connecté · n sources » ou **« En direct · n à l'antenne »**. Dans le menu, la pastille d'un onglet pulse quand son overlay est à l'antenne, est violette quand il est affiché (lower third, ticker, scoreboard, compte à rebours) et cerclée quand il est seulement ouvert dans OBS.
- **Guide** (dernier onglet, ou **F1**) : mise en place dans OBS pas à pas, toutes les URL avec leur taille et un bouton Copier, scènes conseillées, dock, stinger, masques, raccourcis et dépannage.
- **Ctrl + K** : tape une action (« stinger », « brb 5 », « grand yass », « lower moya »…) puis Entrée. **Alt + 1…9** : change d'onglet.
- **Pendant le live** : **Ctrl + Maj + S** stinger · **Ctrl + Maj + P** animation logo des POV · **Ctrl + Maj + L** lower third · **Ctrl + Maj + D** ticker · **Ctrl + Maj + B** scoreboard.
- **Dock OBS étroit** : l'admin passe en mode compact (icônes seules) ; le bouton **Aperçu** en bas à gauche affiche ou cache l'aperçu.

## Dans OBS
- Une **Source navigateur** par overlay, en **1920 × 1080** (les URL sont dans Admin > Liens OBS).
- Admin dans OBS : *Docks > Docks de navigateur personnalisés*, URL `http://localhost:3000/admin`.
- Webcam en biais : filtre *Masque d'image/fusion* avec un fichier de `Documents\Streampack Kaelyx\masques`.
- Transition : *Transitions de scène > Stinger* avec `Documents\Streampack Kaelyx\stinger\kaelyx-stinger.webm`, point de transition **1200 ms**.
- Chat et alertes Twitch : voir la section **Twitch** ci-dessous.

## Les overlays
| Overlay | URL |
|---|---|
| Joueur (un par pseudo, créé dans l'admin) | `/p/<pseudo>` |
| Starting soon / BRB / Fin / Tech / Just chatting | `/scene/starting` `/scene/brb` `/scene/ending` `/scene/tech` `/scene/chatting` |
| Lower third | `/lowerthird` |
| Ticker | `/ticker` |
| Scoreboard (classement Fortnite ou VS LoL) | `/scoreboard` |
| Alertes (Twitch + tests depuis l'admin) | `/alerts` |
| Chat Twitch (source navigateur ~500 × 800) | `/chat` |
| Stinger (déclenché depuis l'admin) | `/stinger` |
| POV joueurs : grande POV, petites POV, plaques (réglages : Admin > POV) | `/pov` (ou `/pov?layout=<id>` pour forcer une mise en page) |
| Desk casters, 1 à 3 cams (réglages : Admin > Cam & casters) | `/caster` |
| Casters en petites cams sur le jeu | `/caster/pip` |
| Cadre webcam seul (source OBS de la taille réglée, 640 × 360 par défaut) | `/cam` (ou `/cam?player=<pseudo>`, `/cam?w=480&h=270&name=Nom`) |
| Roster | `/roster` (filtre : `/roster?game=Fortnite`) |

## Tes fichiers
- **Photos joueurs** : `public/photos/` (ex. `pseudo.png`), puis choisis-les dans Admin > Joueurs.
- **Logo** : le logo officiel est fourni en SVG dans `public/logo/`. Par défaut, `logo.svg` (blanc, identique à `kaelyx-logo-blanc.svg`) est utilisé partout. Variantes : `kaelyx-logo-chrome.svg`, `-argent`, `-violet` et `-anthracite` (pour fond clair). Pour changer, indique le chemin dans Admin > Réglages.
- **Stinger** : `stinger/kaelyx-stinger.webm` (VP9 avec transparence, 1920×1080, 60 i/s) reste l'ancienne animation pour l'instant. L'overlay `/stinger` a la nouvelle. Point de coupure OBS : **1200 ms** dans les deux cas. L'ancienne version courte est dans `_sauvegarde-avant-refonte/`.
- **Son d'alerte** : `public/sounds/alert.mp3`.
- Toutes les données sont dans `data/state.json` (sauvegarde/import aussi dans Admin > Réglages).

## Twitch
Admin > **Twitch** > Chaîne : écris le nom de la chaîne. Cela suffit pour :
- le **chat** : overlay `/chat`, également intégré à la scène Just chatting (option dans Admin > Scènes) ;
- les alertes **sub, resub, gift sub, bits et raid**, affichées par `/alerts`.

Les **follows** demandent une connexion Twitch, à faire une seule fois :
1. https://dev.twitch.tv/console > *Register Your Application*.
2. OAuth Redirect URL : `http://localhost:3000/twitch-auth` · Catégorie : *Broadcaster Suite* · Type de client : *Public*.
3. Colle le Client ID dans Admin > Twitch, puis clique sur **Connecter Twitch**. Utilise le compte de la chaîne, ou celui d'un modérateur.

Ouvre l'admin sur `http://localhost:3000` pour cette étape, et non depuis le dock OBS ou un téléphone. L'autorisation est enregistrée dans `data/twitch-token.json` : ne partage pas ce fichier.

Les **dons** ne passent pas par Twitch. Pour eux, garde le widget StreamElements (`streamelements/`) et décoche toutes les alertes sauf **Don** dans ses réglages, sinon chaque sub apparaîtra en double.

## Effet néon
Une lumière fait le tour des cadres violets (webcams, chat, roster), glisse sur les bandeaux (plaques joueurs et casters, ticker, lower third, alertes) et tourne autour du scoreboard et de l'anneau des scènes. Pour la couper : Admin > Réglages > **Effet néon**.

## Fond animé et effets
- **Fond « soie »** sur les scènes et les POV : des rubans violets ondulent lentement à l'angle des bandes, calculés en temps réel par la carte graphique (dans OBS, l'accélération matérielle des sources navigateur est activée par défaut). Sans carte graphique compatible, le fond classique s'affiche.
- **Compte à rebours** en volets qui basculent (comme un panneau d'aéroport), avec une barre de progression. Dans la dernière minute, le fond accélère et s'illumine ; les 10 dernières secondes battent en violet.
- **Titre des scènes** révélé lettre par lettre, puis une vague de lumière parcourt les lettres de temps en temps ; logo qui flotte en 3D ; un reflet traverse la scène. Dans OBS, la scène se reconstruit chaque fois qu'elle passe à l'antenne.
- **Transition logo** : la soie animée tourne aussi dans le panneau du logo pendant la transition.
- **Plaques des POV** : la photo du joueur (Admin › Joueurs › Photo) remplace le logo dans le carré de la plaque.
- **Scoreboard** : les lignes glissent à leur nouvelle place quand le classement change, les points défilent avec un « +N », une flèche montre qui monte ou descend, le leader est mis en avant. En VS, les scores basculent comme un panneau d'aéroport.
- **Lower third** : entrée façon mini-transition (volet violet), nom lettre par lettre ; si le nom est celui d'un joueur qui a une photo, elle s'affiche dans le carré.
- **Alertes** : une icône par type (follow, sub, gift, bits, raid, don), panneau en soie animée, pseudo lettre par lettre, montant qui défile.
- **Roster, desk casters, overlay joueur, cadre webcam** : fond soie, cartes en 3D, plaques au style des POV (photo, entrée en trois temps).
- **Ticker et chat** : séparateurs avec le logo, entrée en plusieurs temps ; les messages du chat sortent d'un masque et la liste se referme en douceur.

## Palette (stricte)
`#2A2B2C` fond · `#9933CC` violet · `#561C73` violet profond · `#F3F1F1` texte · `#C9CCD1` argent
Polices : Barlow Condensed (titres) et Inter (textes), chargées depuis Google Fonts.

## POV joueurs
Une seule **Source navigateur** OBS : `/pov` en **1920 × 1080**, avec *Contrôler l'audio via OBS* coché pour régler le son des POV.
- **En direct** (Admin > POV) : choisis la mise en page (Solo, Duo, Côte à côte, Quatuor, ou les tiennes), puis clique sur un joueur pour le mettre en grand. L'ancienne POV principale passe en petite. Le lecteur n'est pas rechargé quand un joueur change de place.
- **Éditeur** : glisse les éléments (POV, plaques, cam, logo) dans l'écran 16:9 et tire un coin pour les redimensionner. Aimantation aux bords, au centre et aux autres éléments. Les plaques collées à une POV la suivent. Crée, duplique ou renomme autant de mises en page que tu veux.
- **Sources** (Admin > POV > Sources des POV), au choix pour chaque joueur :
  - *Live Twitch* : le joueur streame comme d'habitude, il n'a rien à faire. Tu écris juste sa chaîne. Quelques secondes de décalage.
  - *Envoi direct* : le joueur ne streame pas. Clique sur **Copier le message pour…** et envoie-le-lui (Discord…). Il démarre la caméra virtuelle d'OBS ou de Streamlabs, ouvre son lien personnel dans Chrome, choisit la caméra virtuelle et clique sur *Start*. Sa POV s'affiche toute seule, sans décalage, et sans rien à ajouter dans ton OBS. Le lien est personnel : en cas de fuite, **Nouveau lien** en crée un autre.
  - *Source OBS* : le pack laisse un trou transparent dont l'aperçu indique la position et la taille, pour y placer ta propre capture sous la source `/pov`.
- **Transitions** : quand tu changes de mise en page ou que tu mets un autre joueur en grand, une transition logo style broadcast (≈ 2,6 s) couvre l'écran. Un volet violet puis un volet anthracite traversent l'écran en oblique (l'angle des bandes des scènes), le logo arrive avec eux, le nom d'équipe sort de son masque au-dessus d'un trait violet, puis tout repart dans le même sens et révèle la nouvelle mise en page. Les volets laissent une traînée de mouvement, le logo pivote en 3D en arrivant et en repartant, et la nouvelle mise en page se pose avec un léger recul de caméra. C'est la même animation que l'overlay `/stinger`. Autres choix : *Bande oblique*, *Fondu* ou *Aucune*. Le bouton **Jouer l'animation logo** la lance à la main (avant un replay, un moment fort…). Quand des joueurs échangent leur place, les vidéos glissent vers leur nouvel emplacement, les plaques sortent et rentrent avec le nouveau nom, et le cadre fait un flash néon.
- **Son** : choisis qui on entend (POV principale seulement, par défaut ; toutes les POV ; ou tout coupé). Sous les boutons « Mettre en grand », chaque joueur a son **curseur de volume** (0 à 100 %, retenu d'un stream à l'autre) et un bouton pour **couper** son son. L'étiquette « en écoute » montre qui est audible en ce moment. Coche aussi *Contrôler l'audio via OBS* sur la source `/pov` pour régler le volume général dans OBS.
- Les repères gris (« aucun joueur », « source OBS… ») n'apparaissent que dans l'aperçu et le navigateur, jamais dans OBS.

## Mot de passe de l'admin
L'admin demande un mot de passe (donné par le mainteneur du pack). Il est retenu **30 jours** sur chaque appareil : fenêtre de l'application, dock OBS, navigateur, téléphone.
- **Les overlays OBS n'ont jamais besoin du mot de passe.**
- Pour le changer : Admin > Réglages > **Sécurité**. Les autres appareils sont alors déconnectés.
- Après 5 essais ratés, il faut attendre (1 min, puis de plus en plus longtemps).
- Mot de passe oublié : ferme l'application, supprime `auth.json` dans `%APPDATA%\Streampack Kaelyx\data`, puis relance. Le mot de passe d'origine redevient valable.

## Piloter depuis un téléphone (version sans application)
Lance `node server.js` avec `HOST=0.0.0.0` (même Wi-Fi). La fenêtre noire affiche l'adresse à ouvrir sur le téléphone, qui demandera le mot de passe.
Sous Windows (PowerShell) : `$env:HOST="0.0.0.0"; node server.js`

## Plusieurs admins en même temps
Tu peux ouvrir l'admin dans le dock OBS et sur ton téléphone en même temps : les changements de l'un apparaissent dans l'autre, et rien n'est écrasé.

## Sauvegarde automatique
À chaque démarrage, l'état est copié dans `data/state.backup.json`. Si un import se passe mal, remets ce fichier à la place de `data/state.json`, ou utilise le bouton **Annuler** qui s'affiche pendant 10 secondes après un import ou une suppression.

## Sans l'application (développeurs)
`node server.js` marche toujours (Node 22+) : les données restent alors dans `data/` et les photos dans `public/photos/`.

## Publier une mise à jour (pour le mainteneur)
Une seule fois :
1. Crée un dépôt GitHub `streampack-kaelyx`, puis vérifie que `build.publish.owner` dans `package.json` est bien ton compte GitHub (`DevYouen`).
2. `npm install`, puis envoie le projet sur le dépôt (`data/` est exclu par `.gitignore`).

À chaque nouvelle version :
1. Modifie le code, puis augmente `"version"` dans `package.json` (ex. `1.0.1`).
2. `git commit -am "v1.0.1"`, `git tag v1.0.1`, `git push`, `git push --tags`.
3. GitHub Actions construit l'installateur et le publie dans *Releases*. Les casters reçoivent la mise à jour tout seuls, au prochain lancement ou dans les 4 h.

En local : `npm start` lance l'application en mode développement (dossiers séparés suffixés « dev ») ; `npm run build` crée l'installateur dans `dist/`. Depuis le terminal de VS Code, enlève d'abord la variable `ELECTRON_RUN_AS_NODE` (`set ELECTRON_RUN_AS_NODE=` sous cmd).
