# 02 – Animer une image

Faire bouger une image avec un moteur vidéo par IA : une capture, un rendu
d’AI Image Gen ou une photo devient un plan animé de quelques secondes,
guidé par une description du mouvement et un mouvement de caméra.

- **Identifiant** : `image-animator`
- **Libellé** : « Animer une image »
- **Prérequis** : socle, partie vidéo (lecture avec `Range`, couvertures
  vidéo, `ffmpeg` pour les couvertures et l’extraction d’images) et coffre de
  clés partagé.
- **Proche d’AI Image Gen** dans sa forme : même principe de moteurs, de file
  de travaux, de fil et de compositeur. Il réutilise le kit extrait du studio.

## 1. Pourquoi ce module

AI Image Gen produit des images fixes ; les moteurs vidéo actuels savent les
animer de façon convaincante sur 4 à 10 secondes. Enchaîner les deux dans la
même interface (générer, choisir, animer, monter dans Clip Studio) est ce qui
rend l’ensemble amusant et utile, sans aller-retour entre des sites.

## 2. Parcours

1. Depuis la galerie ou le fil d’AI Image Gen : clic droit sur une image,
   « Animer cette image ». Le module s’ouvre, l’image est posée comme
   **première image** de la vidéo.
2. L’utilisateur décrit le mouvement (« les vagues se brisent, la lumière du
   phare balaie la brume ») et choisit un mouvement de caméra parmi des
   pastilles : fixe, travelling avant, travelling arrière, panoramique,
   orbite, contre-plongée.
3. Il choisit le moteur, la durée, le format et, si le moteur le permet, le
   son.
4. Le bouton « Animer » affiche le **coût estimé**. Au-delà d’un seuil réglé
   dans les préférences, une confirmation est demandée.
5. La vidéo apparaît dans le fil à sa place définitive, avec un état « En
   cours » qui peut durer plusieurs minutes. On peut quitter la page : le
   travail continue et reprend même après un redémarrage du serveur.
6. Sur le résultat : lecture au survol, « Envoyer dans la galerie »,
   « Prolonger » (repart de la dernière image), « Ajouter à un clip »,
   « Reprendre » (remet la demande dans le compositeur).

## 3. Interface

Le module reprend la forme du studio d’AI Image Gen, pour qu’on s’y
retrouve immédiatement.

- **En-tête compact collant** : titre, onglets (Studio, Moteurs), choix de la
  vue (mosaïque, liste), « Activité ».
- **Fil** : mosaïque justifiée groupée par jour. Chaque tuile montre la
  couverture ; au survol, lecture muette en boucle. Une génération en cours
  occupe déjà sa place, aux proportions demandées, avec l’animation de
  développement du studio et le temps écoulé.
- **Compositeur flottant en bas** :

```
┌───────────────────────────────────────────────────────────────────┐
│ ┌──────┐   ┌──────┐                                               │
│ │image │ → │ fin  │  première image, dernière image (facultative) │
│ │départ│   │  +   │                                               │
│ └──────┘   └──────┘                                               │
│ Décrivez le mouvement : les vagues se brisent, la lumière balaie… │
│ [Fixe][Travelling avant][Panoramique][Orbite]…                    │
│ Veo 3 ▾  │ 8 s ▾ │ 16:9 ▾ │ 720p ▾ │ ♪ Son │ Avancé    [Animer · ≈ 3,20 $] │
└───────────────────────────────────────────────────────────────────┘
```

- Le coût estimé est affiché **dans le bouton**, mis à jour à chaque réglage.
- Les emplacements d’image acceptent le glisser-déposer, le collage et le
  `MediaPicker` du kit, comme dans le studio.
- Menus contextuels (clic droit et « … », même contenu) sur une vidéo :
  Lire, Reprendre, Relancer à l’identique, Prolonger, Extraire une image vers
  la galerie, Ajouter à un clip, Envoyer dans la galerie, Télécharger,
  Supprimer.

## 4. Moteurs

### 4.1 Interface commune

Calquée sur les moteurs d’image d’AI Image Gen, mais adaptée aux travaux
longs, qui se déroulent chez le fournisseur :

```ts
interface VideoModelSpec {
  id: string;
  label: string;
  engineId: string;
  durationsSec: number[];              // ex. [4, 6, 8]
  aspects: ("16:9" | "9:16" | "1:1")[];
  resolutions: ("480p" | "720p" | "1080p")[];
  supportsEndFrame: boolean;
  supportsAudio: boolean;
  supportsTextOnly: boolean;           // sans image de départ
  /** Prix indicatif, pour l'estimation affichée. */
  pricing: { perSecondUsd: number; audioPerSecondUsd?: number; note: string };
}

interface VideoEngine {
  id: string;
  label: string;
  provider: ProviderId;                // clé tirée du coffre partagé
  models: VideoModelSpec[];
  /** Soumet la demande et renvoie l'identifiant de l'opération distante. */
  submit(request: AnimateRequest, ctx: EngineContext): Promise<{ remoteId: string }>;
  /** État de l'opération distante, sans effet de bord. */
  poll(remoteId: string, ctx: EngineContext): Promise<RemoteStatus>;
  /** Télécharge la vidéo terminée dans le fichier indiqué. */
  download(remoteId: string, target: string, ctx: EngineContext): Promise<void>;
  cancel?(remoteId: string, ctx: EngineContext): Promise<void>;
}

type RemoteStatus =
  | { state: "queued" | "running"; progress?: number }
  | { state: "succeeded" }
  | { state: "failed"; reason: string; billed: boolean };
```

