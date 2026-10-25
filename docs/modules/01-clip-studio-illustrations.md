# 01 – Clip Studio : illustrations animées et écriture des scripts

Rattaché à [01 – Clip Studio](01-clip-studio.md),
[07 – Image de marque](07-image-de-marque.md) et
[07 sexies – Direction artistique des vidéos](07f-direction-artistique-video.md).

## 1. Constat (25/10/2026)

Karim, après plusieurs montages de l’assistant : « le montage n’est pas
surprenant », « les illustrations, on est nul », « niveau script, on est
absolument nul ». Chaque clip reprend la même construction, et l’image de
marque est appliquée comme un gabarit de mise en page alors qu’elle n’est
qu’un **réservoir d’éléments visuels** (filigrane, mascotte, couleurs,
polices) que le montage utilise quand c’est utile.

### 1.1 Une référence décortiquée

Un short de 61 s du même genre (face caméra, sujet outil d’IA), relevé à
deux images par seconde. Construction : une **planche** en haut (papier
texturé clair, 60 % de la hauteur), la caméra en bas, sous-titres de trois
mots au plus sur la jointure, le mot clé en couleur d’accent.

| Temps | Ce que dit la voix | Ce que fait la planche |
| --- | --- | --- |
| 0 – 3 s | « Pourquoi l’IA est aussi nulle pour écrire des scripts » | Titre fixe deux lignes, un mot sur un pavé bleu, un autre souligné d’un trait qui se dessine. Le logo de l’outil arrive seul, puis deux concurrents le rejoignent en rang ; une croix se dessine sous chacun sur « nulle ». |
| 3 – 5,5 s | « …alors que tu lui as déjà passé toutes tes vidéos YouTube » | Le champ de saisie réel de l’outil apparaît ; des miniatures de vidéos tombent dedans en pile, un compteur « + 757 vidéos » se pose. |
| 5,5 – 8 s | « tout ce que l’IA retient, ce sont les étapes » | La pile se resserre en éventail sous le logo, puis se vide. |
| 8,5 – 14 s | « Phrase 1… Étape 2, trois conseils… Étape 3, abonne-toi » | Une liste « Étapes » se construit, une ligne par mot prononcé, un grand chiffre 1, 2, 3 change en haut à droite. |
| 14 – 18 s | « il passe à côté de la réflexion » | Chaque ligne se barre d’un trait sur son mot, un pense-bête bleu « et pourquoi ça marche ? » se colle en biais. |
| 18 – 23 s | « des étapes de réflexion » | Le pense-bête rejoint le logo, qui se change en carte centrale « Apprendre à réfléchir » ; cinq bulles (Promesse, Concret, Relance, Tension, Preuve) poussent autour, reliées par des traits courbes. |
| 23 – 27 s | « voici le skill vraiment utile » | Grand titre « Skill de la semaine », trait qui se trace, trois petites icônes de fichiers qui arrivent une par une. |
| 27 – 34 s | « c’est moi qui l’ai fait, 16 000 réels, 56 créateurs » | Carte produit ; fichier réel en arrière-plan ; mur de fiches de comptes ; compteur 12 630 → 16 709 « réels » ; pastille « 56 créateurs ». |
| 34 – 40 s | « une seule promesse, du concret, de la relance » | Liste numérotée : chaque carte arrive sur son mot, la précédente pâlit, « + 22 formules » sous la pile. |
| 40 – 46 s | « tu peux aussi lui demander d’auditer » | Terminal recréé : la commande se tape, la réponse s’écrit, une note 0/10 compte jusqu’à 7/10. |
| 46 – 49 s | « chaque script que je tourne passe par ce skill » | Arborescence de fichiers qui se remplit, une miniature par fichier. |
| 49 – 55 s | « 400 000 vues sur Instagram » | Écran de statistiques d’un téléphone recréé ; le compteur monte jusqu’à 440 765, surligné ; le logo de la plateforme se pose au coin. |
| 55 – 58 s | « pas le contenu IA générique » | Deux fiches côte à côte, l’une barrée d’une grande croix avec l’étiquette « slop IA », l’autre encadrée de bleu. |
| 58 – 61 s | appel à l’action | Planche seule, plein cadre : logo, nom, adresse. |

Ce qui la rend vivante, et qui nous manque :

1. **Une idée, un tableau qui grandit.** Pendant qu’une idée se développe,
   le même tableau reste et chaque phrase y ajoute, déplace, barre ou
   transforme un élément. Le décor ne change que quand l’idée change.
2. **Des objets qui agissent sur le mot** : un logo qui arrive, une croix qui
   se dessine, une ligne qui se barre, un compteur qui monte, une commande
   qui se tape, un trait qui relie. Jamais une image posée qui attend.
3. **Des objets qui voyagent** : un élément arrive grand au centre, puis
   glisse à sa place ; le pense-bête devient la carte centrale.
