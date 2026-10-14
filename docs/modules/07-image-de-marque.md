# 07 – Image de marque et publication YouTube

Enregistrer des **images de marque** (palette, polices, logos, filigrane,
mascotte, ton, carton de fin) et les faire suivre par Clip Studio et par le
filigrane des captures : quand on demande une vidéo, elle sort dans la
direction artistique choisie, sans retouche ; quand une capture arrive, elle
porte le logo de la marque. Puis **connecter un compte YouTube** en un clic
pour y envoyer les clips, les programmer et les gérer depuis ShareX Manager.

- **Identifiant** : `brand-kit`
- **Libellé** : « Image de marque »
- **Prérequis** : Clip Studio (étapes 1 à 8 réalisées), AI Image Gen (moteurs
  et collections), Codex CLI pour l’assistant. La publication s’appuie sur une
  brique **globale** du cœur, les **comptes connectés** (§ 8) : un registre de
  connecteurs (YouTube d’abord ; Facebook, Instagram, Threads, X ensuite),
  plusieurs comptes par connecteur, des jetons chiffrés, et des capacités que
  n’importe quel module interroge.
- **Nom de code et route** : l’identifiant reste `brand-kit` pour ne pas
  entrer en collision avec `/branding`, la page publique de la charte de
  ShareX Manager lui-même (`src/app/(marketing)/branding`).
- **Modules touchés** : `brand-kit` (nouveau), `clip-studio` (application de
  la marque), `watermark` (filigrane des captures par la marque), `scan-studio`
  (le contrôle des polices passe dans le cœur pour être partagé).

## 1. Pourquoi ce module

Aujourd’hui, une vidéo de l’assistant de Clip Studio prend des couleurs tirées
à tour de rôle dans `ACCENTS` (`engine/templates.ts`), des styles de texte
génériques (`TEXT_PRESETS`, `engine/edit.ts`), aucune police propre, aucun
logo et aucun filigrane. Chaque clip doit être rhabillé à la main, et deux
clips d’une même chaîne ne se ressemblent pas. Le module `watermark`, de son
côté, ne sait poser qu’un texte : le logo d’une marque n’a aucun moyen
d’atteindre les captures.

Une chaîne de vidéos courtes vit de sa reconnaissance : la même typo, les
mêmes couleurs, le même coin de logo, la même fin. L’image de marque rend
cette cohérence automatique, sur les vidéos comme sur les images. Et sans
publication, il reste à télécharger chaque MP4 puis à le renvoyer à la main
dans YouTube Studio, avec titre, description et programmation : c’est le
geste répétitif que le module supprime.

## 2. Ce que l’on construit

Quatre briques, livrables séparément :

1. **Les images de marque** : des instances nommées, créées à la main (une
   maquette prête à remplir) ou par l’assistant à partir d’une phrase, avec un
   aperçu de la marque appliquée aux formats d’une chaîne.
2. **L’application à Clip Studio** : un projet, une recette ou une demande à
   l’assistant se rattache à une image de marque, et le montage la suit :
   palette, polices, styles de texte, filigrane, carton de fin, ton du script,
   style des illustrations.
3. **Le filigrane des captures** : le module `watermark` sait poser le logo
   d’une image de marque, à la main sur une image de la galerie ou
   automatiquement sur chaque capture envoyée.
4. **Les comptes connectés et la publication** : une page d’administration
   « Comptes connectés », commune à toute l’application, où l’on relie autant
   de comptes que l’on veut, de chaque service pris en charge. YouTube est le
   premier connecteur : envoi reprenable d’un export, métadonnées tirées de
   l’image de marque, programmation, liste et gestion des vidéos, mise à jour
   de la bannière et du filigrane de la chaîne. Les modules ne parlent pas à
   YouTube : ils demandent au cœur les comptes qui savent faire ce dont ils
   ont besoin (« publier une vidéo »), et s’adaptent à ce qui est connecté.

## 3. Parcours

### 3.1 Créer une image de marque à la main

1. Page « Images de marque », bouton « Nouvelle image de marque ».
2. Une fenêtre demande un nom et, au choix, un point de départ : « Vierge »,
   « Dupliquer une image existante » ou « Importer une archive » (voir 3.3).
3. L’instance s’ouvre **déjà remplie d’une maquette** : palette neutre, polices
   du catalogue de Clip Studio, styles de texte repris des préréglages de Clip
   Studio, carton de fin activé. Sans logo, les formats et le carton de fin
   écrivent le nom de la marque dans la police des titres : tout l’aperçu
   fonctionne dès la première seconde, et l’on remplace ensuite chaque pièce.

### 3.2 La faire créer par l’assistant

1. Même bouton, onglet « Avec l’assistant ».
2. Un champ de demande, comme dans Clip Studio : « Une chaîne de shorts sur
   l’anime et le jeu vidéo, style impression risographie rose et bleu, une
   mascotte féminine qui se réveille dès qu’un truc sort. »
3. On peut joindre jusqu’à six images de référence (logo existant, captures,
   planches), choisies par le sélecteur commun `ImagePickerDialog`. Elles
   sont transmises telles quelles comme contexte.
4. L’assistant :
   - rédige la fiche (nom proposé, accroche, ton, palette avec les rôles,
     choix de polices dans le catalogue, règles « toujours / jamais », notes de
     style des illustrations, identité de la mascotte) par Codex CLI
     (`askCodex`, `ai-image-gen/lib/codex-text.ts`), en JSON validé ;
   - crée une collection AI Image Gen dédiée, dont les `styleNotes` reprennent
     la direction artistique et dont les références jointes deviennent les
     ancres ;
   - met en file les visuels : logo, mascotte (feuille de modèle si demandée),
     fond de bannière, par `enqueueGeneration` dans la collection ;
   - range chaque image terminée dans l’instance, avec sa consigne, et la
     montre dans l’aperçu.
5. Chaque visuel se régénère seul (« Refaire ce visuel ») en gardant tout le
   contexte : fiche, collection, ancres. L’assistant a donc toujours
   conscience de la marque sur laquelle il travaille.

### 3.3 Importer une marque existante

Une archive ZIP contenant un `brand.json` (le format de 5.1) et ses fichiers
(`assets/`, `fonts/`). C’est aussi le format d’export d’une instance : une
marque se sauvegarde et se recharge d’une instance ShareX Manager à l’autre.
Chaque fichier de l’archive repasse les contrôles d’un envoi (signature,
taille), et l’archive est bornée (20 Mo, 200 fichiers, aucun chemin qui sorte
du dossier de la marque).

### 3.4 Faire une vidéo dans la marque

- **Assistant de Clip Studio** : la fenêtre « Créer » gagne un sélecteur
  « Image de marque ». La vidéo produite suit la marque sans autre geste : le
  script prend le ton de la marque, les illustrations son style, le montage
  ses couleurs, ses polices, son filigrane et son carton de fin. Si la marque
  a une voix, la fenêtre la préremplit (voix, débit, intonation) ; on peut en
  changer pour ce clip.
- **Modèles remplis à la main et recettes depuis la galerie** (Diaporama,
  Rythmé, Avant / Après) : même sélecteur.
- **Projet existant** : inspecteur sans sélection, section « Image de marque »
  ▸ appliquer, changer ou retirer. L’opération passe par l’historique de
  l’éditeur : une annulation la défait.
- **Par défaut** : une image de marque peut être marquée « par défaut » ; elle
  est alors présélectionnée partout.

### 3.5 Filigraner les captures

- **À la main** : sur une image de la galerie, action « Filigrane ». La
  fenêtre propose « Texte » (le fonctionnement actuel) ou « Image de marque » :
  on choisit la marque, l’aperçu montre son logo à l’emplacement, à la taille
  et à l’opacité de la marque, et chaque réglage reste modifiable pour cette
  image.
- **Automatiquement** : la gestion des modules n’a pas de formulaire de
  réglages ; c’est la fenêtre « Filigrane » elle-même qui les enregistre. Un
  administrateur y règle le filigrane (texte ou image de marque) puis choisit
  « Utiliser pour chaque envoi ». Avec « Appliquer à chaque envoi » activé
  dans la gestion des modules, chaque capture reçue porte alors le logo de la
  marque. La fenêtre s’ouvre ensuite sur ces réglages enregistrés.

### 3.6 Connecter un compte

1. Administration ▸ « Comptes connectés », bouton « Connecter un compte ».
2. On choisit le service parmi les connecteurs disponibles (YouTube
   aujourd’hui), chacun avec son logo officiel. Un connecteur dont
   l’application n’est pas configurée ouvre d’abord sa configuration (8.2).
3. Redirection vers le service, choix du compte, consentement.
4. Retour sur la page : le compte apparaît avec son avatar, son nom, son
   identifiant, son service et l’état de la connexion. On recommence autant de
   fois qu’il y a de comptes : deux chaînes YouTube, puis plus tard une page
   Facebook et un compte Instagram, côte à côte.
5. Dans une image de marque, section « Publication » : choix des comptes liés
   (un ou plusieurs, de services différents), et modèles de métadonnées (5.1,
   `publishing`).

### 3.7 Publier un clip

1. Dans Clip Studio, depuis le menu d’un export (« Mes exports ») ou à la fin
   d’un export : « Publier ». L’entrée n’apparaît que si au moins un compte
   connecté sait publier une vidéo.
2. Une fenêtre liste les comptes capables de publier une vidéo, ceux de la
   marque du projet cochés d’avance. Pour chaque service coché, les champs
   que ce service accepte, préremplis par la marque : pour YouTube, titre,
   description, tags, catégorie, visibilité, date de programmation,
   déclaration de contenu synthétique. Tout reste modifiable.
3. Chaque compte reçoit son propre travail dans la file de publication du
   serveur : progression, reprise automatique en cas de coupure, lien vers la
   publication à la fin.
4. La vidéo apparaît dans la fiche du compte (« Comptes connectés » ▸ le
   compte ▸ « Publications »), avec ses statistiques.

## 4. Interface

Pages sous `/m/brand-kit/…`, en-tête commun sur le modèle de
`scan-studio/components/module-shell.tsx` (logo, nom, fil d’Ariane, actions),
enveloppe en `min-h-full shrink-0` pour garder la marge du bas. Les pages de
travail occupent toute la largeur ; tout choix d’image passe par
`ImagePickerDialog`.

### 4.1 « Images de marque »

Grille de cartes : aperçu de la bannière, nom, pastilles de palette, avatars
des comptes liés, « par défaut ». Menu contextuel identique au bouton « … » : Ouvrir,
Dupliquer, Définir par défaut, Exporter (ZIP), Supprimer. Les cartes entrent
et sortent avec `framer-motion`.

### 4.2 Éditeur d’une image de marque

```
┌──────────────────────────────────────────────────────────────────────┐
│ Image de marque › Nom ✎   ● par défaut     Exporter   Enregistré ✓   │
├──────────────┬───────────────────────────────────────────────────────┤
│ Identité     │  Aperçu des formats                                    │
│ Couleurs     │  ┌──────────────────────────┐  ┌────┐ ┌──────────────┐ │
│ Typographie  │  │ bannière YouTube         │  │ 9:16│ │ en-tête X    │ │
│ Logos        │  │ (zone sûre en pointillés)│  │short│ └──────────────┘ │
│ Mascotte     │  └──────────────────────────┘  └────┘  ○ avatar  ○ fil.│
│ Vidéo        │                                                        │
│ Assistant IA │  [Exporter les formats en PNG]                         │
│ Publication  │                                                        │
└──────────────┴───────────────────────────────────────────────────────┘
```

Colonne de gauche : sections de la fiche. À droite : l’aperçu, mis à jour à
chaque modification ; seule la vignette qui se recalcule montre un
chargement. Enregistrement automatique (une demi-seconde après la dernière
modification), avec contrôle de version : si la fiche a changé ailleurs entre
deux enregistrements, l’éditeur le dit au lieu d’écraser.

| Section | Contenu |
| --- | --- |
| Identité | Nom, accroche, langue (`fr`, `en`…), description du ton, règles « toujours » et « jamais » |
| Couleurs | Palette par rôles (5.1), contrôle de contraste affiché pour chaque paire qui porte du texte (encre sur fond, texte sur surface, texte sur accent) |
| Typographie | Polices importées (TTF, OTF, WOFF2) ; styles de texte de la marque par rôle (titre, sous-titre, légende, étiquette, texte sur carte) : police du catalogue ou importée, graisse, couleur, majuscules, contour, ombre ; aperçu sur une image voilée et sur un aplat |
| Logos | Logo principal, marque réduite (initiale, tampon) |
| Mascotte | Nom, bloc d’identité texte, feuille de modèle et poses détourées ; tout est joint aux générations |
| Vidéo | Filigrane (image, coin, taille, opacité, marge, apparition), carton de fin (durée, accroche, appel à l’action, pose de la mascotte) |
| Assistant IA | Notes de style des illustrations, ton du script, voix off de la marque (source et voix avec écoute, débit, intonation d’une voix locale), collection AI Image Gen liée |
| Publication | Comptes liés (un ou plusieurs, tous services confondus, choisis parmi les comptes connectés), modèles de titre et de description, tags, catégorie, visibilité par défaut, déclaration de contenu synthétique, public enfant |

### 4.3 Aperçu des formats

Les formats sont dessinés avec le moteur de Clip Studio (`drawFrame`,
`engine/render.ts`) : un format est un projet d’une seule image, construit par
une fonction pure à partir de la marque (`lib/formats.ts`). Ce que montre
l’aperçu est exactement ce qui sort en PNG, et la bannière utilise les mêmes
polices que les vidéos.

