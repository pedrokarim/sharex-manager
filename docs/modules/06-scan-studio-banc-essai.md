# 06 – Scan Studio : banc d’essai de la lecture (étape S0)

Ce que vaut Tesseract pour repérer et lire le texte anglais d’une page, mesuré
avant de construire l’étape S2. Complète le [dossier du module](06-scan-studio.md),
§ 7.1, § 7.2 et § 14.

- **Date** : 06/10/2026.
- **Périmètre** : anglais seulement, niveau 1 de l’échelle de recours (rien
  n’est envoyé, rien n’est généré). Le japonais, le chinois et le coréen
  ont été mesurés à l’étape S4 : § 8.
- **Moteur** : `tesseract.js` 7.0.0 (cœur WebAssembly 7.0.0, moteur LSTM seul),
  données `@tesseract.js-data/eng` 1.0.0, variante `4.0.0_best_int` (2,9 Mo
  compressés).

## 1. Ce qui a été mesuré

Dix pages **dessinées pour l’occasion** (cases, formes simples, bulles au texte
inventé, tracées en SVG) : aucune page de manga, de bande dessinée ou de
webtoon existante, aucun personnage existant. Cinquante-huit textes, dont la
position, le contenu et le type sont connus d’avance.

| Page | Ce qu’elle met à l’épreuve |
| --- | --- |
| 01, 02 | Capitales Arial gras de 30 px, bulles voisines, cartouche noir, onomatopée cernée et penchée |
| 03 | Casse mixte, Comic Sans de 18 à 26 px, césure de fin de ligne, `I` et `l` voisins |
| 04 | Capitales de lettrage de 16 à 34 px, bulles côte à côte |
| 05 | Récitatifs : blanc sur noir, blanc sur bleu nuit, noir sur jaune, italique, blanc sur dégradé |
| 06 | Texte posé sur le dessin, sans bulle : hachures, trame de points, gris moyen |
| 07 | Onomatopées penchées, cernées, couchées ; bulles réduites à « ?! » et « ... » |
| 08 | Bande de webtoon de 800 × 7000, fonds et bulles de couleur |
| 09 | Basse définition : 700 × 990, lettrage de 13 à 15 px, JPEG de qualité 35 |
| 10 | Page dense : empattements, chasse fixe, écriture manuscrite, bulles au bord des cases |

Deux façons de faire ont été comparées, sur les mêmes pages :

- **A – Tesseract seul** : la page entière lue en « texte épars », les mots
  regroupés ensuite en bulles.
- **B – Repérage par les pixels, puis Tesseract** : les lettres sont repérées
  comme de petites taches d’encre sur un fond uni, regroupées en zones, et
  chaque zone est lue seule (découpée, agrandie, redressée, inversée si le
  texte est clair).

La mesure passe par la chaîne du module elle-même
(`modules/scan-studio/lib/analysis/pipeline.ts`), lancée sous Bun avec un
lecteur fait de `sharp` et de `tesseract.js`. Six pages ont ensuite été
rejouées dans Chrome, avec le lecteur du navigateur.

## 2. Résultats

| Famille de textes | Nombre | A : trouvés | A : lus sans faute | B : trouvés | B : lus sans faute |
| --- | --- | --- | --- | --- | --- |
| Bulles et cartouches | 45 | 41 | 36 | **45** | **41** |
| Texte posé sur le dessin | 6 | 2 | 0 | 1 | 0 |
| Onomatopées | 5 | 0 | 0 | 2 | 1 |
| Bulles réduites à une ponctuation | 2 | 0 | 0 | 0 | 0 |
| Zones inventées (faux positifs) | – | 1 | – | 0 | – |

| | A – Tesseract seul | B – pixels puis Tesseract |
| --- | --- | --- |
| Durée par page (1200 × 1700) | 1,3 à 5,9 s, et **29 s** sur la page 06 | 0,6 à 1,8 s |
| Bande de 800 × 7000 | 6,6 s | 2,0 à 3,3 s |
| Caractères faux, bulles et cartouches trouvés | 34 sur 1441 | 6 sur 1539 (0,4 %) |