4. **De vraies interfaces recréées** (champ de saisie, terminal, écran de
   statistiques, arborescence), pas des captures collées.
5. **De vrais logos**, toujours, à côté d’un outil nommé.
6. **Trois mises en page qui alternent** : planche + caméra, caméra plein
   cadre (seulement pour une phrase directe, 5 s au moins), planche seule
   (fin).
7. **Des sons rares mais justes** : clics de frappe sous le terminal, tic
   du compteur, coup sourd quand un chiffre se pose. Aucun bruit de
   mouvement à chaque entrée.

### 1.2 Pourquoi nos montages se ressemblent tous

Relevé dans le code (25/10/2026) :

- **L’assistant choisit dans des listes fermées.** « Monter ma prise »
  (`engine/take-plan.ts`) ne laisse que `split` ou `full` et six planches
  (`counter`, `logo`, `list`, `quote`, `compare`, `title`). La position, la
  taille, l’animation de chacune sont écrites une fois pour toutes
  (`engine/take-templates.ts`) : un texte entre toujours en 8 images, un
  logo toujours au même cadre, le fond de planche est toujours un aplat.
- **Le modèle n’a aucun moyen de décrire un mouvement.** Un élément a une
  seule position (`Transform`), sans images clés ; il n’existe ni flèche,
  ni trait, ni chemin, ni groupe (`engine/types.ts`). Une ligne ne peut pas
  se barrer sur son mot, un logo ne peut pas glisser d’un point à un autre.
- **Le rendu ne sait pas dessiner une illustration** : images, vidéos,
  textes, rectangles et ellipses seulement (`engine/render.ts`). Les SVG
  sont refusés à la recherche d’images (`lib/image-search.ts`), ce qui
  écarte la plupart des logos officiels.
- **L’image de marque impose une construction.** Mascotte posée « à chaque
  segment », carton de fin toujours ajouté, ouverture toujours un titre en
  split, cycle de caméra fixe (zoom avant, panoramique droit, zoom arrière,
  panoramique gauche).
- **Les sons ne suivent pas l’image** : quatre bruitages synthétisés,
  placés sur l’accroche, la révélation et la fin, jamais sur ce que fait la
  planche (`engine/sfx.ts`, `engine/rhythm.ts`).
- **Les consignes d’écriture sont des étapes à recopier**
  (`lib/script-rules.ts`) : trois accroches à remplir dans onze gabarits,
  « title la reprend mot pour mot », une relance entre 40 et 60 %. C’est
  exactement ce que le short de référence reproche aux IA : le modèle
  recopie les étapes et passe à côté de la réflexion qui les justifie. Il
  ne sait rien du créateur (sa voix, ses chiffres, son public, ce contre
  quoi il se bat), ni de ce qui a déjà marché dans sa niche, ni de ce qu’il
  a déjà publié.

## 2. Règles

1. **La marque fournit, le montage compose.** Couleurs, polices, filigrane,
   mascotte et illustrations de la marque sont disponibles ; aucun n’a de
   place ni de moment imposés. Seul le filigrane reste présent par défaut.
   La mascotte est un acteur de la planche : elle apparaît quand un segment
   s’y prête.
2. **Chaque temps fort est une action** sur le mot qui la déclenche.
3. **Une idée, un tableau.** Un tableau dure le temps de son idée et
   grandit ; il ne change qu’au changement d’idée.
4. **Un vrai logo pour chaque outil nommé**, depuis une source officielle,
   source gardée.
5. **Le mouvement est calme, le contenu ne l’est pas** : ressorts sans
   rebond, sorties plus courtes que les entrées, jamais deux valeurs au même
   endroit, jamais un compteur arrêté sur 0.
6. **Pas deux montages pareils d’affilée** : l’assistant connaît les
   derniers montages de la marque (mises en page, tableaux, ouverture) et
   s’en écarte.
7. **Un script part d’une réflexion, pas d’un gabarit** : à qui on parle,
   quelle croyance on casse, quelle preuve on a, puis seulement l’accroche.
8. **Placement exact, règle fondamentale.** Un élément est vraiment en
   haut, vraiment en bas ou exactement au centre ; jamais un écart de
   quelques pixels qui le fait paraître enfoncé ou remonté. Les places
   viennent d’une grille d’espacements (marges, écarts, rembourrages
   fixes), un texte se centre sur son encre mesurée et non sur la ligne de
   base de sa police, et chaque mise en place est mesurée sur l’image
   rendue (écart haut = écart bas, gauche = droite, à 1 px près).
9. **Lisibilité de D1 maintenue** : textes sur fond, contraste ≥ 4,5:1,
   34 px au moins sur un short, rien dans les zones de l’interface des
   plateformes.

## 3. Architecture proposée