| Format | Taille | Note | Avec une pose de la mascotte |
| --- | --- | --- | --- |
| Bannière YouTube | 2560 × 1440 | Zone sûre centrale 1546 × 423 dessinée en pointillés dans l’aperçu seulement ; fichier de 6 Mo au plus | Logo et accroche à gauche dans la zone sûre, la mascotte accoudée au bandeau du bas, à droite, sur un disque tramé ; son visage tient dans la zone sûre |
| Avatar | 800 × 800 | Aperçu à 320, 88 et 40 px | Portrait cadré par le haut sur un disque tramé et le papier de la marque ; une pose en pied est agrandie pour rester lisible à 40 px |
| Filigrane YouTube | 150 × 150 | PNG transparent, envoyé à la chaîne par l’API | Jamais de mascotte : à cette taille, un visage ne se lit plus |
| En-tête X | 1500 × 500 | Coin bas gauche réservé à l’avatar | Logo et accroche en haut à gauche, la mascotte en pied à droite sur un disque tramé ; rien sous l’avatar |
| Carton de fin | 1080 × 1920 et 1920 × 1080 | Le même que celui ajouté aux vidéos (même fonction) | En 9:16 : le nom en bloc sur deux lignes en haut à gauche, l’accroche et l’appel dessous, la mascotte en grand dans le bas (le format ajoute le disque tramé et le papier) |
| Couverture de short | 1080 × 1920 | Titre d’exemple modifiable | Facultative : la pose dans le bas du 3:4 central |

**La mascotte dans les formats.** Chaque format peut mettre en scène une
pose (`mascot.formatPoses`, réglé dans la section Mascotte : une rangée par
format, avec sa vignette, qui montre le format en grand). Sans choix, une pose
est proposée (`lib/mascot.ts`, `proposedFormatPose`) : celle dont la note ou
le libellé nomme le format (« Bannière YouTube. », « Avatar. », « en-tête
X »), sinon la plus large pour la bannière, la plus carrée pour l’avatar, la
plus haute pour l’en-tête X ; la couverture de short n’en a pas d’office, le
filigrane jamais. « Sans mascotte » (`null`) garde le rendu du logo seul. Le
carton de fin garde sa propre pose (`endCard.poseAssetId`), partagée avec les
vidéos. Une marque sans pose rend exactement les formats d’avant.

La mise en scène reprend la planche d’identité d’une marque Riso : la
première encre (l’accent) trame un disque derrière la mascotte, la seconde
(`accentSecondary`, sinon l’encre) peint le bandeau de la bannière ; trames
et croix de repérage sont de petites images SVG dessinées par le navigateur.
Les croix (`registrationMarks`, interrupteur « Croix de repérage » de
l’aperçu) se posent aux coins de la bannière et du carton de fin mis en
scène.

**Les images finies.** Un format peut aussi être une image faite ailleurs
(planche d’identité, graphiste) : « Utiliser une image finie… » ouvre le
sélecteur commun (`ImagePickerDialog` : galerie, ordinateur, lien), puis
`setFormatImage` contrôle l’image (lisible, à la proportion du format à
1 % près, 20 Mo et 40 mégapixels au plus), la ramène à la taille exacte et
la réécrit en PNG : seuls les pixels passent (métadonnées et signatures C2PA
tombent), le filigrane garde sa transparence, les autres formats sont posés
sur un fond opaque. Elle est rangée comme un fichier de la marque (`kind:
"format"`, `formatImages[format]`), remplace la précédente, et ne vient
jamais du navigateur par `saveKit`. L’aperçu, l’export, l’onglet Chaîne d’un
compte connecté (bannière, filigrane, avatar) et `pushBrandToAccount`
l’utilisent telle quelle ; le filigrane des captures aussi (7), et le carton
de fin des vidéos à cette orientation (5.3). « Revenir au rendu composé »
(`clearFormatImage`) la retire.

« Exporter les formats en PNG » rend chaque format dans le navigateur, puis
`saveFormatExport` l’écrit dans `kits/<id>/exports/` ; chaque fichier se
télécharge ou s’envoie dans la galerie (`announceNewUpload`).

### 4.4 « Comptes connectés » (cœur, administration)

Page `/admin/connections`, en-tête léger de l’administration
(`AdminPageHeader`), réservée aux administrateurs. Elle n’appartient à aucun
module : Clip Studio, Image de marque et les modules à venir s’en servent tous.

- **Liste des comptes**, groupés par service : logo officiel du service,
  avatar, nom, identifiant, état (« connecté », « à reconnecter »), droits
  accordés, date de la dernière vérification. Menu contextuel identique au
  bouton « … » : Ouvrir la fiche, Reconnecter, Renommer (nom affiché dans
  ShareX Manager), Déconnecter (révoque le jeton chez le service).
- **« Connecter un compte »** : une fenêtre liste les connecteurs du registre
  (8.1), chacun avec son logo, ce qu’il permet (« publier des vidéos »,
  « gérer la chaîne »…) et son état : prêt, à configurer, ou « bientôt » pour
  un connecteur déclaré mais pas encore réalisé.
- **Configuration d’un connecteur** : identifiant et secret de l’application
  (8.2), URI de redirection à recopier chez le service, marche à suivre propre
  au service. Les valeurs venues de l’environnement sont affichées comme
  telles et ne se modifient pas ici.
- **Fiche d’un compte** (`/admin/connections/<id>`) : onglets fournis par le
  connecteur selon ses capacités. Pour YouTube : « Publications » (vignette,
  titre, visibilité, date de publication ou de programmation, vues, j’aime,
  commentaires ; menu Ouvrir sur YouTube, Modifier, Changer la visibilité,
  Reprogrammer, Supprimer avec une confirmation qui rappelle le titre),
  « Chaîne » (bannière et filigrane depuis une image de marque, quotas du
  jour), « File » (publications en cours, en attente ou en erreur, Reprendre,
  Annuler).

### 4.5 Les modules s’adaptent aux comptes

Un module ne liste jamais « YouTube » en dur. Il demande au cœur les comptes
qui ont une capacité (`publish.video`, `manage.channel`…) et construit son
interface à partir de la réponse :

- aucun compte capable : l’action n’apparaît pas (ou un lien discret vers
  « Comptes connectés » pour un administrateur) ;
- un seul : l’action le vise directement ;
- plusieurs : un sélecteur à cases, avec le logo du service et l’avatar du
  compte ;
- les champs de la fenêtre de publication viennent de la description que
  chaque connecteur donne de ses options (8.1, `publishFields`) : un
  connecteur ajouté plus tard apparaît dans Clip Studio sans y toucher.

## 5. Modèle de données

### 5.1 L’image de marque

```ts
/** Rôles de couleur, et non une liste anonyme : le moteur sait où mettre chacune. */
interface BrandPalette {
  /** Fond des plans sans image, voile posé sur les images, fond du projet. */
  background: string;
  /** Texte posé sur le fond (titres, légendes). */
  ink: string;
  /** Cartes et cadres (choix d'un quiz). */
  surface: string;
  /** Texte posé sur une carte. */
  onSurface: string;
  accent: string;
  /** Mise en avant (numéro 1 d'un classement, mot prononcé des sous-titres). */
  accentSecondary?: string;
  /** Texte posé sur l'accent (étiquettes). */
  onAccent: string;
  /** Teintes autorisées en plus, qui varient les segments à la place de ACCENTS. */
  extras: string[];
}

interface BrandFont {
  id: string;
  /** Nom affiché. */
  name: string;
  /** Famille déclarée au navigateur : `bk-<kitId>-<fontId>`, jamais le nom lu dans le fichier. */
  family: string;
  file: string;
  format: "ttf" | "otf" | "woff2";
}

/** Rôles de texte que les modèles de Clip Studio posent sur leurs éléments. */
type TextRole = "title" | "subtitle" | "caption" | "label" | "body";

interface BrandAsset {
  id: string;
  /** Nom de fichier dans data/kits/<kitId>/assets/. */
  file: string;
  /** `format` : image finie d'un format, rangée par `setFormatImage` seulement. */
  kind: "logo" | "logo-mark" | "mascot-sheet" | "mascot-pose" | "background" | "texture" | "reference" | "format";
  label: string;
  note?: string;
  width: number;
  height: number;
  /** Image générée : consigne, collection et travail d'AI Image Gen, pour la refaire. */
  generated?: { prompt: string; collectionId?: string; jobId?: string; slot: string };
}

interface BrandWatermark {
  assetId: string;
  anchor: "top-left" | "top-right" | "bottom-left" | "bottom-right";
  /** Largeur relative au petit côté de l'image ou de la vidéo (0,04 à 0,4). */
  size: number;
  /** 0,1 à 1. */
  opacity: number;
  /** Marge au bord, relative au petit côté (0 à 0,15). */
  margin: number;
  /** Apparition dans une vidéo, en secondes depuis le début. */
  startSeconds: number;
}

interface BrandEndCard {
  enabled: boolean;
  /** Durée en secondes (1,5 à 8) : la cadence varie d'un projet à l'autre. */
  seconds: number;
  /** Appel à l'action, par exemple « Abonne-toi ». */
  callToAction?: string;
  /** Pose de la mascotte à montrer, sinon le logo seul. */
  poseAssetId?: string;
}

/** Un lien de la marque, repris par {links} : adresse http(s) seulement. */
interface BrandLink {
  label: string;
  url: string;
}

/** Modèles propres à un service : seulement ce qui diffère des modèles communs. */
interface BrandServiceTemplates {
  titleTemplate?: string;
  descriptionTemplate?: string;
  captionTemplate?: string;
  firstCommentTemplate?: string;
  /** Où vont les hashtags (dossier 01 ter, § 4.2) ; absent : la règle du service. */
  hashtagRule?: "description" | "caption" | "firstComment" | "field" | "topic" | "none";
}

interface BrandPublishing {
  /** Comptes connectés où publier par défaut (cœur, § 8), de n'importe quel service. */
  accountIds: string[];
  /**
   * Modèles avec variables : {title}, {hook}, {summary}, {cta}, {tags},
   * {hashtags}, {links}, {credits}, {date}, {brand}. Une variable vide
   * emporte la ligne qu'elle laisserait vide.
   */
  titleTemplate: string;
  descriptionTemplate: string;
  /** Texte court publié avec le média (légende Instagram, texte Threads). */
  captionTemplate: string;
  /** Premier commentaire ; vide : aucun. */
  firstCommentTemplate: string;
  /** Par identifiant de connecteur, douze au plus. */
  serviceTemplates: Record<string, BrandServiceTemplates>;
  /** Mots-dièse visibles, sans « # » ; recopiés des tags à la lecture d'une marque qui n'en a pas. */
  hashtags: string[];
  /** Mots-clés cachés (YouTube). */
  tags: string[];
  /** Dix au plus. */
  links: BrandLink[];
  categoryId: string;
  defaultPrivacy: "private" | "unlisted" | "public";
  containsSyntheticMedia: boolean;
  /** Public enfant : faux par défaut, vrai seulement sur choix explicite. */
  madeForKids: boolean;
}

interface BrandKit {
  version: 1;
  id: string;
  name: string;
  tagline?: string;
  /** Langue des textes de la marque (BCP 47), reprise par snippet.defaultLanguage. */
  language: string;
  tone: string;
  rules: { always: string[]; never: string[] };
  palette: BrandPalette;
  fonts: BrandFont[];
  /** Styles de texte par rôle, au format TextStyle de Clip Studio. */
  textStyles: Record<TextRole, TextStyle>;
  assets: BrandAsset[];
  logoAssetId?: string;
  markAssetId?: string;
  mascot?: {
    name?: string;
    identityPrompt: string;
    sheetAssetIds: string[];
    poseAssetIds: string[];
    /** Pose de la bannière, de l'avatar, de l'en-tête X, de la couverture ; `null` : sans mascotte ; absente : proposée. */
    formatPoses?: Partial<Record<"banner" | "avatar" | "x-header" | "short-cover", string | null>>;
    /** Présence dans les vidéos (6.2). */
    presence?: { opening: boolean; openingPoseId?: string; reactions: boolean };
  };
  watermark?: BrandWatermark;
  endCard: BrandEndCard;
  /** Image finie de chaque format, qui remplace le rendu composé (4.3). */
  formatImages?: Partial<Record<FormatId, string>>;
  /** Croix de repérage sur la bannière et le carton de fin mis en scène. */
  registrationMarks?: boolean;
  ai: { styleNotes: string; collectionId?: string; scriptTone: string };
  /** Voix off (6.4) : « siwis » ou « azure:fr-FR-DeniseNeural », débit de 0,7 à 1,6, intonation d'une voix locale. */
  voice?: { voice: string; speed: number; tone?: "steady" | "balanced" | "expressive" };
  publishing: BrandPublishing;
  isDefault: boolean;
  createdAt: number;
  updatedAt: number;
}
```

Les champs de la mascotte et des formats sont facultatifs : une fiche écrite
avant eux se lit telle quelle (poses proposées, aucune présence dans les
vidéos, aucune image finie), et un réglage abîmé (pose disparue, format
inconnu) est oublié à l’enregistrement, jamais remplacé par une valeur
inventée.

`TextStyle` est celui de `modules/clip-studio/engine/types.ts`, importé et non
recopié : une marque ne peut pas décrire un style que le moteur ne sait pas
dessiner. Une police est soit une famille du catalogue de Clip Studio
(`FONTS`, `lib/fonts.ts`), soit la `family` d’une police importée de la
marque.

**Fichiers** (`modules/brand-kit/data/`, monté en volume) :

```
kits/<id>/brand.json       la fiche, écriture atomique
kits/<id>/assets/          logos, mascotte, fonds, textures, références
kits/<id>/fonts/           polices importées
kits/<id>/exports/         formats exportés en PNG
assets/                    dépôt de la route d'upload, vidé à l'enregistrement
assistant.json             travaux de l'assistant
```

La route d’upload des modules dépose toujours dans `data/assets/` : une
fonction du module (`registerKitAsset`) range ensuite le fichier dans le
dossier de la marque, comme `registerExport` le fait pour Clip Studio.

### 5.2 Le lien avec Clip Studio

Des champs facultatifs, sans changement de version du format (`version: 1`
reste valide, et un projet ancien s’ouvre tel quel) :

```ts
interface ClipProject {
  // …champs existants
  /** Image de marque appliquée ; absente pour un projet libre. */
  brandKitId?: string;
}

interface Track {
  // …champs existants
  /** Piste ajoutée par la marque (filigrane, carton de fin), retirée avec elle. */
  origin?: "brand";
}

/** Indication posée par un modèle : d'où l'élément tire sa couleur et son style. */
interface ThemeHint {
  /** Texte : rôle dont il prend le style. */
  role?: TextRole;
  /**
   * Couleur : « accent » (teinte du segment), « plate » (aplat d'un plan sans
   * image), « veil » (voile sur une image), « surface » (carte),
   * « highlight » (mise en avant).
   */
  paint?: "accent" | "plate" | "veil" | "surface" | "highlight";
  /** Rang du segment, pour la teinte tournante. */
  accent?: number;
}

interface ItemBase {
  // …champs existants
  /** Élément ajouté par la marque, retiré ou remplacé avec elle. */
  origin?: "brand";
  theme?: ThemeHint;
}

interface AssistantRequest {
  // …champs existants
  brandKitId?: string;
}
```

