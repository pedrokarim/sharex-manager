# 01 – Clip Studio

Monter un clip court à partir des images et vidéos de ShareX Manager :
diaporama animé, avant et après, présentation d’un projet, montage pour les
réseaux. Une timeline, des transitions, des titres, une musique, un export
MP4 aux formats 16:9, 9:16, 1:1 ou 4:5.

- **Identifiant** : `clip-studio`
- **Libellé** : « Clip Studio »
- **Prérequis** : socle complet (kit, rendu SVG, `ffmpeg`, vidéos dans les
  uploads, upload direct). Réutilise les légendes de l’Atelier vidéo et les
  scènes de Mockups.
- **Module le plus ambitieux** : il est découpé pour livrer de la valeur dès
  la première étape (diaporama automatique), bien avant la timeline complète.

## 0. Mise à jour : décisions prises à la réalisation

L’étape 1 (éditeur) est réalisée dans `modules/clip-studio/`. Plusieurs
choix de ce dossier ont été revus en la construisant ; ils priment sur les
sections suivantes quand elles divergent.

### Rendu dans le navigateur, pas sur le serveur

L’aperçu **et** l’export se font dans le navigateur, par une seule fonction
de dessin (`engine/render.ts`, `drawFrame`) sur un canevas 2D :

- **aperçu** : `engine/preview.ts`, horloge de l'`AudioContext`, son mixé par
  la Web Audio API, vidéos muettes recalées sur cette horloge ;
- **export** : `engine/export.ts`, chaque image est dessinée puis encodée en
  H.264 par WebCodecs via **Mediabunny** (MPL-2.0) ; les vidéos sources sont
  décodées à l’instant exact demandé (`CanvasSink.canvasesAtTimestamps`), le
  son est mixé hors temps réel par un `OfflineAudioContext` ;
- le serveur ne reçoit que le MP4 final, par la route d’upload des modules.

Conséquences : aucune charge de rendu sur `ascencia-prod`, et ce que l’on
voit dans l’éditeur est exactement ce qui sort dans le fichier. Le graphe
`ffmpeg` décrit plus bas (paragraphe 5.2) n’est plus nécessaire pour
l’export ; il reste une piste pour un futur rendu serveur (génération
automatique hors navigateur).

### Pourquoi pas Remotion, ni le code d’OpenVideo

Les deux références étudiées (Remotion, et l’éditeur de DesignCombo devenu
OpenVideo) sont sous licence double : gratuites pour un particulier ou une
structure de trois personnes au plus, payantes au-delà, avec une licence
dédiée aux outils « prompt vers vidéo ». ShareX Manager est publié sous
GPL v3 : en faire une dépendance créerait une incompatibilité de licence et
imposerait une contrainte à chaque personne qui auto-héberge le projet.
Mediabunny, sous MPL-2.0, est compatible ; le moteur est écrit dans le
projet.

### Modèle de projet

Tout est en images à la cadence du projet (30 i/s), positions relatives au
canevas (`engine/types.ts`). Pistes visuelles superposées (la première est
dessinée au-dessus) et pistes audio ; éléments image, vidéo, texte, forme
(dont une barre de compte à rebours) et son. Les opérations d’édition sont
des fonctions pures (`engine/edit.ts`), ce qui rend l’annulation triviale.

### Plateforme

Ajoutés pour ce module et réutilisables par tous :

- route `POST /api/modules/<nom>/upload` (déclarée par `uploads` dans
  `module.json`, type contrôlé par signature, écriture en flux) ;
- route de données en flux avec `Range` (`lib/modules/media-response.ts`),
  limitée aux types média : elle ne sert plus les fichiers JSON internes
  d’un module (dont `secrets.json` et ses clés API) et valide le nom du
  module.

### Feuille de route révisée

| Étape | Contenu | État |
| --- | --- | --- |
| 1 | Éditeur : projets, timeline multipiste (déplacer, rogner, scinder, aimanter), aperçu, images, vidéos, sons, textes animés et styles, formes, compte à rebours, export MP4, diaporama depuis la galerie | Réalisée |
| 2 | Modèles de projet (Libre, Quiz, Top, Diaporama, Avant / Après), remplis à partir de données structurées (`engine/templates.ts`) ; l’Avant / Après est aussi une recette de la sélection de galerie, images prises deux par deux ; le modèle libre, une suite de séquences sans forme imposée, est celui de l’assistant par défaut, qui choisit la forme adaptée à la demande | Réalisée |
| 3 | Assistant IA : « fais-moi un short quiz sur les animaux ». Script écrit par Codex CLI (`lib/codex.ts`), illustrations demandées à la file d’AI Image Gen, projet monté par un modèle (`lib/assistant.ts`) | Réalisée |
| 4 | Voix de synthèse : Piper en local (gratuit, quatre voix françaises sous licence libre), téléchargé au premier démarrage dans les données du module et non dans l’image Docker (`lib/resources.ts`, `lib/tts.ts`) ; panneau Voix dans l’éditeur ; narration par l’assistant, chaque segment s’allongeant à la durée de sa lecture. sous-titres animés mot à mot, calés sur la voix par l’analyse de ses pauses (`lib/align.ts`), sans modèle de reconnaissance. voix en ligne par clé API (OpenAI, Google Cloud, ElevenLabs, `lib/cloud-tts.ts`), réglées par un admin sur la page « Voix en ligne », le son converti en WAV par ffmpeg pour garder durée et sous-titres | Réalisée |
| 5 | Galerie vidéo (socle, partie vidéo) : un clip exporté s’envoie dans la galerie (menu de l’export ou bouton en fin d’export), avec couverture, durée et lecture ; les vidéos ShareX s’activent dans les réglages d’envoi (95 Mo au plus) | Réalisée |
| 6 | Banque de musique libre de droits : sélection de base versionnée (`music/library.json`, morceaux Jamendo sous CC0 ou CC BY via Openverse), téléchargée au démarrage dans les données du module ; recherche et ajout depuis l’éditeur (onglet Découvrir) ; musique de fond choisie par l’assistant selon l’ambiance ; crédits rappelés à l’export | Réalisée |
| 7 | Compléments du cahier des charges : transitions entre plans (fondu enchaîné, fondu au noir, glissement, balayage, zoom), le plan précédent figé sur sa dernière image sans changer les durées ; recettes « Diaporama » (fondus de 0,6 s), « Rythmé » (1,2 s par image, coupes franches) et « Avant / Après » depuis la galerie, vidéos comprises ; raccourcis J, K, L, + et -, M ; lecture d’un export au clic | Réalisée |
| 8 | Vitesse d’un plan vidéo (×0,25 à ×4, le son suit) ; forme d’onde des pistes son ; normalisation du volume à l’export (−16 dB en moyenne, crête sous −1 dB) ; « Créer un clip » depuis une série d’AI Image Gen | Réalisée |
| 9 | Trouver avant de générer : l’assistant cherche une image qui existe (banque libre Openverse, puis le web par Codex si on l’autorise ; le web d’abord pour un produit commercial récent) et ne génère que ce qui n’existe pas ; icône ou logo officiel posé à côté du nom d’un jeu, d’un film, d’une appli ou d’une marque ; onglet « Trouver » dans le panneau Médias ; droits suivis jusqu’à la publication. Voir « Trouver avant de générer » ci-dessous | Réalisée |
| 10 | Bibliothèque d’animations : un modèle à pistes d’images clés, le texte animé lettre par lettre et mot par mot, 250 à 300 préréglages (éléments, texte, transitions, caméra, impacts), un sélecteur à vignettes animées, le mouvement des marques. Voir [01 bis – la bibliothèque d’animations](01-clip-studio-animations.md) | En cours (A0 à A3 faites) |
| 11 | Vérification des faits : la date du jour dans les consignes ; le web pour écrire le script quand la demande porte sur des faits réels et que la case « Chercher aussi sur le web » est cochée ; une seconde passe de Codex qui contrôle chaque segment (corrigé, remplacé, retiré ou douteux, avec ses sources), les doutes dits dans le suivi, les sources rangées dans le projet (`lib/fact-check.ts`). Voir « Vérification des faits » ci-dessous | Réalisée |
| 12 | Voix gratuites et naturelles : sélecteur de source (locales, Edge, Azure, OpenAI, Google, ElevenLabs), voix de la lecture à voix haute d’Edge sans clé, Microsoft Azure avec son offre gratuite suivie, bouton « Écouter » mis en cache, intonation des voix locales, « Changer la voix de la piste… ». Voir « Voix : sources, écoute et changement de voix » ci-dessous | Réalisée |
| 13 | Voix de l’assistant : débit et intonation dans « Créer », voix de la marque préremplie (et prise d’office quand la demande n’en précise aucune, avec repli sur la voix locale si elle manque), calage de la voix sur une durée visée par format (accélération de 10 % au plus, sinon script raccourci par Codex). Voir « Voix de l’assistant, voix de la marque et calage » ci-dessous | Réalisée |