### 3.1 La planche : un nouveau type d’élément

Un élément `board` (« Planche ») sur une piste visuelle, dessiné par
`drawFrame` comme le reste : le même rendu dans l’aperçu et l’export, sans
navigateur sans tête ni serveur de rendu. Il porte :

- un **fond** (papier de la marque, aplat, image) et sa **zone** (le haut
  d’un split, ou tout l’écran) ;
- des **acteurs** : carte, pastille, titre, liste, compteur, logo, image ou
  découpe, terminal, champ de saisie, téléphone, arborescence, note collée,
  mascotte, et les **traits** : flèche, trait libre, courbe de liaison,
  croix, soulignement, cercle à main levée, encadré ;
- une **partition** : des actions horodatées sur l’index d’un mot de la voix
  (`at: { word: 42 }`), donc recalées quand le montage coupe ou que la voix
  change :

  | Verbe | Effet |
  | --- | --- |
  | `enter` | entrée (montée, fondu, dessin du trait, apparition en grand) |
  | `move` | glisse vers une place ou un autre acteur, avec changement d’échelle |
  | `count` | compteur d’une valeur à une autre |
  | `type` | frappe d’un texte (terminal, champ de saisie) |
  | `strike` | barre une ligne, pose une croix |
  | `mark` | surligne, entoure, souligne |
  | `link` | trace un trait courbe entre deux acteurs |
  | `morph` | un acteur devient un autre (note → carte centrale) |
  | `dim` | pâlit (élément passé d’une liste) |
  | `leave` | sortie courte et nette |

  Chaque verbe peut appeler un son : frappe, tic, coup sourd, clic. Le
  bruitage suit donc l’image, au lieu d’une liste de temps forts posée à
  part.

- une **mise en page de la caméra** animée : la jointure planche / caméra
  est une valeur dans le temps (split, plein cadre caméra, planche seule),
  au lieu d’un booléen.

Le modèle n’écrit plus « une planche `counter` », il écrit une partition :
quels acteurs, où, et ce qu’ils font sur quels mots. Les dispositions
(place libre, alignement, taille minimale, zones de sécurité, pas deux
acteurs au même endroit) sont vérifiées par le moteur, qui corrige au lieu
de refuser.

### 3.2 Images clés pour tout élément

Indépendamment de la planche, chaque élément ordinaire gagne des images
clés de position, d’échelle, de rotation et d’opacité (`keys`), avec les
ressorts sans rebond. C’est ce qui permet, dans l’éditeur, de faire bouger
n’importe quoi et de tracer une flèche qui se dessine.

### 3.3 Dans l’éditeur

- Un panneau **« Illustrer »** dans le rail de gauche : acteurs et traits à
  glisser sur l’aperçu (flèche, croix, cercle, soulignement, carte, liste,
  compteur, terminal, téléphone, logo par nom).
- Sur l’aperçu : tracer une flèche ou un trait à la souris, poignées de
  courbe ; déplacer un acteur à un autre instant crée une image clé.
- Dans la chronologie, sous la planche : les actions en pastilles alignées
  sur les mots de la transcription, déplaçables d’un mot à l’autre.
- L’inspecteur d’une action : verbe, durée, son associé.

### 3.4 Ressources visuelles

- **Logos** : SVG acceptés, nettoyés (scripts et liens externes retirés),
  rastérisés à la taille utile ; recherche par nom sur les sources
  officielles (site, dépôt, fiche de l’application), source gardée ; cache
  par marque.
- **Découpes** : détourage d’une image ou d’une personne (le détourage de la
  mascotte existe déjà, voir le dossier 07 sexies), pour poser un objet sur
  le papier.
- **Illustrations de la marque** : une bibliothèque réutilisée de clip en
  clip (comme les poses de la mascotte), jamais une image générée par
  segment.
- **Bruitages** : quelques sons dessinés en plus des quatre actuels (frappe,
  tic, coup sourd sur papier, clic), toujours synthétisés par le code, donc
  sans licence.

## 4. Écriture des scripts

Le principe : donner au modèle **de quoi réfléchir** plutôt que des cases à
remplir.

### 4.1 Ce que l’assistant doit savoir

- **La fiche de voix du créateur**, dans la marque : ce qu’il fait, pour
  qui, la langue et le débit, les mots qu’il emploie et ceux qu’il
  n’emploie jamais, ce qu’il défend et ce contre quoi il se bat, ses
  preuves (chiffres réels, résultats, clients), ce qu’il demande au
  spectateur. Remplie une fois (dix minutes de questions), relue par lui.
- **Les concepts qui marchent dans sa niche** : les shorts récents d’une
  dizaine de comptes, chacun mesuré contre la médiane de son propre compte
  (un short à ×5 sur un petit compte vaut plus qu’un ×1 sur un gros), avec
  leurs trois premières secondes. Rafraîchi une fois par mois. Les sources
  YouTube passent par yt-dlp, déjà utilisé par Clip Studio.