Les éléments ajoutés par la marque (filigrane, carton de fin) portent
`origin: "brand"`, ainsi que leurs pistes, pour pouvoir être retirés ou
remplacés quand on change de marque, sans toucher à ce que l’utilisateur a
placé lui-même. Les indications `theme` sont posées par les modèles
(`templates.ts`) : c’est grâce à elles qu’une marque appliquée après coup sait
quel texte est un titre et quel cadre porte la couleur du segment.

### 5.3 Ce que Clip Studio reçoit : le thème

Clip Studio ne lit pas la fiche entière. `brand-kit` la traduit en un thème
résolu (`toBrandTheme`, fonction pure), servi par `getBrandTheme(kitId)` :

```ts
interface BrandTheme {
  kitId: string;
  name: string;
  palette: BrandPalette;
  textStyles: Record<TextRole, TextStyle>;
  /** Familles des polices importées, à charger avant de dessiner. */
  fonts: { family: string; kitId: string; fontId: string }[];
  watermark?: { source: MediaSource; anchor: BrandWatermark["anchor"]; size: number; opacity: number; margin: number; startSeconds: number };
  endCard?: {
    seconds: number;
    logo?: MediaSource;
    name: string;
    tagline?: string;
    callToAction?: string;
    pose?: MediaSource;
    /** Image finie du carton 9:16 ou 16:9 : posée telle quelle à son orientation. */
    images?: { vertical?: MediaSource; horizontal?: MediaSource };
  };
  /** Présence de la mascotte au montage ; absente quand elle est éteinte ou sans pose. */
  mascot?: { opening?: MediaSource; reactions: MediaSource[] };
}
```

`MediaSource` désigne un fichier de la marque par son adresse
`/api/modules/brand-kit/data/kits/<id>/assets/<fichier>`, que la validation des
projets de Clip Studio accepte déjà (média de ce site).

### 5.4 Les comptes connectés (cœur)

```ts
/** Ce qu'un compte sait faire ; un module demande une capacité, jamais un service. */
type ConnectionCapability =
  | "publish.video"      // envoyer une vidéo
  | "publish.image"      // publier une image (Instagram, Facebook… à venir)
  | "publish.text"       // publier un message (X, Threads… à venir)
  | "posts.list"         // lister les publications du compte
  | "posts.manage"       // modifier, changer la visibilité, supprimer
  | "profile.banner"     // changer la bannière
  | "profile.watermark"; // changer le filigrane des vidéos

interface ConnectedAccount {
  id: string;                    // identifiant interne, « acc-… »
  connector: string;             // « youtube », plus tard « facebook », « instagram »…
  /** Identifiant chez le service (UC… pour une chaîne YouTube). */
  externalId: string;
  name: string;
  /** Nom choisi dans ShareX Manager, sinon le nom chez le service. */
  label?: string;
  avatarUrl?: string;
  /** Adresse publique du compte (page de la chaîne). */
  url?: string;
  /** Jetons chiffrés, jamais renvoyés au client. */
  credentials: EncryptedBlob;
  scopes: string[];
  /** Capacités réellement accordées, déduites des portées. */
  capabilities: ConnectionCapability[];
  status: "connected" | "needs-reconnect";
  connectedAt: number;
  lastCheckedAt: number;
}

interface PublishJob {
  id: string;
  accountId: string;
  connector: string;
  /** Fichier à publier : export de Clip Studio, désigné par son identifiant. */
  source: { module: string; id: string; file: string; bytes: number; kind: "video" | "image" };
  /** Options propres au service, validées par son connecteur (`publishFields`). */
  options: Record<string, unknown>;
  state: "queued" | "uploading" | "processing" | "done" | "failed" | "cancelled" | "waiting-quota";
  /** État de reprise propre au connecteur (URI de session YouTube…). */
  resume?: Record<string, unknown>;
  bytesSent: number;
  /** Publication obtenue : identifiant et adresse chez le service. */
  result?: { externalId: string; url: string };
  error?: string;
  createdAt: number;
  updatedAt: number;
}
```

Un compte est identifié par `connector` + `externalId` : reconnecter la même
chaîne met à jour le compte au lieu d’en créer un second. Plusieurs comptes
d’un même service coexistent sans limite.

Le fichier d’un export est retrouvé par le module qui le possède : Clip Studio
expose `resolveExportFile(id)` (accès serveur seulement) qui rend le chemin du
fichier après contrôle de son nom (`assertFileName`). Aucun chemin ne vient du
navigateur.

Stockage : `data/connections/accounts.json`, `data/connections/apps.json`
(identifiants d’application saisis dans l’interface, secret chiffré),
`data/connections/publish-jobs.json` et `data/connections/quota.json` dans le
volume `/app/data` déjà monté, fichiers en 0600, répertoire en 0700, écriture
atomique.

## 6. Application de la marque au montage

### 6.1 Les modèles deviennent thémables

`templates.ts` ne lit plus `ACCENTS` et `TEXT_PRESETS` directement : chaque
modèle reçoit un thème (celui d’une marque, ou le thème par défaut qui
reproduit exactement le rendu actuel) et pose sur ses éléments les
indications `theme` de 5.2.

| Élément d’un modèle | Rôle ou peinture | Thème par défaut | Avec une marque |
| --- | --- | --- | --- |
| Titre d’intro, de conclusion, numéro d’un classement | `title` | préréglage « Impact » | `textStyles.title` |
| Sous-titre d’intro, « Dis-le en commentaire » | `subtitle` | préréglage « Légende » | `textStyles.subtitle` |
| Question, légende, texte d’une séquence | `caption` | préréglage « Légende » | `textStyles.caption` |
| « Question 2/5 », « Avant », « Après » | `label` | Poppins 700, blanc sur la teinte | `textStyles.label`, fond `accent`, texte `onAccent` |
| Choix d’un quiz | `body` | Poppins 700, `#111111` | `textStyles.body`, couleur `onSurface` |
| Numéro 1 d’un classement | `title` + `highlight` | `#facc15` | `accentSecondary`, sinon `accent` |
| Cadre d’un choix | `surface` | blanc | `surface` |
| Aplat d’un plan sans image | `plate` | teinte assombrie | `background` |
| Voile sur une image | `veil` | noir à 42 % | `background`, même opacité |
| Barre du compte à rebours, étiquette | `accent` | `ACCENTS[i]` | `[accent, accentSecondary, ...extras][i]` |

La surbrillance verte de la bonne réponse et le texte vert de l’explication
restent verts : ils disent « juste », pas « marque ».

### 6.2 Une fonction pure

`applyBrandTheme(project, theme | null): ClipProject`, dans
`modules/clip-studio/engine/brand.ts`, sans accès disque ni réseau, testable
comme les modèles :

1. **Nettoyage** : retire tout élément et toute piste qui portent
   `origin: "brand"`.
2. **Fond** : `project.background` prend `palette.background` (noir sans
   marque) ; `project.brandKitId` prend l’identifiant de la marque, ou
   disparaît.
3. **Restylage** : chaque élément qui porte une indication `theme` reprend son
   style ou sa couleur du thème, selon la table de 6.1. Un texte garde sa
   taille et son alignement (propres à sa place), et prend tout le reste du
   style de son rôle.
4. **Sous-titres karaoké** : police, graisse, couleur et contour du rôle
   `caption`, mot prononcé en `accentSecondary` (ou `accent`) ; taille et
   majuscules inchangées.
5. **Filigrane** : un élément image sur une piste visuelle dédiée, au-dessus
   de toutes les autres, de `startSeconds` jusqu’au carton de fin, positionné
   selon le coin, la taille et la marge, `origin: "brand"`.
6. **Carton de fin** : un segment ajouté à la fin (aplat du fond, logo ou nom
   de la marque en titre, accroche, appel à l’action en étiquette, pose de la
   mascotte), sur des pistes `origin: "brand"`.
7. **Mascotte** (`mascotTracks`, seulement avec `theme.mascot`) : à
   l’ouverture, une pose accompagne l’accroche du premier segment (préréglage
   « Montée en grandissant », `rise-grow`) ; puis, à chaque segment suivant
   (les plans de la piste principale), une petite pose dans un coin, une
   autre à chaque fois (« Surgissement rebondi », `surge-up`). Chaque pose va
   à la première place libre, de la plus grande taille proposée à la plus
   petite : jamais sur un texte (estimé à sa longueur, sans le dessiner) ni
   sur un cadre du segment, toujours dans la zone de sécurité d’un short
   (`SHORT_SAFE_ZONE`, la même que l’aperçu de Clip Studio : ni sous le nom du
   compte, ni sous la légende, ni sous les boutons) ou dans les marges d’un
   autre cadre. Quand rien ne tient, le segment reste tel quel. Pistes
   `origin: "brand"`, sous le filigrane.
8. **Idempotence** : appliquer deux fois la même marque donne le même projet ;
   appliquer une autre marque remplace la précédente ; `null` retire la
   marque et rend le rendu du thème par défaut.

Un projet monté avant ce module n’a pas d’indications : la marque n’y change
que le fond, les sous-titres karaoké, et y ajoute filigrane et carton de fin.
Les éléments posés à la main ne sont jamais restylés.

`buildFromTemplate(template, name, aspect, data, theme?)` construit avec le
thème puis appelle `applyBrandTheme` quand une marque est fournie. Les
recettes (`buildSequence`) font de même.

### 6.3 Les polices

La route de données des modules ne sert que des médias
(`lib/modules/media-response.ts`) et les polices n’en font pas partie. On
reprend le modèle de Scan Studio :

- le contrôle d’un fichier de police (signature TTF, OTF ou WOFF2, répertoire
  des tables, table des noms, tailles) passe de
  `scan-studio/lib/server/fonts.ts` à `src/lib/fonts/inspect.ts`, partagé par
  les deux modules ;
- `importFont(kitId, { name, data })` contrôle et range le fichier ;
  `readFontFile(kitId, fontId)` le rend en base64 à une fonction du module,
  donc à un compte connecté seulement ;
- dans le navigateur, `ensureBrandFonts(theme.fonts)` (Clip Studio,
  `lib/fonts.ts`) déclare chaque police par `new FontFace(family, buffer)`
  avant le rendu ; l’aperçu, les formats et l’export attendent ce chargement,
  pour qu’aucune image ne sorte avec la police de repli.

### 6.4 L’assistant

- `scriptPrompt()` reçoit le nom, l’accroche, la langue, le ton, les règles
  « toujours / jamais » et le ton du script de la marque, passés comme
  données dans une consigne qui le précise.
- `generateImages()` ne colle plus `Cinematic lighting…` en dur quand une
  marque est choisie : il passe `ai.styleNotes` dans la consigne, et
  `collectionId` quand la marque en a une, pour que les ancres de la
  collection (mascotte, références) partent avec chaque image. Si la marque a
  une mascotte, son `identityPrompt` est ajouté à toute consigne qui la met en
  scène.
- Quand la marque pose ses réactions à chaque segment (`theme.mascot`), la
  mascotte n’est plus mise en scène dans les illustrations : la consigne le
  dit, aucun segment ne la demande, et son identité ne part plus vers AI
  Image Gen (`AssistantBrand.mascotPlaced`). Avec l’ouverture seule, rien ne
  change.
- Le montage passe le thème à `buildFromTemplate` ; la musique est posée après
  le carton de fin, pour le couvrir.
- **Voix de la marque** (`voice`, section « Assistant IA » de l’éditeur) :
  source et voix, choisies avec le sélecteur de Clip Studio et son bouton
  « Écouter », débit (Posée, Normale, Rapide) et, pour une voix locale,
  intonation. Lue avec tolérance (`cleanVoiceSettings`) : une marque d’avant
  la voix, ou une voix abîmée, n’en a simplement pas ; le débit est borné, une
  voix en ligne ne garde pas d’intonation. La liste des marques la donne
  (`listKits`) : la fenêtre « Créer » la préremplit quand la marque est
  choisie, et l’assistant la prend d’office quand une demande ne précise
  aucune voix. Si elle n’est pas disponible (clé Azure absente, Edge en
  panne), la voix locale par défaut la remplace et le suivi le dit, sans
  échec du clip (dossier 01, étape 13).

### 6.5 Contrôle de cohérence des images

Les visuels générés avec un personnage passent une vérification avant d’entrer
dans la marque ou dans un clip : un modèle de vision reçoit l’image et la
feuille de modèle et répond en JSON (même personnage, mains à cinq doigts,
paire de chaussures identique, absence de logo de marque tierce). Une image
refusée est régénérée une fois, puis signalée dans l’interface au lieu d’être
utilisée en silence. Ce contrôle est un garde-fou, pas une garantie : la
vignette reste affichée pour une relecture humaine.

Le seul modèle de vision disponible sans clé sur le serveur est Codex CLI
avec une image jointe (`codex exec --image`). Le contrôle n’est donc actif que
si Codex est installé ; sans lui, l’image est marquée « non vérifiée ».

## 7. Le filigrane des captures (module `watermark`)

Le module garde son rôle (poser un filigrane sur une image, à la main ou à
chaque envoi) et gagne une seconde source.

| Réglage | Texte (actuel) | Image de marque (nouveau) |
| --- | --- | --- |
| `source` | `"text"` | `"brand"` |
| Contenu | `text`, `color`, `fontSize` | `kitId` : l’image finie du filigrane de la marque s’il y en a une (4.3), sinon le logo du filigrane (`watermark.assetId`, sinon le logo principal) |
| Position | neuf positions | neuf positions ; par défaut le coin de la marque |
| Taille | `fontSize` à l’échelle de 1 000 px | `size` de la marque, relative au petit côté |
| Opacité, marge | réglages | ceux de la marque, modifiables |

- Le logo est lu côté serveur par `getWatermarkImage(kitId)` de `brand-kit`
  (appel entre modules par `apiModuleManager.callModuleFunction`, réservé au
  serveur), redimensionné par `sharp` et composé sur l’image.
