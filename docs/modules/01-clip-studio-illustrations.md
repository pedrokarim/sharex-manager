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
| I4 – Ressources | Logos SVG officiels, découpes, bibliothèque d’illustrations de la marque, nouveaux bruitages | Chaque outil nommé dans les trois prises de I2 a son vrai logo |
| I5 – Interfaces recréées | Terminal, champ de saisie, téléphone (statistiques), arborescence, fiche de compte, dessinés par le moteur et animés | Les séquences 40–46 s et 49–55 s de la référence reproduites |
| I6 – Éditeur | Panneau « Illustrer », tracé à la souris, actions sur la chronologie, inspecteur | Karim pose une flèche et une barre sur un mot sans aide |
| S1 – Fiche de voix | Questions guidées, fiche dans la marque, relue par le créateur | Les scripts citent ses vrais chiffres et ses mots |
| S2 – Raisonnement | Nouvelles consignes (§ 4.2), notes visuelles, faits sans case à remplir, quatre contrôles (fait, voir § 7) | Sur cinq sujets, aucun script ne passe le contrôle « interchangeable » à l’aveugle |
| S3 – Niche et historique | Concepts de la niche mesurés, historique des sujets et accroches | Une semaine de cinq scripts : cinq concepts prouvés, aucune forme d’accroche deux fois de suite |

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
