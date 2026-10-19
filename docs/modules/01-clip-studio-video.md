# Clip Studio – La vidéo comme matière du montage

> Dossier ouvert le 18/10/2026. Il complète [01-clip-studio.md](01-clip-studio.md)
> et prime sur lui pour tout ce qui touche à la vidéo source, au son des vidéos,
> à l’import par adresse et à la transcription.

Jusqu’ici, Clip Studio montait surtout des images fixes animées. L’éditeur
savait poser une vidéo (rognage, coupe, vitesse, volume), mais :

- le son d’une vidéo ne se coupait, ne s’effaçait ni ne se baissait sous la
  voix, et ne pouvait pas vivre sur une piste audio ;
- rien ne venait d’une adresse (YouTube, Twitch, lien direct) ;
- aucune parole n’était transcrite : impossible de sous-titrer une vidéo qui
  parle, ou d’y repérer les bons passages ;
- l’assistant n’illustrait qu’avec des images.

Ce dossier en fait un outil de montage vidéo. Quatre volets, menés dans cet
ordre ; les trois premiers sont indépendants.

## V1 – Le son des vidéos, comme dans un vrai montage

Types (`engine/types.ts`, posés) : `VideoItem` gagne `muted`, `fadeIn`,
`fadeOut` (en images), `duck` (gain sous la voix, comme `AudioItem.duck`) et
`audioLinkId` ; `AudioItem` gagne `linkedVideoId` et `speed` (le son
détaché d’une vidéo accélérée suit sa vitesse) ; `ClipAsset` garde `hasAudio`,
lu par Mediabunny à l’import.

- **Garder, couper, baisser** : chaque vidéo garde son son par défaut. L’interrupteur
  « Son de la vidéo » pose `muted` sans perdre le volume réglé. Le réglage
  « S’efface sous la voix » (`duck`) baisse le son de la vidéo pendant qu’une
  voix off parle : c’est le cas courant d’une illustration commentée.
- **Fondus** : `fadeIn` et `fadeOut` s’appliquent au son de la vidéo, à
  l’aperçu comme à l’export (`applyGainEnvelope`, `mixAudio`).
- **Détacher le son** : crée un `AudioItem` sur une piste audio, même source,
  même rognage, même vitesse ; la vidéo devient muette (`audioLinkId`). Les
  deux restent liés : déplacer, rogner, scinder ou supprimer l’un agit sur
  l’autre, changer la vitesse ou dupliquer aussi. « Rattacher le son » défait
  le lien : la vidéo reprend volume, fondus et creux réglés sur le son.
  Détacher le son d’une vidéo coupée le rend audible : c’est le son détaché
  qui se règle.
- **Timeline** : les blocs vidéo montrent l’onde de leur son (ou « sans son »
  quand `hasAudio` est faux), et un pictogramme quand le son est coupé ou
  baissé sous la voix.
- **Sans son** : une vidéo sans piste son (`hasAudio: false`) n’offre aucun
  réglage de son.

## V2 – Récupérer une vidéo par son adresse

Sources : YouTube (vidéo, short), Twitch (clip, VOD), lien direct vers un
fichier vidéo. Outil : **yt-dlp**, binaire autonome épinglé (version et
empreinte SHA-256), téléchargé dans `data/tools/` comme ffmpeg
(`src/lib/media/ytdlp.ts`). Bun sert de moteur JavaScript à yt-dlp pour
YouTube.

- **YouTube refuse l’IP du serveur** (« Sign in to confirm you’re not a
  bot », vérifié le 18/10/2026) ; Twitch passe. YouTube se récupère donc avec
  les **cookies d’un compte dédié**, déposés par un administrateur dans les
  réglages de Clip Studio et gardés comme un secret (`data/secrets.json`,
  droits 600, jamais renvoyés au navigateur). Sans cookies, l’écran le dit et
  propose d’envoyer le fichier.
