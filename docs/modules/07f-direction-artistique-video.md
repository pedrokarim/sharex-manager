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

Livrée côté marque en octobre 2026. Le choix de la pose dans le montage
(moteur de Clip Studio) reste à brancher (§ 5.7).

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

### 5.7 Reste pour le moteur (suite de D2)

- Émotion de chaque segment dans le script (assistant de Clip Studio).
- Thème de la marque (`toBrandTheme`) : passer la bibliothèque étiquetée au
  moteur au lieu de la simple liste `reactions`.
- Le moteur appelle `pickPose` à chaque segment, avec `exclude` (la pose
  précédente) et `side` (le côté du contenu) ; faute de pose du bon côté, il
  peut retourner l’image en miroir (deux poses d’Okiro sur seize seulement
  regardent vers la gauche, six vers la droite, huit sont de face).
- Place réservée et taille lisible ; critère de l’étape : un clip de
  5 segments montre au moins 4 poses différentes, chacune en accord avec son
  segment.

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
- **Reste à voir** : la mascotte peut encore masquer un titre (D2) ; les
  polices du catalogue n’ont pas d’espace fine insécable (U+202F), que le
  navigateur emprunte à la police système.