### Trouver avant de générer (étape 9)

Jusqu’à l’étape 8, l’assistant générait **toutes** ses illustrations. C’est
lent, cela coûte, et c’est souvent faux : un short sur un jeu, un
personnage, un lieu ou une espèce animale veut **la vraie image**, pas une
illustration qui lui ressemble. Désormais l’assistant cherche d’abord, et ne
génère que ce qui ne peut pas se trouver.

**Le script dit, segment par segment, ce qu’il faut.** Chaque segment porte
un champ `image` :

```ts
interface ScriptImage {
  /** « find » : un sujet réel et précis ; « generate » : une illustration, une idée, la mascotte. */
  mode: "find" | "generate";
  /** Requête de recherche, en anglais, 2 à 6 mots (le nom exact du jeu, du lieu, de l’espèce…). */
  query?: string;
  /** Consigne de génération, toujours fournie : elle sert aussi de secours. */
  prompt: string;
  /** Avec le web : produit commercial ou œuvre récente, cherché directement sur le web. */
  official?: boolean;
  /** Avec le web : l’icône ou le logo officiel du sujet nommé, en plus de l’illustration. */
  icon?: { query: string } | null;
}
```

Un segment qui met en scène la mascotte de la marque est toujours en
`generate` : on ne trouve pas sa mascotte sur Internet.

Un **produit commercial récent** (jeu vidéo, gacha, film, série, anime,
appli) n’est pas dans Openverse, fait surtout de photos sous licence libre :
quand le script le marque `official`, ou qu’une règle simple le devine sur la
requête (`prefersWebFirst` : « game », « gacha », « key art », « movie »,
une année récente…), le web passe d’abord et Openverse ne reste qu’un
secours. Sa requête est alors son titre exact suivi de « key art », et la
consigne de Codex demande le visuel officiel ou une capture officielle du
bon titre (site officiel, kit presse, page du store, wiki officiel), jamais
un autre titre de la même licence.

**L’échelle des sources**, pour un segment en `find`, s’arrête à la
première qui donne une image retenue :

1. **Openverse** (`api.openverse.org/v1/images`), sans clé : seulement les
   licences qui permettent un usage commercial et une modification, CC0,
   domaine public et CC BY, comme pour la musique (§ 8). Les licences NC, ND
   et SA sont écartées. Auteur, titre, licence et page source deviennent la
   mention du média.
2. **Le web, par Codex** (`codex --search exec`, l’option étant globale), seulement si la demande
   l’autorise (case « Chercher aussi sur le web »). Codex reçoit le sujet du
   segment et rend jusqu’à trois adresses **directes** d’images, avec la page
   d’où elles viennent, en privilégiant les visuels officiels (kits presse,
   sites des éditeurs) et Wikimedia. Ces images sont marquées **« droits à
   vérifier »**.
3. **La génération** par AI Image Gen, comme avant, si rien ne convient et
   que le mode le permet.

**Chaque candidate est contrôlée** avant d’être montrée ou utilisée :
téléchargement par le serveur avec les garde-fous du cœur
(`fetchRemoteImage` : HTTP(S) seulement, aucune adresse interne, redirections
revérifiées, 20 Mo), type réel et dimensions lus par sharp, petit côté d’au
moins 640 px. Une image retenue est copiée dans les médias du module : le
projet ne dépend jamais d’un site extérieur.

**Le choix entre plusieurs candidates** se fait sur une planche contact
(sharp, vignettes numérotées) montrée à Codex avec le texte du segment : il
rend le numéro de l’image qui illustre le mieux, ou 0 si aucune ne convient.
Sans Codex, la première candidate qui passe les contrôles est retenue.