- **Parcours** : l’utilisateur colle une adresse → le serveur lit les
  métadonnées (titre, auteur, durée, vignette) → il choisit le passage (début
  et fin) → un travail récupère seulement ce passage, en H.264 et AAC (format
  que le navigateur décode), au plus 1080p, et l’enregistre comme média du
  module, avec sa provenance (`MediaSource.origin`) et `rights: "unverified"`.
- **Bornes** : passage de 20 minutes au plus, fichier de 500 Mo au plus,
  deux récupérations à la fois ; adresses limitées aux schémas `http(s)` et
  aux sites reconnus ou à un fichier vidéo ; yt-dlp lancé sans shell, avec
  délai maximal, annulable.
- **Disque** : un média récupéré qui n’est utilisé par aucun projet depuis
  30 jours est effacé.

Écarts de la réalisation (18/10/2026) :

- Les cookies YouTube et les clés Pexels et Pixabay ne sont pas dans `data/secrets.json`
  (qui efface à l’écriture les champs qu’il ne connaît pas) mais dans
  `data/youtube-cookies.txt` et `data/video-sources.json`, droits 600, réglés
  dans « Voix en ligne », section « Sources vidéo ». yt-dlp reçoit une copie
  des cookies par travail, effacée ensuite (il réécrit le fichier donné).
- Un **lien direct** n’est pas confié à yt-dlp : le serveur le télécharge
  lui-même avec la résolution DNS contrôlée de `remote-image.ts` (aucune
  adresse interne, redirections revérifiées, ports 80 et 443), puis ffmpeg
  coupe le passage. Sa durée n’est connue qu’à réception : sans fin, il est
  gardé jusqu’à 20 minutes après le début.
- **Twitch sert du HEVC** à toutes les tailles de clip (vérifié sur un clip de
  ZeratoR) sans le dire dans ses formats : tout fichier qui n’est pas H.264
  8 bits et AAC est réencodé par ffmpeg (libx264 `veryfast`, CRF 21, deux
  fils), ce qui allonge la récupération des longs passages.
- La coupe d’un passage tombe sur l’image clé la plus proche (pas de
  `--force-keyframes-at-cuts`) ; la progression d’un passage est estimée
  d’après le débit annoncé, ffmpeg ne la donnant pas à yt-dlp.
- « Utilisé depuis 30 jours » : chaque média récupéré porte `lastUsedAt`,
  remis à jour par le ménage (au plus une fois par heure, au lancement d’une
  récupération) quand un projet s’en sert.

Garde-fous ajoutés après la revue de sécurité (18/10/2026) :

- **Arrêt réel** : pour un passage, yt-dlp lance lui-même ffmpeg, et
  l’exécutable Linux est un PyInstaller « onefile » (deux processus). yt-dlp
  est donc lancé dans son propre groupe de processus, et l’annulation,
  l’échéance ou le dépassement de taille tuent tout le groupe (`taskkill /T`
  sous Windows) ; le travail est rendu dès la fin de yt-dlp
  (`src/lib/media/process-tree.ts`). Vérifié sous Windows : un passage Twitch
  annulé ne laisse ni yt-dlp ni ffmpeg derrière lui.
- **Taille bornée dans ffmpeg** : `--downloader-args "ffmpeg_o:-fs …"` pour
  un passage (où `--max-filesize` ne vaut pas), `-fs` dans la mise au format ;
  un fichier arrêté à la limite est refusé.
- **Lectures d’adresse** : deux à la fois, quatre en attente au plus, vingt
  par minute pour tout le serveur ; une adresse déjà en cours de lecture
  n’est pas lue deux fois.
- **Disque** : avant une récupération, une découpe ou un import de Pexels, la
  place libre doit couvrir la taille la plus grande attendue plus 2 Go ; les
  médias venus d’ailleurs (adresse, Pexels, extraits) ont un budget de
  20 Go, au-delà duquel les plus anciens inutilisés sont effacés avant d’en
  accepter un nouveau, sinon la récupération est refusée.
- **Lien direct** : ffmpeg ne lit le fichier reçu qu’en fichier local
  (`-protocol_whitelist file`) et dans un conteneur attendu
  (`-format_whitelist mov,mp4,…,matroska,webm`, accepté par le ffmpeg épinglé
  b6.1.1).