Autres relevés, pour B :

- **Dans Chrome** (pages 01, 05, 07, 08, 09 et 10) : mêmes zones, 0,55 à 2,1 s
  par page ; la première analyse, qui charge le moteur, a pris 1,9 s. Les
  lectures diffèrent à la marge (le canevas n’agrandit pas l’image comme
  `sharp`).
- **Chargement du moteur** : 0,5 à 0,8 s sous Bun. Trois fichiers, tous servis
  par l’application : script de travail (0,1 Mo), cœur WebAssembly (3,9 Mo),
  données de langue (2,9 Mo).
- **Mémoire** : 220 à 300 Mo pour tout le processus du banc sous Bun, `sharp`
  compris. Non mesurée dans le navigateur.
- **Type deviné** : juste pour les 48 zones trouvées (dialogue, récitatif sur
  fond sombre, onomatopée).

## 3. Ce qui marche

- Les bulles et les cartouches nets sont **tous trouvés** : blancs, colorés,
  noirs à texte blanc, petits (13 px), compressés en JPEG, collés au bord
  d’une case, à cheval sur deux tranches d’une bande de webtoon.
- La lecture d’une zone isolée est fiable : 41 bulles sur 45 sans une faute,
  capitales comme casse mixte, empattements et chasse fixe compris.
- Le nettoyage fait ce qu’on attend : lignes recollées, césure réunie
  (`impos-` / `sible`), capitales remises en casse de phrase.
- Aucune zone inventée : les hachures et les trames ne passent pas le tri.

## 4. Ce qui ne marche pas

- **Tesseract ne sait pas repérer le texte d’une page** (façon A). Il oublie
  des bulles entières dès que la page porte une grande onomatopée ou une
  trame (pages 05, 07 et 10), et il peut passer trente secondes sur une page
  hachurée. Il n’est donc gardé que pour lire, pas pour chercher.
- **Le texte posé sur le dessin est presque toujours manqué** (1 sur 6, et lu
  avec deux fautes). Le repérage par les pixels demande un fond uni : sur des
  hachures, un gris moyen ou un dégradé, il ne voit rien. C’est la limite
  annoncée au § 3 du dossier, et la raison d’être du tracé à la main.
- **Les onomatopées** : une seule lue juste (couchée, en aplat noir). Les
  lettres cernées et les textes très penchés ne sont pas lus.
- **Quatre bulles lues avec une faute** :

| Texte | Lu | Confiance | Signalée ? |
| --- | --- | --- | --- |
| `Will Illya follow us?` | `Will Ilya follow us?` | 0,55 | oui |
| `Is this going to be on the test?` (manuscrit) | `Ts this going +o be on the test?` | 0,79 | oui, de justesse |
| `NO! GO BACK!` | `NO! 60 BACK!` | 0,92 | **non** |
| `still in the office?` | `still in the of fice?` | 0,87 | **non** |

- **La confiance ne suffit pas** à attraper toutes les fautes : deux sur
  quatre passent au-dessus du seuil. Dans Chrome, la bulle manuscrite a même
  obtenu 0,83. La relecture humaine reste nécessaire.
- **Les noms propres perdent leur majuscule** quand le lettrage est en
  capitales (`WHO IS OLIVIA?` devient `Who is olivia?`). Seul un terme du
  glossaire la retrouve.
- **Les bulles réduites à « ?! » ou « ... »** ne deviennent pas des zones :
  c’est voulu, il n’y a rien à traduire et l’original reste en place.

## 5. Décisions

| Sujet | Pressenti dans le dossier | Décision après mesure |
| --- | --- | --- |
| Repérage, anglais (§ 7.1) | Détecteur de texte de BD au format ONNX | **Repérage par les pixels** pour S2 : il suffit aux bulles et aux cartouches, sans modèle à télécharger. Le détecteur ONNX n’a pas été mesuré ; il reste la piste pour le texte posé sur le dessin. |
| Lecture, anglais (§ 7.2) | Tesseract en WebAssembly | **Confirmé**, à condition de lui donner une zone isolée, jamais la page. |
| Seuil « lecture à vérifier » (§ 6.2) | À fixer | **0,80**. Sur le banc : aucune lecture juste signalée à tort (0 sur 41), deux fautes signalées sur quatre. |
| Critère d’acceptation de S2 (§ 14) | « Grande majorité », seuil à fixer | **Neuf bulles ou cartouches sur dix lus sans retouche** sur les pages du banc. Mesuré : 41 sur 45. |
| Durée (§ 12) | « Quelques minutes » pour 20 pages | Une à deux secondes par page : un chapitre de 20 pages en moins d’une minute sur le poste de mesure. |