- Une image de marque supprimée ou sans logo fait échouer le traitement avec
  un message clair : rendre l’image intacte ferait croire que le filigrane a
  été posé.
- `module.json` perd l’icône chargée depuis un site tiers (flaticon) au profit
  d’un logo local dans `branding/`, comme les autres modules, et passe dans la
  catégorie « Édition », avec le recadrage et le redimensionnement.
- Les traductions de la fenêtre (`locales/fr.json`, `en.json`) gagnent les
  libellés de la nouvelle source.
- Réglages enregistrés (traitement à l’envoi) : une valeur `null` pour
  `position`, `size`, `opacity` ou `margin` reprend celle de la marque. La
  fenêtre enregistre ainsi toute valeur laissée égale à celle de la marque :
  une marque retouchée plus tard est suivie sans repasser par le module.
  `module.json` ne fixe plus de position ni d’opacité par défaut, sinon le
  coin de la marque ne s’appliquerait jamais aux envois.
- Le logo redimensionné est gardé en mémoire par marque, version
  (`updatedAt`) et largeur ; l’opacité est appliquée au canal alpha d’une
  copie, et l’image garde son format d’origine.
- Sans module `brand-kit` actif, la source « Image de marque » n’apparaît pas
  dans la fenêtre, et un réglage enregistré qui la désigne fait échouer le
  traitement avec un message clair.
- À l’envoi automatique, un échec (marque supprimée, logo retiré) est
  journalisé et la capture part sans filigrane : perdre une capture serait
  pire. À la main, l’échec s’affiche et aucune version n’est créée.

## 8. Comptes connectés et publication (cœur)

Les comptes connectés sont une brique du cœur, comme les albums ou les
réglages : ils ne dépendent d’aucun module, et un module peut s’en servir
sans savoir quel service se trouve derrière. YouTube en est le premier
connecteur ; Facebook, Instagram et Threads ont suivi (dossiers 07a, 07b,
07c), puis TikTok (dossier 07e : brouillon dans la boîte de réception de
TikTok par défaut, publication directe une fois l’application auditée) ; X
est étudié (dossier 07d). Chacun tient en un dossier de
`src/lib/connections/connectors/`.

### 8.1 Le registre des connecteurs

`src/lib/connections/connectors/` contient un fichier par service, inscrit
dans `registry.ts`. Un connecteur décrit tout ce que le cœur et l’interface
ont besoin de savoir, et rien ne le cite ailleurs :

```ts
interface Connector {
  id: string;                       // « youtube »
  label: string;                    // « YouTube »
  /** Entrée de BrandLogo : le logo officiel du service. */
  logo: string;
  /** Nom d'un compte chez ce service : « chaîne », « page », « compte ». */
  accountNoun: { one: string; many: string };
  /** « ready » : utilisable ; « planned » : affiché « bientôt », non connectable. */
  status: "ready" | "planned";
  /** Ce que le connecteur sait faire, et les portées qui le permettent. */
  capabilities: { capability: ConnectionCapability; scopes: string[] }[];
  /** Variables d'environnement qui configurent l'application, et aide de configuration. */
  app: { envPrefix: string; setupSteps: string[]; consoleUrl: string };
  oauth: {
    authorizeUrl: string;
    tokenUrl: string;
    revokeUrl?: string;
    pkce: boolean;
    /** Paramètres propres au service (access_type=offline…). */
    extraParams?: Record<string, string>;
    /** Jeux de portées proposés à la connexion (« tout », « lecture et envoi »). */
    scopeSets: { id: string; label: string; scopes: string[] }[];
  };
  /** Lit l'identité du compte avec un jeton neuf. */
  fetchProfile(token: AccessToken): Promise<AccountProfile>;
  /** Champs de publication propres au service, décrits pour que l'interface les dessine seule. */
  publishFields?: PublishField[];
  /** Valide les options reçues et les complète (limites du service). */
  normalizeOptions?(options: unknown, source: PublishSource): Record<string, unknown>;
  /** Publie un fichier ; rend l'état de reprise au fil de l'envoi. */
  publish?(context: PublishContext): Promise<{ externalId: string; url: string }>;
  /** Actions de gestion, présentes selon les capacités. */
  posts?: { list; update; remove };
  profile?: { setBanner; setWatermark };
}

/** Un champ de publication : l'interface le dessine sans connaître le service. */
type PublishField =
  | { key: string; kind: "text"; label: string; maxLength: number; maxBytes?: number; required?: boolean }
  | { key: string; kind: "textarea"; label: string; maxLength: number; maxBytes?: number }
  | { key: string; kind: "tags"; label: string; maxTotal: number }
  | { key: string; kind: "select"; label: string; choices: { value: string; label: string }[] }
  | { key: string; kind: "datetime"; label: string; help?: string }
  | { key: string; kind: "toggle"; label: string; help?: string };
```

Ajouter un service, c’est écrire son fichier dans `connectors/`, l’inscrire
dans `registry.ts`, ajouter son logo officiel à `BrandLogo` et ses tests :
la page « Comptes connectés », la fenêtre de publication de Clip Studio et
le choix des comptes d’une image de marque le prennent en charge sans autre
modification. Facebook, Instagram, Threads et X sont inscrits dès B4 avec le
statut `planned`, pour que l’interface montre ce qui viendra.

### 8.2 Configurer l’application d’un service

Chaque service demande une « application » créée chez lui (identifiant et
secret du client OAuth). Deux sources, dans cet ordre :

1. l’environnement du serveur, `<PREFIX>_CLIENT_ID` et
   `<PREFIX>_CLIENT_SECRET` (`YOUTUBE_CLIENT_ID`, `YOUTUBE_CLIENT_SECRET`) ;
2. à défaut, la configuration saisie dans « Comptes connectés » par un
   administrateur, rangée dans `data/connections/apps.json`, secret chiffré.

Le chiffrement (AES-256-GCM) prend sa clé dans
`CONNECTIONS_ENCRYPTION_KEY` (32 octets aléatoires, en base64). Sans elle, la
clé est dérivée de `AUTH_SECRET` (HKDF, contexte propre aux comptes
connectés) : l’instance fonctionne sans réglage de plus, mais changer
`AUTH_SECRET` oblige alors à reconnecter les comptes, ce que la page dit.
Chaque blob porte la version de sa clé, pour une rotation future.

L’URI de redirection d’un service est fixe et tirée de `AUTH_URL` :
`<AUTH_URL>/api/connections/<connecteur>/callback`. La page l’affiche, prête à
copier.

### 8.3 Connexion OAuth, commune à tous les services

La connexion d’un compte **n’est pas** un mode de connexion à ShareX Manager :
elle ne passe pas par Better Auth, qui garde l’identité (Ascencia ID ou
comptes locaux). Elle relie un compte de publication à l’instance.

| Route | Rôle |
| --- | --- |
| `GET /api/connections/<connecteur>/connect?scopes=<jeu>` | Session administrateur exigée. Génère `state` et, si le service le prend en charge, le vérificateur PKCE ; les place dans un cookie `HttpOnly`, `Secure`, `SameSite=Lax`, signé et valable dix minutes ; redirige vers le service |
| `GET /api/connections/<connecteur>/callback` | Session administrateur exigée. Vérifie `state`, échange le code contre les jetons, lit le profil (`fetchProfile`), chiffre et enregistre ; un compte déjà connu (même `externalId`) est mis à jour ; redirige vers « Comptes connectés » avec le compte mis en avant |

Le reste (liste, renommage, déconnexion, publication, gestion) passe par des
actions serveur de la page d’administration et par la bibliothèque
`src/lib/connections/`, que les modules importent directement : un module
importe déjà le cœur (`@/lib/media/video`, `@/lib/gallery-events`).

**Jetons** : `getAccessToken(accountId)` renouvelle le jeton d’accès une
minute avant expiration, sous un verrou par compte pour ne jamais lancer deux
renouvellements en même temps. Une réponse `invalid_grant` passe le compte en
« à reconnecter », et toutes les interfaces le disent. La déconnexion révoque
le jeton chez le service quand il le permet, puis efface le compte.

**Ce que voient les modules** : `listAccounts({ capability })` rend des
résumés sans jeton (`id`, `connector`, `name`, `label`, `avatarUrl`,
`capabilities`, `status`), et `listConnectors()` les descriptions publiques
(nom, logo, champs de publication). Un module n’a jamais accès à un jeton :
il demande une action (`enqueuePublish`, `posts.list`…), le cœur l’exécute.

### 8.4 Le connecteur YouTube

**Préparer le projet Google Cloud** (marche à suivre affichée dans la
configuration du connecteur) :

1. Créer un projet dans Google Cloud Console et y activer **YouTube Data API
   v3**.
2. Écran de consentement OAuth : type « Externe », nom de l’application,
   adresse de contact.
3. Identifiants : « ID client OAuth », type « Application Web », URI de
   redirection autorisée `<AUTH_URL>/api/connections/youtube/callback`.
4. Renseigner l’identifiant et le secret dans l’environnement ou dans la page.
5. **Passer l’application « En production »**. En statut « Test », Google fait
   expirer les jetons d’actualisation au bout de sept jours : la chaîne se
   déconnecterait chaque semaine. En production sans vérification, Google
   affiche un avertissement « application non validée » au moment du
   consentement, que le propriétaire de l’instance peut accepter ; c’est
   suffisant pour une instance personnelle. La vérification par Google n’est
   nécessaire que pour ouvrir l’application à d’autres comptes.

Paramètres de la demande d’autorisation : `access_type=offline`,
`prompt=consent` (pour obtenir le jeton d’actualisation à chaque reconnexion),
`include_granted_scopes=true`, `code_challenge_method=S256`. Une connexion
désigne une chaîne : pour une seconde chaîne, on reconnecte en choisissant
l’autre chaîne (ou le compte de marque) chez Google.

**Portées et capacités** :

| Portée | Capacités |
| --- | --- |
| `https://www.googleapis.com/auth/youtube.upload` | `publish.video`, `profile.watermark` (`watermarks.set`) |
| `https://www.googleapis.com/auth/youtube` | `posts.list`, `posts.manage` (`videos.update`, `videos.delete`), `profile.banner` (`channelBanners.insert` puis `channels.update`, que `youtube.upload` ne permet pas) |
| `https://www.googleapis.com/auth/youtube.readonly` | `posts.list` seulement |
| `https://www.googleapis.com/auth/youtube.force-ssl` (à la demande) | `comment.create` (`commentThreads.insert`), `captions.upload` (`captions.insert`) ; `cover.set` (`thumbnails.set`) passe aussi avec `youtube.upload` ou `youtube` |

Deux jeux proposés à la connexion : « Tout » (`youtube.upload` +
`youtube`) et « Lecture et envoi seulement » (`youtube.upload` +
`youtube.readonly`), où la gestion et la bannière restent grisées. On ne
demande pas `youtubepartner` ; `youtube.force-ssl` (premier commentaire,
sous-titres) n'est jamais demandée à la connexion, seulement ajoutée à un
compte connecté, à la demande (§ 8.9, « Autorisation incrémentale »).

### 8.5 La file de publication

`src/lib/connections/publish-queue.ts` : file persistante commune à tous les
services, **un envoi à la fois** sur la machine (verrou propre à la file),
pour ne pas saturer le lien de `ascencia-prod`. L’export de Clip Studio n’a
pas de verrou serveur à partager : il se fait dans le navigateur.

- `enqueuePublish({ accountId, source, options })` valide les options par le
  connecteur, crée le travail et rend son identifiant ; un compte sans la
  capacité voulue est refusé.
- Le connecteur publie et rend son état de reprise au fil de l’envoi ; la file
  l’enregistre dans `resume`.
- Au redémarrage (`src/instrumentation.ts`), un travail `uploading` reprend
  avec son état de reprise ; sans état, il repart du début.
- Une réponse de quota dépassé passe le travail en `waiting-quota` et suspend
  les travaux du même service jusqu’à la remise à zéro, au lieu de réessayer
  en boucle.

**Envoi reprenable YouTube** (`connectors/youtube/upload.ts`) :

1. Ouvrir la session :
   `POST https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status`,
   corps JSON des métadonnées, en-têtes `X-Upload-Content-Length` et
   `X-Upload-Content-Type: video/mp4`. Google répond avec l’URI de session
   dans `Location`, enregistrée dans `resume`.
2. Envoyer le fichier par blocs de 8 Mio (multiple de 256 Kio) lus en flux sur
   le disque, `PUT` sur l’URI avec `Content-Range`. Le fichier n’est jamais
   chargé entier en mémoire.
3. Coupure ou erreur 5xx : interroger l’état (`PUT` vide,
   `Content-Range: bytes */<taille>`), lire l’en-tête `Range` et reprendre au
   bon octet, avec attente exponentielle (1, 2, 4, 8, 16 s, puis échec
   signalé). Une réponse 404 ou 410 sur l’URI (session expirée) fait repartir
   du début.
4. Fin : la réponse contient la ressource vidéo ; enregistrer l’identifiant,
   passer en `processing`, puis interroger
   `videos.list?part=processingDetails,status` toutes les trente secondes
   jusqu’à la fin du traitement YouTube.

### 8.6 Métadonnées YouTube

Champs de publication du connecteur, préremplis par la marque :

| Champ YouTube | Source | Limite |
| --- | --- | --- |
| `snippet.title` | Modèle de titre de la marque, rempli par le nom du projet | 100 caractères, sans `<` ni `>` |
| `snippet.description` | Modèle de description, avec les crédits musicaux du projet ajoutés automatiquement quand la licence l’exige (CC BY) | 5 000 octets, sans `<` ni `>` |
| `snippet.tags` | Tags de la marque et de la fenêtre | 500 caractères au total |
| `snippet.categoryId` | Catégorie de la marque (par exemple 20 « Jeux vidéo », 1 « Film et animation », 24 « Divertissement ») | obligatoire pour `videos.update` |
| `snippet.defaultLanguage` | `language` de la marque | – |
| `status.privacyStatus` | Visibilité choisie, **toujours envoyée** : sans elle, YouTube publie en public | `private`, `unlisted`, `public` |
| `status.publishAt` | Date de programmation | n’est acceptée que si la vidéo est `private` |
| `status.selfDeclaredMadeForKids` | `madeForKids` de la marque, faux par défaut | – |
| `status.containsSyntheticMedia` | Coché par défaut quand le clip contient des images ou une voix générées présentées comme réalistes | – |

