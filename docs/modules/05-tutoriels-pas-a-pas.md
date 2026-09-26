# 05 – Tutoriels pas à pas

Transformer une série de captures en guide : chaque capture devient une
étape, annotée (flèches, cadres, numéros, zones masquées) et accompagnée d’un
texte. Le guide se consulte dans ShareX Manager, se partage par un lien
public, ou s’exporte en Markdown.

- **Identifiant** : `tutorials`
- **Libellé** : « Tutoriels »
- **Prérequis** : socle, partie images (kit, rendu SVG, pages publiques).
  Réutilise le moteur de scènes et les formes de Mockups.

## 1. Pourquoi ce module

Une grande partie des captures sert à expliquer quelque chose : « clique
ici, puis là ». Aujourd’hui, il faut les annoter une à une dans un autre
outil, les renvoyer, puis écrire le texte ailleurs. Un tutoriel réunit les
trois gestes au même endroit et produit un document partageable.

## 2. Parcours

1. Dans la galerie, sélection de plusieurs captures, clic droit, « Modules »,
   « Créer un tutoriel ». Les captures sont triées par date de capture :
   c’est presque toujours l’ordre dans lequel on a fait les choses.
2. L’éditeur s’ouvre sur la première étape. Le titre du tutoriel est
   proposé à partir de la date (« Tutoriel du 26 septembre ») et se modifie
   en un clic.
3. Pour chaque étape : annoter la capture avec la barre d’outils, écrire le
   titre et le texte de l’étape.
4. « Aperçu » montre le rendu final tel que le lecteur le verra.
5. « Publier » grave les annotations dans des images définitives et crée la
   page publique. Le lien est copié.
6. Une modification ultérieure repasse le tutoriel en « modifications non
   publiées » jusqu’à la publication suivante.

## 3. Interface

### 3.1 Liste des tutoriels (page d’accueil du module)

Grille de cartes : couverture (première étape), titre, nombre d’étapes, état
(brouillon, publié, publié avec modifications en attente), date. Menu
contextuel : Ouvrir, Aperçu, Copier le lien public, Dupliquer, Exporter en
Markdown, Dépublier, Supprimer.

### 3.2 Éditeur

```
┌─────────────────────────────────────────────────────────────────┐
│ Tutoriels │ Titre du tutoriel ✎        Brouillon  [Aperçu][Publier]│ en-tête collant
├──────┬──────────────────────────────────────────────────────────┤
│  1 ▣ │   [↖][▭][◯][→][T][①][▒][■][⌨]   outils flottants          │
│  2 ▣ │                                                           │
│  3 ▣ │           ┌─────────────────────────────┐                 │
│  4 ▣ │           │   capture annotée           │                 │
│  +   │           └─────────────────────────────┘                 │
│      ├──────────────────────────────────────────────────────────┤
│ rail │  Titre de l'étape                                         │
│      │  Texte de l'étape (Markdown simple)                       │
└──────┴──────────────────────────────────────────────────────────┘
```

- **Rail des étapes à gauche**, étroit : vignettes numérotées, réordonnables
  par glisser-déposer (`Reorder` de `framer-motion`), étape active mise en
  avant. `+` ajoute une étape depuis le sélecteur de médias du kit (uploads,
  rendus des autres modules, ordinateur, collage).
- **Canevas au centre** avec la barre d’outils flottante au-dessus de
  l’image, pas dans une colonne : les outils restent près de ce qu’ils
  modifient.
- **Texte de l’étape sous le canevas**, pas à côté : on lit l’étape comme le
  lecteur la lira, image puis explication.
- La colonne unique reste lisible sur mobile : le rail devient une bande
  horizontale en haut.

### 3.3 Outils d’annotation

| Outil | Touche | Détail |
| --- | --- | --- |
| Sélection | `V` | Déplacer, redimensionner, supprimer (`Suppr`), dupliquer (`Ctrl D`) |
| Cadre | `R` | Rectangle arrondi, contour seul |
| Ellipse | `E` | Contour seul |
| Flèche | `A` | Tracée du point de départ au point d’arrivée, pointe arrondie |
| Texte | `T` | Bulle avec fond, taille automatique |
| Numéro | `N` | Pastille numérotée, numérotation automatique dans l’étape |
| Projecteur | `S` | Assombrit tout sauf la zone choisie |
| Flou | `B` | Floute une zone (voir la sécurité : le flou est gravé à la publication) |
| Masque | `M` | Rectangle plein, pour les secrets : plus sûr que le flou |
| Touche | `K` | Pastille de raccourci clavier (« Ctrl + C ») |