- **Cookies** : seules les lignes de youtube.com sont gardées d’un export.
- **Vidéo envoyée pour une découpe** : c’est le serveur qui décide qu’elle
  appartient au travail (reçue depuis moins de deux heures, jamais servie à
  une autre création, sans projet qui s’en sert), pas l’indication du
  navigateur.
- **Messages** : les erreurs rangées avec les travaux n’ont plus de chemin du
  serveur ; un disque plein est dit comme tel, le détail reste dans les
  journaux.
- **Dossiers de travail** cachés (`.remote-tmp`, `.clip-tmp`, `.video-tmp`,
  `.transcribe-tmp`) vidés de ce qui a plus de six heures, au démarrage puis
  toutes les heures.

Limite connue : **aucun quota par compte**. Les fonctions du module ne
reçoivent pas l’identité de l’appelant ; les bornes ci-dessus valent pour
tout le serveur. Un quota par compte demandera que le gestionnaire de modules
transmette l’utilisateur à l’appel.

## V3 – Transcrire la parole d’une vidéo

Moteur : **Whisper d’OpenAI** (`whisper-1`, mots horodatés), avec la clé déjà
enregistrée pour les voix (`data/secrets.json`). Chaque appel est noté au
registre des IA (`recordAiUsage`, écran « Intelligence artificielle »).

- Le son est extrait par ffmpeg (mono, 16 kHz, compressé) ; au-delà de la
  limite de l’API (25 Mo), il est découpé en morceaux recollés au bon instant.
- Les mots sont rangés dans `MediaSource.words`, en millisecondes de la
  source, avec `transcript` (moteur, langue, date) ; la transcription est
  faite une fois par média, et réutilisée.
- **Sous-titrer une vidéo** : `captionForVoice` accepte aussi une vidéo
  transcrite : les sous-titres suivent son placement et son rognage.

Réalisé (`lib/transcribe.ts`, `lib/transcription-jobs.ts`), avec ces précisions :

- Son extrait en Opus à 32 kb/s (MP3 si ffmpeg n’a pas Opus) : une heure
  tient en 15 Mo ; les morceaux ne servent qu’au-delà de 24 Mo.
- Whisper rend des mots sans ponctuation : ils sont alignés sur le texte des
  segments pour retrouver ponctuation et majuscules (« c’ » + « est » fondus
  en un mot).
- Un média de Clip Studio garde sa transcription dans sa fiche
  (`data/assets.json`) ; une vidéo de la galerie (`upload:…`), dans
  `data/transcripts.json`, oubliée si le fichier change.
- Une vidéo muette n’est pas sous-titrée ; celle dont le son est détaché
  l’est par son élément audio. À une vitesse autre que 1, les mots sont
  ramenés au temps du projet au moment de poser les sous-titres : changer la
  vitesse ensuite ne les recale pas. Seuls les mots du passage lu sont gardés.
- Un son transcrit n’est pas une voix de synthèse : « Changer la voix de la
  piste » ne le propose pas.
- Trois heures au plus par média, contrôlées sur la durée lue par ffmpeg
  avant d’extraire le son (l’extraction reste bornée quand la durée n’est pas
  annoncée) ; une transcription de moins de 24 h ne se refait pas
  (`force`), chaque essai étant payé à OpenAI. Le son est extrait dans un
  dossier caché (`.transcribe-tmp`).

## V4 – Nouvelles façons de lancer une création

Dans la fenêtre de création, à côté de « Assistant IA », « Modèle » et
« Vide » :

1. **Sous-titrer un clip** : une adresse ou un fichier → récupération →
   transcription → projet au format choisi : la vidéo en plein cadre (recadrée
   au centre, ou posée sur son propre flou pour garder toute l’image), les
   sous-titres animés de la marque, le filigrane et le carton de fin.