## 6. Limites de ce banc

- Dix pages, pas la vingtaine prévue, et toutes synthétiques (quatre pages
  réelles ont été ajoutées depuis, § 7) : pas de grain de
  papier, pas de page de travers, pas de trame d’imprimerie, pas de lettrage
  dessiné à la main. Sur de vrais scans, les chiffres seront moins bons.
- Les polices sont celles du poste (Arial, Comic Sans, Impact, Georgia…), pas
  des polices de lettrage du métier.
- Une seule machine, un seul navigateur (Chrome) ; ni téléphone, ni machine
  modeste, ni mémoire relevée dans l’onglet.
- Les pages et les scripts du banc ne sont pas dans le dépôt : ils ont servi
  le temps de la mesure. Les tests du module, eux, n’appellent jamais le
  moteur.

## 7. Pages réelles, et repérage par la bulle

- **Date** : 06/10/2026.
- **Pages** : quatre pages d’un même chapitre, fournies par le propriétaire de
  l’instance pour un essai privé : une couverture, une bannière de crédits et
  deux pages ordinaires, de 1215 × 1728 et 1304 × 1854. Elles ne sont ni dans
  le dépôt ni dans les tests, et ce document n’en reproduit aucun texte : les
  résultats sont donnés en nombres et en positions.
- **Ce qu’elles portent** : sur les deux pages ordinaires, 9 cartouches blancs
  à lettrage anglais en capitales, posés sur un dessin tramé, soit 12 textes
  (trois cartouches en coude portent deux textes chacun) ; sur la seconde, le
  lettrage japonais d’origine encore visible dans le dessin, et 2 petites
  bulles rondes au lettrage de 10 px, traversées par une trame de lignes.

### 7.1 Ce que le premier essai a montré

La chaîne décrite plus haut regroupait les lettres par simple proximité. Sur
ces pages :

- une zone s’étendait aux taches du dessin voisin (508 × 258 px pour un texte
  de 176 × 179 px), et sa lecture était perdue ;
- deux textes voisins, dans un même cartouche en coude, ne faisaient qu’une
  zone de 27 mots ;
- un cartouche n’était couvert qu’à moitié (2 lignes sur 4) ;
- 4 zones étaient inventées dans le dessin d’une page, dont un « mot » de deux
  lettres lu avec une confiance de 0,85, donc jamais signalé ;
- la couverture donnait une zone de 13 mots faux.

### 7.2 Ce qui a changé

Le repérage rattache maintenant chaque texte à ce qui le contient :

- **Le fond est découpé en plages** d’un seul tenant : le blanc d’une bulle ou
  d’un cartouche en est une, fermée par son trait (et le noir d’un cartouche
  sombre, pour un texte clair). Deux lettres ne vont ensemble que si la même
  plage les entoure : un trait d’un pixel suffit à séparer deux cartouches, et
  aucune zone ne déborde plus sur le dessin.
- **Une zone par bulle**, quand son texte tient dans un même rectangle : deux
  blocs l’un sous l’autre sont réunis. Deux textes côte à côte dans une bulle
  en coude restent deux zones : on les reconnaît à leurs lignes décalées de
  part et d’autre de l’espace qui les sépare.
- **La zone garde la forme de sa bulle** : le contour reste celui du texte
  d’origine ; le masque ne mord jamais sur le trait ; la boîte du texte
  traduit prend la place libre autour du texte (jusqu’à 2,5 hauteurs de ligne
  de chaque côté), moins une marge.
