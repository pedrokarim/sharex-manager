# 07 sexies – Direction artistique des vidéos

Rattaché à [07 – Image de marque](07-image-de-marque.md) et à
[01 – Clip Studio](01-clip-studio.md).

## 1. Constat (vidéos publiées avec une marque, octobre 2026)

Relevé image par image sur deux exports réels :

- **Police monospace partout.** Trois rôles de texte sur cinq (sous-titre,
  étiquette, texte courant) utilisaient la police des petites mentions de la
  planche de la marque, une monospace. Hors code, une monospace n’a rien à
  faire dans une vidéo.
- **Texte illisible.** Couleurs de la marque posées telles quelles (bleu
  sombre, encre presque noire), sans fond ni contour, sur des images souvent
  sombres ou chargées. Aucune règle de contraste dans le moteur.
- **Images délavées.** Un voile couleur papier recouvrait chaque image pour
  « faire Riso » : les visuels perdaient leur éclat sans que le texte gagne
  en lisibilité.
- **Mascotte figée.** Deux poses seulement, petites, posées au hasard sur
  l’image, sans lien avec ce que dit le segment.
- **Montage statique.** Rien ne bouge pendant des secondes : ni coupe, ni
  zoom, ni sous-titres mot à mot, ni bruitage.

Ce qui plaît et reste : l’ombre colorée décalée du titre (impression double
de la piste Riso).

## 2. Règles

1. **Lisible d’abord.** Aucun texte n’est posé « nu » sur une image : il a un
   fond (étiquette, bandeau) ou un contour épais, et le couple couleur du
   texte / couleur de ce fond atteint **4,5:1** au moins (3:1 pour un titre
   de plus de 7 % de la hauteur). Le moteur le garantit ; une marque ne peut
   pas l’enfreindre.
2. **Pas de monospace**, sauf pour un texte marqué comme du code. Une marque
   a une police de titre et une police de texte lisible (sans-serif).
3. **Images éclatantes.** Pas de voile clair sur les images. L’identité passe
   par les étiquettes, les couleurs, les trames et les cadres, pas par un
   brouillard sur le visuel.
4. **La mascotte est un personnage.** Une bibliothèque de poses étiquetées
   (émotion, geste), cohérentes avec la fiche de modèle ; l’assistant donne
   une émotion à chaque segment, le moteur choisit la pose qui va, jamais
   deux fois la même d’affilée, à une place réservée et à une taille lisible.
5. **Un rythme.** Coupes ou zooms courts dans chaque segment, sous-titres mot
   à mot en grand, visuels qui arrivent sur le mot qui les nomme, bruitages
   seulement sur les temps forts.
6. **Vérifié sur une vraie vidéo.** Chaque étape se juge sur un clip rendu,
   planche d’images à l’appui, et par une mesure du contraste sur les pixels
   rendus, pas seulement par des tests de code.

## 3. Étapes

| Étape | Contenu | Critère |
| --- | --- | --- |
| D1 – Lisibilité | Rôles de texte (titre, texte) et polices ; traitement obligatoire de chaque texte (étiquette, bandeau, contour) ; contraste calculé ; plus de voile sur les images ; trame Riso légère facultative ; marque Okiro corrigée | Sur un clip rendu de chaque modèle, image claire comme image sombre : aucun texte sous 4,5:1 mesuré sur les pixels ; aucune monospace hors code |
| D2 – Mascotte | Bibliothèque de poses par émotion et geste (générées depuis la fiche de modèle) ; émotion par segment dans le script ; choix de la pose ; place et taille | Un clip de 5 segments montre au moins 4 poses différentes, chacune en accord avec son segment |
| D3 – Rythme | Coupes et zooms courts, sous-titres mot à mot, visuel sur le mot, bruitages sur les temps forts, niveau de la musique sous la voix | Un plan ne reste jamais plus de 2,5 s sans changement ; bruitages limités aux temps forts |
| D4 – Style mesuré | Un style relevé sur une vidéo de référence (rythme des coupes, place et taille des sous-titres, zooms, bruitages) appliqué par une marque | Le clip test reste dans les valeurs mesurées de la référence |