2. **Découper une vidéo** : une longue vidéo → transcription → l’IA propose
   des passages forts (début, fin, titre, raison) ; l’utilisateur coche ceux
   qu’il veut ; chacun devient un projet comme en 1.
3. **Monter par-dessus une vidéo** : une vidéo source et une consigne → le
   script s’appuie sur la transcription ; la voix off commente ; des extraits
   de la source servent d’illustrations, leur son s’efface sous la voix ou se
   garde quand l’extrait est cité.
4. **L’assistant illustre en vidéo** : le script dit, pour chaque segment, s’il
   vaut mieux une image ou une vidéo ; les vidéos viennent de **Pixabay**
   (clé gratuite et immédiate), de **Pexels** (clé gratuite, mais Pexels a
   suspendu la délivrance de nouvelles clés) ou de **Wikimedia Commons**
   (sans clé, licences libres seulement), réglés dans Clip Studio, posées
   muettes sous la voix et coupées en plans comme les images.

Réalisé pour 1 et 2 (18/10/2026) : `lib/clip-jobs.ts` (travaux),
`lib/clip-moments.ts` (passages, pur), `engine/video-templates.ts`
(`buildSubtitledClip`, pur), `components/clip-modes.tsx` (panneau des deux
modes dans la fenêtre de création). Précisions et écarts :

- **Source** : une adresse (lue et coupée par V2), une vidéo de Mes médias,
  ou un fichier envoyé depuis la fenêtre (rangé dans Mes médias). Pour
  « Sous-titrer », 20 minutes au plus ; une vidéo plus longue de Mes médias
  n’est pas proposée (« à découper »).
- **Cadrage** : « Recadrer » par défaut (la vidéo couvre le cadre). « Image
  entière sur fond flou » pose la vidéo en `contain` sur une copie muette en
  `cover`, avec le nouveau mouvement de caméra « Fond flou »
  (`backdrop-blur` : agrandie de 12 %, floue de 3,5 % du petit côté,
  luminosité 0,55), seulement quand les proportions diffèrent de plus de 3 %.
- **Marque** : filigrane, carton de fin, styles et lisibilité (D1) comme les
  clips de l’assistant ; sous-titres à la place et à la taille du style
  mesuré (D4) quand la marque le suit. **La mascotte n’est pas posée** sur
  une vidéo filmée.
- **Accroche** : un titre de trois secondes en haut du cadre, prérempli avec
  le titre de la vidéo, modifiable ou retiré ; pour un extrait, le titre du
  passage.
- **Sous-titres longs** : un élément de sous-titres porte 120 mots au plus
  (le contrôle d’enregistrement refuse un texte de plus de 5 000
  caractères) ; les morceaux se suivent sans trou, sur la même vidéo.
- **Longue vidéo à découper** : la récupération V2 gagne un usage
  `purpose: "clipping"` : 2 heures, 720p, image plafonnée à 1,5 Mb/s,
  fichier final de 1,6 Go au plus (plafond relevé : c’est une source de
  travail, effacée après la découpe, et de toute façon par le ménage des
  30 jours), fichier reçu de 4 Go au plus avant conversion (effacé aussitôt
  converti). Ces récupérations n’apparaissent pas dans l’onglet « Adresse »
  de l’éditeur.
- **Repérage** : la transcription est coupée en phrases (ponctuation,
  silence de 1,5 s, 40 mots au plus), une ligne `#n [mm:ss] texte` chacune,
  en parties de 20 000 caractères au plus ; Codex rend, par partie, les
  numéros de la première et de la dernière phrase de chaque passage (JSON
  strict). La réponse est réparée : bornée à la vidéo, recalée sur des
  phrases entières, allongée ou raccourcie entre 15 et 60 s, une marge de
  0,2 s avant et 0,35 s après sans entamer les mots voisins ; un
  chevauchement est tranché par la note ; huit passages au plus. Une partie
  illisible est passée.
- **Revue** : un lecteur joue le passage sur la vidéo source (adresse du
  module, lue par plages). Un passage décalé à la main (±1 s) n’est pas
  recalé sur les mots, borné entre 5 et 90 s.