La séparation `submit`, `poll` et `download` est le point clé : l’état du
travail enregistre `remoteId`, si bien qu’un redémarrage du serveur reprend
l’interrogation au lieu de relancer une génération déjà facturée.

### 4.2 Fournisseurs envisagés

Les API vidéo évoluent très vite. Les noms de modèles, les paramètres et les
prix ci-dessous sont **à confirmer dans la documentation officielle au moment
de l’implémentation** ; l’architecture, elle, ne dépend pas de ces détails.

| Moteur | Accès | Forme de l’API (à confirmer) | Intérêt |
| --- | --- | --- | --- |
| Google Veo | Clé Gemini (`GOOGLE_API_KEY`, déjà utilisée par AI Image Gen) | Opération longue (`predictLongRunning`), interrogation de l’opération, téléchargement du fichier produit | Qualité élevée, son généré, clé déjà en place : **premier moteur à intégrer** |
| OpenAI Sora | Clé OpenAI (`OPENAI_API_KEY`, déjà en place) | Création d’une vidéo avec image de référence, interrogation du statut, téléchargement du contenu | Deuxième moteur, même clé que les images |
| Runway | `RUNWAY_API_KEY` | Tâche image vers vidéo, interrogation de la tâche | Contrôle fin du mouvement de caméra |
| fal.ai | `FAL_KEY` | File d’attente générique (soumission, statut, résultat) donnant accès à plusieurs modèles (Kling, Hailuo, Wan…) | Une seule clé pour comparer beaucoup de modèles |

Les moteurs en ligne de commande (Codex, Gemini CLI) ne sont pas prévus :
aucun ne produit de vidéo aujourd’hui.

### 4.3 Mouvement de caméra

Les pastilles de mouvement sont traduites différemment selon le moteur :
paramètre dédié quand l’API en propose un (Runway), sinon fragment ajouté à
la description (« slow dolly-in, stable camera »). La table de traduction est
propre à chaque moteur et testée.

## 5. Modèle de données

```ts
interface AnimateRequest {
  firstFrame?: MediaRef;
  lastFrame?: MediaRef;
  prompt: string;
  camera: CameraPreset;
  negativePrompt?: string;
  model: string;
  durationSec: number;
  aspect: "16:9" | "9:16" | "1:1";
  resolution: "480p" | "720p" | "1080p";
  audio: boolean;
  seed?: number;
  /** Génération d'origine quand il s'agit d'un prolongement. */
  extendsId?: string;
}

interface AnimateJob {
  id: string;
  status: "queued" | "submitting" | "remote" | "downloading" | "done" | "error" | "canceled";
  request: AnimateRequest;
  remoteId?: string;
  estimatedCostUsd: number;
  createdAt: number;
  submittedAt?: number;
  finishedAt?: number;
  error?: string;
  log: LogLine[];
}

interface Animation {
  id: string;
  request: AnimateRequest;
  /** Images de départ et de fin archivées, pour « Reprendre ». */
  sources: { first?: string; last?: string };
  file: string;                        // data/videos/<id>.mp4
  poster: string;                      // data/videos/<id>.jpg
  durationMs: number;
  width: number;
  height: number;
  modelLabel: string;
  estimatedCostUsd: number;
  createdAt: number;
  favorite?: boolean;
  savedToGallery?: string;
}
```

**Fichiers** (`modules/image-animator/data/`, monté en volume) :

```
jobs.json            travaux, dont les identifiants distants (reprise)
animations.json      historique
spend.json           dépenses estimées par mois
videos/              vidéos et couvertures
sources/             images de départ et de fin archivées
```

## 6. File de travaux

- File du kit, concurrence 2 (le travail se fait chez le fournisseur), sans
  la ressource `media-encode` sauf pour la courte étape de couverture.
- Interrogation à intervalle croissant : 5 s, puis 10 s, puis 20 s, plafonnée
  à 30 s ; délai maximal configurable (15 min par défaut), après quoi le
  travail passe en erreur avec le lien de l’opération distante dans le
  journal.
- **Reprise au démarrage** : tout travail en état `remote` est réinterrogé ;
  jamais resoumis.
- **Pas de relance automatique** après un échec : une nouvelle soumission
  peut être facturée. L’erreur indique si l’échec a été facturé quand le
  fournisseur le dit.