## 4. Vérification

- Rendu réel d’un clip par modèle, sur l’instance de démonstration, avec la
  marque corrigée et une marque neutre.
- Planche d’images (une image toutes les secondes) lue à l’œil.
- Mesure : pour chaque texte, contraste entre la couleur du texte et la
  couleur réellement rendue derrière lui (pixels du fond, de l’étiquette ou
  du contour).

## 5. D2 – Mascotte : la bibliothèque de poses (partie marque)

Livrée côté marque en octobre 2026, branchée dans le moteur de Clip Studio
le même mois (§ 5.7).

### 5.1 Étiquettes

Chaque pose (image `mascot-pose`) porte `pose` : quatre étiquettes à listes
fermées (`lib/types.ts`, libellés français dans `lib/mascot.ts`).

| Étiquette | Valeurs |
| --- | --- |
| `emotion` | joie, enthousiasme, surprise, choc, réflexion, doute, déception, tristesse, colère, malice, fierté, neutre |
| `gesture` | pointe, accoudée, bras levés, mains sur les joues, pouce levé, menton dans la main, salut, montre un objet, présente (main ouverte), haussement d’épaules, bras croisés, poings sur les hanches, main sur le visage, doigt sur la bouche, recule, sans geste |
| `framing` | en pied, buste, visage |
| `facing` | vers la gauche, de face, vers la droite : le côté de l’image vers lequel elle regarde ou pointe, pour la poser en regard du contenu |

- **Dans l’image plutôt que dans `mascot`** : l’étiquette suit le fichier
  (archive, duplication, suppression, visuel refait) sans table à tenir à jour.
- **Validation stricte** (`sanitizePoseTags`) : une valeur hors liste reprend
  celle de la fiche enregistrée, jamais une valeur inventée. Une mascotte garde
  60 poses au plus.
- **Migration douce**, à la lecture (`upgradeKit`) : une pose sans étiquettes
  en reçoit d’après son libellé et sa note (`proposePoseTags` : « qui
  pointe » donne pointe et enthousiasme, « accoudée » donne accoudée,
  « portrait » donne buste…), le cadrage venant sinon de la forme de l’image.

### 5.2 Choix de la pose

`pickPose(kit, { emotion, gesture?, framing?, side?, exclude? })`, fonction
pure de `lib/mascot.ts` : l’émotion exacte, sinon une émotion voisine
(`POSE_EMOTION_NEIGHBORS`, la plus proche d’abord), sinon une pose neutre.
Jamais une émotion qui n’est pas voisine : mieux vaut aucune pose qu’une pose
triste sur un segment joyeux. À égalité, le geste demandé, puis le cadrage,
puis le côté (celui demandé, puis de face, puis l’opposé). `exclude` écarte la
pose précédente tant qu’une autre convient.

### 5.3 Détourage

Calcul pur dans `lib/cutout.ts`, décodage et réencodage par sharp dans
`lib/server/cutout-image.ts` :

- fond vert uni (`#00FF00`) reconnu sur le bord de l’image : rendu
  transparent, bords adoucis et sans reflet vert ;
- fond déjà transparent avec une lueur autour du personnage (cas rencontré
  avec Codex) : les pixels d’alpha inférieur à 112 sont retirés ;
- îlots isolés (moins d’un dix-millième de l’image) effacés, puis recadrage
  au plus près avec une marge de 2 % du grand côté ;
- réencodage en PNG : ni métadonnées ni signature C2PA.

Toute pose qui entre dans la marque (import, galerie, génération, visuel
refait) passe par là ; une image sans fond reconnu reste telle quelle.

### 5.4 Génération