- **Son propre historique** : sujets et formes d’accroche des quatre
  dernières semaines, pour ne pas se répéter ; et, quand le compte est
  connecté, ce qui a marché chez lui.

### 4.2 Le raisonnement demandé, dans l’ordre

1. **La visée** : le concept prouvé sur lequel le script repose, le
   spectateur visé, la croyance qu’il casse, la preuve qui la casse.
2. **Trois accroches** de formes différentes, notées, la meilleure gardée.
   L’accroche à l’écran **complète** l’accroche dite, elle ne la répète pas
   (on retire « title la reprend mot pour mot »).
3. **Le corps** selon le type de vidéo (apprendre, preuve, histoire, avis,
   offre), une phrase par respiration, une relance au milieu.
4. **La fin** : une seule demande, ou une dernière phrase qui reboucle sur
   la première.
5. **Les notes visuelles**, à part des phrases dites, numérotées par ligne :
   `planche : <1 à 4 mots>` (un chiffre, un résultat, un nom d’outil, une
   liste) et `montrer : <quoi>`. **C’est le lien avec la planche** : le
   montage part de ces notes au lieu de deviner.
6. **Les faits** : tout chiffre, nom ou résultat vient de la fiche de voix,
   de la demande ou d’une vérification. Jamais de case `{{à remplir}}` : le
   script est lu par une voix de synthèse, qui la lirait telle quelle ;
   quand un fait manque, la phrase s’écrit sans lui.
7. **Quatre contrôles** avant de montrer le script, réécrit s’il en rate
   un :
   - générique : une ligne pourrait-elle figurer dans n’importe quel
     script de la niche ?
   - interchangeable : un autre créateur pourrait-il le dire tel quel ?
   - sans structure : promesse, type, relance et fin sont-ils nommés et
     tenus ?
   - hors concept : repose-t-il sur un concept qui a fait ses preuves ?
8. **La passe d’humanisation** déjà en place (tournures d’IA, caractères
   invisibles, typographie).

## 5. Étapes

| Étape | Contenu | Critère |
| --- | --- | --- |
| I1 – Moteur de planche | Type `board`, acteurs de base (carte, titre, pastille, liste, compteur, logo, image), traits (flèche, croix, barre, soulignement, liaison), verbes, partition sur les mots, jointure caméra animée ; images clés sur tout élément (moteur fait, jointure et geste d’interface à venir, voir § 7) | Une partition écrite à la main reproduit les séquences 0–3 s, 8–18 s et 18–23 s de la référence ; aucun saut d’image, aperçu et export identiques |
| I2 – Assistant | « Monter ma prise » écrit une partition depuis la transcription (et les notes visuelles quand le script vient de Clip Studio) ; règles « une idée, un tableau » ; vérification et correction des places ; sons des verbes ; mémoire des derniers montages | Trois prises montées à la suite : trois ouvertures et trois enchaînements de tableaux différents ; aucun plan de plus de 4 s sans action |
| I3 – Marque réservoir | Mascotte en acteur, carton de fin facultatif, ouverture libre ; papier et accent de la marque comme fond de planche | Un montage avec marque n’a aucune place imposée hormis le filigrane |
| I4 – Ressources | Logos SVG officiels, découpes, bibliothèque d’illustrations de la marque, nouveaux bruitages (logos SVG et bruitages faits, voir § 7) | Chaque outil nommé dans les trois prises de I2 a son vrai logo |
| I5 – Interfaces recréées | Terminal, champ de saisie, téléphone (statistiques), arborescence, fiche de compte, dessinés par le moteur et animés | Les séquences 40–46 s et 49–55 s de la référence reproduites |
| I6 – Éditeur | Panneau « Illustrer », tracé à la souris, actions sur la chronologie, inspecteur | Karim pose une flèche et une barre sur un mot sans aide |
| S1 – Fiche de voix | Questions guidées, fiche dans la marque, relue par le créateur (fait, voir § 7) | Les scripts citent ses vrais chiffres et ses mots |
| S2 – Raisonnement | Nouvelles consignes (§ 4.2), notes visuelles, faits sans case à remplir, quatre contrôles (fait, voir § 7) | Sur cinq sujets, aucun script ne passe le contrôle « interchangeable » à l’aveugle |
| S3 – Niche et historique | Concepts de la niche mesurés, historique des sujets et accroches (fait, voir § 7) | Une semaine de cinq scripts : cinq concepts prouvés, aucune forme d’accroche deux fois de suite |

S1 et S2 ne dépendent pas de la planche et peuvent partir en premier. I1 est
le socle de tout le reste du montage.

## 6. Vérification