Les modèles de titre et de description sont remplis par une fonction pure du
cœur (`src/lib/connections/templates.ts`), commune à tous les services ; chaque
connecteur applique ensuite ses propres limites.

**Shorts** : l’API n’a pas de champ « Short ». Une vidéo verticale ou carrée
de trois minutes au plus est classée en Short par YouTube. La fenêtre de
publication le rappelle et signale un export 16:9 envoyé depuis une marque
orientée Shorts.

### 8.7 Gérer les vidéos et la chaîne YouTube

| Action | Appel |
| --- | --- |
| Lister les envois | `channels.list?part=contentDetails&mine=true` pour la playlist `uploads`, puis `playlistItems.list` et `videos.list?part=snippet,status,statistics` par lots de 50 |
| Modifier titre, description, tags | `videos.update?part=snippet` en renvoyant le `snippet` complet (catégorie comprise), sinon les champs absents sont effacés |
| Changer la visibilité, reprogrammer | `videos.update?part=status` |
| Supprimer | `videos.delete`, après confirmation |
| Changer la miniature | `thumbnails.set` (vidéos longues surtout ; pour un Short, YouTube choisit souvent l’image dans la vidéo) |
| Bannière | `channelBanners.insert` avec le PNG exporté (2560 × 1440 recommandés, 2048 × 1152 au minimum, 6 Mo au plus), puis `channels.update?part=brandingSettings` avec `brandingSettings.image.bannerExternalUrl`. `channels.update` remplace toute la partie `brandingSettings` : lire d’abord l’existant et le renvoyer complet |
| Filigrane | `watermarks.set` avec le PNG 150 × 150 et `timing` (`offsetFromStart` ou `offsetFromEnd`, `offsetMs`, `durationMs` d’une seconde au moins) ; le champ `position` est ignoré, YouTube le place toujours en haut à droite |
| Avatar | **Pas d’API** : la page propose le PNG 800 × 800 au téléchargement et un lien vers YouTube Studio (§ 8.10) |

### 8.8 Quotas

D’après la documentation de l’API (pages « Quota calculator » et
`videos.insert`, mises à jour le 08/10/2026, vérifiées le 11/10/2026) :

- `videos.insert` est compté dans son **propre compartiment** « Video
  Uploads » : 1 unité par envoi, **100 envois par jour** par défaut ;
- les autres méthodes partagent le compartiment général, 10 000 unités par
  jour par défaut : `channelBanners.insert`, `watermarks.set`,
  `thumbnails.set`, `channels.update`, `videos.update` et `videos.delete`
  coûtent 50 unités, une lecture (`videos.list`, `channels.list`,
  `playlistItems.list`) 1.
- suites de publication (référence vérifiée le 12/10/2026) :
  `commentThreads.insert` 50 unités, `captions.insert` **400 unités**,
  `thumbnails.set` 50 unités ; `commentThreads.list` (recherche d'un
  commentaire déjà posté après une réponse perdue) 1.
- profil, sections et playlists (calculateur vérifié le 12/10/2026) :
  `channelSections.list` et `playlists.list` 1 unité ;
  `channelSections.insert`, `update`, `delete`, `playlists.insert`,
  `update` et `playlistItems.insert` 50 unités (§ 8.10).

Le quota appartient à l’application Google, donc à toutes les chaînes
connectées ensemble. Les coûts sont rangés dans une seule table
(`connectors/youtube/quota.ts`), pour suivre un changement de Google en une
ligne. Le cœur tient un compteur par service, par compartiment et par jour
(fuseau du Pacifique, celui de la remise à zéro de Google), l’affiche dans la
fiche des comptes, et refuse une action qui dépasserait le reste du jour avec
un message clair.

D’après la même source, les vidéos envoyées depuis un projet non vérifié ne
sont plus restreintes en mode privé. Ce point a changé plusieurs fois : la
file vérifie après chaque envoi que la visibilité obtenue est bien celle
demandée, et l’affiche sinon.

### 8.9 Extensions du cœur pour les connecteurs à venir

YouTube a servi de modèle ; Facebook, Instagram, Threads et X s'en écartent
sur des points que le cœur prend désormais en charge de façon générique. Un
connecteur ne déclare que ce dont il a besoin : tout est facultatif, et
YouTube fonctionne sans rien changer. Les tests passent par un faux service
(`tests/lib/connections-fake-service.ts`), jamais par un service réel.

#### Plusieurs comptes par autorisation

`fetchAccounts(token, chargeQuota)` rend une liste de `DiscoveredAccount`
(pages d'un profil, comptes professionnels liés). Il est prioritaire sur
`fetchProfile` à la connexion. Chaque compte peut porter :

- `token` : son propre jeton (jeton de page) ; `expiresAt` absent, il
  n'expire pas. Sans `token`, le compte partage le jeton de l'autorisation,
  recopié dans chaque compte et renouvelé pour tous ensemble, sous un verrou
  par autorisation ;
- `scopes` et `capabilities` : portées accordées pour ce compte, et
  restriction des capacités (un rôle insuffisant sur une page) ;
- `data` : données **non secrètes** du connecteur (identifiant d'une page
  liée, abonnement), rangées en clair et rendues dans `context.data`.

Tous les comptes d'une autorisation portent le même `grantId`. Déconnecter
l'un ne touche pas aux autres : l'accès n'est révoqué chez le service
(`revokeAccess` du connecteur, sinon `oauth.revokeUrl`) qu'avec le dernier
compte de l'autorisation, et avec le jeton de l'autorisation (gardé, chiffré,
à côté d'un jeton de page). Sans révocation possible par l'API,
`app.disconnectHelp` est rendu à l'administrateur (« retirez l'application
dans les réglages du service »).

**Choix des comptes à garder.** Au retour du service, une autorisation qui
rend plusieurs comptes n'enregistre rien : les comptes trouvés et leurs jetons
sont mis de côté dix minutes, chiffrés, liés à l'administrateur qui a lancé la
connexion (`src/lib/connections/pending.ts`). L'interface lit la liste sans
jeton (`readPendingAuthorization`, action `getPendingAuthorizationAction`),
l'administrateur coche ceux à garder, `finalizePendingAuthorization` (action
`finalizePendingAuthorizationAction`) n'enregistre que ceux-là ; les jetons des
autres sont oubliés, jamais révoqués (révoquer l'autorisation casserait aussi
les comptes gardés). Un service à compte unique, ou une autorisation qui ne
rend qu'un compte, est enregistré directement.

#### Parcours de connexion en fenêtre surgissante

`GET /api/connections/<connecteur>/connect` accepte `mode=popup` et
`returnTo` (chemin interne validé par `safeReturnPath` ; une adresse externe,
`//hôte`, une barre oblique inverse ou un caractère de contrôle sont
ignorés). Les deux voyagent dans le cookie de transaction signé. Au retour :

- en mode popup, une petite page (script à nonce, rien d'autre) envoie un
  `ConnectionResultMessage` à `window.opener` par `postMessage(…, origine de
  l'application)`, le répète sur le `BroadcastChannel` `sxm-connections`
  (quand le service a coupé le lien entre les fenêtres), puis se ferme ;
- sans fenêtre d'origine, ou hors mode popup, redirection vers `returnTo` (ou
  « Comptes connectés ») avec `connected=<compte>`, `pending=<attente>`, ou
  `error` et `errorCode`.

Les codes d'erreur sont lisibles pour que l'interface les traduise en action :
ceux du service (`access_denied`, `redirect_uri_mismatch`, `invalid_client`,
`invalid_grant`…) et ceux du cœur (`app_not_configured`, `invalid_state`,
`no_accounts`, `connection_failed`). Le code est échangé sans délai au retour
(certains services ne le gardent que trente secondes).

#### Variantes OAuth

| Réglage du connecteur | Effet |
| --- | --- |
| `oauth.pkce: false` | ni défi dans l'adresse, ni vérificateur à l'échange |
| `oauth.clientAuth: "basic"` | identifiant et secret en `Authorization: Basic` (échange, renouvellement, révocation) |
| `oauth.tokenMethod: "GET"` | échange en paramètres d'adresse |
| `oauth.scopeSeparator: ","` | portées jointes par une virgule |
| `oauth.parseTokenResponse(body, status)` | lecture d'une réponse non normée ; par défaut le cœur lit aussi `{ data: [ { access_token, permissions } ] }` |
| `oauth.readError(body, status)` | lecture d'une erreur ; par défaut `{ error }`, `{ error: { message, type, code } }` et `{ error_type, error_message }` |
| `fetchGrantedScopes(token, context)` | portées accordées quand la réponse ne les donne pas (inspection du jeton), repli sur celles demandées |
| `app.settings` | réglages propres au service (identifiant de configuration de connexion…), saisis avec l'application ou lus dans leur variable d'environnement, recopiés dans l'adresse d'autorisation si `authorizeParam` ; un réglage `secret` est chiffré et jamais réaffiché |

Les réponses de jeton sont lues par `parseJsonKeepingIds` : un entier de seize
chiffres ou plus reste une chaîne (`JSON.parse` arrondirait un identifiant de
dix-sept chiffres). Un identifiant se range et se transporte toujours en
chaîne ; un connecteur lit ses propres réponses avec `readJsonKeepingIds`.

`context.appSecretProof(valeur)` rend le HMAC-SHA256 de la valeur par le
secret de l'application : le connecteur signe ses appels sans jamais recevoir
le secret. Seuls les points d'extension des jetons (`exchangeToken`,
`refreshToken`, `fetchGrantedScopes`, `revokeAccess`), qui parlent au service
au nom de l'application, reçoivent le secret dans `TokenHookContext.app`.

La lecture des comptes passe aussi par cette preuve : `fetchAccounts(token,
chargeQuota, context)` à la connexion et `fetchProfile(token, chargeQuota,
account, context)` à la connexion comme à la vérification reçoivent un
`AccountReadContext` (`chargeQuota`, `appSecretProof`, `appSettings`), jamais
le secret. Un connecteur n'a donc plus à charger `apps.ts` ni à deviner son
propre identifiant pour signer ces appels.

#### Cycle de vie des jetons

- `exchangeToken(tokens, context)` : juste après l'échange du code
  (échange contre un jeton longue durée) ; `issuedAt` est rangé avec le jeton.
- `refreshToken(account, tokens, context)` : renouvellement sans
  `refresh_token` normé (prolonger un jeton longue durée). Un `refresh_token`
  normé reste renouvelé par le cœur, comme pour YouTube.
- `tokenLifetime` : `renewBeforeMs` (fenêtre de renouvellement, une minute
  par défaut), `minAgeMs` (« pas avant » : un jeton plus jeune n'est pas
  prolongé), `defaultMs` (durée supposée sans `expires_in`, `null` : n'expire
  pas), `schedule` (« scheduled » par défaut : à l'usage et par la tâche de
  fond ; « on-use » : à l'usage seulement, pour un jeton d'actualisation à
  usage unique) et `maintenanceAfterMs` (renouvellement d'entretien d'un
  « on-use » resté inutilisé).
- Tâche de fond (`maintenance.ts`, lancée par `instrumentation.ts`) : au
  démarrage puis toutes les heures, elle prolonge les jetons dus même sans
  publication, passe « à reconnecter » les comptes dont le jeton non
  renouvelable a expiré, et efface les liens publics et les autorisations en
  attente expirés. Les jetons à `refresh_token` classique (YouTube) restent
  renouvelés à l'usage seulement.
- Tout renouvellement passe sous le verrou du compte (ou de l'autorisation
  pour un jeton partagé). L'écriture est atomique ; si le disque la refuse
  malgré trois essais, le nouveau couple reste en mémoire et sert aux appels
  suivants plutôt que d'être perdu (un jeton d'actualisation à usage unique
  est déjà consommé chez le service).
- Un refus (`invalid_grant`, `ReconnectRequiredError`) passe le compte « à
  reconnecter ». Une autre erreur, tant que le jeton reste valable, est notée
  et le jeton actuel sert.
- `ReconnectRequiredError` levée par le connecteur **pendant un usage**
  (publication, suivi, gestion : jeton de page devenu invalide) passe aussi le
  compte « à reconnecter » ; la file garde ses travaux en attente jusqu'à la
  reconnexion.

L'administration voit `tokenState` : « Connecté », « Expire bientôt » (jeton
non prolongeable à moins d'une semaine de l'échéance, ou dernier
renouvellement en échec, avec la raison) et « À reconnecter ».

#### Liens publics temporaires vers un fichier