**Icônes et logos officiels.** Une illustration plein cadre ne dit pas
toujours de quel jeu on parle ; une icône, si. Quand la recherche web est
permise, le script donne pour chaque segment qui nomme une chose réelle et
identifiable (jeu, film, série, marque, appli, personnage, lieu) une requête
`icon.query` (« Genshin Impact app icon », « Ananta logo »), en plus de son
illustration. L’icône est cherchée sur le web seulement (`findSegmentIcon`),
avec sa propre consigne : icône d’appli du store, logo du kit presse ou du
site officiel, avatar du compte officiel ; format carré ou logo détouré, PNG
transparent accepté, SVG refusé (le téléchargement et sharp n’acceptent que
des pixels), petit côté d’au moins 128 px au lieu de 640. Les candidates sont
posées sur un fond gris (un logo noir comme un logo blanc y restent visibles)
et montrées à Codex, qui doit reconnaître l’icône officielle de CE sujet :
sans Codex, s’il échoue ou s’il hésite, la réponse est 0 et le segment reste
sans icône. Rien plutôt qu’un faux. Les icônes partagent la file du web
(cinq recherches à la fois au plus) avec les illustrations.

Les modèles réservent à l’icône un emplacement facultatif, qui ne change rien
au rendu quand il est vide :

| Modèle | Emplacement |
| --- | --- |
| Classement | au-dessus du nom de l’entrée, pendant qu’il est affiché |
| Quiz | à droite de l’étiquette « Question n/N », à la révélation seulement : c’est l’icône de la bonne réponse |
| Diaporama | au-dessus de la légende |
| Libre | au-dessus du texte de la séquence, ou de son titre seul |

Une icône carrée remplit sa carte aux coins arrondis ; un logo plus large ou
plus haut est posé dans une carte claire (peinture `surface`), réduit pour
tenir dans le canevas. Une ombre portée (peinture `veil`, décalée vers le bas)
la détache du fond, et le tout apparaît avec le préréglage « pop-in » du
registre d’animations. Carte et ombre suivent l’image de marque comme les
autres cadres.

**Les modes**, dans la fenêtre « Créer » de l’assistant :

| Mode | Comportement |
| --- | --- |
| Trouver, sinon générer | par défaut ; chaque segment `find` cherche d’abord, les autres sont générés |
| Trouver seulement | rien n’est généré ; un segment sans image trouvée garde un aplat |
| Générer | le fonctionnement d’avant |
| Aucune | pas d’illustration |

La case « Chercher aussi sur le web (droits à vérifier) » est cochée par
défaut et retenue par le navigateur d’une fois sur l’autre ; le serveur ne
fouille le web que si la demande le dit explicitement (`webSearch: true`).
Sans elle, ni icône ni « web d’abord ».

**Le suivi de l’assistant** dit, à l’étape des illustrations, combien ont été
trouvées et où (« 3 trouvées (2 sur le web, 1 sur Openverse) »), combien ont
été créées, combien sont restées sans image, et combien d’icônes officielles
ont été posées sur combien cherchées.

**À la main**, dans l’éditeur : le panneau Médias gagne un onglet
« Trouver ». On y cherche dans Openverse (vignettes, licence, auteur, page
source, résultats suivants à la demande), sur le web par Codex, ou parmi les
icônes officielles ; les images du web et les icônes sont signalées « droits à
vérifier ». Un clic importe l’image dans les médias du projet, avec sa
mention et l’état de ses droits, et l’ajoute au clip ; un second bouton
l’importe seulement dans « Mes médias ». Une image trouvée ajoutée plus tard
depuis « Mes médias » garde l’état de ses droits.

**Les droits suivent l’image** jusqu’à la publication. `MediaSource` porte la
mention (`credit`) et un état `rights` : `"free"` (licence libre vérifiée) ou
`"unverified"` (trouvée sur le web). La fenêtre de publication liste les
images aux droits non vérifiés d’un projet et demande de le confirmer avant
d’envoyer ; les mentions des images libres rejoignent celles de la musique
dans la description.

**Limites et sécurité**

- Une recherche web lance Codex : elle prend de vingt à soixante secondes, et
  elle est bornée à une recherche d’illustration et une d’icône par
  segment, cinq recherches web à la fois au plus
  (`FOUND_LIMITS.webConcurrency`).
- Les adresses rendues par Codex sont des données : elles passent toutes par
  `fetchRemoteImage`, jamais par le navigateur ; un SVG ou un fichier qui
  n’est pas une image est refusé.
- Les candidates téléchargées pour l’onglet « Trouver » vivent dans
  `data/found/` et sont effacées après vingt-quatre heures si elles n’ont pas
  été importées.
- Les visuels d’anime et de jeu, leurs icônes et leurs logos restent des
  œuvres et des marques protégées : « droits à vérifier » n’est pas une
  formalité, et la fenêtre de publication demande de le confirmer.

### Vérification des faits (étape 11)

Un script écrit par Codex **de mémoire**, sans la date du jour et sans
relecture, se trompe sur ce qui dépend du temps. Cas réel : « un top sur les
prochains jeux gacha les plus attendus » donnait quatre jeux justes sur cinq,
le cinquième étant sorti depuis longtemps. Les mêmes causes donnent une bonne
réponse de quiz fausse (le pire), des chiffres, records ou dates inventés, un
mauvais studio, un classement sans fondement, un nom mal orthographié qui
fausse aussi la recherche d’images et d’icônes. Trois garde-fous, dans
`lib/fact-check.ts`.

**La date du jour** entre dans la consigne du script et dans celle de la
vérification, lisible et au format ISO (« lundi 12 octobre 2026
(2026-10-12) »), avec la règle : tout ce qui dépend du temps (« à venir »,
« récent », « cette année », « actuel », « le plus… », un record, un statut
sorti ou à venir) se juge à cette date et se vérifie, jamais de mémoire.

**Le web pour écrire le script**, quand la demande porte sur des faits réels.
La décision est une règle simple, testée sur la seule demande
(`classifySubject`) :

| Demande | Exemples | Web pour le script |
| --- | --- | --- |
| Fiction déclarée | conte, histoire inventée, poème, « il était une fois » | non, et pas de vérification |
| Faits réels | mots du temps (« prochains », « récent », « attendus », une année), superlatif ou classement, nom propre ou sigle, chiffre, « record », « biographie », modèle Quiz ou Classement | oui |
| Sujet intemporel | une recette, des conseils, une explication générale | non |