- **Le texte sans bulle** est repéré comme avant, mais on lui demande plus :
  trois taches au moins, de tailles voisines, et une lecture plus sûre.
- **Tri des lectures** : une lecture qui doute et ne ressemble pas à des mots
  est rejetée (presque pas de voyelles, signes mêlés aux lettres, lettres
  éparses, autre écriture que le latin). Une lecture sûre n’est jamais rejetée
  sur sa seule forme.
- **Écriture en colonnes** : quand la langue source est l’anglais, un texte
  rangé en colonnes n’est pas lu.
- **Lettrage minuscule** : sous 11 px, la zone est agrandie jusqu’à 4,5 fois
  avant lecture, au lieu de 3.
- **Page sans rien à traduire** : une fonction dit si une page analysée ne
  porte aucun texte latin assez sûr, ou seulement des crédits (adresses, rôles
  d’une équipe). L’atelier peut alors proposer de la laisser telle quelle.

### 7.3 Résultats

Même lecteur que pour le reste du banc (`sharp` et `tesseract.js` sous Bun),
avant et après le changement.

| Deux pages ordinaires | Avant | Après |
| --- | --- | --- |
| Cartouches présents | 9 | 9 |
| Cartouches repérés comme contenants | – | **9** |
| Textes en cartouche présents | 12 | 12 |
| Textes trouvés, chacun dans sa zone | 10 | **12** |
| Textes lus sans faute | 6 | **12** |
| Lectures signalées (confiance sous 0,80) | 5 | 0 |
| Zones inventées | 4 | **0** |
| Petites bulles tramées trouvées | 0 sur 2 | 0 sur 2 |

| Pages à ne pas traduire | Avant | Après |
| --- | --- | --- |
| Couverture : zones rendues | 1 | **0** |
| Bannière de crédits : zones rendues | 2 | 2 |
| Pages reconnues comme « rien à traduire » | – | **2 sur 2** |
| Pages ordinaires prises à tort pour telles | – | 0 sur 2 |

Confiance des 12 textes après le changement : de 0,81 à 0,95.

| Durée | Avant | Après |
| --- | --- | --- |
| Page réelle, analyse entière | 2,2 à 3,9 s | 2,3 à 3,7 s |
| Repérage seul, page de 1200 × 1700 | 0,35 à 0,45 s | 0,45 à 0,75 s |
| Lectures par page ordinaire | 11 à 30 | 11 à 18 |

Les durées ont été relevées sur un poste occupé à autre chose : elles donnent
un ordre de grandeur, pas une mesure fine. Le découpage du fond coûte quelques
dixièmes de seconde par page ; il est en partie rendu par les lectures
évitées.

**Pages synthétiques (§ 2), rejouées après le changement** : aucun écart.

| Famille de textes | Nombre | Trouvés, avant | Trouvés, après | Sans faute, avant | Sans faute, après |
| --- | --- | --- | --- | --- | --- |
| Bulles et cartouches | 45 | 45 | 45 | 41 | 41 |
| Texte posé sur le dessin | 6 | 1 | 1 | 0 | 0 |
| Onomatopées | 5 | 2 | 2 | 1 | 1 |
| Bulles réduites à une ponctuation | 2 | 0 | 0 | 0 | 0 |
| Zones inventées | – | 0 | 0 | – | – |

Durée par page synthétique de 1200 × 1700 : 0,6 à 1,7 s avant, 0,9 à 2,1 s
après ; bande de 800 × 7000 : 2,0 s avant, 2,9 s après.

### 7.4 Ce qui échoue encore

- **Les deux petites bulles tramées ne sont pas trouvées.** Une trame de
  lignes horizontales les traverse tous les 6 à 8 px : elle coupe l’intérieur de
  la bulle en bandes et barre chaque lettre, si bien qu’il n’y a ni plage
  fermée ni tache isolée. Un essai hors chaîne, sur des rectangles posés à la
  main et après retrait des lignes, n’a pas donné de lecture juste non plus :
  au mieux 24 caractères faux sur 54 pour l’une, 3 sur 7 pour l’autre
  (confiance de 0,55 à 0,79). L’agrandissement seul ne suffit donc pas ; ces
  bulles restent à tracer à la main.