« Générer des poses », dans la section Mascotte : une ligne par pose voulue
(émotion, geste, cadrage, côté), préremplie avec les émotions encore sans pose
et un geste proposé (`SUGGESTED_GESTURE`), 12 poses au plus par génération.
Le serveur (`lib/server/poses.ts`) demande chaque pose à AI Image Gen avec
trois feuilles de modèle jointes et l’identité de la mascotte, sur fond vert,
la détoure et la garde à part (`kits/<id>/pending/`). Chaque résultat
s’accepte, étiquettes retouchables, ou se rejette : rien n’entre dans la
marque en silence. Le suivi (avancement, pose en cours, arrêt) vient de
`data/pose-jobs.json`, relu toutes les trois secondes tant qu’une génération
tourne.

### 5.5 Interface

Section Mascotte, « Bibliothèque de poses » : un compteur par émotion, qui
sert aussi de filtre (une émotion sans pose apparaît en pointillés), un filtre
par geste, la grille des poses avec le résumé de leurs étiquettes (un clic
ouvre les quatre listes), l’ajout par le sélecteur d’image commun avec
détourage automatique, puis les poses générées en attente de décision.

### 5.6 Okiro

Seize poses générées par Codex avec la fiche de modèle (vues, expressions,
mains) et relues une à une : joie (pouce levé, vers la droite et vers la
gauche), enthousiasme (bras levés ; pointe vers la gauche), surprise (mains
sur les joues), choc (recule), réflexion (menton dans la main, deux fois),
doute (haussement d’épaules), déception (main sur le visage), malice (doigt
sur la bouche), fierté (poings sur les hanches), neutre (salut ; présente vers
la droite), tristesse, colère (bras croisés). Une écartée : « présente vers
la gauche », dont le regard partait à l’opposé du geste. Les trois poses
d’origine ont reçu leurs étiquettes. Les images restent dans les données
locales de la marque, hors du dépôt.

### 5.7 Moteur (suite de D2)

Branché en octobre 2026 : voir « D2 – Mascotte » dans l’état des étapes
ci-dessous.

## 5. État des étapes

### D1 – Lisibilité : faite (octobre 2026)

- **Moteur** (`modules/clip-studio/engine/legibility.ts`, appliqué par
  `applyBrandTheme`) : pour chaque texte habillé par la marque, le moteur
  regarde ce qu’il y a dessous pendant toute sa présence (image ou vidéo,
  aplat partiel ou translucide, aplat plein de couleur connue, fond du
  projet). Sur un aplat uni, rien n’est posé si le contraste suffit, sinon une
  autre couleur de la palette. Sur une image : le contour épais que dessine la
  marque (au moins 10 % de la taille du texte), sinon une étiquette (fond
  plein, coins de la marque, interligne d’au moins 1,3 pour les jambages). Les
  couleurs viennent de la palette, dans l’ordre de ses rôles ; noir ou blanc
  en dernier recours. Une étiquette de segment garde sa teinte et son texte
  s’y ajuste ; une couleur qui porte un sens (vert d’une bonne réponse,
  numéro 1) garde sa couleur et reçoit une étiquette. Le titre garde son ombre
  colorée décalée et ne déborde plus de sa place (il rétrécit si besoin).
  Sous-titres mot à mot : contour épais, mot prononcé aux couleurs de la
  marque, distinct du texte.
- **Images éclatantes** : le voile des images devient transparent dès qu’une
  marque est appliquée. Trame Riso facultative (`halftone` de la marque) :
  points d’encre à 7 % sur les aplats unis et le carton de fin, jamais sur une
  image.
- **Polices** : `modules/brand-kit/lib/typography.ts`. Une police monospace
  (reconnue à son nom, et mesurée dans l’éditeur) ne peut pas être la police
  de texte ; `toBrandTheme` et la lecture d’une fiche la remplacent par la
  police de texte de la marque (Poppins à défaut), avec un avertissement
  jusqu’au prochain enregistrement. L’éditeur a un choix « Polices des
  vidéos » (titre, texte) et la trame. Le catalogue distingue polices de texte
  (Poppins, Inter, Montserrat) et de titre.
- **Sans marque** : rendu inchangé au pixel près (128 images comparées avant
  et après, empreintes identiques).