Le choix d’une règle sur la demande plutôt que d’un champ du plan : la
décision se prend **avant** d’écrire le script, quand il n’y a pas encore de
plan, et elle se teste sans Codex. La case « Chercher aussi sur le web » de
la fenêtre « Créer » reste maîtresse : décochée (ou absente, quand les
illustrations sont seulement générées), le script s’écrit de mémoire, et la
vérification relit sans le web en le disant.

**La vérification**, nouvelle étape du suivi entre « Écriture du script » et
les illustrations. Une seconde passe de Codex, avec le web quand il est
permis, reçoit la demande et le script **comme des données** (en JSON entre
balises, `<` échappé, comme la fiche de marque et les sujets de recherche) et
la date du jour. Elle contrôle chaque affirmation vérifiable, segment par
segment : nom exact, date de sortie, statut sorti ou à venir, studio et
éditeur, chiffres, records ; pour un quiz, la bonne réponse de chaque
question **et** la fausseté des autres choix. Elle répond en JSON strict, un
verdict par segment :

| Verdict | Effet |
| --- | --- |
| `ok` | gardé tel quel |
| `fixed` | remplacé par le segment corrigé (nom, date, bonne réponse…) |
| `replaced` | remplacé par un autre élément réel qui répond vraiment à la demande (un autre jeu réellement à venir), image comprise |
| `removed` | retiré, sans remplaçant fabriqué : le clip peut compter moins d’éléments que demandé, et le suivi le dit |
| `doubtful` | gardé, et le doute est dit dans le suivi (« Ananta : date de sortie non confirmée ») |

Un verdict inconnu, une correction illisible (bonne réponse hors des choix,
segment vide) ou un segment oublié deviennent `doubtful` : rien ne passe pour
vérifié sans l’avoir été. Le script corrigé repasse par le nettoyage habituel
et repart dans la suite normale : les noms exacts donnent de meilleures
requêtes d’images et d’icônes. Si le titre annonce un nombre qui ne tient
plus, la vérification le corrige. Si tout tombe, le travail s’arrête avec un
message clair plutôt que de monter un clip vide.

**Le suivi** dit le bilan en une ligne : « 5 éléments vérifiés sur le web ;
1 corrigé, 1 remplacé, 1 retiré ; le clip compte 4 éléments au lieu de 5 ;
à confirmer – Ananta : date de sortie non confirmée ». Sans le web : « Sans
le web : 5 éléments relus de mémoire, non vérifiés ». Le travail garde aussi
le détail (`facts` : compteurs, changements, doutes).

**Les sources** de chaque segment (adresse et titre de page) sont rangées dans
le projet, avec la date de la vérification : `brief.sources`
(`{ segment, url, title }`, `segment` étant l’index de la ligne dans
`brief.script`) et `brief.checkedAt`. La rédaction des textes de publication
peut les citer dans la description.

**Limites et sécurité**

- La vérification ajoute une passe de Codex, bornée à cinq minutes
  (`FACT_CHECK_TIMEOUT_MS`) et annulée avec le travail. Un script écrit avec
  le web a six minutes au lieu de quatre.
- Si elle échoue (Codex absent, délai dépassé, réponse illisible), le clip
  continue avec le script tel quel et l’étape devient « Vérification
  impossible », en erreur visible, avec la raison : jamais un échec
  silencieux.
- Les adresses rendues par Codex sont des données non fiables : https
  seulement, sans identifiants, 500 caractères au plus, trois par segment,
  titres nettoyés et bornés. Elles ne sont **jamais** téléchargées par le
  serveur.

### Voix : sources, écoute et changement de voix (étape 12)

**Diagnostic de la chaîne audio.** Les voix locales jugées « molles » ne
venaient pas de Clip Studio. Le WAV de Piper (22 050 Hz, 16 bits, mono) est lu
avec la fréquence de son en-tête, au mixage comme à l’aperçu, et aucune voix
n’est étirée ni accélérée pour tenir dans un segment (seules les vidéos ont
une vitesse ; c’est le segment qui s’allonge à la durée de sa voix). Un même
texte lu par Piper en direct et par Clip Studio donne la même durée à 1 % près,
l’écart venant de la part aléatoire de Piper,
qui ne lit jamais deux fois un texte à l’identique. L’impression vient des réglages
d’origine des modèles (`noise_scale` 0,667, `noise_w` 0,8) : la durée des sons
varie beaucoup, d’où un débit irrégulier, que le débit « Posée » (×0,85)
accentue.

**Intonation des voix locales.** Le panneau Voix et la fenêtre de changement
de voix proposent « Régulière » (0,5 / 0,4), « Équilibrée » (0,6 / 0,6, par
défaut) et « Expressive » (valeurs d’origine du modèle). Le réglage suit le
compte et reste dans la fiche de chaque voix produite.

**Sources.** Le choix d’une voix commence par la source, puis la voix, avec
recherche, langue (le français par défaut) et genre quand il est connu. Une
source indisponible dit comment l’activer. La langue et le genre filtrés
restent dans le navigateur.

| Source | Clé | Coût | Mots horodatés |
| --- | --- | --- | --- |
| Locales (Piper) | aucune | gratuit, calcul sur le serveur | alignement sur les pauses (`lib/align.ts`) |
| Microsoft Edge (lecture à voix haute) | aucune | gratuit | donnés par Microsoft (`WordBoundary`) |
| Microsoft Azure | `AZURE_SPEECH_KEY` et `AZURE_SPEECH_REGION` | gratuit jusqu’à 500 000 caractères par mois (offre F0) | alignement sur les pauses |
| OpenAI, Google Cloud, ElevenLabs | une clé chacun | payé à l’usage | alignement sur les pauses |

**Microsoft Edge.** Clip Studio parle le protocole de la lecture à voix haute
du navigateur Edge (`lib/edge-tts.ts`) : liste des voix en HTTPS, synthèse par
WebSocket avec la clé publique du client Edge, un jeton `Sec-MS-GEC` recalculé
toutes les cinq minutes et l’en-tête `Origin` d’Edge. Depuis octobre 2026,
Microsoft synthétise par `api.msedgeservices.com` ; l’ancien hôte
`speech.platform.bing.com` répond 403 dans beaucoup de pays et ne sert plus
que de second essai. **Accès non officiel :** il peut cesser du jour au
lendemain. Chaque hôte est essayé une fois, l’horloge est recalée une fois sur
l’heure de Microsoft si elle était décalée, puis l’erreur dit « Microsoft a
changé l’accès de lecture d’Edge : passez par Azure ou une voix locale ».
Délais bornés : 10 s pour se connecter, 45 s pour une lecture. Un admin peut
désactiver Edge dans « Voix en ligne ».

