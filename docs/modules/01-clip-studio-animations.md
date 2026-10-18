# 01 bis – Clip Studio : la bibliothèque d’animations

Rattaché à [01 – Clip Studio](01-clip-studio.md), étape 10.

## 1. Le but

Clip Studio connaît aujourd’hui neuf animations d’entrée et de sortie, cinq
transitions et sept mouvements de caméra. Une chaîne de shorts en demande
beaucoup plus : un titre qui tombe lettre par lettre, une légende qui se
décode, un chiffre qui défile, un plan qui secoue à l’impact, une étiquette
qui pulse. Le but est de donner à Clip Studio **une vraie bibliothèque**,
plusieurs centaines d’animations prêtes à l’emploi, utilisables à la main
dans l’éditeur, par les modèles, par l’assistant et par les images de marque.

La matière vient d’un catalogue public d’animations d’interface et de texte,
consulté comme référence : chaque fiche y donne la durée, la courbe, les
images clés et les décalages de l’animation. On le parcourt **en entier**,
on garde tout ce qui peut vivre dans une vidéo, et on le réécrit dans le
modèle de Clip Studio.

## État au 12/10/2026

| Étape | État |
| --- | --- |
| A0 | Faite : inventaire et tri (§ 3) |
| A1 | Faite : moteur à pistes (`engine/motion/`), 31 courbes nommées, Bézier, ressorts, marches ; rotation, échelles par axe, inclinaison, flou, luminosité, découpe, couleur ; phase de mise en avant (`animEmphasis`) ; les neuf animations d’origine rendent à l’identique (plus de 10 000 valeurs comparées) |
| A2 | Faite : 77 préréglages d’éléments (`presets/elements.ts`), qui couvrent 82 fiches ; 81 comparaisons visuelles sur 82 dans les seuils |
| A3 | Faite : texte découpé par lettre, mot ou ligne (`text-layout.ts`), 7 premiers préréglages (`presets/text.ts`) puis 71 de la bibliothèque (`presets/text-library/`), qui couvrent 78 fiches |
| A4 | Faite : effets (brouillage et décodage, compteur au format français, curseur de frappe, glitch en tranches), calques secondaires (copie teinte pour la lueur et l’aberration chromatique, traîne, anneau, reflet, voile, ombre au sol, fond, surligneur, soulignement, trait barré), masques de forme (cercle, losange, biais, taches, stores, barres, horloge, mosaïque), ancrage des transformations, espacement par lettre, piste propre du fond du texte (`motion/effects.ts`, `presets/effects.ts`) ; 50 préréglages et la finition de 9 préréglages livrés (traîne de `dash-out` et `spring-in`, lueur de `bloom-in` et `neon-on`, anneaux de `flash-pulse`, `beat` et `refuse`, reflets de `lift` et `star-land`) ; aucun autre projet ne change de rendu (1,4 million d’appels de dessin comparés) |
| A5 | Faite : transitions, caméra et effets de plan en pistes (`motion/scenes.ts`) ; les cinq transitions et les sept mouvements d’origine rendent les mêmes valeurs (plus de 60 000 comparées), 29 transitions, 12 mouvements de caméra et 8 effets de plan (impact) de plus ; dans l’éditeur depuis le 12/10/2026 : tout le catalogue, rangé par catégorie, dans l’inspecteur et au clic droit de la timeline, avec recherche, favoris et vignettes dessinées par `drawFrame` ; effets de plan posés au clic droit d’une piste, montrés en marques, déplacés en les tirant et réglés dans leur inspecteur (§ 7) |
| A6 | Faite : 5 mises en avant, 7 boucles (plus 5 boucles lumineuses d’A4) et 8 grilles (`presets/attention.ts`) ; une boucle s’arrête net avec la sortie, calques compris. Les grilles découpent un élément en carreaux décalés ; un décalage entre plusieurs éléments reste celui de leurs débuts sur la timeline |
| A7 | Faite, sauf la passe d’intégrité visuelle : sélecteur par phase dans l’inspecteur (onglets Entrée, Sortie, Mise en avant), catalogue rangé par catégorie avec recherche sans accents, favoris gardés dans le navigateur, filtre selon le type d’élément ; vignettes dessinées par `drawFrame`, jouées au survol ou au clavier sur une seule horloge, figées au milieu de l’animation si le système réduit les animations ; réglages déclarés dessinés d’après leur forme ; clic droit de la timeline rangé par catégorie avec « Plus d’animations… » ; entrée et sortie teintées aux bords du bloc et réglables en tirant leur poignée (`components/motion-*.tsx`, `lib/motion-catalog.ts`) |
| A8, A9 | À faire |