Comme pour D1 à D4 : chaque étape se juge sur des clips rendus, une image
toutes les 0,5 s en planche horodatée, comparée à la référence ;
débordements, chevauchements et contraste mesurés sur les pixels, à
390 et 1080 px de large.

## 7. État

**S2 – Raisonnement, fait le 25/10/2026.** Les consignes du script ne
donnent plus d’étapes à recopier : `scriptReasoningLines`
(`lib/script-rules.ts`) fait raisonner le modèle dans l’ordre du § 4.2 et
dit pourquoi chaque consigne existe. Le JSON du script gagne `aim`
(spectateur, croyance cassée, preuve, promesse, type du corps parmi
`teach`, `proof`, `story`, `opinion`, `offer`), `visualNotes`
(`{ line, kind: "board" | "show", text }`, rangées dans
`brief.visualNotes` du projet et recalées quand la vérification ou le
raccourcissement retire un segment) et, pour information seulement,
`gates`. Les familles d’accroches restent, chacune avec son levier, comme
formes dont s’inspirer. L’accroche est dite par la voix ; le titre affiché
la complète en six mots au plus. Les cases `{{…}}` sont interdites et
retirées des textes lus. Une réponse de l’ancienne forme se lit toujours.

Restent hors de S2 : la fiche de voix (S1 ; `scriptPrompt` accepte déjà
une `voice`, la marque en tient lieu d’ici là), les concepts de la niche
(S3, d’où l’absence du « concept prouvé » dans la visée) et la relecture
des faits de l’accroche dite : la vérification ne contrôle encore que le
titre affiché.

**S1 – Fiche de voix, fait le 25/10/2026.** La marque gagne `voiceSheet`
(`modules/brand-kit/lib/voice-sheet.ts`), remplie dans la section
« Voix du créateur » de l’éditeur (touche 8) : ce qu’il fait (`pitch`,
200 caractères), pour qui (`audience`, 300), son débit (`wordsPerMinute`,
de 100 à 240 mots par minute, 160 par défaut), les mots qu’il emploie et
ceux qu’il n’emploie jamais (`words`, `bannedWords`, 20 de 60 caractères
chacun), ce qu’il défend (`stands`, 300) et ce contre quoi il se bat
(`against`, 300 : une habitude, un mythe, un outil, jamais le spectateur),
ses preuves (`proofs`, 10 lignes de 200 caractères) et ce qu’il demande au
spectateur (`asks`, trois échelons de 160 caractères, du plus léger au plus
engageant). Chaque question porte un exemple et une jauge dit combien ont
leur réponse. La fiche est bornée par `sanitizeKit` et à la lecture
(`upgradeKit`) ; vide, elle n’est pas enregistrée.

« Proposer à partir de mes textes » ouvre un tiroir où coller une bio, des
descriptions, des transcriptions : Codex en tire une proposition en
arrière-plan (`startVoiceDraft`, `getVoiceDraftJob`, `cancelVoiceDraft`),
sans chiffre absent des textes, montrée réponse par réponse. Ce qui remplit
une question vide part coché, ce qui remplacerait une réponse part décoché,
la réponse actuelle affichée à côté ; rien n’entre dans la fiche sans
« Reprendre ».

`toAssistantBrand` lit la fiche (`toCreatorVoice`, seulement les réponses
données) dans `AssistantBrand.creatorVoice`, et `scriptPrompt` la passe à
`scriptReasoningLines` quand la demande n’en fournit pas une autre : le bloc
`<voix>` en données, plus une consigne par réponse qui oriente le
raisonnement (le spectateur de la visée part de `audience`, la croyance à
casser de `against`, la fin choisit une seule des `asks`). Sans fiche, rien
ne change : la marque tient lieu de voix.

Le débit n’entre pas dans la consigne : les scripts de l’assistant sont lus
par la voix de synthèse de la marque, dont le débit se règle à part (section
Assistant IA) ; caler `SPEAKING_RATE_WPM` sur le débit du créateur
allongerait des scripts lus plus lentement. Il servira quand le créateur
lira lui-même un script. La langue n’est pas une question de la fiche :
c’est celle de la marque (Identité). Le critère du § 5 (des scripts qui
citent ses vrais chiffres et ses mots) reste à juger sur des scripts
réellement écrits avec une fiche remplie.

**S3 – Niche et historique, fait le 25/10/2026.** L’écran « Niche »
(`pages/niche.tsx`, ouvert depuis « Idées ») remplace le tiroir « Étudier
la niche » : les réglages à droite (marque, lecture, premières paroles,
lancement avec ses étapes, son avancement et « Annuler », comptes de
référence), le résultat à gauche (concepts qui marchent avec leurs
meilleurs exemples, tableau filtrable des vidéos qui sortent du lot,
comptes mesurés). La banque reste celle des idées
(`data/concepts/<marque>.json`) : une seule liste de comptes et de concepts
par marque, que les idées et les scripts lisent.