- **La bannière de crédits rend encore 2 zones** (confiance 0,52 et 0,70) :
  c’est du vrai texte latin. La page est reconnue comme n’ayant rien à
  traduire, mais les zones existent tant qu’elle n’est pas marquée.
- **Le lettrage japonais** resté dans le dessin n’a produit aucune zone, mais
  le filtre des colonnes n’y est presque pour rien : posé sur la trame, ce
  lettrage ne forme pas de taches isolées (1 candidate écartée sur les quatre
  pages). Le filtre n’est éprouvé que par des colonnes dessinées pour les
  tests ; un texte japonais net, dans une bulle blanche, reste à mesurer.
- **Deux textes côte à côte dont les lignes sont à la même hauteur** restent
  une seule zone, sauf si un couloir de près d’une hauteur de ligne les
  sépare : rien ne les distingue d’un paragraphe.
- **Bulle ronde** : la place disponible est un rectangle. Dans une ellipse
  serrée autour de son texte, il ne dépasse guère le texte d’origine.
- **Texte posé sur le dessin** : inchangé, 1 texte sur 6 sur les pages
  synthétiques. Les règles sont même un peu plus strictes pour lui.
- **Quatre pages réelles, d’un seul chapitre et d’un seul lettreur** : des
  cartouches blancs à angles droits, le cas le plus favorable. Ni bulles
  dessinées à la main, ni page de travers, ni scan jauni.
- **Rien n’a été rejoué dans un navigateur** après ce changement : le lecteur
  du canevas (dont le recouvrement du texte voisin avant lecture) et les
  durées dans Chrome restent à vérifier.

## 8. Japonais, chinois, coréen et bandes hautes (étape S4)

- **Date** : 06/10/2026.
- **Périmètre** : lecture du japonais, du chinois simplifié et traditionnel et
  du coréen, en lignes et en colonnes, et bandes de webtoon. Toujours le
  niveau 1 de l’échelle de recours : rien n’est envoyé, rien n’est généré.
- **Moteur** : le même, `tesseract.js` 7.0.0. Données `@tesseract.js-data`
  1.0.0, variante `4.0.0_best_int` comme pour l’anglais : `jpn`, `jpn_vert`,
  `chi_sim`, `chi_sim_vert`, `chi_tra`, `chi_tra_vert`, `kor`, `kor_vert`. Les
  modèles « _vert » lisent le texte écrit en colonnes ; il en existe un pour
  chacune des quatre langues.
- **Où** : tout ce qui suit a été mesuré **dans Chrome**, avec le lecteur du
  navigateur et la chaîne du module, sur une page statique jetable servie à
  part (les fichiers du moteur venant de `public/scan-studio-ocr/`).

### 8.1 Ce qui a été mesuré

Quinze pages **dessinées pour l’occasion** par un script : des cases, des
formes géométriques, des trames de points et de hachures, des bulles et des
cartouches. Les phrases sont **inventées** dans chaque langue et composées
avec les polices du poste (Yu Gothic et MS Gothic, Microsoft YaHei et SimSun,
Microsoft JhengHei, Malgun Gothic), de 22 à 30 px. Aucune page, aucun
personnage, aucune réplique d’une œuvre existante. Position, texte et sens
d’écriture de chaque bulle sont connus d’avance.

| Pages | Ce qu’elles mettent à l’épreuve |
| --- | --- |
| 2 pages japonaises en colonnes, 1 en lignes | Colonnes lues de droite à gauche, bulle d’une seule colonne, 4 bulles à furigana, cartouche noir |
| Chinois simplifié : 1 en lignes, 1 en colonnes | Deux polices (bâton, à empattements), cartouche noir, cartouche de couleur |
| Chinois traditionnel : 1 en lignes, 1 en colonnes | Idem |
| Coréen : 1 en lignes, 1 en colonnes | Mots séparés par des espaces ; les colonnes sont rares en coréen |
| 3 bandes de webtoon : 800 × 9000, 800 × 12000, 800 × 20000 | Bulles posées exprès sur le bord d’une tranche, fonds de couleur, cartouches noirs |
| 2 couvertures, 1 bannière de crédits | Proposition « rien à traduire » |