Le convertisseur a lu 439 fiches : 108 brouillons prêts, 109 partiels, 222 à reprendre à la main. Ce qui reste attend surtout des capacités du moteur, par ordre de fiches débloquées :

| Besoin | Fiches | Étape |
| --- | --- | --- |
| Calques secondaires (halo, anneau, reflet, voile, traîne, copies) | 18 éléments, et la finition de 8 préréglages livrés | fait (A4) ; restent les particules et les étincelles |
| Groupes et grilles (décalage entre plusieurs éléments) | 15 | fait pour les grilles (A6) ; les fiches de tuiles en 3D attendent `rotateY` |
| 3D (`rotateX`, `rotateY`, perspective) | 5 éléments, 14 textes | plus tard |
| Brouillage et décodage, compteur, surlignage, soulignement, curseur, lueur, chromatisme | 26 textes | fait (A4) ; restent la frappe « humaine » (décalage irrégulier), les afficheurs à segments et le cercle griffonné (tracé) |
| Espacement par lettre, ancrage de transformation, piste propre du fond | 13 textes, 2 éléments | fait (A4) |
| Masques de forme (cercle, biais, tache) | 5 éléments, 3 textes | fait (A4), avec losange, stores, barres, horloge et mosaïque ; restent les masques flous |
| Réglages « ordre » et « unité de découpe » (`MotionParam`) | évite des doublons de préréglages | moteur : à déclarer (l’inspecteur les affiche déjà, A7) |
| Particules, effets de pixels, police variable, texte sur un chemin | 14 éléments, 25 textes | plus tard |

## 2. Ce que l’on reprend, et comment

Le catalogue ne porte aucune licence ni condition d’utilisation : il est donc
sous tous droits réservés. La ligne suivie :

- **On reprend les faits** : une durée, une courbe d’accélération, une
  amplitude, un décalage entre lettres, l’ordre des images clés. Ce sont des
  paramètres, pas des œuvres, et beaucoup sont des courbes publiques et
  anciennes.
- **On ne reprend pas** le code des démos, les textes des fiches, leurs
  noms, leurs médias, ni l’organisation du catalogue telle quelle : chaque
  animation reçoit un nom français à nous, une catégorie de Clip Studio, des
  réglages pensés pour la vidéo, et les doublons sont fusionnés.
- **Rien de la source n’entre dans le dépôt** : ni nom d’auteur, ni adresse,
  ni copie des fiches. L’inventaire extrait et les comparaisons visuelles
  vivent dans le dossier de travail de la session, hors de git.

## 3. L’inventaire

Relevé le 12/10/2026 sur les données publiques du catalogue (fichiers de
données chargés dans un bac à sable, hors du dépôt) : **782 fiches** en
64 catégories, dont 228 de texte, 191 de l’atlas (principes, courbes,
ressorts, caméra), le reste d’interface et de jeu. Chaque fiche porte une
durée, une courbe, des notes de reproduction et, pour le texte, l’unité
découpée (caractère 99, mot 37, ligne 23, bloc 47, groupe 22).