- **Vérification sur images rendues** : chaque modèle (libre, quiz,
  classement, diaporama) et le carton de fin, rendus par `drawFrame` avec la
  marque corrigée, sur des images très claires, très sombres, très chargées
  et des photos ; contraste mesuré pour chaque texte entre les pixels de ses
  lettres et ceux rendus autour (étiquette, contour ou aplat). Avant : 181
  textes sur 331 sous le seuil, jusqu’à 1,02:1. Après : aucun, minimum 5,5:1.
- **Marque de la chaîne** : corrigée par un script hors dépôt (Poppins pour
  les textes, mise en avant rose, trame), l’ombre rose du titre gardée.
- **Reste à voir** : les polices du catalogue n’ont pas d’espace fine insécable (U+202F), que
  le navigateur emprunte à la police système. (La mascotte qui masquait un
  titre est réglée par D2.)

### D2 – Mascotte : faite (octobre 2026)

- **Étiquettes dans le moteur** (`modules/clip-studio/engine/poses.ts`) : les
  listes fermées (émotion, geste, cadrage, côté), les émotions voisines et le
  classement (`rankPoses`) vivent dans le moteur ; la marque les reprend
  (`brand-kit/lib/types.ts`) et `pickPose` n’est plus qu’un appel au même
  classement. Une seule logique pour la fiche et pour le montage.
- **Script** : quand la mascotte est posée au montage, la consigne de
  l’assistant demande à chaque segment une clé `emotion` (liste fermée), un
  `gesture` facultatif et une `outroEmotion` pour la conclusion. Lecture
  stricte : une émotion hors liste vaut `neutral`, un geste inconnu est écarté.
  L’émotion suit le segment à travers la vérification des faits et le
  raccourcissement. Les modèles la rangent sur le fond de chaque segment
  (`cue` : rang, émotion, geste, temps fort), l’accroche en
  « enthousiasme », la conclusion en joie à défaut.
- **Thème** : `toBrandTheme` passe la bibliothèque étiquetée
  (`mascot.library`). Sans elle (thème d’avant), le fonctionnement d’avant,
  inchangé.
- **Choix** : l’ouverture garde la pose choisie par la marque ; chaque segment
  suivant reçoit la pose de son émotion (exacte, voisine, sinon neutre, le
  geste demandé à égalité), jamais la précédente, ni l’avant-dernière tant
  qu’une autre convient. Posée à gauche, elle regarde à droite (vers le
  contenu), et inversement ; faute de pose du bon côté, l’image est
  retournée en miroir (`flipX`, dessiné par `render.ts`).
- **Place et taille** : le moteur estime la place de chaque texte du segment
  (sous-titres compris, groupe de mots le plus large), des icônes et des
  cadres, et pose la mascotte à gauche ou à droite là où elle ne recouvre
  rien, dans la zone visible d’un short (ni le haut, ni la légende, ni les
  boutons). Hauteurs essayées selon le cadrage : de 40 % à 24 % de la hauteur
  pour une pose en pied, de 30 % à 19 % pour un buste ; plus petite, elle
  n’est pas posée. Quand une marque ou l’assistant crée le clip, les modèles
  lui gardent une place : titres de l’ouverture et de la conclusion remontés,
  choix du quiz décalés à droite (la pose se tient dessous à gauche), icône à
  droite. Entrée par « surgissement rebondi », sortie par « rétrécissement en
  fondu » (préréglages du registre).
- **Vérifié sur Okiro** (19 poses, rendu par `drawFrame`, une image toutes
  les 0,5 s) : au libre (5 séquences), 7 poses posées, 7
  différentes ; quiz 5 sur 5 ; classement 6 sur 6 ; diaporama 6 posées,
  5 différentes ; libre en 16:9, 5 sur 5. Chacune en accord avec l’émotion de
  son segment (la même ou une voisine). Hauteur de 24 % à 33 % d’un short
  (38 % à 72 % d’un cadre large). Chevauchement mascotte / texte mesuré sur
  les pixels rendus de chaque image : 0. Critère de l’étape tenu : sur
  5 segments, au moins 4 poses différentes.

### D3 – Rythme : fait (octobre 2026)