Couleurs : une palette courte (accent du thème, rouge, orange, vert, bleu,
blanc, noir), épaisseur en trois crans. Tout est animé à l’apparition
(légère mise à l’échelle), sans effet à l’export.

### 3.4 Menus contextuels

- **Sur une annotation** : Dupliquer, Mettre au premier plan, Mettre en
  arrière-plan, Couleur ▸, Supprimer.
- **Sur une étape du rail** : Dupliquer, Remplacer la capture, Insérer une
  étape avant ou après, Supprimer.
- **Sur le canevas vide** : Coller, Tout sélectionner, Réinitialiser les
  annotations de l’étape.

### 3.5 Page publique

Servie par la route générique des pages publiques du socle :
`/p/tutorials/<slug>`.

- Colonne de lecture unique, 720 px de large, étapes numérotées, images
  gravées, texte rendu depuis le Markdown (sous-ensemble sûr : gras,
  italique, code, liens, listes).
- Sommaire collant sur grand écran, qui suit l’étape visible.
- Clic sur une image : agrandissement.
- Métadonnées Open Graph : titre, résumé et couverture générée (première
  étape dans un cadre Mockups, si le module est activé).

## 4. Modèle de données

```ts
interface Tutorial {
  id: string;
  title: string;
  summary?: string;
  slug: string;                         // aléatoire, 10 caractères
  visibility: "private" | "unlisted" | "public";
  steps: TutorialStep[];
  createdAt: number;
  updatedAt: number;
  publication?: {
    publishedAt: number;
    version: number;
    /** Empreinte du contenu publié, pour détecter les modifications. */
    contentHash: string;
  };
}

interface TutorialStep {
  id: string;
  source: MediaRef;
  crop?: { x: number; y: number; width: number; height: number };
  annotations: Annotation[];
  title: string;
  body: string;                         // Markdown simple
}

type Annotation =
  | { id: string; kind: "rect" | "ellipse"; box: Box; color: string; weight: 1 | 2 | 3 }
  | { id: string; kind: "arrow"; from: Point; to: Point; color: string; weight: 1 | 2 | 3 }
  | { id: string; kind: "text"; box: Box; text: string; color: string }
  | { id: string; kind: "badge"; at: Point; number: number; color: string }
  | { id: string; kind: "spotlight"; box: Box; dim: number }
  | { id: string; kind: "blur" | "mask"; box: Box }
  | { id: string; kind: "key"; at: Point; keys: string[] };

/** Coordonnées normalisées (0 à 1) : indépendantes de la résolution. */
interface Point { x: number; y: number }
interface Box { x: number; y: number; width: number; height: number }
```

Les coordonnées sont **normalisées** par rapport à l’image recadrée : les
annotations restent justes si l’on remplace la capture par une version de
meilleure résolution.

**Fichiers** (`modules/tutorials/data/`, monté en volume) :

```
tutorials/<id>.json      un fichier par tutoriel, magasin JSON atomique
public/<slug>/           images gravées de la version publiée
exports/                 archives Markdown
```

Un fichier par tutoriel plutôt qu’un seul fichier global : l’enregistrement
automatique réécrit souvent, un seul document volumineux deviendrait coûteux.

## 5. Rendu et publication

- **Éditeur** : les annotations sont un calque SVG au-dessus de l’image,
  produit par le même `renderSceneSvg` que Mockups. Les formes sont
  manipulées directement dans le SVG (poignées), sans bibliothèque de
  canevas.
- **Publication** : pour chaque étape, le serveur rend la scène complète
  (image et annotations) en WebP par `sharp`, largeur 1600 px au plus. Le
  flou et le masque sont **appliqués aux pixels** de l’image source avant la
  composition : l’original n’est jamais copié dans `public/`.
- La publication est un travail de la file du kit (concurrence 2), avec
  progression par étape. L’ancienne version publique reste servie jusqu’à ce
  que la nouvelle soit complète, puis elle est remplacée d’un bloc (dossier
  temporaire puis renommage).
- **Enregistrement automatique** : chaque modification est enregistrée
  800 ms après la dernière action (fonction `saveTutorial`), avec un
  indicateur discret « Enregistré » dans l’en-tête. Aucun bouton
  « Enregistrer ».

## 6. Fonctions serveur