| Lot | Fiches | Catégories | Pour Clip Studio |
| --- | --- | --- | --- |
| Texte, prêt pour la vidéo | 194 | apparition, sortie, mise en avant, remplacement, frappe, physique, masque, couleur et lumière, flou, glitch, profondeur, sous-titres, titres, bandeaux télé, boucles, compteurs, mise en page | **oui** (A3, A4) |
| Texte, à adapter | 54 | défilement, pointeur, police variable, texte sur un chemin, japonais | en partie (A9) : le défilement devient du temps, le pointeur est écarté |
| Éléments | 148 | entrée, déplacement, échelle, rotation, réaction, attention, lumière, effets, listes, boucles, récompenses, impacts, cinématiques | **oui** (A2, A6) |
| Transitions et caméra | 43 | transitions entre plans, mouvements de caméra | **oui** (A5) |
| Courbes et ressorts | 73 | courbes, ressorts, rythme, principes | **oui**, comme bibliothèque de courbes (A1), pas comme animations |
| Plus tard | 63 | tracés SVG, particules, données, 3D, étalonnage, personnages | non pour l’instant : un moteur est à créer pour chacun |
| Hors vidéo | 207 | défilement de page, survol, formulaires, boutons, navigation, chargements, interfaces de jeu, son | non : ils réagissent à un utilisateur, pas au temps |

Environ **385 fiches** passent directement dans une vidéo, 54 de plus après
adaptation, et 73 nourrissent la bibliothèque de courbes. Une fois les
quasi-doublons fusionnés (beaucoup de fiches ne diffèrent que par une
amplitude), on vise **250 à 300 préréglages distincts**.

**Les notes de reproduction** sont semi-structurées, par exemple
`y 40px → 0 / opacity 0 → 1 / stagger 0.05s / 0.9s power3.out` pour le texte,
ou `0ms Y+24 · Opacity 0% / 600ms Y0 · Opacity 100%` pour les éléments.
164 notes d’éléments suivent la forme « instant · propriété valeur » et se
convertissent sans aide ; les notes de texte suivent presque toutes la forme
« propriété départ → arrivée / décalage / durée courbe ». Le reste mêle
notation et phrases et demande une relecture.

## 4. Ce que le moteur sait faire aujourd’hui

- `engine/timeline.ts`, `applyAnim` : neuf animations codées une par une
  (`fade`, quatre `slide-*`, `pop`, `zoom`, `typewriter`, `wipe`), une seule
  courbe à l’entrée (`outCubic`) et une à la sortie (`inCubic`).
- `AnimState` : opacité, décalage, échelle, révélation, balayage. Ni
  rotation, ni échelle par axe, ni flou, ni couleur.
- `engine/render.ts` : un texte se dessine **ligne par ligne** ; rien ne
  permet d’animer un mot ou une lettre à part (le karaoké colore un mot, il ne
  le déplace pas).
- Cinq transitions (`fade`, `fade-black`, `slide`, `wipe`, `zoom`) et sept
  mouvements de caméra, chacun codé à la main.

Tout est fonction de l’image (`frame`) : l’aperçu et l’export dessinent
exactement la même chose. Le nouveau moteur garde cette règle.

## 5. Le nouveau modèle : des pistes d’images clés

Une animation n’est plus du code : c’est une **donnée**, lue par un seul
interpréteur.

```ts
/** Propriétés animables d'un élément, ou d'une unité de texte. */
type MotionProperty =
  | "opacity"
  | "x" | "y"                 // fraction du petit côté du cadre, ou de la taille du texte (unités « em »)
  | "scale" | "scaleX" | "scaleY"
  | "rotate"                  // degrés
  | "skewX"
  | "blur"                    // fraction de la taille du texte
  | "brightness"
  | "reveal"                  // part visible, de 0 à 1 (frappe, masque)
  | "wipe"                    // balayage, avec un angle
  | "clip"                    // découpe rectangulaire (haut, droite, bas, gauche)
  | "tracking"                // espacement des lettres
  | "color";                  // couleur du texte, interpolée en OKLab

interface Keyframe {
  /** Position dans l'animation, de 0 à 1. */
  at: number;
  value: number | string;
  /** Courbe qui mène à cette image clé. */
  ease?: EaseSpec;
}

/** Une courbe : un nom de la bibliothèque, une Bézier, un ressort ou des marches. */
type EaseSpec = EaseName | { bezier: [number, number, number, number] } | { spring: { mass: number; stiffness: number; damping: number } } | { steps: number };

interface MotionPreset {
  id: string;                      // « rise-short », « drop-bounce »… à nous
  label: string;                   // « Montée courte »
  category: MotionCategory;        // nos catégories (§ 9)
  phase: "in" | "out" | "emphasis" | "loop";
  target: "any" | "text" | "image" | "shape";
  /** Durée par défaut, modifiable dans l'inspecteur. */
  durationMs: number;
  /** Texte : unité animée, et décalage entre unités. */
  split?: "whole" | "line" | "word" | "char";
  stagger?: { eachMs: number; from: "start" | "end" | "center" | "random"; ease?: EaseSpec };
  tracks: Partial<Record<MotionProperty, Keyframe[]>>;
  /** Effets qui ne s'interpolent pas : brouillage, curseur, compteur, secousse. */
  effects?: MotionEffect[];
  /** Réglages exposés : intensité (0 à 2), direction, et leur effet sur les pistes. */
  params?: MotionParam[];
}
```