Certains services ne reçoivent pas le fichier : ils vont le chercher.
`context.publicUrl(ttlMs?, options?)` (ou `context.publicLink`, qui rend aussi
l'identifiant du lien) donne une adresse
`<AUTH_URL>/api/connections/media/<jeton>.<extension>` :

- jeton aléatoire de 256 bits ; seule son empreinte SHA-256 est rangée
  (`data/connections/public-media.json`) ;
- lié à **un** fichier déjà résolu par le serveur : le fichier du travail,
  un élément de carrousel (`item: n`), la couverture (`item: "cover"`) ou un
  fichier dérivé créé par `context.tempFile(extension)` (`derivedFile`, effacé
  avec son lien) ; jamais un chemin venu d'une requête ;
- une heure par défaut, `Connector.publicMedia.ttlMs` sinon, de une minute à
  vingt-quatre heures ; relisible pendant ce temps (`HEAD`, nouvel essai du
  service), dans la limite de `maxDownloads` lectures complètes (5 par défaut,
  50 au plus), comptées en octets servis pour qu'une lecture par morceaux
  `Range` ne soit pas pénalisée ;
- servi sans session par `serveMediaFile` (`GET` et `HEAD`, `Range`,
  `Content-Length`), `Content-Type` exact, `Cache-Control: no-store`,
  `X-Robots-Tag: noindex, nofollow` ; inconnu, expiré, révoqué ou épuisé : la
  même réponse 404, sans chemin ;
- journal des accès par lien (`context.publicLinkAccesses(id)` : heure,
  méthode, octets, agent), pour la progression et le diagnostic ;
- fermé par `context.revokePublicUrls(id?)` dès que le service a fini de
  télécharger, et dans tous les cas quand le travail se termine.

**Une instance qui n'est pas joignable depuis Internet ne peut pas publier
vers ces services.** La page « Comptes connectés » l'indique quand AUTH_URL
manque, désigne une adresse locale ou n'est pas en HTTPS. En production, le
chemin `/api/connections/media/*` doit être **exempté des défis anti-robots**
du proxy (Cloudflare : règle ciblée sur ce seul chemin, jamais sur toute la
zone), sans quoi le robot du service échoue à lire le fichier. `robots.txt`
autorise ce seul chemin sous `/api/`.

#### Publications sans fichier ou avec plusieurs fichiers

`PublishSource` est une union :

- `PublishFileSource` (`kind: "video" | "image"`), avec une couverture
  facultative (`cover`, résolue par le module avec son propre identifiant) ;
- `PublishTextSource` (`kind: "text"`, `text`, `bytes: 0`) : aucun fichier,
  `context.filePath` vide, `context.filePaths` vide ;
- `PublishCarouselSource` (`kind: "carousel"`, `items`) : chaque élément est
  résolu par le module ; aucune interface ne s'en sert encore.

La capacité exigée suit la source (`publish.text`, `publish.image`,
`publish.video`). `normalizeOptions` reçoit la source telle quelle. Une
capacité peut exiger plusieurs portées à la fois (`allOf`).

#### Limites, coût et date

- `limits` (`video`, `image` : formats, poids, durées, rapport, dimensions ;
  `cover` : mêmes critères pour la couverture d'une vidéo ; `text` : longueur
  et mesure ; `carousel` : nombre d'éléments) et
  `limitsFor(account)` (limites propres au compte, selon son abonnement lu au
  profil). La file refuse avant l'envoi ce qui ne les respecte pas ; la
  fenêtre de publication de Clip Studio les affiche et refuse aussi un export
  hors limites (rapport, durée, poids), sans nom de service en dur. Une
  couverture (`PublishFileSource.cover`) est vérifiée contre `limits.cover`,
  jamais contre `limits.image` : une couverture de Reel est en 9:16, hors du
  4:5 à 1,91:1 d'une image publiée. Sans `limits.cover`, elle n'est pas
  vérifiée. Instagram déclare JPEG, 9:16, 8 Mio.
- Mesure d'un texte (`limits.text.count`, la même dans le navigateur et sur
  le serveur, `measureText` de `limits.ts`) : « characters », « emoji-bytes »
  (un émoji compte pour ses octets UTF-8) ou « weighted » (poids 2 hors
  écritures latines, adresse web à 23). `Connector.measureText` peut la
  remplacer côté serveur.
- `pricing` : prix par publication selon le type de source, surcoût d'une
  adresse, table datée. La fenêtre affiche le coût estimé ; le budget mensuel
  d'un service (`<PREFIX>_MONTHLY_BUDGET`, sinon `setMonthlyBudgetAction`)
  est respecté par la file, qui refuse au-delà. `CreditsExhaustedError` (ou
  le budget atteint) passe les travaux du service en `waiting-credits`, sans
  reprise automatique.
- `accountQuota` : quota par compte sur fenêtre glissante (« 250 publications
  sur 24 heures »), compté par `context.chargeQuota`. Le connecteur peut aussi
  lire l'usage réel chez le service et lever `QuotaExceededError` avec
  `scope: "account"` : seul ce compte attend jusqu'à `retryAt`.
- `publishAt` (paramètre de `enqueuePublish`) : publication différée tenue par
  la file, pour un service qui ne programme pas lui-même ; le travail reste en
  file jusqu'à l'heure, même après un redémarrage.

#### Reprise

L'état de reprise (`saveProgress`) survit au redémarrage : un service qui crée
d'abord un conteneur puis le publie (appel non rejouable) y range l'identifiant
du conteneur et relit son état avant de republier. `context.attempt` dit
combien de fois le travail a été tenté ; au-delà du premier passage,
`findExisting(context)` est consulté avant de republier, et une publication
retrouvée termine le travail sans doublon.

**Attente chez le service hors du verrou d'envoi.** La file n'envoie qu'un
travail à la fois, mais ce verrou ne couvre que l'envoi des octets. Un
connecteur dont le service traite encore le fichier avant de pouvoir le
publier (conteneur Instagram ou Threads `IN_PROGRESS`) n'attend pas dans
`publish()` : il enregistre son état de reprise, puis rend
`{ pending: true, retryAfterMs, note? }` (`PublishPending`).

- Le travail passe en `processing` **sans `result`**, avec `checkAt` (heure du
  prochain passage, bornée d'une seconde à une heure), `processingSince`
  (début de l'attente) et `note` (étape lisible, « Instagram traite le média
  avant de le publier. »). La file passe aussitôt au travail suivant.
- À l'heure dite, la boucle de suivi (à côté de l'envoi) rappelle
  `continuePublish(context)`, ou `publish(context)` à défaut, avec le même
  contexte (fichiers, liens publics, état de reprise) et le même numéro de
  passage : `findExisting` n'est pas consulté. Le connecteur rend le résultat
  final (`externalId`, `url`), une nouvelle attente, ou lève une erreur, traitée
  comme à l'envoi (quota, crédits, reconnexion, échec).
- `checkAt`, `resume` et `processingSince` sont sur le disque : après un
  redémarrage, `startPublishQueue` reprend chaque attente à son heure (ou tout
  de suite si elle est passée). Les liens publics et fichiers dérivés restent
  ouverts pendant l'attente et se ferment quand le travail se termine.
- Un travail en attente sans résultat **peut être annulé** (rien n'est publié,
  ce que le service a reçu expire de lui-même). Après deux heures d'attente,
  il échoue ; « Reprendre » repart avec son état de reprise, sans republier.
- Les connecteurs comptent eux-mêmes leur attente dans l'état de reprise
  (Instagram : 30 s, une minute jusqu'à 5 min, puis 5 min jusqu'à 30 min ;
  Threads : 30 s puis une lecture par minute, 5 ou 10 lectures selon le média)
  et la remettent à zéro quand ils abandonnent, pour que « Reprendre » refasse
  une attente complète avec le même conteneur.

Une publication déjà faite dont le service poursuit le traitement (vidéo
YouTube ou Facebook) reste suivie par `checkProcessing`, aussi hors du verrou,
une fois par intervalle (`checkAt`). `ProcessingStatus.result` peut y rendre le
résultat définitif : Facebook remplace ainsi l'adresse provisoire d'un Reel par
son `permalink_url`, qui n'existe parfois qu'après le traitement.

#### Suites de publication

Une publication peut porter des **suites**, exécutées par la file une fois
la publication faite : premier commentaire, sous-titres, couverture
(dossier 01 ter, § 6, pour ce que chaque service permet et les sources).

```ts
enqueuePublish({
  accountId, source, options, publishAt,
  followUps: {
    comment: "Lien en bio !",
    subtitles: { file: "clip.fr.srt", language: "fr" },
    cover: { file: "cover.png" },
  },
});
```

- **Fichiers.** Sous-titres et couverture sont résolus par le module
  propriétaire, comme la vidéo : la file appelle
  `resolveExportFile(id, { file, purpose: "subtitles" | "cover" })`
  (`id` : celui de la suite, sinon celui de la source) et vérifie que le
  fichier rendu est bien celui demandé (par son nom) ; un module qui ne
  connaît pas encore ce second argument rendrait la vidéo, qui n'est alors
  jamais envoyée à sa place.
- **Ce que le service accepte** : `Connector.followUps` (limites lues par
  l'interface, `documented` dit si la limite vient du service ou d'une borne
  interne faute de documentation) et les méthodes `postComment`,
  `uploadSubtitles`, `setCover`, qui reçoivent un `FollowUpContext` (le
  contexte du compte, plus `result`, `source`, `options`, `attempt`,
  `resume`, `saveProgress`). Capacités exigées : `comment.create`,
  `captions.upload`, `cover.set`.
- **Couverture prise à la publication** (`followUps.cover.mode:
  "publish"`, Instagram) : la couverture devient celle de la source
  (`PublishFileSource.cover`) et l'option du connecteur qui la fait servir
  est fixée (`cover: "custom"`) ; la suite est marquée faite quand la
  publication l'est.
- **À la mise en file**, une suite que le service ne permet pas, ou que le
  compte n'a pas autorisée, est rangée `skipped` avec sa raison
  (`skipCode: "unsupported" | "unauthorized"`) : la publication part quand
  même. Un commentaire trop long, des sous-titres dans un format refusé ou
  une langue invalide sont refusés, comme un texte trop long.
- **Exécution** : quand le travail passe à `done`, hors du verrou d'envoi,
  par la boucle de suivi (`runFollowUps`, aussi appelée par
  `checkProcessingJobs`). Le connecteur rend le résultat (`externalId`,
  `url`, `note`), une attente (`{ pending, retryAt | retryAfterMs, note }` :
  vidéo YouTube privée ou programmée, publication Facebook programmée ou en
  brouillon, conteneur Threads en traitement) ou un abandon sans erreur
  (`{ skipped, note }` : commentaires désactivés, piste déjà présente). Une
  attente sans date est abandonnée après trente jours (`skipCode:
  "expired"`) ; une attente datée reprend à son heure (`checkAt`).
- **Erreurs** : un quota épuisé fait attendre la remise à zéro (et suspend
  le service, comme pour un envoi), un jeton refusé passe le compte « à
  reconnecter » et la suite attend la reconnexion, une erreur passagère
  (réseau, 5xx, 429) est réessayée après 1, 2, 5, 15, 30 minutes, 1 puis
  3 heures, huit fois au plus ; toute autre erreur, ou la huitième, rend la
  suite `failed`. **Jamais le travail** : il reste `done`, et
  `PublishJobSummary.warning` dit « Premier commentaire non posé : … ».
- Chaque suite garde son état (`waiting`, `done`, `failed`, `skipped`), son
  erreur, sa remarque, son résultat, ses essais (`attempts`, `errorCount`),
  `checkAt` et son état de reprise (`resume`, jamais envoyé au client). Tout
  est rangé avec le travail dans `publish-jobs.json` : les suites survivent
  au redémarrage, et un travail dont une suite attend n'est jamais effacé
  de l'historique. Au-delà du premier passage, le connecteur cherche d'abord
  un commentaire identique déjà posté (réponse perdue) avant de reposter.
- `retryFollowUp(jobId, kind)` relance une suite en échec ou non faite
  (après avoir ajouté l'autorisation) ; `cancelFollowUp(jobId, kind)`
  annule une suite qui attend ; annuler le travail annule ses suites.
- `listJobs({ sourceModule, sourceId })` retrouve les publications d'un
  export (fiche d'un export de Clip Studio).

#### Autorisation incrémentale

Les portées des suites ne sont **jamais demandées à la première
connexion** : les jeux de portées proposés restent ceux d'avant, et une
capacité que seul un ajout donne figure dans
`ConnectorInfo.onDemandCapabilities`.

- `AccountSummary.requestableCapabilities` : capacités que le service offre
  mais que les portées accordées au compte ne couvrent pas. Une capacité
  retirée par le rôle du compte chez le service (Page Facebook sans la tâche
  MODERATE pour commenter) n'y figure pas : reconnecter n'y changerait rien.
- `ConnectorInfo.capabilityScopes` : les portées qu'un ajout demandera pour
  chaque capacité (la première de `scopes`, plus toutes ses `allOf`).
- `GET /api/connections/<connecteur>/connect?account=<id>&add=comment.create`
  relance la connexion du compte avec ses portées actuelles **plus** celles
  des capacités ajoutées (`incrementalScopes`) ; les portées demandées
  voyagent dans le cookie de transaction signé (`Transaction.scopes`) et
  valent quand le service ne rend pas celles accordées. Avec `mode=popup` et
  `returnTo`, comme une connexion ordinaire.
- YouTube : `include_granted_scopes=true` (déjà envoyé), on ajoute
  `youtube.force-ssl` (commentaire, sous-titres) ; la miniature passe avec
  `youtube.upload`, déjà accordée.
- Facebook : Facebook Login for Business fixe les autorisations par
  configuration (`config_id` remplace `scope`). L'ajout passe par une
  seconde configuration, avec en plus `pages_manage_engagement` et
  `pages_read_user_content` : réglage d'application `config_id_extended`
  (ou `FACEBOOK_EXTENDED_CONFIG_ID`), lu par `oauth.incremental.settingParams`.
  Sans lui, la demande s'arrête sur la configuration de l'application, avec
  la consigne (`ConnectorInfo.incrementalHelp`).
- Instagram : `instagram_business_manage_comments` ; Threads :
  `threads_manage_replies`. Chacune doit d'abord être ajoutée au cas
  d'usage de l'application chez Meta (étape facultative de la
  configuration).

#### Ce qui reste à faire ailleurs

- L'interface du parcours (choix des comptes, fenêtre surgissante, saisie des
  réglages d'application et du budget) sera refaite : le cœur expose déjà
  données, routes et actions.
- Les listes de travaux doivent distinguer deux « processing » : sans
  `result`, « en traitement chez le service, pas encore publié » (afficher
  `note` et l'heure de `checkAt`, garder « Annuler », pas de lien vers la
  publication) ; avec `result`, « publié, traitement en cours » (lien vers la
  publication, pas d'annulation). La fenêtre de publication peut afficher
  `limits.cover` (`describeMediaLimits`) près du choix de couverture.
- La conversion d'une image trop lourde ou d'un autre format en JPEG reste à
  la charge du connecteur (`context.tempFile` puis `derivedFile`).
- Les routes de désautorisation et de suppression des données
  (`signed_request`) ne sont pas écrites : à ajouter quand une application
  passera en production chez son service.

### 8.10 Profil des comptes

L’onglet « Chaîne / Profil » de la fiche d’un compte rassemble tout ce qui
fait l’identité du compte, en deux groupes visibles d’un coup d’œil :

- **« Modifiable depuis ShareX Manager »** : pour chaque élément, la valeur
  actuelle chez le service (lue par l’API), la valeur proposée (préremplie
  depuis l’image de marque choisie, modifiable avant l’envoi, avec son
  compteur), ce qui change (mots ajoutés et retirés, langues traduites,
  ancienne et nouvelle valeur), puis « Envoyer » (un bouton par élément,
  « Tout envoyer » dès que plusieurs ont changé). Après l’envoi, le profil
  est relu chez le service. Une capacité que le compte n’a pas encore
  accordée affiche « Autoriser… » (connexion incrémentale, ci-dessus), pas
  une erreur ; une capacité retirée par le rôle du compte le dit.
- **« À changer chez {service} »** : ce que l’API ne permet pas, dit
  franchement (« YouTube ne permet pas de le changer par son API »), avec
  l’aide pour le faire à la main : l’image rendue depuis la marque au clic
  (comme l’avatar, `renderFormatPng` + `buildFormat`) à télécharger, le
  texte de la marque à copier en un clic, et le lien direct vers la bonne
  page du service.

Une valeur vide dans la marque ne propose rien : elle n’efface jamais ce qui
existe chez le service.

#### Contrat du cœur

Rien dans l’interface ne cite un service. Chaque connecteur déclare ses
éléments (`Connector.profileFields`, type `ProfileField`) : clé, libellé,
`editable`, nature (`text`, `textarea`, `url`, `keywords`, `language`,
`country`, `video`, `localizations`, `image`), limites (`maxLength`,
`itemLimits`), `clearable`, capacité exigée, ce que la marque fournit
(`brand`, `imageFormat`) et, pour un élément non modifiable, la page d’aide
(`manual.url`, avec `{externalId}`, `{handle}` ou `{url}`). Méthodes :

- `readProfile(context)` : valeurs actuelles (aucune capacité exigée) ;
- `updateProfile(context, changes)` : valeurs déjà contrôlées par le cœur
  (`cleanProfileValue`, `src/lib/connections/profile.ts`) ; le connecteur
  relit d’abord ce que le service remplacerait en entier et renvoie le reste
  tel quel, puis rend les valeurs relues ;
- `profileChoices(context, key)` : choix d’un élément « vidéo » (bande-annonce) ;
- `sections` et `playlists` : page d’accueil du compte et playlists.

`describeConnector` publie les éléments avec les portées de leur capacité
(`ConnectorInfo.profileFields[].scopes`), `profileRead`,
`profileChoiceKeys`, `profileSections` et `playlists`. Côté gestion
(`manage.ts`) : `readAccountProfile`, `updateAccountProfile` (rien ne part si
un seul élément est refusé), `accountProfileChoices`, `listAccountSections`,
`addAccountSection`, `moveAccountSection`, `removeAccountSection`,
`listAccountPlaylists`, `createAccountPlaylist`, `updateAccountPlaylist`,
`addVideoToAccountPlaylist`. Nouvelles capacités : `profile.details`,
`profile.sections`, `playlists.manage`.

#### Ce que la marque fournit

`BrandPublishing` gagne trois champs, complétés à la lecture pour une marque
d’avant (`upgradePublishing`) : `channelDescriptionTemplate` (modèle de la
description de la chaîne, `{hook}\n\n{links}` par défaut, avec `{brand}`,
`{hook}`, `{cta}`, `{links}`, `{hashtags}`, `{tags}`, `{date}`), `bio` (bio
courte, 150 caractères) et `country` (ISO 3166-1 alpha-2, facultatif). Les
mots-clés reprennent les tags, la langue celle de la marque. Section
« Publication » de l’éditeur, groupe « Profil des comptes ».
`profileBrandInput(kit)` (`modules/brand-kit/lib/profile.ts`) rend le modèle
et passe le tout au cœur, qui ne connaît pas la forme d’une marque.

#### YouTube

Références vérifiées le 12/10/2026 :
[`channels.update`](https://developers.google.com/youtube/v3/docs/channels/update),
[ressource `channels`](https://developers.google.com/youtube/v3/docs/channels),
[`channelSections`](https://developers.google.com/youtube/v3/docs/channelSections),
[`channelSections.update`](https://developers.google.com/youtube/v3/docs/channelSections/update),
[`playlists`](https://developers.google.com/youtube/v3/docs/playlists),
[`playlists.update`](https://developers.google.com/youtube/v3/docs/playlists/update),
[`playlistItems.insert`](https://developers.google.com/youtube/v3/docs/playlistItems/insert),
[calculateur de quota](https://developers.google.com/youtube/v3/determine_quota_cost),
[historique des révisions](https://developers.google.com/youtube/v3/revision_history).

| Élément | Par l’API | Appel, coût, portée |
| --- | --- | --- |
| Description (1 000 caractères) | Oui | `channels.update?part=brandingSettings`, 50 unités, après `channels.list` (1) ; `youtube` ou `youtube.force-ssl` |
| Mots-clés (séparés par des espaces, 500 caractères au total) | Oui | idem ; un mot-clé de plusieurs mots part entre guillemets |
| Langue de la chaîne | Oui | idem (`defaultLanguage`) |
| Pays | Oui | idem (`country`), vidable |
| Bande-annonce pour les non-abonnés | Oui | idem (`unsubscribedTrailer`), vidéo publique ou non répertoriée de la chaîne, choisie parmi les 50 derniers envois (3 unités) |
| Traductions du nom et de la description | Oui | `channels.update?part=localizations`, 50 unités, requête à part (une partie par requête) ; langue de la chaîne exigée avant |
| Bannière, filigrane | Oui | inchangés (§ 8.7) |
| Sections de la page d’accueil (10 au plus) | Oui | `channelSections.list` 1, `insert`, `update`, `delete` 50 chacune ; `profile.sections` |
| Playlists | Oui | `playlists.list` 1, `insert` et `update` 50, `playlistItems.insert` 50 ; `playlists.manage` |
| Nom de la chaîne | Non | `channelTitleUpdateForbidden` : le titre est renvoyé inchangé |
| Identifiant @, photo de profil, liens | Non | aucun champ dans la ressource ; YouTube Studio › Personnalisation › Profil |

`channels.update` remplace toutes les valeurs modifiables de la partie
envoyée, et efface une propriété absente : on relit la chaîne et on renvoie
`brandingSettings` complet (titre, `trackingAnalyticsAccountId`, langue, pays,
bande-annonce…). `channelSections.update` et `playlists.update` effacent de
même ce qui n’est pas renvoyé : la section (type, titre, contenu) ou la
playlist (titre, description, langue, `podcastStatus`) est relue d’abord.
Une mise à jour du profil coûte donc 52 unités (lecture, écriture,
relecture), 102 si les traductions changent avec.

#### Facebook, Instagram, Threads, TikTok

- **Facebook (Page)**, d’après la référence
  [Page](https://developers.facebook.com/docs/graph-api/reference/page/)
  (section « Updating ») et le guide
  [Manage a Page](https://developers.facebook.com/docs/pages-api/manage-pages) :
  `POST /{page-id}` change `about` (la « Description » de la Page,
  100 caractères) et `website`, avec un jeton de Page d’une personne qui a
  la tâche MANAGE et l’autorisation `pages_manage_metadata`. Cette
  autorisation n’est demandée qu’à la demande, par la seconde configuration
  Facebook Login for Business (`config_id_extended`), qui doit la porter ;
  une Page sans la tâche MANAGE n’a pas `profile.details`. À changer chez
  Facebook : le nom, la photo de profil (aucune méthode documentée) et la
  couverture (`cover` exige `business_management`, que l’application ne
  demande pas ; la marque fournit son format 3:1).
- **Instagram** : la référence
  [IG User](https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-user)
  dit « Updating : This operation is not supported ». Tout est à changer
  dans l’application (Modifier le profil) : nom, nom d’utilisateur, bio
  (150 caractères dans l’application), lien et photo. La lecture rend les
  valeurs actuelles, sans la bio ni le lien si l’API refuse ces champs.
- **Threads** : la page
  [Threads Profiles](https://developers.facebook.com/docs/threads/threads-profiles)
  ne décrit que la lecture (`threads_basic`) : nom, nom d’utilisateur, bio,
  liens et photo sont à changer dans l’application.
- **TikTok** : la page
  [Get User Info](https://developers.tiktok.com/doc/tiktok-api-v2-get-user-info)
  ne décrit que la lecture (nom et photo avec `user.info.basic`, pseudo et
  bio avec `user.info.profile`) : tout est à changer dans l’application
  (dossier 07e, § 8).

#### Ce que la documentation a corrigé

- `brandingSettings.image` (dont `bannerExternalUrl`) est marquée dépréciée
  dans la ressource `channels` depuis septembre 2020, alors que
  `channelBanners.insert` dit encore de l’utiliser : la bannière (§ 8.7)
  continue de s’en servir, à surveiller.
- Les types de section `likedPlaylists`, `likes`, `postedPlaylists`,
  `postedVideos`, `recentActivity` et `recentPosts` ont été retirés le
  12/05/2021 : une section existante de ce type s’affiche « Type retiré par
  YouTube », on ne peut plus en ajouter.
- Les limites des playlists (150 caractères pour le titre, 5 000 pour la
  description) sont celles de YouTube Studio : la référence de l’API ne les
  écrit pas. Celle du nom traduit n’est pas documentée non plus.

## 9. Fonctions serveur

### 9.1 Module `brand-kit`

| Fonction | Accès | Rôle |
| --- | --- | --- |
| `listKits()` / `getKit(id)` | user | Lecture |
| `createKit({ name, from })` | user | Maquette vierge ou copie d’une marque |
| `saveKit(kit, expectedUpdatedAt)` | user | Enregistrement automatique, refus si la fiche a changé entre-temps |
| `deleteKit(id)` / `setDefaultKit(id)` | user | – |
| `registerKitAsset(kitId, { file, kind, label })` | user | Range un fichier déposé par la route d’upload des modules |
| `importGalleryAsset(kitId, { name, kind })` | user | Copie une image de la galerie dans la marque |
| `importSvgAsset(kitId, { svg, kind, label })` | user | Contrôle un SVG puis le rastérise en PNG |
| `removeKitAsset(kitId, assetId)` | user | – |
| `importFont(kitId, { name, data })` / `readFontFile(kitId, fontId)` / `removeFont(kitId, fontId)` | user | Polices de la marque |
| `getBrandTheme(kitId)` | user | Thème résolu pour Clip Studio (5.3) |
| `startKitAssistant({ brief, references })` / `getKitAssistantJob(id)` | user | Assistant de création |
| `regenerateAsset(kitId, assetId, note?)` | user | Refaire un visuel avec tout le contexte |
| `exportKit(id)` / `importKit(archive)` | user | ZIP au format `brand.json` |
| `saveFormatExport(kitId, format, png)` / `sendFormatToGallery(kitId, file)` | user | Formats rendus par le navigateur |
| `setFormatImage(kitId, format, { file } \| { gallery })` / `clearFormatImage(kitId, format)` | user | Image finie d’un format (fichier déposé ou image de la galerie), contrôlée et ré-encodée ; retour au rendu composé |
| `getWatermarkImage(kitId)` | serveur | Logo du filigrane pour le module `watermark` |
| `listPublishAccounts()` | user | Comptes capables de publier une vidéo, sans jeton (pour le choix des comptes d’une marque) |
| `listPublishServices()` | user | Services prêts à publier une vidéo, avec leurs champs, leur règle de hashtags et la limite du premier commentaire (onglets « par service » des textes de publication) |
| `pushBrandToAccount({ kitId, accountId, what })` | admin | Bannière ou filigrane de la marque vers un compte qui a la capacité |

« serveur » : la fonction est déclarée `public` dans `functions`, ce que la
route `call-function` refuse toujours ; seul `apiModuleManager.callModuleFunction`
l’atteint.

### 9.2 Clip Studio (ajouts)

| Ajout | Rôle |
| --- | --- |
| `engine/brand.ts` | `applyBrandTheme`, thème par défaut, résolution des couleurs et des styles |
| `templates.ts` | modèles thémables, indications `theme` |
| `lib/fonts.ts` | `ensureBrandFonts` |
| `startAssistant(request)` | accepte `brandKitId` |
| `resolveExportFile(id, { file, purpose }?)` | serveur : chemin contrôlé d’un export, de sa couverture ou de ses sous-titres, pour la file de publication |
| `listPublishTargets()` / `publishExport({ exportId, targets })` | user / admin : comptes capables et mise en file, un travail par compte ; les textes de chaque cible sont calculés par le serveur à partir des textes de l’export (dossier 01 ter, § 4) |
| `getExport`, `updateExportPost`, `setExportCover`, `defaultPostTexts`, `draftPostTexts` | user : fiche d’un export, ses textes de publication, sa couverture, le jeu tiré de la marque, les propositions de l’assistant (dossier 01 ter, § 7) |
| `listExportPublications(id)` | admin : publications d’un export, retrouvées dans la file par leur source |
| `lib/post-texts.ts`, `lib/credits.ts`, `lib/subtitles.ts` | fonctions pures : résolution des textes par service, crédits complets du projet, sous-titres SubRip |
| Inspecteur sans sélection | section « Image de marque » |
| Fenêtre « Créer » | sélecteur « Image de marque » |
| Menu d’un export | « Publier », pour un administrateur, si un compte sait publier une vidéo |

### 9.3 Cœur

`src/lib/fonts/inspect.ts` : contrôle d’un fichier de police, partagé par
Scan Studio et Image de marque.

`src/lib/connections/` :

| Fichier | Rôle |
| --- | --- |
| `types.ts` | `Connector`, `ConnectedAccount`, `ConnectionCapability`, `PublishField`, `PublishJob` |
| `registry.ts` | Liste des connecteurs, `getConnector(id)` |
| `crypto.ts` | `encrypt` et `decrypt` en AES-256-GCM, clé `CONNECTIONS_ENCRYPTION_KEY` ou dérivée de `AUTH_SECRET`, nonce aléatoire par écriture, version de clé dans le blob |
| `store.ts` | Comptes, applications, travaux et compteurs, fichiers atomiques en 0600, `setDataRoot` pour les tests |
| `apps.ts` | Configuration d’une application : environnement, sinon fichier |
| `oauth.ts` | URL d’autorisation, PKCE, cookie de transaction signé, échange du code, renouvellement sous verrou, révocation |
| `accounts.ts` | `listAccounts({ capability })`, `getAccessToken`, renommage, déconnexion |
| `publish-queue.ts` | File de publication persistante, concurrence 1, reprise au démarrage |
| `templates.ts` | Modèles de titre et de description (fonctions pures) |
| `quota.ts` | Compteurs par service, compartiment et jour |
| `connectors/youtube/` | `index.ts` (connecteur), `api.ts`, `upload.ts`, `quota.ts`, `metadata.ts` |
| `connectors/planned.ts` | Facebook, Instagram, Threads, X déclarés « bientôt » |
| `manage.ts` | Gestion des publications, bannière et filigrane, liste des publications gardée dix minutes |
| `audit.ts`, `errors.ts`, `routes.ts` | Journal d’administration sans jeton, erreurs typées, options du cookie et adresse de retour |
| `index.ts` | Ce que les modules importent (rien qui touche aux jetons) |
| `publish-fields.tsx` | Dessine un champ `PublishField` ; partagé par l’administration et Clip Studio |

Routes : `src/app/api/connections/[connector]/connect/route.ts` et
`callback/route.ts`. Pages : `src/app/(app)/admin/connections/page.tsx` et
`[accountId]/page.tsx`, avec leurs actions serveur. Une entrée « Comptes
connectés » dans la navigation de l’administration.

## 10. Intégration

```json
{
  "name": "brand-kit",
  "version": "0.1.0",
  "description": "Images de marque appliquées aux vidéos et aux captures",
  "author": "ShareX Manager",
  "enabled": true,
  "entry": "index.process.ts",
  "category": "Vidéo",
  "branding": { "logo": "branding/logo.png", "logoSmall": "branding/logo-96.png", "accent": "#db2777" },
  "hasUI": false,
  "supportedFileTypes": [],
  "settings": {},
  "uploads": { "maxMb": 20, "kinds": ["image"] },
  "functions": { "listKits": "user", "…": "user", "getWatermarkImage": "public" },
  "pages": [
    { "path": "", "title": "Images de marque", "component": "pages/kits.tsx" },
    { "path": "edit", "title": "Éditeur", "component": "pages/editor.tsx" }
  ],
  "navItems": [{ "title": "Image de marque", "icon": "Palette" }],
  "fileActions": [
    {
      "id": "add-to-kit",
      "label": "Ajouter à une image de marque",
      "icon": "Palette",
      "fileTypes": ["png", "jpg", "jpeg", "webp"],
      "maxFiles": 20,
      "page": "",
      "params": { "action": "add-assets" }
    }
  ]
}
```

À ne pas oublier, dans l’ordre :

1. `modules/brand-kit/module.json` et `index.process.ts`, avec la table
   `functions`.
2. Les pages dans le registre `MODULE_PAGES` de
   `src/app/(app)/m/[moduleName]/[[...path]]/module-page-loader.tsx`.
3. La ligne de volume dans `docker-compose.yml` :
   `./module-data/brand-kit:/app/modules/brand-kit/data`.
4. Les logos dans `branding/` (512 et 96 px), pour `brand-kit` comme pour
   `watermark`.
5. Les nouvelles variables dans `.env.example` (noms seulement, toutes
   facultatives) : `YOUTUBE_CLIENT_ID`, `YOUTUBE_CLIENT_SECRET`,
   `CONNECTIONS_ENCRYPTION_KEY`.
6. Aucune ligne à ajouter dans `src/lib/child-env.ts` : c’est une **liste
   blanche** (variables système, plus les préfixes demandés par l’outil
   lancé, `CODEX_` et `OPENAI_` pour Codex). Les nouvelles variables
   n’atteignent donc ni Codex CLI ni Piper ; un test le vérifie, pour qu’un
   préfixe ajouté un jour (`YOUTUBE_`, `CONNECTIONS_`) ne les laisse pas
   passer.
7. Une entrée par service dans `BrandLogo` (`src/components/brand-logo.tsx`),
   avec le logo officiel : YouTube, puis Facebook, Instagram, Threads et X
   pour les connecteurs annoncés.
8. Les tests dans `tests/modules/` et `tests/lib/`.
9. L’entrée `Unreleased` › `Added` du `CHANGELOG.md` à chaque étape livrée.

## 11. Sécurité

- **Jetons** : chiffrés au repos, jamais renvoyés au client ni à un module,
  jamais journalisés (le journal masque les en-têtes `Authorization` et tout
  champ `*_token`). Le client ne voit que l’état et la date de la dernière
  vérification.
- **OAuth** : `state` et PKCE vérifiés, cookie de transaction signé et à durée
  courte, URI de redirection fixe tirée de `AUTH_URL`, jamais d’une requête.
  Une callback sans session administrateur est refusée.
- **Portées minimales** (8.4), capacités déduites des portées réellement
  accordées, et révocation réelle à la déconnexion.
- **Administrateurs seulement** : connecter, déconnecter, publier et gérer
  sont réservés aux administrateurs ; un compte « user » voit au plus les
  comptes connectés dans le choix des comptes d’une marque.
- **Publication** : visibilité par défaut `private` dans la maquette d’une
  marque ; passer une marque en `public` par défaut demande une confirmation.
  Supprimer une publication demande une confirmation qui rappelle son titre.
- **Fichiers** : images et polices contrôlées par signature ; SVG refusés
  s’ils contiennent un script, une entité, un gestionnaire d’événement ou une
  référence externe, puis rastérisés en PNG à l’import (aucun SVG n’est
  servi) ; tailles bornées ; archives ZIP bornées en taille, en nombre de
  fichiers et en chemins.
- **Textes** : les textes de la marque dessinés sur canevas ne sont jamais
  interprétés ; ceux envoyés à Codex ou au moteur d’images sont bornés en
  longueur et passés comme données, à l’intérieur de consignes qui le
  précisent.
- **Sous-processus** : `child-env.ts` est une liste blanche, les nouvelles
  variables n’y passent pas (10, point 6).
- **Contenu de tiers** : les visuels de marque ne doivent pas imiter une
  marque, un personnage ou un logo existants ; les consignes de l’assistant le
  disent, et le contrôle de 6.5 le vérifie sur les images générées.

## 12. Performances

- Aperçu des formats : rendu au canevas dans le navigateur, aucune charge
  serveur ; les vignettes ne se redessinent que lorsque la fiche change, à la
  résolution d’affichage (le PNG plein format n’est rendu qu’à l’export).
- Publication : en flux depuis le disque par blocs de 8 Mio, un envoi à la
  fois, aucune copie du fichier en mémoire.
- Liste des publications d’un compte : mise en cache dix minutes,
  actualisation à la demande.
- Assistant de création : deux travaux au plus en même temps, comme celui de
  Clip Studio ; les images passent par la file existante d’AI Image Gen et sa
  concurrence.
- Filigrane des captures : le logo redimensionné est gardé en mémoire par
  marque et par taille, et invalidé quand la fiche change.

## 13. Limite assumée : le rendu reste dans le navigateur

L’export de Clip Studio se fait dans le navigateur (WebCodecs et Mediabunny).
Il n’existe donc pas de chaîne « demande, montage, export, publication »
entièrement côté serveur : il faut un onglet ouvert pour produire le MP4.

L’assistant enchaîne quand même tout ce qui est possible : il monte le projet
dans la marque, et l’éditeur propose « Exporter puis publier » qui lance
l’export puis ouvre la fenêtre de publication préremplie. Il reste un clic.

Un rendu serveur sans fenêtre (Chromium sans affichage qui exécute le même
`drawFrame`) supprimerait ce dernier clic et permettrait de programmer une
série de vidéos d’avance. Il est décrit comme une étape à part (B6), parce
qu’il pèse sur `ascencia-prod` (4 cœurs, 7,8 Gio partagés avec MongoDB et
Ascencia ID) et demande une file avec une concurrence d’un rendu à la fois.

## 14. Découpage

| Étape | Contenu | Critères d’acceptation |
| --- | --- | --- |
| B1 | Module `brand-kit` : instances, maquette par défaut, édition des sections Identité, Couleurs, Typographie, Logos, Mascotte, Vidéo ; polices importées (contrôle partagé avec Scan Studio) ; aperçu et export PNG des formats ; import et export ZIP | Une marque créée à la main avec deux polices importées et un logo produit une bannière 2560 × 1440 dont le logo et l’accroche tiennent dans la zone sûre, identique entre l’aperçu et le PNG |
| B2 | Modèles thémables et `applyBrandTheme` dans Clip Studio : palette, styles de texte par rôle, polices, filigrane, carton de fin ; sélecteur dans la fenêtre « Créer », les recettes et l’inspecteur ; ton et style de la marque dans l’assistant | Deux shorts quiz générés par l’assistant avec la même marque ont le même fond, les mêmes polices, le filigrane au même endroit et le même carton de fin ; retirer la marque rend le rendu par défaut ; un projet monté sans marque est identique à celui d’avant le module |
| B2′ | Module `watermark` : source « Image de marque », réglages automatiques, logo local | Une capture envoyée avec le traitement automatique et une marque choisie porte le logo de la marque au coin, à la taille et à l’opacité de la marque |
| B3 | Assistant de création de marque : fiche par Codex, collection AI Image Gen, visuels mis en file avec références, régénération d’un visuel ; mascotte jointe aux images de l’assistant de Clip Studio ; contrôle de cohérence (6.5) | À partir d’une phrase et de deux images jointes, une marque complète est prête avec palette, polices, styles, logo et fond de bannière ; les images d’un clip qui met en scène la mascotte montrent le même personnage |
| B4 | Comptes connectés (cœur) : registre de connecteurs, configuration des applications, chiffrement, OAuth commun, page « Comptes connectés » ; connecteur YouTube ; file de publication persistante ; publication depuis les exports de Clip Studio vers un ou plusieurs comptes ; comptes liés d’une marque | Deux chaînes se connectent l’une après l’autre et apparaissent côte à côte ; un short exporté est envoyé en « non répertorié » sur les deux avec titre et description de la marque ; une coupure réseau en plein envoi reprend sans renvoyer le début ; un redémarrage du serveur pendant l’envoi le reprend ; un connecteur « bientôt » s’affiche sans pouvoir être connecté |
| B5 | Gestion : fiche d’un compte, liste des vidéos et statistiques, modification des métadonnées, visibilité, reprogrammation, suppression ; bannière et filigrane de la chaîne depuis la marque ; compteurs de quota | Changer la bannière d’une marque puis « Mettre à jour la bannière » la remplace sur la chaîne sans effacer ses autres réglages ; le compteur de quota correspond aux appels faits |
| B6 | Rendu serveur sans fenêtre et publication programmée d’une série | À définir après B5, mesures de charge sur `ascencia-prod` à l’appui |
| B7 | Connecteurs suivants (Facebook, Instagram, Threads, X) | Un fichier par service dans `connectors/`, sans modification de Clip Studio ni d’Image de marque |

## 15. Tests

- **Unitaires** :
  - `applyBrandTheme` : couleurs, rôles de texte, karaoké, filigrane selon le
    coin et `startSeconds`, carton de fin, idempotence, changement de marque,
    retrait ;
  - modèles avec le thème par défaut : rendu identique à celui d’avant le
    module (tests existants de `clip-studio-*.test.ts`) ;
  - `toBrandTheme` et la maquette par défaut ; validation d’une fiche
    (couleurs, rôles, bornes) ;
  - formats : la bannière place logo et accroche dans la zone sûre ;
  - mascotte (`brand-kit-mascot.test.ts`) : pose proposée puis choisie par
    format, « sans mascotte », visage de la bannière dans la zone sûre, rien
    sous l’avatar de l’en-tête X, formats inchangés sans pose ; image finie
    contrôlée, ré-encodée, sans doublon, qui remplace le rendu, sert de
    filigrane aux captures et suit les archives ; migration douce ;
  - mascotte au montage (`clip-studio-brand-mascot.test.ts`) : ouverture et
    réactions ajoutées, une autre pose à chaque segment, zone de sécurité des
    shorts, aucun cadre ni texte court masqué, retrait, idempotence, carton de
    fin mis en scène ou fini, assistant qui ne génère plus la mascotte ;
  - modèles de titre et de description (variables, troncature à 100
    caractères, 5 000 octets, 500 caractères de tags) ;
  - `crypto.ts` : aller-retour, refus d’un blob altéré, refus d’une mauvaise
    clé, clé dérivée de `AUTH_SECRET` ;
  - registre : chaque connecteur a un logo, des capacités cohérentes avec ses
    portées, et des champs de publication valides ;
  - `listAccounts({ capability })` : plusieurs comptes, filtrage par capacité,
    aucun jeton dans la réponse ;
  - `child-env.ts` : les variables des comptes connectés ne passent jamais ;
  - filigrane des captures : logo de la marque posé au bon coin, erreur sans
    logo.
- **Intégration, avec un faux serveur Google** (fixtures HTTP, aucun appel
  réel en CI) :
  - flux OAuth complet, `state` invalide refusé, reconnexion d’une chaîne déjà
    connue qui met à jour au lieu de dupliquer, `invalid_grant` qui passe le
    compte « à reconnecter » ;
  - envoi reprenable avec coupure simulée au milieu d’un bloc et reprise au
    bon octet ;
  - `quotaExceeded` qui suspend la file ;
  - `channels.update` qui renvoie bien la partie `brandingSettings` complète.
- **Isolation** : `setDataRoot` pour le module et pour `src/lib/connections`,
  comme Scan Studio.
- **Navigateur** : de la création d’une marque jusqu’à la publication d’un
  short sur une chaîne de test, en « privé ».

## 16. Questions ouvertes

- **Autres plateformes** : Facebook, Instagram et Threads passent par l’API
  Meta (Graph API) avec une page ou un compte professionnel, et une revue de
  l’application par Meta pour la publication ; X facture l’accès en écriture
  à son API. Chaque connecteur demandera son propre dossier court (portées,
  formats acceptés, limites) avant d’être réalisé.
- **Publication d’images et de messages** : les capacités `publish.image` et
  `publish.text` sont réservées dans le modèle ; la galerie pourrait proposer
  « Publier » sur une capture, avec le filigrane de la marque.
- **Ouverture animée de la marque** : un mouvement signature (par exemple deux
  couches de couleur qui se calent) décrit comme une suite d’images clés dans
  la marque, joué par le moteur de Clip Studio en ouverture de chaque clip.
- **Musique de signature** : un morceau de la marque qui remplacerait le choix
  par ambiance (`pickTrack`) ; écartée de B2 tant que la banque de musique
  n’accepte que des morceaux libres d’Openverse.
- **Plusieurs langues** : une marque déclinée en français et en anglais avec
  ses modèles de titre et de description propres.
- **Statistiques dans le temps** : YouTube Analytics API, pour suivre la
  performance des clips par marque.