Appliqué quand une marque ou l’assistant crée le clip
(`buildFromTemplate(…, theme, { pace })`), jamais à un projet existant ouvert
tel quel. Tout ce qui est posé est ordinaire : plans, effets de plan, pistes
« Sous-titres » et « Bruitages », que l’éditeur déplace, retouche ou
supprime.

- **Réglage de la marque** : « Rythme du montage » (`pace`) : `calm`
  (montage d’avant, la mascotte gardant sa place), `normal` (un changement
  toutes les 2,2 s au plus), `lively` (toutes les 1,4 s). Absent : `normal`.
  Un clip de l’assistant sans marque prend `normal`. Sans marque ni
  assistant, rien ne change (128 images comparées avant et après, empreintes
  identiques).
- **Plans** (`engine/rhythm.ts`) : le fond image de chaque segment est
  découpé en plans de 1 à 2,2 s, le même visuel cadré autrement à chaque
  coupe, avec les mouvements de caméra existants (zoom avant au plus ×1,15,
  panoramique, zoom arrière), un seul sens par plan. Un moment encore
  immobile (aplat sans image, carton de fin fini) reçoit un zoom bref
  (« zoom sur le temps fort ») sur le texte ou l’image de l’instant. Le
  carton de fin de plus de 2,5 s montre son appel à l’action 1,2 s après le
  reste.
- **Sous-titres mot à mot** avec la voix off (libre et diaporama, dont le
  texte lu devient les sous-titres) : gros, sans fondu, en bas du tiers
  central d’un short (67 % de la hauteur), le mot prononcé aux couleurs de la
  marque, lisibles selon D1. Le quiz et le classement les laissent de côté :
  tout ce que la voix lit y est déjà écrit à l’écran.
- **Le visuel sur le mot** : l’icône d’un sujet apparaît quand la voix
  prononce son nom (mots horodatés de la voix, nom tiré de la requête de
  l’icône, ou titre de l’élément au classement, réponse au quiz) ; un nom
  absent de la voix laisse l’icône à sa place d’avant.
- **Bruitages** (`engine/sfx.ts`, écrits dans `data/resources/sfx/` par
  `lib/sfx.ts`) : impact, whoosh, pop, révélation, synthétisés par le code
  d’après une recette fixe : aucun enregistrement d’autrui, donc ni licence ni
  mention. Posés sur les temps forts seulement, trois au plus : l’accroche
  (impact), la révélation (numéro 1, bonne réponse de la dernière question),
  la fin (whoosh sur le carton). Volume 0,45, sous la voix (0,9).
- **Musique sous la voix** (`engine/mix.ts`, aperçu et export) : avec une voix
  off, la musique de l’assistant joue à 0,28 entre les répliques et s’efface à
  ×0,43 pendant que la voix parle (descente 0,12 s, remontée 0,3 s). Mesuré
  sur la banque (musique vers −11 LUFS, voix de synthèse vers −16,5 LUFS) :
  la musique passe environ 12 dB sous la voix. Avant : 0,14 fixe, environ
  10,7 dB sous elle, sans respiration entre les répliques.
- **Vérifié sur des clips rendus** : chaque modèle avec Okiro (voix aux mots horodatés,
  photos, icône), une image toutes les 0,5 s. Plus long plan sans
  changement : libre 2,10 s, quiz 2,20 s, classement 1,97 s, diaporama
  2,13 s, libre en 16:9 2,10 s, rythme vif 1,40 s, clip de l’assistant sans
  marque 2,10 s (rythme calme : 8,7 s, le montage d’avant, voulu).
  Contraste des textes mesuré sur les pixels, textes posés : 5,54:1 au plus
  bas. Bruitages : 2 au libre et au diaporama (accroche, fin), 3 au quiz et
  au classement (plus la révélation), 0 en rythme calme.
- **Reste à faire** (interface, hors de ce lot) : le choix « Rythme du
  montage » dans l’éditeur de la marque, et dans l’inspecteur de Clip Studio
  le miroir d’une image et le creux sous la voix d’une musique (`flipX`,
  `duck` se règlent aujourd’hui par le projet).