Dans un projet, `Anim` devient `{ kind: string; frames: number; params? }` :
`kind` est l’identifiant d’un préréglage. Les neuf animations actuelles
deviennent des préréglages **sous le même identifiant**, avec un rendu
identique au pixel près (tests), et le format de projet reste `version: 1`.

**Une quatrième phase.** Aujourd’hui un élément a une entrée et une sortie.
Il gagne `animEmphasis?: Anim & { at: number; repeat?: number }` : une mise en
avant (pulsation, secousse, lueur) jouée pendant que l’élément est à l’écran,
une fois ou en boucle.

**La bibliothèque de courbes** (`engine/motion/easing.ts`) : la famille
classique complète (sine, quad, cubic, quart, quint, expo, circ, back,
elastic, bounce, chacune en entrée, sortie et entrée-sortie), les Bézier
cubiques, les ressorts (résolus une fois puis échantillonnés, pour rester
déterministes) et les marches. Les noms des autres outils (`power3.out`,
`easeOutCubic`, `back.out(1.7)`, `inOut(3)`) sont traduits par une table de
correspondance utilisée par le convertisseur (§ 8), jamais exposés tels quels.

**Le hasard reste reproductible** : un décalage « aléatoire » ou un
brouillage tire ses valeurs d’un générateur initialisé par l’identifiant de
l’élément et le rang de l’unité. L’aperçu et l’export tombent toujours sur les
mêmes lettres.

## 6. Le texte découpé

C’est l’ajout qui change le plus les vidéos.

1. **Mise en page une fois** : le texte est découpé en lignes (`wrapText`),
   puis en mots (`Intl.Segmenter` en mode `word`), puis en graphèmes (mode
   `grapheme`, pour qu’un accent, une ligature ou un émoji restent entiers).
   Chaque unité reçoit sa position mesurée. Le résultat est gardé en cache par
   texte, style et largeur.
2. **Un état par unité** : l’interpréteur calcule l’état de chaque unité à
   l’image demandée, avec son décalage (`stagger`) et son ordre (début, fin,
   centre, hasard).
3. **Dessin par unité** : chaque unité est dessinée avec sa transformation,
   son opacité, son flou. Le contour, l’ombre et le fond du style restent
   ceux du bloc ; le fond (étiquette) peut lui-même avoir sa piste.
4. **Effets** : brouillage puis décodage (caractères tirés d’un jeu choisi,
   qui se fixent dans l’ordre), curseur de frappe, compteur (un nombre qui
   défile jusqu’à sa valeur, avec le format français), surlignage qui se
   déroule, soulignement qui se trace.
5. **Karaoké** : les sous-titres animés gardent leur logique de mots
   prononcés ; une animation de mot (pop, rebond, couleur) peut s’y appliquer
   au mot prononcé.

## 7. Transitions et caméra

- **Transitions** : une transition devient un préréglage à deux pistes
  d’images clés, l’une pour le plan qui part, l’autre pour celui qui arrive
  (glissement poussé, zoom traversant, rideau, iris, flou croisé,
  balayage en biais…). Les cinq actuelles gardent leur identifiant.
- **Caméra** : les mouvements d’une image (Ken Burns, travelling, zoom
  « coup de poing », secousse, tremblement d’impact) sont des pistes sur le
  zoom, le cadrage et la rotation de la caméra. Les sept actuels gardent leur
  identifiant.