- **Lecture publique** (`lib/niche-public.ts`) : sans compte connecté ni
  quota, yt-dlp lit l’onglet « Shorts » de chaque chaîne en liste plate (un
  appel, 30 vidéos, vues arrondies par YouTube, ni date ni durée), puis le
  détail (`-j`) des plus fortes, trois par compte et vingt-quatre par
  étude, pour leur date, leur durée et, sur demande, leurs premières
  paroles (sous-titres d’origine, français ou anglais, ce qui est dit dans
  les 3,5 premières secondes). Un appel à la fois, quatre secondes au moins
  entre deux, par la porte commune des lectures d’adresse (vingt par minute
  pour tout le serveur) ; arguments fixés, adresse après `--`. La lecture
  par un compte YouTube connecté (API) reste possible et mesure aussi sa
  propre chaîne. Le champ `service` d’un compte de référence prépare les
  autres services, qui passeront par les comptes connectés.
- **Mesure** (`lib/niche-measure.ts`) : chaque vidéo est divisée par la
  médiane de son propre compte (les 12 vidéos qui suivent les 3 plus
  récentes) ; elle sort du lot à 2 × ou plus, si cette médiane repose sur 8
  vidéos au moins. Ce seuil remplace les 3 × de l’étape 14 pour ce qui part
  à Codex ; une recette demande toujours trois succès sur deux comptes.
- **Concepts** : Codex range les vidéos qui sortent du lot (titres et
  premières paroles, en données) dans la banque ; il nomme et regroupe,
  vues et multiples viennent de la mesure. Chaque vidéo garde son concept
  (`conceptId`). Rien n’est écrit avant la fin : une étude annulée laisse la
  banque telle qu’elle était. Moins de trente jours après la précédente, il
  faut confirmer.
- **Historique** (`lib/script-history.ts`) : le journal
  `data/script-history.json` reçoit chaque script devenu projet (titre,
  accroche dite et sa famille, concept suivi, promesse), complété par les
  travaux de l’assistant et les projets plus anciens. Les quatre dernières
  semaines de la marque partent dans la consigne.
- **Consigne** (`nicheLines` dans `lib/script-rules.ts`) : concepts et
  scripts récents en données entre balises ; la visée gagne `concept`, le
  nom du concept sur lequel repose le script ; jamais la même forme
  d’accroche que le dernier script, jamais un sujet de ces quatre semaines
  sauf si la demande le réclame ; le contrôle « hors concept » vérifie le
  concept nommé. L’accroche retenue n’est pas de la famille du script
  précédent quand Codex en propose une autre (`pickBestHook`). Sans banque
  ni historique, la consigne reste celle de S2.

Reste hors de S3 : TikTok et Instagram (le modèle de données est prêt, pas
la lecture), ce qui a marché chez le créateur sans compte connecté (sa
chaîne n’est mesurée que par l’API), et le critère jugé sur une vraie
semaine de cinq scripts.

**I1 – Moteur de planche, fait le 25/10/2026, sans encore de geste dans
l’interface.** Le choix final diffère du § 3.1 sur un point : la planche
n’est pas un type d’élément à part, mais une partition compilée en
éléments ordinaires (`engine/board.ts`, `compileBoard` puis
`boardTracks`), que l’éditeur déplace, rogne et retouche comme les autres.
Le moteur a gagné ce qui lui manquait pour la dessiner :

- **images clés** sur tout élément visuel (`keys`, `engine/keys.ts`) :
  position, taille, rotation, opacité, agrandissement, sur un ressort sans
  rebond ; une coupe ou un début rogné garde le mouvement exact, sans saut ;
- **tracés** (`shape: "stroke"`) : lignes et courbes qui se dessinent sur
  leur longueur réelle, pointes de flèche ; un tracé n’est jamais pris pour
  le fond d’un texte ;
- **marques de texte** (`marks`) : pavé, soulignement, barre, cercle,
  couleur, posés sur des mots et mesurés au rendu sur les vraies lettres ;
  un mot sur pavé garde une vraie espace avec ses voisins ;
- **compteur** (`count`) et **unité** dans un autre corps (`tail`), la
  ligne entière restant centrée ;
- **centrage sur les capitales** (`opticalCenter`) : mesuré, un texte en
  capitales tombe au pixel près sur le centre de sa boîte (les chiffres de
  Poppins dépassent les capitales de 3 px à ce corps : un repère « 01 »
  garde cet écart, qui vient de la police) ;
- **ombre douce** sous un aplat (`shadow`).