**Microsoft Azure.** API REST officielle : liste
`https://<région>.tts.speech.microsoft.com/cognitiveservices/voices/list`,
synthèse `POST …/cognitiveservices/v1` en SSML, en-têtes
`Ocp-Apim-Subscription-Key`, `Content-Type: application/ssml+xml`,
`X-Microsoft-OutputFormat: riff-24khz-16bit-mono-pcm` et `User-Agent`. Seules
les voix neuronales standard sont proposées, pas les voix HD, hors offre
gratuite. Les caractères facturés (tout le SSML sauf `<speak>` et `<voice>`,
un idéogramme chinois compte double) sont comptés par mois dans
`data/tts-usage.json`, extraits d’écoute compris, et affichés en jauge dans
« Voix en ligne » et dans le sélecteur. Au-delà de 500 000 dans le mois, Clip
Studio n’envoie plus rien : une ressource payante ne facture donc rien par ce
module. Le compte est local : une autre application qui utilise la même clé
n’y figure pas. Un refus 429 (quota du mois ou plus de 20 demandes par
minute) donne un message clair, sans nouvel essai ; les demandes sont espacées
pour rester sous 20 par minute.

**Écouter.** Chaque voix a un bouton « Écouter », partout où l’on choisit une
voix : une phrase d’exemple dans la langue de la voix, synthétisée une seule
fois puis gardée dans `data/voice-samples/` (nom = empreinte de la voix, des
réglages et de la phrase). Un seul extrait joue à la fois ; un second clic
l’arrête.

**Changer la voix d’une piste.** Clic droit sur un extrait de voix dans la
timeline, ou bouton de l’inspecteur : « Changer la voix de la piste… ». On
choisit la voix (avec écoute), le débit et l’intonation, puis chaque extrait
est relu dans l’ordre avec son texte d’origine (`respeakVoice`). Le texte est
gardé dans la fiche du son (`speech`) depuis cette étape, et retrouvé par ses
mots horodatés pour les voix plus anciennes. Chaque extrait garde son instant
de départ ; sa durée suit la nouvelle lecture. Les sous-titres animés liés
reprennent les nouveaux mots (un sous-titre scindé redevient un seul
morceau). Le projet change une seule fois : une seule étape d’annulation. Un
extrait en échec garde l’ancienne voix et reste signalé ; relancer avec les
mêmes réglages ne refait que les échecs. Un extrait devenu plus long que
l’écart avant le suivant est signalé.

### Voix de l’assistant, voix de la marque et calage (étape 13)

**Débit et intonation dans « Créer ».** À côté du choix de la voix, la
fenêtre « Créer » de l’assistant propose le débit (Posée, Normale, Rapide :
les paliers de l’éditeur, `VOICE_SPEEDS` dans `lib/voice-settings.ts`) et,
pour une voix locale, l’intonation. « Écouter » joue la voix à ce débit et à
cette intonation. Débit et intonation sont gardés dans ce navigateur
(`clip-studio:assistant-voice`), comme la dernière voix choisie. La demande
les transmet (`voiceSpeed`, `voiceTone`), bornés par `cleanRequest` : débit de
0,7 à 1,6, intonation parmi les trois connues, ignorée par une voix en ligne.
`speakLine` les passe à `synthesize`.

**Voix de la marque.** Une image de marque peut fixer sa voix (dossier 07,
section « Assistant IA ») : source et voix, débit, intonation. Quand la
fenêtre « Créer » choisit une marque qui a une voix, ces réglages sont
préremplis et une ligne l’indique (« Voix de la marque « Nom » »). Changer
la voix, le débit ou l’intonation ne vaut que pour ce clip (« Voix changée
pour ce clip », avec « Reprendre la voix de la marque »). Côté serveur,
`resolveNarrationVoice` prend la voix de la demande, sinon celle de la
marque ; `narration: false` garde le clip muet, même quand la marque a une
voix. Une voix indisponible – clé Azure absente, source coupée – est
remplacée par la voix locale par défaut (Siwis) avant le premier mot ; une
voix en ligne qui ne répond pas dès la première ligne (Edge en panne) aussi.
Le suivi le dit (« Voix de la marque indisponible (…) : voix locale Siwis à
la place ») et le clip se fait. La fenêtre « Créer » prévient de même quand
la voix de la marque n’est pas proposée sur ce serveur.

**Calage sur la durée visée.** La fenêtre « Créer » règle une durée parlée
visée, bornée par format : 60 s au plus pour un short 9:16, 90 s en 1:1 et
4:5, 180 s en 16:9. Par défaut : 45 s (libre, top), 60 s (quiz), 40 s
(diaporama), dans la limite du format. Le script la reçoit dans sa consigne.
Après l’enregistrement de toutes les voix, si la durée parlée totale (la
somme des voix, sans les pauses du montage ni le carton de fin) dépasse la
cible :

- jusqu’à 10 % au-delà, la voix est réenregistrée un peu plus vite, jamais
  au-delà de ×1,10 du débit choisi (un débit « Rapide » à ×1,15 monte au plus
  à ×1,265 ; jamais au-delà de ×1,6) ;
- au-delà, ou quand le débit est déjà au plus haut, Codex raccourcit le
  script : les mêmes éléments, dans le même ordre, le script passé comme
  données entre balises (`asData`, comme la marque et la vérification des
  faits). Seuls les textes lus changent (légendes, textes, questions et
  explications, détails) ; jamais le titre, les choix d’un quiz ni la bonne
  réponse, ni les images déjà trouvées. Une réponse qui change le nombre
  d’éléments, ou qui ne fait rien gagner, est écartée. Le script raccourci
  est réenregistré.

Deux tentatives au plus. Le détail de l’étape « Enregistrement de la voix »
dit ce qui a été fait (« Voix accélérée de 6 % pour tenir en 60 s »,
« Script raccourci de 18 s ») ; si rien n’y fait, le clip se fait quand même
et le suivi le signale (« Durée visée encore dépassée : 64 s de voix pour
60 s »). Les voix remplacées sont effacées des médias : les mots horodatés et
les sous-titres karaoké viennent de la voix finale. Le travail garde ce suivi
dans `narration` (voix retenue et son origine, repli, durée mesurée,
accélération, secondes gagnées, tentatives). Le script raccourci n’est pas
revérifié : la consigne interdit d’ajouter ou de changer un fait.