- **Effets de plan** (impact) : flash blanc, secousse de tout le cadre,
  aberration de couleur légère. Ils s’appliquent à une piste entière à un
  instant donné ; c’est la catégorie qui manque le plus aux shorts d’action.

### Dans l’éditeur

- **Catalogue** (`lib/scene-catalog.ts`) : les listes du moteur
  (`listTransitions`, `listCameraMoves`, `listShotFx`), rangées par
  catégories lisibles (transitions : Fondus, Glissements et poussées,
  Balayages et formes, Zooms et rotations, Mouvements vifs, Flashs et
  lumière ; caméra : Zooms, Panoramiques et travellings, Impacts, Mise au
  point et ambiance ; effets : Flashs et lumière, Secousses et zooms,
  Couleur). Un préréglage que le moteur ajouterait sans catégorie va dans
  « Autres » ; un test vérifie qu’il n’y en a aucun aujourd’hui. Les noms
  sont ceux du moteur ; les cinq transitions et les sept mouvements
  d’origine gardent le leur. Un identifiant inconnu (projet plus récent)
  s’affiche « Inconnue (…) » pour une transition, « Inconnu (…) » pour
  un mouvement ou un effet, sans planter : le moteur le joue comme un
  fondu, une image fixe ou rien.
- **Sélecteur** (`components/scene-picker.tsx`) : dans l’inspecteur
  (« Transition », « Mouvement de caméra » d’une image ou d’une vidéo),
  dans une fenêtre ouverte depuis la timeline, ou en tiroir sur un
  téléphone : recherche sans accents, filtres par catégorie, favoris propres
  à chaque famille (séparés de ceux des animations, dont les identifiants se
  recoupent), vignettes dessinées par `drawFrame` (`lib/scene-preview.ts`,
  `components/scene-thumbnail.tsx`) : une transition passe d’un aplat
  « A » à un aplat « B », un mouvement anime un paysage témoin, un effet
  le frappe. Choisir une transition pose sa durée conseillée, sauf si la
  durée a été réglée à la main.
- **Clic droit de la timeline** : « Transition d’entrée », « Mouvement
  de caméra » et « Effet de plan ici » sur un plan, « Ajouter un effet
  de plan ici » sur une piste visuelle, à l’instant visé ; chaque
  sous-menu range par catégorie, favoris en tête, et finit par le catalogue
  à vignettes. Sur un téléphone, une seule entrée ouvre le catalogue en
  tiroir.
- **Effets de plan** (`components/scene-fx.tsx`) : une marque en haut de
  la piste, à l’instant de l’effet, prolongée sur sa durée. Un clic ouvre son
  inspecteur (aperçu, instant, durée de 0,1 à 3 s, « Changer », « À la
  tête de lecture », « Retirer l’effet ») ; un glissement la déplace
  (aimantée comme un plan), les flèches la décalent d’une image (d’une
  seconde avec Maj), Suppr la retire. Une piste verrouillée garde ses effets
  sans les laisser modifier. Chaque geste est une étape d’annulation ; les
  curseurs d’un même réglage se regroupent en une seule.

## 8. Récupérer tout le catalogue, étape par étape

1. **Inventaire** (fait) : les données publiques du catalogue sont chargées
   dans un bac à sable Node et rangées dans un fichier de travail hors du
   dépôt, avec, pour chaque fiche, sa catégorie, sa durée, sa courbe, ses
   notes de reproduction et son unité.
2. **Tri** : la table du § 3 répartit automatiquement les catégories ; une
   relecture confirme fiche par fiche qu’elle peut vivre dans une image de
   vidéo (une animation déclenchée par un survol, par exemple, est écartée
   même dans une catégorie retenue).
3. **Brouillon automatique** : un convertisseur (script de travail, hors du
   dépôt) lit les notes de reproduction et produit un brouillon dans le modèle
   du § 5 :
   - propriétés reconnues (`y`, `x`, `opacity`, `scale`, `scaleX`, `scaleY`,
     `rotate`, `blur`, `skew`, couleurs, révélation) et leurs valeurs ;
   - unités converties : les pixels des démos (cadre de 320 × 200) deviennent
     des fractions du cadre ou de la taille du texte ;
   - durées, décalages et courbes traduits par la table de correspondance ;
   - unité de découpe reprise pour le texte ;
   - une fiche dont la note ne se lit pas entièrement est marquée « à
     compléter », jamais devinée en silence.