- **Extraits** : ffmpeg cherche puis réencode (libx264 `veryfast`, CRF 20,
  AAC 160 kb/s), à l’image près, à la cadence de la source. L’extrait est
  un nouveau média (`excerpt-…`) qui hérite de la mention, des droits et de
  la provenance (passage recalé dans la vidéo d’origine), avec ses mots
  remis à zéro.
- **Vidéo source** : « Garder la vidéo source » n’est proposé que pour une
  vidéo récupérée ou envoyée pour l’occasion ; une vidéo déjà dans Mes
  médias, ou dont un projet se sert, n’est jamais effacée.
- **Travaux** : `data/clip-jobs.json`, deux à la fois, annulables ; l’état
  « passages proposés » survit à la fermeture de la fenêtre, qui retrouve le
  dernier travail en cours. Une erreur de transcription (crédit OpenAI
  épuisé…) s’affiche à son étape, sans projet écrit ; un passage récupéré
  pour « Sous-titrer » reste alors dans Mes médias, une longue vidéo
  récupérée pour « Découper » est effacée.
- Vérifié sur un clip Twitch public (26 s), transcription simulée :
  récupération, source de 720p, extrait coupé à 60 images/s, projets valides
  au contrôle d’enregistrement. Pas encore vérifiés : Whisper réel (clé sans
  crédit), Codex sur une vraie transcription, l’interface dans le
  navigateur.

Réalisé pour 3 et 4 (18/10/2026) : `lib/video-search.ts` (Pexels),
`lib/assistant.ts` (vidéo source, extraits, choix image ou vidéo),
`engine/templates.ts` et `engine/rhythm.ts` (placement et plans vidéo),
`components/source-video-field.tsx` (champ « Vidéo source » de l’assistant),
source « Vidéos » de l’onglet « Trouver ». Précisions et écarts :

- **Pexels** (clé des « Sources vidéo », ou `PEXELS_API_KEY`) : recherche
  dans l’orientation du projet (portrait pour 9:16 et 4:5, paysage pour
  16:9, carré pour 1:1) ; pour chaque vidéo, le MP4 dont la hauteur est la
  plus proche de celle du projet sans dépasser 1920 px ; résultats rangés
  par durée (4 à 30 s d’abord, puis assez longs pour le segment). Le
  serveur télécharge le fichier lui-même, seulement depuis `*.pexels.com`,
  `player.vimeo.com`, `*.vimeocdn.com` et `vod-progressive.akamaized.net`
  (redirections revérifiées, `safeLookup`, 200 Mo et 5 minutes au plus) ;
  ffmpeg le lit et ne le réencode que s’il n’est pas en H.264 et AAC. Média
  du module avec « Vidéo : auteur sur Pexels », `rights: "free"` et une
  provenance (page Pexels) : le ménage des 30 jours s’applique aussi.
- **Registre des IA** : Pexels y devient un fournisseur (logo officiel),
  chaque appel noté ; le solde du mois est relevé dans les en-têtes
  `X-Ratelimit-*` des réponses, les appels de l’heure sont comptés sur le
  serveur, et l’assistant s’arrête dix appels avant la limite de 200 par
  heure pour laisser l’onglet « Trouver » utilisable.
- **Script** : le champ `image` gagne `"kind": "image" | "video"`, proposé
  seulement quand la demande cherche ses illustrations et qu’une clé Pexels
  est enregistrée (case « Illustrer aussi en vidéo », cochée par défaut).
  Une vidéo se cherche par mots-clés anglais (`query`) ; jamais pour la
  mascotte. Secours : vidéo introuvable → image cherchée → image générée
  (selon le mode). Quand le premier plan est plus court que le segment
  estimé, un second plan du même sujet est importé.