Chaque page fait 1200 × 1700 et porte 11 textes (6 pour le coréen en
colonnes). Une bulle compte comme **trouvée** si une zone tombe dedans,
**entière** s’il n’y en a qu’une, **sans faute** si son texte nettoyé est
celui attendu, à la forme pleine chasse ou non de la ponctuation près.

### 8.2 Résultats par langue

| Langue et sens | Textes | Trouvés | Entiers | Sens reconnu | Sans faute | Caractères faux |
| --- | --- | --- | --- | --- | --- | --- |
| Japonais, colonnes | 22 | 22 | 22 | 22 | **20** | 3 sur 252 |
| Japonais, lignes | 11 | 11 | 11 | 11 | **11** | 0 sur 132 |
| Chinois simplifié, lignes | 11 | 11 | 11 | 11 | **11** | 0 sur 110 |
| Chinois simplifié, colonnes | 11 | 10 | 10 | 10 | 7 | 4 sur 97 |
| Chinois traditionnel, lignes | 11 | 11 | 11 | 11 | **10** | 1 sur 110 |
| Chinois traditionnel, colonnes | 11 | 11 | 11 | 11 | 4 | 9 sur 107 |
| Coréen, lignes | 11 | 11 | 11 | 11 | **10** | 1 sur 161 |
| Coréen, colonnes | 6 | 6 | 6 | 6 | 0 | 17 sur 72 |

Autres relevés sur ces neuf pages :

- **Zones inventées** : 0.
- **Durée** : 1,1 à 2,5 s par page, moteur déjà chargé.
- **Furigana** : les 4 bulles qui en portent sont trouvées, et aucune de
  leurs lectures ne contient un furigana ; 3 sont lues sans faute, la
  quatrième se trompe sur un kanji de 22 px (confiance 0,57, signalée).
- **Fautes signalées** (confiance sous 0,80) : 9 des 20 textes mal lus. En
  japonais, 2 sur 2 ; en chinois en colonnes, 5 sur 10 ; en coréen en
  colonnes, 1 sur 6.
- **Lectures justes signalées à tort** : 8 sur 73, dont 5 sur la seule page
  de chinois simplifié en lignes. Le seuil de 0,80 fixé pour l’anglais est
  plus sévère pour ces écritures.
- **Cartouches noirs** : 7 trouvés sur 8.

### 8.3 Bandes de webtoon

| Bande | Tranches | Textes | Trouvés, entiers | Sans faute | Bulles sur un bord de tranche | Durée |
| --- | --- | --- | --- | --- | --- | --- |
| 800 × 9000, chinois simplifié | 4 | 17 | **17** | 16 | 3, toutes entières et sans faute | 3,1 s |
| 800 × 12000, coréen | 5 | 23 | **23** | 21 | 2, toutes entières et sans faute | 3,9 s |
| 800 × 20000, coréen | 8 | 38 | **38** | 32 | 7, toutes entières et sans faute | 7,2 s |

- Aucune zone inventée, aucune bulle trouvée deux fois.
- L’avancement est annoncé de 26 à 50 fois par bande et ne recule jamais :
  une fois par tranche pendant le repérage, puis une fois par zone lue.
- L’ordre rendu suit la bande de haut en bas ; deux bulles vraiment côte à
  côte sont lues de gauche à droite.
- **Limites de taille** : le module refuse à l’import une image de plus de
  20 000 px de côté ou de 150 mégapixels ; la bande de 800 × 20000 est donc
  la plus haute qu’il accepte, et elle passe. L’image n’est jamais posée
  entière sur un canevas : le repérage en dessine une tranche de 3200 px à la
  fois, la lecture une zone à la fois. La limite de canevas du navigateur
  n’est donc pas en jeu, et n’a pas été cherchée ; seule l’image décodée
  reste en mémoire, soit 64 Mo pour cette bande (calculé, non relevé).

### 8.4 Pages sans rien à traduire