4. **Réécriture** : chaque brouillon est relu et complété (par un agent,
   puis validé par goût dans l’éditeur) : nom français, catégorie de Clip
   Studio, réglages exposés (intensité, direction), fusion des doublons.
5. **Comparaison visuelle** : pour chaque préréglage, on dessine nos images
   avec `drawFrame` à 0, 25, 50, 75 et 100 % de l’animation, et on les met à
   côté des images de la démo de référence capturées aux mêmes instants
   (Chrome sans interface). Position, échelle et opacité sont mesurées des
   deux côtés ; un écart au-delà du seuil renvoie le préréglage en relecture.
   Ces comparaisons restent dans le dossier de travail.
6. **Intégration par lots** (§ 11) : chaque lot entre avec ses tests, son
   sélecteur à jour, et la passe d’intégrité visuelle de l’interface.

## 9. Interface

- **Inspecteur** : un sélecteur « Animation » par phase (Entrée, Sortie,
  Mise en avant, Boucle), rangé par nos catégories (Fondus, Glissements,
  Échelles et rebonds, Rotations, Masques et balayages, Flous et lumières,
  Lettre par lettre, Mot par mot, Frappe et décodage, Glitch, Impacts,
  Compteurs, Titres et bandeaux…), avec une recherche et des favoris.
- **Vignettes animées** : chaque préréglage se montre sur un petit canevas
  qui joue l’animation au survol, dessinée par le même moteur que la vidéo.
- **Réglages** : durée, intensité, direction ; pour le texte, l’unité, le
  décalage et l’ordre.
- **Timeline** : la durée des phases d’entrée, de sortie et de mise en avant
  se voit et se règle au bord de l’élément.
- **Galerie** (page « Animations », `pages/animations.tsx`, `lib/motion-gallery.ts`) :
  tout le catalogue en vignettes vivantes, en sept onglets (Éléments, Texte,
  Effets, Mises en avant, Transitions, Caméra, Effets de plan), avec
  recherche, catégories, favoris partagés avec le sélecteur et « Tout lire »
  (seules les vignettes visibles jouent, sur l’horloge commune) ; une carte
  ouverte donne sa fiche : aperçu réglable, détails et chemin dans l’éditeur.
- Pleine largeur, chargements localisés, et **passe d’intégrité visuelle**
  obligatoire (clair et sombre, cinq largeurs, noms longs) avant livraison.

## 10. Marques et assistant

- **Mouvement de la marque** : une image de marque choisit ses préréglages
  par rôle de texte (titre, sous-titre, légende, étiquette) et son ouverture.
  `applyBrandTheme` les pose sur les éléments qui portent une indication de
  rôle, comme il pose déjà les styles. C’est la réponse à la question ouverte
  de l’« ouverture animée de la marque » (dossier 07).
- **Modèles et assistant** : chaque modèle (quiz, classement…) reçoit une
  courte liste de préréglages qui lui vont, au lieu de ses animations codées
  en dur ; l’assistant choisit dans cette liste, jamais au hasard dans tout le
  catalogue.

## 11. Découpage