- **Placement** : une `VideoItem` muette (`muted: true`, volume gardé, pas
  de creux), en `cover`, prise en son milieu après ses premiers 10 % ;
  plus courte que le segment, elle **boucle** (morceaux consécutifs repris
  au début) au lieu de figer sa dernière image. `cutShots` découpe le fond
  vidéo d’un segment en plans de la durée du rythme (2,2 s normal,
  1,4 s vif, style mesuré compris) : chaque plan reprend la vidéo à un
  autre moment (fenêtres réparties sur toute la vidéo, prises dans un ordre
  qui saute), en alternance avec le second plan quand il existe ; aucun plan
  n’est plus long que sa vidéo. `fillStills` ne pose aucun zoom de plan fixe
  pendant qu’une vidéo plein cadre joue.
- **Vidéo source** : une vidéo de Mes médias, ou récupérée par son adresse
  depuis la fenêtre (le panneau de V2, bouton « Utiliser comme source »).
  Seules les vidéos du module sont acceptées (pas `upload:`). Elle est
  transcrite par un travail V3 (réutilisé s’il existe) ; le script reçoit
  la transcription en phrases `[mm:ss] texte`, 12 000 caractères au plus,
  comme une donnée entre balises.
- **Échec de transcription** (crédit OpenAI épuisé, vidéo muette) : le clip
  continue, l’étape « Transcription de la vidéo source » le dit avec le
  message d’OpenAI ; le script choisit alors ses extraits sans citer
  (`keepAudio` forcé à faux). Seule une vidéo introuvable arrête le travail.
- **Extraits** : `"excerpt": {"start", "end", "keepAudio"}` par segment,
  contrôlé au montage (`fitExcerpt`) : dans la source, 1,5 à 12 s ; une
  citation s’élargit aux mots commencés ou pas finis, et n’est citée que si
  la source a du son et une transcription. Un extrait **cité** passe en
  premier, avec son son et sans creux, sous-titré d’après la transcription
  de la source (`captionForVoice`) ; la voix off du segment parle après lui,
  puis l’illustration du segment (ou la suite de la source, muette). Un
  extrait **muet** couvre tout le segment sous la voix off : aucune
  illustration n’est cherchée pour lui. Les extraits ne sont jamais coupés
  en plans (ils portent « Extrait m:ss – m:ss » dans la timeline). Au
  quiz, un extrait n’est jamais cité (minutage fixe).
- **Pas encore fait** : la musique ne s’efface pas sous une citation (une
  vidéo n’est pas une voix off pour `mixAudio`).
- Vérifications : tests Vitest (Pexels simulé, transcription simulée).
  Aucune clé Pexels sur le poste de développement : pas d’appel réel à
  Pexels ; Whisper réel non vérifié (clé sans crédit) ; l’interface n’a pas
  été vue dans le navigateur.

Réalisé pour 4, suite (19/10/2026) : Pexels a **suspendu la délivrance de
nouvelles clés** ; deux banques s’ajoutent. `lib/video-pixabay.ts`,
`lib/video-wikimedia.ts`, `lib/video-providers.ts` (liste des banques,
ordre, repli) ; `lib/video-search.ts` garde Pexels et la mécanique commune
(téléchargement contrôlé, mise au format, import). Précisions et écarts :

- **Pixabay** (clé des « Sources vidéo », ou `PIXABAY_API_KEY`, chiffrée
  dans `data/video-sources.json` comme celle de Pexels) : `GET
  https://pixabay.com/api/videos/` avec `q`, `page`, `per_page`,
  `safesearch=true` et `video_type=film`. Pas de filtre d’orientation chez
  Pixabay : les vidéos dans l’orientation du projet passent devant. Parmi
  `large`, `medium`, `small` et `tiny` (MP4 en H.264), la hauteur la plus
  proche de celle du projet sans dépasser 1920 px. Conditions de Pixabay
  respectées : chaque réponse gardée **24 heures** sur le serveur (une même
  recherche ne repart pas), fichiers toujours téléchargés par le serveur
  (jamais liés en direct dans un projet ; seules les vignettes et l’aperçu
  au survol des résultats viennent du CDN, ce que Pixabay permet), source
  citée (« Vidéo : auteur sur Pixabay », « Licence Pixabay »). Limite de
  100 requêtes par 60 secondes : en-têtes `X-RateLimit-*` relus, appels de
  la minute comptés, dix gardés pour l’onglet « Trouver ». Hôtes admis au
  téléchargement : `cdn.pixabay.com` (celui de la documentation actuelle),
  `pixabay.com`, et Vimeo (`player.vimeo.com`, `*.vimeocdn.com`), qui
  servait d’anciennes réponses. Aucune clé sur le poste de développement :
  **aucun appel réel à Pixabay**, hôtes et forme des réponses pris dans la
  documentation officielle.