| Page | Zones rendues | Proposée « rien à traduire » |
| --- | --- | --- |
| Couverture : un grand titre dessiné, cerné et penché | 0 | **oui** |
| La même, avec une mention de chapitre de trois signes | 1 (la mention, lue juste) | non |
| Bannière de crédits : trois rôles et trois pseudonymes, une adresse | 2 (deux pseudonymes) | **non** |

La mention de chapitre est un vrai texte : ne pas proposer de passer la page
se défend. La bannière, elle, est manquée : les mots de deux signes posés
sans cartouche ne sont pas gardés, si bien qu’aucune zone ne porte un rôle
suivi de deux-points, et un pseudonyme en kana passe pour une réplique.

### 8.5 Ce qui marche

- **Le repérage** tient pour les trois écritures : 93 bulles et cartouches
  trouvés sur 94 sur les pages, 78 sur 78 sur les bandes, chacun dans une
  seule zone.
- **Le sens d’écriture** est reconnu pour toutes les zones trouvées, bulle par
  bulle, y compris une colonne seule.
- **Les colonnes d’une bulle font une seule zone**, lue de droite à gauche
  par le modèle des colonnes.
- **Le japonais** se lit bien dans les deux sens : 31 textes sur 33 sans
  faute, les deux fautes signalées.
- **Le chinois et le coréen en lignes** se lisent bien : 31 sur 33.
- **Les furigana** sont écartés avant la lecture.
- **Les bandes** : une bulle coupée par le bord d’une tranche est trouvée une
  fois, entière.
- **Un modèle n’est téléchargé que s’il sert** : une première analyse en
  japonais a demandé le script du moteur, son script de travail, son cœur,
  puis `jpn_vert` et `jpn`, et rien d’autre ; une seconde analyse n’a
  redemandé aucune donnée de langue.
- **L’anglais n’a pas bougé** : les dix pages du § 1, rejouées dans Chrome
  avant et après ce changement, donnent page pour page les mêmes nombres
  (47 textes trouvés sur 58, 44 sans faute, aucune zone inventée).

### 8.6 Ce qui ne marche pas

- **Le chinois en colonnes se lit mal** : 11 textes sans faute sur 22. La
  ponctuation tombe (points de suspension, virgules, points finals, 8 des 13
  caractères faux) et quelques signes sont confondus. La moitié de ces fautes
  passe au-dessus du seuil.
- **Le coréen en colonnes perd ses espaces** : les syllabes sont lues, mais
  le modèle met une espace après chacune. Le module n’en garde aucune, ce qui
  se corrige plus vite à la main ; aucune des 6 bulles n’est donc juste.
- **Le modèle lit une même zone juste à une échelle et de travers à une
  autre**, sans qu’une échelle gagne toujours. Une zone lue avec une confiance
  sous 0,80 est donc relue à une seconde échelle (signes de 44 px, puis de
  36 px), et la plus sûre des deux lectures est gardée. Avec une seule
  lecture à 36 px, le japonais en colonnes donnait 18 textes sans faute sur
  22 ; il en donne 20.
- **La confiance ne suffit toujours pas** : 11 fautes sur 20 ne sont pas
  signalées, et la répétition d’un petit kana, un kanji pris pour un autre ou
  une syllabe voisine sortent avec 0,72 à 0,95.
- **Un cartouche noir collé à une forme noire du dessin** n’est pas une plage
  fermée : son texte est alors traité comme un texte posé sur le dessin. Sur
  une première version des pages, où les trois cartouches noirs touchaient une
  trame de hachures ou un disque noir, aucun n’était lu.
- **Les signes blancs et gras d’un cartouche sombre se soudent** au seuil
  ordinaire de l’encre claire : pour ces écritures, le seuil est relevé.
- **Un texte de deux signes hors bulle** n’est pas gardé, et **un signe seul**
  n’est jamais lu, même dans une bulle.
- **Des furigana plus petits qu’une lettre repérable** (moins de 7 px sur une
  page de 1200 px de large) ne sont pas vus, donc pas écartés. Non mesuré.
- **Le texte posé sur le dessin et les onomatopées** : non mesurés pour ces
  langues ; les limites relevées pour l’anglais (§ 4) valent a fortiori.

