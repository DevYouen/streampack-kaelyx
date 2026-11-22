# Streampack Kaelyx Esport

Overlays OBS aux couleurs de Kaelyx, avec une console admin pour tout modifier en direct.

## Démarrer (1 minute)
1. Télécharge **Streampack-Kaelyx-Setup.exe** (page *Releases* du projet) et double-clique dessus.
2. L'application s'ouvre sur l'admin. Au premier lancement, elle propose de reprendre les réglages de l'ancien pack : choisis son fichier `data\state.json`.
3. Fermer la fenêtre ne coupe pas les overlays : l'application reste près de l'horloge (icône K). Pour quitter : clic droit sur l'icône > *Quitter*.

**Mises à jour :** automatiques. L'application télécharge les nouvelles versions en fond et les installe quand tu la fermes (jamais en plein stream). Tes réglages, photos et URL OBS ne changent pas.

**Ton dossier :** `Documents\Streampack Kaelyx` (clic droit sur l'icône > *Dossier photos, masques et stinger*) :
- `photos\` : photos des joueurs ;
- `sounds\` : un `alert.mp3` placé ici remplace le son d'alerte ;
- `masques\` et `stinger\` : les fichiers à utiliser dans OBS.

Les réglages et le token Twitch sont rangés à part, dans `%APPDATA%\Streampack Kaelyx\data`.

> Windows peut afficher « Windows a protégé votre ordinateur » au premier lancement de l'installateur : clique sur *Informations complémentaires* > *Exécuter quand même*.

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
| Desk casters, 1 à 3 cams (réglages : Admin > Cam & casters) | `/caster` |
| Casters en petites cams sur le jeu | `/caster/pip` |
| Cadre webcam seul (source OBS de la taille réglée, 640 × 360 par défaut) | `/cam` (ou `/cam?player=<pseudo>`, `/cam?w=480&h=270&name=Nom`) |
| Roster | `/roster` (filtre : `/roster?game=Fortnite`) |

## Tes fichiers
- **Photos joueurs** : `public/photos/` (ex. `pseudo.png`), puis choisis-les dans Admin > Joueurs.
- **Logo** : le logo officiel est fourni en SVG dans `public/logo/`. Par défaut, `logo.svg` (chrome) est utilisé partout, car c'est le plus lisible sur les fonds anthracite et violet. Variantes unies : `kaelyx-logo-blanc.svg`, `-argent`, `-violet` et `-anthracite` (pour fond clair). Pour changer, indique le chemin dans Admin > Réglages.
- **Stinger** : `stinger/kaelyx-stinger.webm` est le rendu de `/stinger` avec le logo chrome et le nom d'équipe (VP9 avec transparence, 1920×1080, 60 i/s, 2,5 s). Point de coupure OBS : **1200 ms**. L'ancienne version courte est dans `_sauvegarde-avant-refonte/`.
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

## Palette (stricte)
`#2A2B2C` fond · `#9933CC` violet · `#561C73` violet profond · `#F3F1F1` texte · `#C9CCD1` argent
Polices : Barlow Condensed (titres) et Inter (textes), chargées depuis Google Fonts.

## Piloter depuis un téléphone
Lance avec `HOST=0.0.0.0 ADMIN_TOKEN=tonmotdepasse node server.js` (même Wi-Fi).
La fenêtre noire affiche l'adresse à ouvrir sur le téléphone (avec `?token=...`). Le mot de passe est ensuite retenu par le navigateur.
Sans `ADMIN_TOKEN`, n'importe qui sur le réseau peut modifier tes overlays. Les overlays OBS, eux, n'ont jamais besoin du mot de passe.

Sous Windows (PowerShell) : `$env:HOST="0.0.0.0"; $env:ADMIN_TOKEN="tonmotdepasse"; node server.js`

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