- **Wikimedia Commons** (sans clé, toujours disponible) : API MediaWiki,
  `generator=search` dans l’espace des fichiers (`gsrnamespace=6`,
  `filetype:video`), `prop=videoinfo` avec `url|size|mime|mediatype|
  extmetadata|derivatives`. `User-Agent` qui nomme l’application et donne
  le dépôt et l’adresse de contact (`src/config/links.ts`), comme le
  demande la politique de Wikimedia ; 30 requêtes par minute au plus,
  réponses gardées une heure. Seules les licences **CC0, domaine public,
  CC BY et CC BY-SA** sont gardées (jamais NC, ND, GFDL seule ni un fichier
  marqué non libre) ; auteur (texte brut tiré du HTML de Commons) et
  licence vont dans la mention : « Vidéo : auteur sur Wikimedia Commons
  (CC BY-SA 4.0) ». Plans de 2 à 120 s ; version téléchargée : petit côté
  de 1080 px au plus, 200 Mo au plus (taille estimée d’après le débit pour
  une version réencodée), une version WebM réencodée par Commons préférée à
  l’original à hauteur égale. Hôte admis : `upload.wikimedia.org`. Le
  fichier (WebM ou Ogg) est lu comme un lien direct (`-protocol_whitelist
  file`, conteneurs admis, Ogg en plus) et toujours réencodé en H.264 et AAC
  par le ffmpeg épinglé : l’export du navigateur l’exige.
- **Onglet « Trouver »** : la source « Vidéos » est toujours là (Wikimedia
  Commons l’est toujours) ; quand plusieurs banques sont utilisables, un
  sélecteur à logos officiels choisit la banque. Chaque carte cite sa
  licence et ouvre la page de la vidéo sur sa banque.
- **Assistant** : la case « Illustrer aussi en vidéo » est toujours
  proposée (logos des banques utilisables) ; un segment « video » se
  cherche dans **Pixabay** (avec une clé), puis **Pexels** (avec une clé),
  puis **Wikimedia Commons** ; une banque qui échoue ou ne trouve rien
  laisse passer la suivante, et rien du tout ramène à l’image, comme avant.
  Le suivi dit où chaque vidéo a été trouvée (« 2 vidéos Pixabay, 1 vidéo
  Wikimedia Commons »).
- **Registre des services** : Pixabay (API à clé) et Wikimedia Commons
  (service gratuit) y figurent avec leurs logos et leurs limites ; chaque
  appel est noté avec sa durée (`durationMs`) et, en cas d’échec, sa
  famille (`errorKind` : limite de débit, clé refusée, délai…).
- Vérifications : tests Vitest (Pixabay et Wikimedia simulés : choix du
  fichier, licences, cache de 24 heures, limite de débit, ordre des
  banques, clé chiffrée). Vérifié pour de vrai sur Wikimedia Commons :
  recherche « ocean waves » (24 résultats libres), téléchargement et
  réencodage d’un WebM VP9 (2,8 s, 3,6 s de travail) et d’un original Ogg
  Theora 1080p (6,4 s, 8,5 s de travail) en H.264 lisible. L’interface n’a
  pas été vue dans le navigateur.

## Hors champ, pour l’instant

- Rendu sur le serveur : l’export reste dans le navigateur (Mediabunny).
- Recadrage qui suit un visage.
- Fichiers intermédiaires allégés (proxies) : les passages récupérés restent
  courts, c’est ce qui borne la mémoire du navigateur.