## 1. Pourquoi ce module

Les rendus d’AI Image Gen, les captures d’un projet ou les enregistrements
d’écran racontent souvent une histoire qui gagne à être montée : une série de
visuels générés, l’évolution d’une interface, une démonstration. Un
diaporama propre avec musique se fait en une minute ; un vrai montage reste
possible pour qui veut aller plus loin.

## 2. Parcours

### 2.1 Création express

1. Dans la galerie (ou dans le fil d’AI Image Gen), sélection de plusieurs
   images, clic droit, « Modules », « Créer un clip avec la sélection ».
2. Une fenêtre demande deux choses seulement : le **format** (16:9, 9:16,
   1:1, 4:5, avec aperçu de la forme) et la **recette** :
   - **Diaporama** : 3 s par image, mouvement de caméra lent alterné, fondus
     enchaînés de 0,6 s ;
   - **Avant / Après** : images par paires, balayage de l’une à l’autre ;
   - **Rythmé** : 1,2 s par image, coupes franches, zooms courts.
3. Le projet s’ouvre dans l’éditeur, déjà monté, lecture lancée. Il reste à
   ajouter une musique ou un titre, ou à exporter directement.

### 2.2 Montage

Dans l’éditeur : réordonner, raccourcir, couper, changer une transition,
ajouter un titre, régler le mouvement d’une image, placer la musique, puis
exporter. L’export passe par la file ; le résultat se lit, s’envoie dans la
galerie ou se télécharge.

## 3. Interface

### 3.1 Page « Projets »

Grille de cartes : image de couverture, nom, format, durée, date. Survol :
lecture muette de l’aperçu du dernier export. Menu contextuel : Ouvrir,
Dupliquer, Changer de format (crée une copie adaptée), Exporter, Supprimer.
Bouton « Nouveau clip » : même fenêtre que la création express, avec
sélection des médias par le `MediaPicker` du kit.

### 3.2 Éditeur

```
┌─────────────────────────────────────────────────────────────────────┐
│ Clip Studio │ Nom du clip ✎  16:9 ▾      ⟲ ⟳   Activité  [Exporter] │ en-tête collant
├──────────┬──────────────────────────────────────────┬───────────────┤
│ Médias   │                                          │ Inspecteur    │
│ (tiroir, │          ┌────────────────────┐          │ (apparaît     │
│  touche  │          │                    │          │  avec une     │
│  M)      │          │   aperçu du clip   │          │  sélection,   │
│          │          │                    │          │  sinon masqué)│
│          │          └────────────────────┘          │               │
│          │        ◀◀  ▶  ▶▶   0:07 / 0:24           │               │
├──────────┴──────────────────────────────────────────┴───────────────┤
│ 0:00    0:05    0:10    0:15    0:20                       zoom ─●─ │ règle
│ Titres    ▬▬ Titre ▬▬                ▬ Légende ▬                    │
│ Principale [img1][⋈][img2 ][⋈][vidéo3      ][⋈][img4][img5]        │ piste magnétique
│ Audio     ▁▂▅▇▅▂▁▁▂▃▆▇▆▃▂▁▁▁▂▅▇▅▂▁▁▂▃▆▇▆▃▂▁  musique.mp3          │
└─────────────────────────────────────────────────────────────────────┘
```

- **Aperçu central**, aux proportions du format, lecture en temps réel dans
  le navigateur (voir 5.3).
- **Tiroir « Médias » à gauche**, fermé par défaut (`M`) : le `MediaPicker`
  du kit intégré (uploads, rendus d’AI Image Gen, exports de l’Atelier vidéo,
  musiques du module). On glisse un média du tiroir vers une piste.
- **Inspecteur à droite**, présent seulement quand un élément est
  sélectionné : on ne garde pas une colonne de réglages vide ouverte en
  permanence.
- **Timeline en bas**, sur toute la largeur, collante : règle avec zoom, tête
  de lecture, trois pistes :
  - **Principale**, magnétique : les plans s’enchaînent sans trou ;
    supprimer un plan resserre la piste ; les transitions (`⋈`) sont des
    pastilles entre deux plans ;
  - **Titres et superpositions**, libre : titres, légendes, logo ;
  - **Audio** : musique et voix off, avec forme d’onde et fondus.
- Réordonnancement animé avec `framer-motion` (`layout`) : les plans voisins
  glissent pour laisser la place.
- Magnétisme : les bords se calent sur la tête de lecture, les autres bords
  et les secondes rondes, avec un trait de repère pendant le glissement.

### 3.3 Inspecteur selon la sélection

| Sélection | Réglages |
| --- | --- |
| Plan image | Durée, cadrage (remplir ou contenir, fond flou si contenir), mouvement de caméra (aucun, zoom avant, zoom arrière, panoramique gauche ou droite, personnalisé avec points de départ et d’arrivée tracés sur l’aperçu), courbe d’accélération |
| Plan vidéo | Entrée et sortie dans la source, vitesse, volume, cadrage |
| Transition | Type (fondu, fondu au noir, glissement, balayage, zoom, coupe franche), durée |
| Titre | Texte, style (préréglages de titres issus du moteur de scènes), position, animation d’entrée et de sortie (fondu, glissement, apparition), durée |
| Audio | Entrée dans la source, volume, fondu d’entrée et de sortie, « Adapter la durée du clip à la musique » |
| Rien | Format, cadence (30 i/s par défaut), couleur de fond, durée totale |

### 3.4 Raccourcis

| Touche | Action |
| --- | --- |
| `Espace` | Lecture ou pause |
| `J` / `K` / `L` | Arrière, pause, avant (accélération par appuis successifs) |
| `S` | Scinder le plan à la tête de lecture |
| `Suppr` | Supprimer et resserrer |
| `Ctrl Z` / `Ctrl Maj Z` | Annuler, rétablir (historique de 100 états) |
| `Ctrl D` | Dupliquer |
| `+` / `-` | Zoom de la timeline |
| `M` | Tiroir des médias |

### 3.5 Menus contextuels

- **Plan** : Scinder ici, Dupliquer, Remplacer le média, Mouvement ▸
  (préréglages), Transition suivante ▸, Ouvrir dans l’Atelier vidéo (plan
  vidéo), Supprimer.