| Fonction | Rôle |
| --- | --- |
| `listTutorials()` | Résumés pour la page d’accueil |
| `createTutorial(sources)` | Crée un brouillon à partir d’une sélection triée par date |
| `getTutorial(id)` / `saveTutorial(tutorial)` | Lecture et enregistrement, avec contrôle de version optimiste (`updatedAt`) |
| `publishTutorial(id, visibility)` | Met en file la gravure et la publication |
| `unpublishTutorial(id)` | Supprime `public/<slug>/` immédiatement |
| `exportMarkdown(id)` | Archive ZIP : `README.md` et images gravées |
| `getPublicPage(slug)` | **Seule** fonction publique, appelée par la route des pages publiques ; renvoie `null` pour un tutoriel privé ou inconnu |

## 7. Intégration

```json
{
  "name": "tutorials",
  "category": "Documentation",
  "supportedFileTypes": [],
  "hasUI": false,
  "public": { "resolver": "getPublicPage" },
  "pages": [
    { "path": "", "title": "Tutoriels", "component": "pages/list.tsx" },
    { "path": "edit", "title": "Éditeur", "component": "pages/editor.tsx" }
  ],
  "navItems": [{ "title": "Tutoriels", "icon": "ListOrdered" }],
  "fileActions": [
    {
      "id": "create",
      "label": "Créer un tutoriel",
      "description": "Une étape par capture, dans l'ordre de capture",
      "icon": "ListOrdered",
      "fileTypes": ["png", "jpg", "jpeg", "webp", "gif"],
      "maxFiles": 60,
      "page": "edit",
      "params": { "action": "create" }
    }
  ]
}
```

Liens avec les autres modules :

- **Mockups** : « Couverture en mockup » applique le préréglage par défaut à
  la première étape pour l’image Open Graph.
- **Atelier capture vidéo** (plus tard) : « Étapes depuis une vidéo » extrait
  une image aux instants marqués d’une capture vidéo.

## 8. Sécurité

C’est le module qui expose des données sans session : il demande le plus de
soin.

- **Masquage irréversible.** Le flou est un rayon de 24 px au minimum sur
  l’image rendue à sa taille finale ; le masque est un aplat opaque.
  L’interface recommande le masque pour les mots de passe et les jetons, et
  le signale par une infobulle sur l’outil Flou.
- **Aucune fuite de l’original.** La page publique ne sert que
  `public/<slug>/`. Les références `upload:` et `module:` n’y apparaissent
  jamais, ni dans le HTML ni dans les métadonnées.
- **Fichiers sécurisés.** Une capture marquée « sécurisée » dans la galerie
  ne peut pas être publiée : la publication échoue avec un message qui nomme
  l’étape concernée.
- **Markdown.** Rendu côté serveur avec une liste blanche de balises ; pas de
  HTML brut, liens en `rel="noopener nofollow"`.
- **Métadonnées.** Aucune donnée EXIF dans les images gravées.
- **Slug.** Aléatoire, non devinable ; « Régénérer le lien » invalide
  l’ancien.

## 9. Découpage

| Étape | Contenu | Critères d’acceptation |
| --- | --- | --- |
| T1 | Création depuis la galerie, rail des étapes, texte, outils cadre, flèche, numéro, texte ; enregistrement automatique ; aperçu privé | Un tutoriel de 8 étapes se crée et s’annote sans perte après rechargement |
| T2 | Flou, masque, projecteur, touches ; gravure ; page publique ; dépublication | Le lien public affiche les images gravées ; l’original n’est accessible par aucune URL publique |
| T3 | Export Markdown, couverture Mockups, visibilité « non listé » | L’archive s’ouvre correctement dans un éditeur Markdown |
| T4 | Aide à la rédaction par IA (proposer titre et texte d’une étape à partir de la capture), étapes depuis une vidéo | À définir après T3 |

## 10. Tests

- Unitaires : conversion des coordonnées normalisées, numérotation
  automatique, empreinte de contenu, rendu Markdown (injections de balises).
- Sécurité : aucune route publique ne sert un fichier hors de
  `public/<slug>/` ; une capture sécurisée bloque la publication ; un
  tutoriel privé renvoie 404 sur sa page publique.
- Navigateur : parcours complet, de la sélection dans la galerie au lien
  public ouvert dans une session privée.

## 11. Questions ouvertes

- L’export PDF est souvent demandé pour ce type de document. Sans navigateur
  sans tête dans l’image Docker, il faudrait composer le PDF à la main
  (`pdf-lib`) à partir des images gravées et du texte. À évaluer après T3.
- Les tutoriels publics doivent-ils apparaître dans le catalogue public, à
  côté des albums publics ?