La partition : acteurs (texte, carte avec ou sans repère, pastille, note,
image en carreau, compteur), verbes calés sur les mots (entrer, glisser,
compter, barrer, marquer, croiser, relier, flécher, pâlir, sortir, se
changer en un autre), zone d’écriture distincte du papier, grille
d’espacements (`SPACE`), piles centrées au pixel près (`stack`, `column`),
calques (traits, devant, textes, images, cartes, liaisons, papier) où ce qui
arrive après se pose sur ce qui était là. En fin de planche, tout sort sur
des images courtes, sauf un acteur qui continue sur la suivante
(`persist`). `issues` signale deux acteurs qui se chevauchent sans
recouvrement voulu (`overlap`), un acteur hors de la zone et un papier vide
au début d’une planche.

Vérifié sur la planche d’essai (`tests/modules/clip-studio-board-sample.ts`,
qui rejoue les mécanismes des séquences 0–3 s, 8–18 s et 18–23 s de la
référence avec un texte à nous, plus un compteur) avec le banc
`scripts/board-stills.ts` : le vrai `drawFrame` sur `@napi-rs/canvas`,
Poppins chargée, une image tous les quarts de seconde, aucun défaut de
placement relevé, écarts mesurés au pixel dans les cartes. Les bornes des
images clés, tracés, marques et notes visuelles sont contrôlées à
l’enregistrement d’un projet.

Pas encore fait : la jointure caméra animée (prévue avec I2, quand
l’assistant choisit la mise en page), le rendu dans l’export du navigateur
(même fonction de dessin, mais non mesuré dans un vrai navigateur), et tout
geste de l’interface : rien ne crée encore de planche hors du banc.

**I4 (logos, sons), fait le 25/10/2026 pour les logos SVG et les
bruitages.** La recherche d’icônes accepte un logo officiel en SVG
(`lib/svg-logo.ts`). Le fichier n’est jamais servi ni dessiné tel qu’il
arrive : lu par un analyseur XML strict (saxes), il est réécrit à partir
d’une liste fermée d’éléments de dessin (formes, textes, dégradés, motifs,
masques, marqueurs, filtres simples, `use` interne) et d’attributs de
présentation. Disparaissent les scripts, les gestionnaires d’évènements,
`foreignObject`, les animations, les éléments et attributs des logiciels de
dessin, les instructions de traitement et toute référence qui ne désigne
pas un élément du document (`href`, `url()`, `@import`, échappements CSS),
sauf une image incorporée en PNG, JPEG, GIF ou WebP. Sont refusés un
DOCTYPE (entités), un XML invalide, plus de 1,5 Mo, plus de 5 000 éléments
ou de 48 niveaux, plus de 20 000 éléments une fois les références
développées, une boucle de références, un SVG sans viewBox ni dimensions
absolues et un rendu vide (moins de 0,2 % de pixels visibles).

Le SVG nettoyé est rastérisé en PNG transparent par sharp (librsvg), 512 px
sur le grand côté (un logo allongé garde 128 px sur le petit, dans la limite
de 1 024 px), puis contrôlé comme une image en pixels : le canevas, l’export
et tous les consommateurs ne reçoivent que des pixels. `@napi-rs/canvas`
sait aussi dessiner un SVG, mais il ignore les feuilles de style, fréquentes
dans les logos exportés. `fetchRemoteImage` accepte `image/svg+xml` sur
demande (`allowSvg`), pour ce seul appelant ; une illustration reste en
pixels seulement.

Un logo n’est cherché qu’une fois. Une icône reconnue garde, dans les
médias du module (communs à tous les projets et à toutes les marques), son
adresse d’origine et les sujets pour lesquels elle a été reconnue
(`iconCacheKey` : sans accents, casse ni ponctuation). `findSegmentIcon` la
reprend sans recherche ni téléchargement ; une adresse déjà téléchargée
n’est pas retéléchargée, et son import retombe sur le même média. Source et
mention (`credit`, `rights`) ne changent pas.

Cinq bruitages de planche rejoignent les quatre de D3 dans `engine/sfx.ts`,
synthétisés de la même façon, donc sans licence : `type` (boucle de quatre
touches douces, 400 ms, qui commence et finit dans le silence),
`type-burst` (six touches dont une barre d’espace, 640 ms), `tick` (60 ms),
`thud` (papier posé sur un bureau, 320 ms, 99,7 % de l’énergie sous
300 Hz) et `click` (pavé tactile, 30 ms). Chacun a son volume
(`SFX_VOLUMES` : 0,35 pour la frappe, 0,25 pour le tic, 0,2 pour le coup
sourd, 0,3 pour le clic), de 3,6 à 14 dB sous l’impact, mesuré sur 50 ms
glissantes. Pour le compilateur de planche : `sfxItem(kind, …)` comme
avant, `sfxSeries` (le même son à plusieurs instants, écart minimal, 24 au
plus) et `typingSfx` (une frappe de durée quelconque, coupée entre deux
touches). `ensureSfxBank` écrit les nouveaux fichiers au démarrage.