- **Transition** : Type ▸, Durée ▸ (0,3 / 0,6 / 1 s), Supprimer.
- **Titre** : Style ▸, Animation ▸, Dupliquer, Supprimer.
- **Piste vide** : Coller, Ajouter un titre ici, Ajouter une musique.

## 4. Modèle de données

```ts
interface ClipProject {
  id: string;
  name: string;
  format: {
    aspect: "16:9" | "9:16" | "1:1" | "4:5";
    width: number;              // 1920, 1080…
    height: number;
    fps: 30;
  };
  background: string;           // couleur des bandes en mode « contenir »
  main: MainClip[];             // piste magnétique, dans l'ordre
  overlays: OverlayClip[];
  audio: AudioClip[];
  createdAt: number;
  updatedAt: number;
  exports: ClipExport[];
}

interface MainClip {
  id: string;
  ref: MediaRef;
  kind: "image" | "video";
  durationMs: number;
  /** Vidéo seulement : où commence le plan dans la source. */
  sourceInMs?: number;
  speed?: number;
  volume?: number;
  fit: "cover" | "contain";
  motion?: CameraMotion;
  /** Transition vers le plan suivant. */
  transitionOut?: { kind: TransitionKind; durationMs: number };
}

interface CameraMotion {
  /** Cadrage de départ et d'arrivée, en coordonnées normalisées. */
  from: { cx: number; cy: number; zoom: number };
  to: { cx: number; cy: number; zoom: number };
  easing: "linear" | "ease-in-out";
}

type TransitionKind =
  | "cut" | "fade" | "fadeblack" | "slideleft" | "slideright"
  | "wipeleft" | "wiperight" | "zoomin";

interface OverlayClip {
  id: string;
  startMs: number;
  durationMs: number;
  scene: Scene;                 // moteur de scènes du socle
  enter: "none" | "fade" | "slide-up" | "pop";
  exit: "none" | "fade" | "slide-down";
}

interface AudioClip {
  id: string;
  ref: MediaRef;
  startMs: number;
  sourceInMs: number;
  durationMs: number;
  volume: number;
  fadeInMs: number;
  fadeOutMs: number;
}

interface ClipExport {
  id: string;
  file: string;
  quality: "preview" | "final";
  durationMs: number;
  sizeBytes: number;
  createdAt: number;
  savedToGallery?: string;
}
```

La position d’un plan principal dans le temps n’est pas stockée : elle se
déduit de l’ordre, des durées et des transitions. C’est ce qui rend la piste
magnétique sans code de résolution de conflits.

**Fichiers** (`modules/clip-studio/data/`, monté en volume) :

```
projects/<id>.json    un fichier par projet, magasin JSON atomique
audio/                musiques importées par l'utilisateur
proxies/<hash>.mp4    copies légères des vidéos pour l'aperçu
titles/<hash>.png     titres rendus, mis en cache par empreinte de scène
exports/              clips produits
tmp/<jobId>/          fichiers intermédiaires
```

## 5. Moteur

### 5.1 Chronologie : une seule fonction de vérité

`lib/timeline.ts`, pure et partagée entre le navigateur et le serveur :

```ts
/** Où commence chaque plan, compte tenu des chevauchements de transitions. */
function layoutMain(project: ClipProject): PlacedClip[];

/** Ce qui est visible et audible à l'instant t. */
function frameAt(project: ClipProject, tMs: number): FrameState;

/** Cadrage d'un plan image à l'instant t de ce plan. */
function cameraAt(motion: CameraMotion, progress: number): Viewport;
```

L’aperçu du navigateur et le graphe `ffmpeg` sont tous deux construits à
partir de ces fonctions : un plan ne peut pas durer 3 s dans l’aperçu et
3,2 s à l’export.

### 5.2 Export : génération du graphe `ffmpeg`

`buildClipGraph(project)` produit les entrées et un `filter_complex` :

1. **Plans image** : `-loop 1 -t <durée> -i <image>`, puis redimensionnement
   à 2 × la sortie, puis mouvement de caméra par `zoompan` avec des
   expressions calculées depuis `CameraMotion`. Le suréchantillonnage évite
   les tremblements typiques de `zoompan` à pleine résolution. À mesurer :
   si le coût est trop élevé, repli sur un rendu image par image du mouvement
   avec `sharp` dans un dossier temporaire.
2. **Plans vidéo** : `-ss <entrée> -t <durée>` sur l’original (pas le
   proxy), `setpts` pour la vitesse, `scale` et `crop` (remplir) ou `scale`,
   `pad` et fond flou (contenir), `fps=30`, `setsar=1`, `format=yuv420p`.
3. **Transitions** : chaînage de `xfade=transition=<type>:duration=<d>:offset=<o>`
   pour l’image, `acrossfade` pour le son, avec les décalages calculés par
   `layoutMain`.
4. **Titres** : chaque scène rendue une fois en PNG transparent (cache par
   empreinte), bouclée sur sa durée, animée par `fade=t=in:alpha=1` et un
   `overlay` à coordonnées dépendantes du temps pour les glissements, activée
   par `enable='between(t,a,b)'`.
5. **Audio** : sons des plans vidéo et pistes audio mixés par `amix`
   (`normalize=0`), volumes par `volume`, fondus par `afade`, puis
   `loudnorm=I=-16:TP=-1.5` en une passe (deux passes en v2).
6. **Sortie** : H.264 High, CRF 20, `veryfast`, AAC 160k, `+faststart`,
   `-threads 2`.

Durée maximale d’un projet en v1 : **3 minutes**. Au-delà, le graphe devient
difficile à tenir en une passe ; la v2 rendra par segments puis assemblera
avec le démultiplexeur `concat`.

### 5.3 Aperçu en temps réel

Le navigateur n’attend jamais le serveur pour montrer le montage :

- un `<canvas>` aux dimensions du format, redessiné à chaque image par
  `requestAnimationFrame` à partir de `frameAt(project, t)` ;
- images : `drawImage` avec le cadrage de `cameraAt` ;
- vidéos : éléments `<video>` cachés, lus depuis les **proxies** 540p, calés
  sur le temps de la timeline ;
- transitions : fondus et glissements reproduits par composition sur le
  canevas ;
- titres : SVG de la scène rastérisé une fois en `ImageBitmap` ;
- audio : Web Audio API, un nœud de gain par piste, pour des fondus
  identiques à l’export.