| Étape | Contenu | Critères d’acceptation |
| --- | --- | --- |
| A0 | Inventaire et tri | Fait le 12/10/2026 (§ 3) |
| A1 | Interpréteur de pistes, bibliothèque de courbes, `AnimState` étendu (rotation, échelle par axe, flou, couleur, découpe), migration des neuf animations actuelles en préréglages | Tous les projets existants rendent les mêmes images au pixel près ; tests de chaque courbe aux bornes |
| A2 | Préréglages d’éléments (lot « Éléments », hors listes et boucles) | Environ 80 préréglages, chacun comparé visuellement (§ 8.5) |
| A3 | Texte découpé (§ 6, points 1 à 3) et préréglages de texte (apparition, sortie, remplacement, physique, masque, profondeur, titres) | Une phrase de 60 caractères animée lettre par lettre s’exporte en 9:16 sans saut d’image ; les accents et les émojis restent entiers |
| A4 | Effets : flou, lumière, couleur, brouillage, frappe avec curseur, compteur, surlignage | Un compteur « 0 → 1 250 » s’affiche au format français ; un décodage est identique entre l’aperçu et l’export |
| A5 | Transitions et caméra à pistes, effets de plan (impact) | Les cinq transitions et sept mouvements actuels sont inchangés ; 30 nouveaux |
| A6 | Mise en avant et boucles (`animEmphasis`) | Une pulsation en boucle s’arrête avec la sortie de l’élément |
| A7 | Sélecteur avec vignettes animées, recherche, favoris | Passe d’intégrité visuelle réussie. Interface faite le 12/10/2026 ; la passe reste à faire |
| A8 | Mouvement de la marque, préréglages des modèles et de l’assistant | Deux clips d’une même marque ont les mêmes animations de titre |
| A9 | Texte à adapter : défilement converti en temps, texte sur un chemin, polices variables | Selon ce que les polices du catalogue de Clip Studio permettent |

Ce qui reste après A7 :

- la passe d’intégrité visuelle du sélecteur, de son tiroir mobile et des
  zones de la timeline (clair et sombre, cinq largeurs, noms longs)
  avant de déclarer l’étape réussie ;
- les réglages « ordre » et « unité de découpe » sont à déclarer dans
  le moteur (`MotionParam`) : l’inspecteur dessine déjà tout réglage à
  options (`options`) ou à plage (`min`, `max`), sans code nouveau ;
- la mise en avant se voit sur le bloc de la timeline (trait sous le bloc)
  mais ne se règle qu’à l’inspecteur ;
- la question des « essentiels » en tête du sélecteur (§ 13) reste
  ouverte : les favoris en tiennent lieu pour l’instant.

Ce qui reste après A4 à A6 :

- la comparaison visuelle des nouveaux préréglages s’est faite sur les
  valeurs relevées dans les fiches (échelles des anneaux, écarts de
  l’aberration, décalages, durées, courbes : 29 mesures, aucun écart au-delà
  des seuils), et par planches dessinées avec `drawFrame` ; la capture des
  démos de référence (§ 8.5) reste à faire pour ces lots ;
- les nouvelles transitions, la caméra (images et vidéos) et les effets de plan
  (`Track.effects`) se choisissent dans l’éditeur depuis le 12/10/2026 (§ 7,
  « Dans l’éditeur ») ;
- un compteur reprend l’écriture du nombre : « 1 250 » écrit avec une
  espace fine insécable compte avec elle, « 1250 » sans séparateur ;
- la dernière image de l’ancien « Zoom » appelait une mise à l’échelle de
  1,0000000000000002 que la piste ne fait plus : même image au pixel près.

## 12. Tests

- Chaque préréglage : état de repos atteint à la fin d’une entrée et au début
  d’une sortie, aucune valeur `NaN`, décalages bornés à la durée de l’élément.
- Courbes : valeurs aux bornes, monotonie quand elle est attendue, ressorts
  stables.
- Texte découpé : segmentation des accents, ligatures et émojis ; cache de
  mise en page invalidé quand le texte ou le style change.
- Déterminisme : deux rendus de la même image donnent les mêmes pixels.
- Rétrocompatibilité : les projets de démonstration rendent les mêmes images
  qu’avant A1.
- Performance : l’export d’un short de 60 s en 9:16 avec des titres animés
  lettre par lettre ne double pas le temps d’export actuel.

## 13. Questions ouvertes

- **Combien en garder visibles ?** 250 à 300 préréglages, c’est beaucoup
  dans un sélecteur : peut-être 60 « essentiels » en tête, le reste par
  catégorie.
- **Le son des animations** : un « whoosh » calé sur une transition ou un
  impact rendrait les shorts plus vivants ; il faudrait une petite banque de
  bruitages libres, comme pour la musique.
- **Le texte vertical japonais** : utile seulement si une chaîne publie en
  japonais.