Pas encore fait : l’appel de ces sons par les verbes de la planche
(`engine/board.ts`, avec I2), une écoute par une oreille humaine (les tests
ne mesurent que crête, niveau, durée et spectre), les découpes et la
bibliothèque d’illustrations de la marque. Le critère du § 5 se jugera sur
les prises de I2.

**I2 – Assistant, fait le 25/10/2026.** « Monter ma prise » ne choisit plus
une planche parmi six : Codex découpe la prise en **tableaux**, un par idée
(`engine/take-plan.ts`). Chaque tableau a une mise en page (`split`,
`full`, ou `board`, la planche seule pendant que la voix continue), une
disposition (`single`, `row`, `list`, `hub`, `versus`, `stack`), un titre
facultatif (un mot sur pavé, un mot souligné sur son mot dit) et des objets
(texte, compteur, logo, carte, pastille, note) qui entrent chacun sur leur
mot, et peuvent s’y barrer ou s’y croiser. La consigne dit pourquoi : une
idée qui se construit retient, une image qui change sans lien épuise.
Codex choisit le sens, jamais une coordonnée : `engine/take-scenes.ts`
calcule les places sur la grille, centre titre et corps ensemble dans la
zone sûre, réduit un tableau trop haut et agrandit (d’un tiers au plus) un
tableau qui ne remplit pas sa zone. Le lecteur répare le plan : accroche
lisible dès la première image, plein cadre de 5 s au moins, un tableau
sans titre commence au mot de son premier objet (jamais de papier vide, la
caméra reste jusque-là), un tableau resté vide disparaît ; une réponse de
l’ancienne forme se lit encore. D’une mise en page à l’autre, le papier
glisse (descend pour la planche seule) et la caméra glisse du plein cadre à
la carte du bas. Les enchaînements des trois derniers montages de la marque
(`brief.montage`) sont donnés à Codex pour qu’il ne refasse ni la même
ouverture ni la même suite. Un même logo n’est cherché qu’une fois par
montage.

**I3 – Marque réservoir, fait le 25/10/2026 pour les montages de prise.**
La planche prend de la marque sa police et une palette tirée de ses couleurs
(`engine/board-palette.ts`), jamais ses autres styles de texte (une
étiquette de marque aurait posé un fond derrière le repère d’une carte) ;
chaque élément garde le nom de sa couleur, un changement de marque le
recolore. La mascotte n’est plus posée d’office ni retirée d’office : elle
**réagit** sur la planche quand le plan le demande (une émotion de la liste
fermée des poses, trois fois par vidéo au plus, une fois par tableau, dans
une disposition où elle a sa place), avec la pose de la bibliothèque qui va
avec, jamais deux fois de suite la même. Le carton de fin reste celui que la
marque active ou non. La lisibilité de D1 lit chaque élément à sa place
posée, images clés comprises : une carte encore transparente pendant son
entrée n’est plus prise pour un fond chargé. Pas encore fait : les modèles
de l’assistant sans prise (libre, quiz, classement, diaporama) gardent leur
construction d’avant (mascotte par segment) ; ils passeront aux planches
dans une étape à part.

Vérifié avec le banc `scripts/take-stills.ts` : un plan qui passe par
toutes les dispositions et les trois mises en page, monté par
`buildTakeProject`, sans marque puis avec une marque sombre
(`--brand sombre`) ; aucun défaut de placement relevé, papier et caméra qui
glissent, traits qui partent avant les cartes en fin de tableau. Chaque
disposition, en `split` comme en `board`, est posée sans chevauchement ni
débordement dans les tests.

**I5 – Interfaces recréées, fait le 25/10/2026.** Quatre acteurs de
planche (`engine/board.ts`), faits des mêmes briques que les autres, que
« Monter ma prise » sait demander (`terminal`, `prompt`, `phone`, `tree`,
seuls ou en pile) :

- **terminal** : fenêtre sombre à trois points et titre, police de code
  embarquée (JetBrains Mono, hors des sélecteurs de polices : jamais pour un
  texte courant) ; une commande se tape lettre à lettre sur son mot, au son
  des touches, une réponse arrive d’un coup, une réussite reçoit une coche
  dessinée, alignée sur les autres lignes ;
- **champ de saisie** : la demande se tape, bouton d’envoi à flèche ;
- **téléphone** : écran de statistiques, chiffre qui défile avec ses tics et
  son coup sourd, courbe qui se trace pendant ce temps ;
- **arborescence** : le dossier en titre, les fichiers qui arrivent un à un,
  reliés par des branches qui poussent avec eux.

Vérifié sur le banc `scripts/take-stills.ts` (trois tableaux d’interfaces
ajoutés) et dans les tests : chaque interface posée sans chevauchement ni
débordement, en `split` comme en `board`, la frappe calée sur le mot de la
commande.