« Aperçu exact » lance en plus un export en 480p (`ultrafast`, CRF 30), pour
vérifier le rendu réel avant l’export final.

### 5.4 Proxies

À l’ajout d’une vidéo au projet, un travail léger produit un proxy 540p
(`veryfast`, CRF 28, images clés toutes les 15 images pour un déplacement
fluide). La vidéo est utilisable immédiatement ; l’aperçu passe sur le proxy
dès qu’il est prêt, sans que l’utilisateur ait à le savoir.

## 6. Fonctions serveur

| Fonction | Rôle |
| --- | --- |
| `listProjects()` / `getProject(id)` | Lecture |
| `createProject({ refs, aspect, recipe })` | Crée un projet monté selon une recette |
| `saveProject(project)` | Enregistrement automatique, contrôle de version optimiste |
| `duplicateProject(id, aspect?)` | Copie, avec adaptation du cadrage si le format change |
| `importAudio(ref)` | Copie une musique uploadée dans `audio/` et calcule sa forme d’onde |
| `ensureProxy(ref)` | Met en file la création du proxy d’une vidéo |
| `enqueueExport(projectId, quality)` | Export aperçu ou final |
| `getStudioState(projectId)` | Travaux en cours et exports, en un appel |
| `cancelExport(jobId)` | Annulation |
| `sendToGallery(projectId, exportId)` | Copie dans les uploads et `announceNewUpload` |
| `getVoices()` | Voix de toutes les sources prêtes, et disponibilité de chaque source |
| `speak({ text, voice, speed, tone })` | Lit un texte et range le son parmi les médias |
| `previewVoice({ voice, speed, tone })` | Extrait d’écoute, mis en cache |
| `respeakVoice({ ref, text, voice, speed, tone })` | Relit une voix de la timeline avec une autre voix |
| `startAssistant(request)` | Lance l’assistant ; `voice`, `voiceSpeed`, `voiceTone`, `narration` et `targetSeconds` règlent la voix et la durée visée (étape 13) |
| `getTtsProviders()`, `saveTtsKey({ provider, key, region, enabled })` | Clés, région d’Azure, interrupteur d’Edge (admins seulement) |

## 7. Intégration

```json
{
  "name": "clip-studio",
  "category": "Vidéo",
  "supportedFileTypes": [],
  "hasUI": false,
  "limits": { "maxUploadMb": 95 },
  "pages": [
    { "path": "", "title": "Projets", "component": "pages/projects.tsx" },
    { "path": "edit", "title": "Éditeur", "component": "pages/editor.tsx" }
  ],
  "navItems": [{ "title": "Clip Studio", "icon": "Film" }],
  "fileActions": [
    {
      "id": "create",
      "label": "Créer un clip avec la sélection",
      "icon": "Film",
      "fileTypes": ["png", "jpg", "jpeg", "webp", "mp4", "webm", "mov"],
      "maxFiles": 60,
      "page": "",
      "params": { "action": "create" }
    }
  ]
}
```

- **AI Image Gen** : « Créer un clip » sur une série (collection) ou une
  sélection de rendus, par références `module:`.
- **Atelier vidéo** : « Ajouter à un clip » sur un export.
- **Animer une image** : les vidéos générées sont proposées dans le tiroir
  des médias.

## 8. Musique et droits

Le module ne fournit **aucune musique** : aucune banque de sons n’est
embarquée, pour ne pas avoir à gérer de licences. L’utilisateur importe ses
propres fichiers (MP3, M4A, WAV, OGG). La page d’import le rappelle en une
phrase.

## 9. Performances

- Export final : un seul à la fois sur la machine (ressource
  `media-encode`). Ordre de grandeur à mesurer : un clip 1080p de 30 s avec
  dix plans et des transitions devrait prendre entre 30 s et 2 min.
- L’estimation de durée affichée avant l’export s’appuie sur les exports
  précédents (secondes de calcul par seconde de clip, moyenne glissante).
- Aperçu : aucune charge serveur pendant l’édition, hors proxies.
- L’enregistrement automatique n’envoie que le projet, jamais les médias.

## 10. Sécurité

- Toutes les sources passent par `resolveMediaRef`.
- Les textes des titres sont échappés pour XML avant le rendu SVG.
- `buildClipGraph` n’insère jamais un texte saisi dans une expression de
  filtre `ffmpeg` : les titres sont des images, pas du `drawtext`. C’est
  aussi ce qui ferme la porte aux injections dans le graphe de filtres.
- Les métadonnées des sources sont retirées (`-map_metadata -1`).

## 11. Découpage

| Étape | Contenu | Critères d’acceptation |
| --- | --- | --- |
| C1 | Création express : images seules, recettes Diaporama et Rythmé, formats, musique, export ; édition réduite à une liste réordonnable avec durée par plan | Depuis la galerie, dix images deviennent un clip 9:16 avec musique en moins de trois minutes, export compris |
| C2 | Timeline complète : piste magnétique, scinder, raccourcir, transitions par plan, mouvement de caméra réglable, annuler et rétablir | Un clip modifié par la timeline s’exporte avec des durées identiques à l’aperçu, à l’image près |
| C3 | Plans vidéo, proxies, audio des plans, mixage, fondus, `loudnorm` | Une capture vidéo et deux images se montent avec la musique, sans décalage du son |
| C4 | Titres et superpositions, styles, animations, recette Avant / Après | Un titre s’affiche au même endroit et au même moment dans l’aperçu et l’export |
| C5 | Changement de format d’un projet, rendu par segments, projets de plus de 3 min | À définir après C4 |

## 12. Tests

- Unitaires : `layoutMain`, `frameAt`, `cameraAt` (cas limites :
  transitions plus longues qu’un plan, plan de durée minimale, dernier plan
  sans transition) et `buildClipGraph` par instantanés.
- Intégration, dans le conteneur : exports de projets de test, contrôle de
  la durée (`ffprobe`) à une image près et de la présence du son.
- Navigateur : création express depuis la galerie jusqu’à l’envoi du clip
  dans la galerie.

## 13. Questions ouvertes

- Caler automatiquement les coupes sur le rythme de la musique (détection
  des temps forts) : très apprécié pour la recette « Rythmé », à étudier
  après C3.
- Sous-titres importés depuis un fichier SRT, ou générés par transcription.
- Modèles de projet partageables (un habillage de titres réutilisable).