- Refus de contenu par le fournisseur : message clair, sans jargon (« Le
  moteur a refusé cette demande au titre de sa politique de contenu »).

## 7. Coûts

- Estimation par génération : `durée × prix par seconde (+ son)`, affichée
  dans le bouton et enregistrée avec le travail.
- **Seuil de confirmation** dans les préférences (1 $ par défaut).
- **Plafond mensuel** facultatif : au-delà, le bouton « Animer » est désactivé
  avec le montant dépensé et la date de remise à zéro.
- Tableau « Dépenses estimées » dans la page Moteurs, par mois et par moteur.
  Ces montants sont indicatifs ; la facture du fournisseur fait foi, et
  l’interface le dit.

## 8. Fonctions serveur

| Fonction | Rôle |
| --- | --- |
| `getCatalogue()` | Moteurs, modèles et disponibilité selon les clés du coffre |
| `estimate(request)` | Coût estimé |
| `enqueueAnimation(request)` | Contrôle du plafond, archivage des images, mise en file |
| `getAnimatorState()` | Travaux et dernières animations, en un appel |
| `cancelAnimation(jobId)` | Annulation locale, et distante si le moteur le permet |
| `extendAnimation(id, request)` | Extrait la dernière image (`ffmpeg -sseof`) et prépare un prolongement |
| `extractFrame(id, atMs)` | Image vers la galerie |
| `sendToGallery(id)` | Copie de la vidéo dans les uploads et `announceNewUpload` |
| `getSpend()` / `savePreferences(prefs)` | Dépenses et préférences (seuil, plafond) |

## 9. Intégration

```json
{
  "name": "image-animator",
  "category": "IA",
  "supportedFileTypes": [],
  "hasUI": false,
  "pages": [
    { "path": "", "title": "Studio", "component": "pages/studio.tsx" },
    { "path": "settings", "title": "Moteurs", "component": "pages/settings.tsx" }
  ],
  "navItems": [{ "title": "Animer une image", "icon": "Clapperboard" }],
  "fileActions": [
    {
      "id": "animate",
      "label": "Animer cette image",
      "description": "Crée une courte vidéo à partir de l'image",
      "icon": "Clapperboard",
      "fileTypes": ["png", "jpg", "jpeg", "webp"],
      "maxFiles": 1,
      "page": ""
    }
  ]
}
```

- **AI Image Gen** : « Animer » dans le menu d’une image du fil, par
  référence `module:ai-image-gen/images/…` (voir les références de médias
  du socle).
- **Clip Studio** : les animations apparaissent dans le tiroir des médias ;
  « Ajouter à un clip » crée ou complète un projet.
- **Galerie** : une animation envoyée dans la galerie est une vidéo comme une
  autre, avec sa couverture.

## 10. Sécurité

- Clés lues uniquement côté serveur, depuis le coffre partagé.
- Les images envoyées au fournisseur sont celles choisies par l’utilisateur ;
  une capture marquée « sécurisée » dans la galerie demande une confirmation
  explicite avant d’être envoyée à un service externe.
- Les vidéos téléchargées sont contrôlées (signature MP4, taille maximale)
  avant d’être enregistrées.
- Les URL de téléchargement signées renvoyées par les fournisseurs ne sont
  jamais transmises au navigateur.

## 11. Découpage

| Étape | Contenu | Critères d’acceptation |
| --- | --- | --- |
| V1 | Un moteur (Google Veo), première image, description, mouvements de caméra, fil, envoi à la galerie, reprise après redémarrage | Une animation lancée, le conteneur redémarré pendant la génération, puis la vidéo récupérée sans nouvelle facturation |
| V2 | Deuxième moteur (Sora ou fal.ai), estimation des coûts, seuil, plafond, page des dépenses | Le plafond bloque la demande qui le dépasserait, avec un message clair |
| V3 | Dernière image, prolongement, son, extraction d’image, « Ajouter à un clip » | Trois prolongements enchaînés forment une séquence continue dans Clip Studio |
| V4 | Génération en lot (une série d’images, même réglage) | À définir après V3 |

## 12. Tests

- Unitaires : estimation des coûts, traduction des mouvements de caméra par
  moteur, calendrier d’interrogation, contrôle du plafond.
- Moteurs : chaque moteur testé contre un faux serveur qui rejoue des
  réponses enregistrées (soumission, états intermédiaires, succès, refus,
  échec facturé). Aucun test automatique n’appelle une API payante.
- Reprise : travail en état `remote` écrit dans `jobs.json`, redémarrage de
  la file, vérification qu’aucune soumission n’est refaite.

## 13. Questions ouvertes

- Faut-il une interpolation locale (prolonger ou ralentir sans IA,
  `minterpolate` de `ffmpeg`) ? Peu coûteux, qualité limitée.
- Génération d’une image puis animation en une seule action depuis AI Image
  Gen (« Générer et animer ») : pratique, mais double la facture en cas
  d’image ratée. À proposer seulement avec un aperçu intermédiaire.