### 8.7 Ce que charge le navigateur

| Fichier | Poids | Quand |
| --- | --- | --- |
| Script du moteur, script de travail | 0,06 et 0,11 Mo | À la première analyse |
| Cœur WebAssembly | 3,9 Mo | À la première analyse |
| Anglais | 2,95 Mo | Chapitre en anglais |
| Japonais : lignes, colonnes | 2,03 et 2,02 Mo | Chapitre en japonais, chaque modèle à sa première zone |
| Chinois simplifié : lignes, colonnes | 1,72 et 1,71 Mo | Chapitre en chinois simplifié |
| Chinois traditionnel : lignes, colonnes | 1,66 et 1,65 Mo | Chapitre en chinois traditionnel |
| Coréen : lignes, colonnes | 1,57 et 0,62 Mo | Chapitre en coréen |

Une première analyse en japonais charge donc 8,1 Mo, dont 4,05 Mo de données
de langue. Les huit nouveaux fichiers pèsent 13 Mo dans
`public/scan-studio-ocr/lang/` ; les paquets, qui portent aussi une variante
plus lourde dont le module ne se sert pas, 89 Mo dans `node_modules`.

Chaque modèle a son fil de travail, et deux au plus vivent en même temps.
Sur la page de mesure, servie sans cache, le script de travail et le cœur ont
été redemandés pour le second fil ; ce que fait l’application, qui sert ces
fichiers avec ses propres en-têtes, n’a pas été vérifié.

### 8.8 Décisions

| Sujet | Pressenti dans le dossier | Décision après mesure |
| --- | --- | --- |
| Lecture du japonais (§ 7.2) | Modèle spécialisé manga | **Tesseract**, avec `jpn` et `jpn_vert`, dans le navigateur : 31 sur 33 sur le banc. Le modèle spécialisé n’a pas été mesuré ; il reste la piste pour le lettrage dessiné à la main. |
| Lecture du chinois et du coréen (§ 7.2) | PaddleOCR, au format ONNX | **Tesseract** en lignes. En colonnes, il lit mais demande une relecture ; PaddleOCR n’a pas été mesuré. |
| Variante des données | – | `4.0.0_best_int`, comme l’anglais : 0,6 à 2 Mo par modèle. |
| Sens d’écriture | Rendu par le détecteur | Relevé **bulle par bulle** sur la disposition des signes ; la langue ne tranche que pour un signe seul. |
| Ordre du texte dans une zone | – | Celui du moteur : ses boîtes de mots sont trop larges pour ces écritures. |
| Seuil « lecture à vérifier » | 0,80 | **Gardé**, faute de mieux : il signale 9 fautes sur 20 et 8 lectures justes sur 73. |
| Critère d’acceptation de S4 (§ 14) | Un chapitre de chaque langue traité de bout en bout | Sur le banc : **neuf bulles sur dix lues sans retouche en lignes** (42 sur 44 mesuré), et **en colonnes pour le japonais** (20 sur 22). Le chinois et le coréen en colonnes sont livrés comme une aide à relire. |

### 8.9 Limites de ce banc

- Des pages synthétiques, là encore : des polices du système, nettes, sans
  grain ni compression, de 22 à 30 px. Pas de lettrage de manga dessiné à la
  main, pas de police de lettrage du métier, pas de scan. Sur de vraies
  pages, les nombres seront moins bons.
- Une page par langue et par sens, deux pour le japonais en colonnes : 11 à
  22 textes par ligne du tableau. Un écart d’un texte y pèse 5 à 9 points.
- Aucun chapitre réel de ces langues n’a été traité de bout en bout : le
  critère du § 14 reste à constater sur les pages du propriétaire.
- Une seule machine, un seul navigateur (Chrome), une seule largeur de bande
  (800 px). Ni Firefox, ni Safari, ni téléphone ; la mémoire de l’onglet n’a
  pas été relevée.
- L’atelier n’a pas été ouvert sur une bande haute : ce banc ne mesure que
  l’analyse.
- Les pages et les scripts du banc ne sont pas dans le dépôt.
