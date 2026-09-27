# 00 – Socle commun des modules à pages

Ce dossier décrit ce que la plateforme doit offrir avant d’accueillir de
nouveaux modules à pages. Il se découpe en deux parties livrables
séparément : une **partie images**, nécessaire à Mockups et Tutoriels, et une
**partie vidéo**, nécessaire à l’Atelier capture vidéo, à Clip Studio et à
Animer une image.

## 1. État des lieux

Relevé sur le code et la production au moment de la rédaction.

### Ce qui existe et fonctionne

- **Pages de module.** `module.json` déclare `pages` et `navItems` ; les pages
  sont servies sous `/m/<module>/<page>` par
  `app/(app)/m/[moduleName]/[[...path]]/page.tsx`, qui délègue au chargeur
  client `module-page-loader.tsx` (pages déjà téléchargées affichées sans
  spinner, préchargement des onglets voisins).
- **Fonctions serveur.** Toute fonction exportée par `index.process.ts` est
  appelable par `POST /api/modules/call-function` (session obligatoire). Les
  arguments et le résultat transitent en JSON.
- **Données du module.** `modules/<nom>/data/` est lisible par
  `GET /api/modules/<nom>/data/<chemin>` (session obligatoire, protection
  contre la traversée de dossiers).
- **Actions sur fichiers.** `fileActions` dans `module.json`, la route
  `GET /api/modules/file-actions` et la section « Modules » du menu
  contextuel de la galerie (voir `modules/README.md`).
- **Annonce à la galerie.** `announceNewUpload(fileName)` dans
  `lib/gallery-events.ts` pousse l’événement SSE `new_file`.
- **AI Image Gen** contient déjà, à l’état de code propre au module, tout ce
  qu’un second module voudra réutiliser : file de travaux, sélecteur de
  médias, grille justifiée, menus contextuels partagés entre clic droit et
  bouton « … », glisser-déposer et collage, cache de page entre deux visites.

### Ce qui manque ou bloque

| Constat | Conséquence |
| --- | --- |
| Chaque page doit être ajoutée à la main dans `MODULE_PAGES` de `module-page-loader.tsx` | Un nouveau module exige une modification de l’application |
| Les onglets de `ModuleShell` sont codés en dur dans AI Image Gen | Chaque module recopierait son en-tête |
| La route `data/` lit le fichier entier en mémoire (`readFileSync`), sans `Range`, et ne connaît que PNG, JPEG, WebP, GIF et JSON | Impossible de lire ou de parcourir une vidéo dans le navigateur |
| La route d’upload ShareX refuse tout ce qui n’est ni image, ni document, ni archive (« Type de fichier non supporté ») | Aucune vidéo ne peut entrer dans ShareX Manager |
| Limites de taille : 10 Mo dans `config/uploads.json`, 20 Mo dans Nginx (`client_max_body_size 20M`), 100 Mo par requête chez Cloudflare (offre gratuite) | Un enregistrement d’écran d’une minute dépasse déjà les deux premières |
| Aucune vidéo en production (9 027 PNG, 4 501 JPEG, 9 GIF) et aucun rendu vidéo dans la galerie | La galerie doit apprendre à afficher une vidéo |
| L’image Docker `runner` n’embarque pas `ffmpeg` | Aucun traitement vidéo possible |
| Les clés API vivent dans `modules/ai-image-gen/data/secrets.json` | Un second module IA devrait les ressaisir |
| `sharp` ne se charge pas en développement local (Turbopack, Bun, Windows : « Failed to load external module sharp ») | Les miniatures et tout rendu `sharp` sont intestables hors Docker |
| `modules/hello-world/index.ts` contient une erreur de syntaxe qui empêche `tsc` de vérifier les types de tout le projet | Aucune vérification de types fiable tant qu’elle n’est pas corrigée |

## 2. Partie images

### 2.1 Kit commun des modules

Extraire d’AI Image Gen ce qui n’est pas propre à la génération d’images,
sans changer son comportement.

**Emplacement et règle d’import.** Le kit vit dans l’application, pas dans un
module :

```
lib/modules/kit/          → code serveur et utilitaires partagés
components/modules-kit/   → composants et hooks client
```

Un module n’importe que `@/lib/modules/kit/*`, `@/components/modules-kit/*`,
`@/components/ui/*` et `@/lib/utils`. Tout le reste de l’application est
considéré comme privé : c’est ce qui permettra plus tard de publier un module
séparément.

**Contenu du kit.**

| Brique | Origine dans AI Image Gen | Rôle |
| --- | --- | --- |
| `createModuleClient(name)` | `lib/client.ts` (`callModule`, `imageUrl`) | Appels typés aux fonctions serveur, URL des données du module |
| `createJsonStore<T>(file, fallback)` | `lib/store.ts` (`readJson`, `writeJson`) | Lecture et écriture JSON **atomiques** (fichier temporaire puis `rename`) |
| `createJobQueue(options)` | `lib/jobs.ts` | File de travaux persistée, concurrence bornée, annulation par `AbortSignal`, progression et journal |
| `useModuleState(fetcher, cadence)` | `useStudioState` | Interrogation adaptative (rapide pendant un travail, lente au repos) et instantané gardé entre deux visites |
| `ModuleShell` | `components/module-shell.tsx` | En-tête et onglets tirés de `module.json`, mode compact collant pour les espaces de travail |
| `MediaPicker` | `components/image-picker.tsx` | Sélecteur à sources enfichables (uploads, bibliothèques de modules, ordinateur, lien), filtrable par type de média |
| `useMediaIntake` | `lib/use-image-intake.ts` | Glisser-déposer et collage sur toute la page, fichiers, URL et médias internes |
| `JustifiedGrid` | `justify()` de `studio-feed.tsx` | Mosaïque justifiée, groupée par jour, animée |
| `MenuKit` | `components/generation-menu.tsx` | Même contenu pour le menu contextuel et le menu déroulant |
| `JobQueuePanel` | `components/job-queue.tsx` | Panneau « Activité » avec journal par travail |
| `importRemoteMedia(url)` | `lib/remote-image.ts` | Import par lien avec refus des adresses internes, étendu aux vidéos |

**File de travaux générique.** C’est la brique la plus importante, car
chaque module lourd en dépend.

```ts
interface JobQueueOptions<TRequest, TResult> {
  /** Espace de noms : clé globale et fichier de persistance. */
  name: string;
  /** Travaux exécutés en parallèle dans cette file. */
  concurrency: number;
  /** Jeton de ressource partagé entre modules (ex. "media-encode"). */
  resource?: SharedResource;
  persistFile: string;
  run(
    request: TRequest,
    ctx: {
      signal: AbortSignal;
      progress(current: number, total: number, label: string): void;
      log(level: "info" | "warn" | "error", text: string): void;
    }
  ): Promise<TResult>;
  /** Nettoyage après succès, échec ou annulation (fichiers temporaires). */
  cleanup?(request: TRequest): void;
}
```

L’état vit dans `globalThis` sous un `Symbol.for(...)` propre au module,
comme aujourd’hui, pour survivre au rechargement à chaud. Au démarrage, un
travail resté « en cours » est marqué « interrompu » plutôt que relancé en
silence.

**Ressources partagées.** Deux modules qui encodent de la vidéo en même temps
feraient tomber le serveur. `SharedResource` est un sémaphore global au
processus, identifié par un nom :

```ts
const mediaEncode = sharedResource("media-encode", {
  slots: Number(process.env.SXM_MEDIA_CONCURRENCY ?? 1),
  // Ne démarre pas un encodage si la machine manque déjà de mémoire.
  minAvailableMemoryMb: 700,
});
```

Avant d’accorder un jeton, le sémaphore lit `MemAvailable` dans
`/proc/meminfo` ; sous le seuil, le travail reste « en file d’attente » avec
le libellé « En attente de mémoire disponible ».

### 2.2 Registre des pages généré

Remplacer la table écrite à la main par un fichier généré.

- `scripts/generate-module-pages.ts` parcourt `modules/*/module.json` et écrit
  `app/(app)/m/[moduleName]/[[...path]]/module-pages.generated.ts` avec un
  `import()` explicite par page. Les imports restent littéraux : c’est ce qui
  évite que Turbopack parcoure tout `modules/`.
- Le script est lancé par `predev` et `prebuild` dans `package.json`, et
  vérifié en CI : un fichier généré différent de celui commité fait échouer
  la vérification.
- `module-page-loader.tsx` importe ce registre au lieu de sa table.
- Les onglets de `ModuleShell` viennent de `pages` (titre, chemin) et d’un
  nouveau champ facultatif `icon` par page.

### 2.3 Références de médias entre modules

Aujourd’hui, un fichier se désigne par son nom dans les uploads. Les modules
ont besoin de désigner aussi un fichier d’un autre module (« Animer ce rendu
du studio »). On introduit une référence textuelle unique :

```
upload:1787345960433-capture.png
module:ai-image-gen/images/gen-1787349622474-KlucG8-0.png
```

- `resolveMediaRef(ref)` (serveur) renvoie le chemin absolu après contrôle :
  préfixe connu, module activé, chemin qui reste dans `uploads/` ou dans
  `modules/<nom>/data/`, fichier existant.
- `mediaRefUrl(ref)` (client) renvoie l’URL de lecture.
- Le paramètre `files` des `fileActions` accepte des références ; un nom nu
  reste interprété comme `upload:<nom>` pour la compatibilité.
- Le menu d’une génération d’AI Image Gen pourra ainsi proposer les actions
  des autres modules (« Animer », « Mockup ») sur ses propres rendus, en
  appelant `/api/modules/file-actions` avec des références `module:`.

### 2.4 Route de données v2

`GET /api/modules/<nom>/data/<chemin>` doit servir des médias lourds :

- lecture en flux (`fs.createReadStream` converti en `ReadableStream`), plus
  jamais `readFileSync` ;
- en-tête `Range` et réponse `206 Partial Content`, indispensable au
  déplacement dans une vidéo ;
- types MIME étendus : `mp4`, `webm`, `mov`, `mp3`, `m4a`, `wav`, `ogg`,
  `srt`, `vtt` ;
- `ETag` fondé sur taille et date de modification ;
- **jamais de SVG servi tel quel** : un SVG peut contenir du script. Les SVG
  produits par les modules sont rastérisés, ou servis avec
  `Content-Disposition: attachment` et `Content-Security-Policy: sandbox`.

La même lecture en flux avec `Range` s’applique à `/api/files/<nom>`
(`lib/file-handler.ts`) pour les vidéos des uploads.

### 2.5 Upload direct vers un module

Les médias lourds ne doivent plus transiter en base64 dans le JSON de
`call-function` (un fichier de 50 Mo en devient 67 et reste entièrement en
mémoire).

`POST /api/modules/<nom>/upload` : `multipart/form-data`, écrit en flux dans
`modules/<nom>/data/incoming/`, limite de taille déclarée par le module dans
`module.json` (`limits.maxUploadMb`), types acceptés contrôlés par signature
de fichier et non par l’extension seule. La réponse renvoie une référence
`module:<nom>/incoming/<fichier>`.

### 2.6 Rendu SVG côté serveur

Mockups, Tutoriels et les titres de Clip Studio décrivent une image par une
**scène** (fond, calques, textes, formes) plutôt que par des pixels. Pour que
l’aperçu et l’export soient identiques, une seule fonction pure produit le
SVG :

```ts
// Partagée entre le navigateur et le serveur, sans dépendance DOM.
function renderSceneSvg(scene: Scene, assets: AssetResolver): string;
```

- **Dans le navigateur**, le SVG est inséré tel quel : l’aperçu est exact, se
  met à l’échelle sans flou et s’anime avec `framer-motion`.
- **Sur le serveur**, `sharp(Buffer.from(svg), { density })` le rastérise en
  PNG ou WebP (libvips embarque librsvg). Les images sources sont incluses en
  URI `data:` après redimensionnement, jamais par chemin de fichier.
- **Polices.** librsvg passe par fontconfig : les polices doivent être
  installées dans l’image Docker. On embarque une courte liste choisie
  (Inter, JetBrains Mono, Noto Sans pour les accents et les symboles, Noto
  Color Emoji) dans `docker/fonts/` avec un `fonts.conf`, plutôt que des
  paquets Debian dont la version varie.
- **Prérequis de développement** : régler le chargement de `sharp` en local
  (exécution sous WSL ou Docker, ou `serverExternalPackages`) avant de
  commencer ces modules, faute de quoi rien n’est testable sur le poste.

### 2.7 Coffre de clés partagé

Déplacer les clés des fournisseurs d’IA hors d’AI Image Gen :

- stockage dans `data/provider-keys.json` (volume `/app/data` déjà monté),
  les variables d’environnement (`OPENAI_API_KEY`, `GOOGLE_API_KEY`,
  `STABILITY_API_KEY`, puis `RUNWAY_API_KEY`, `FAL_KEY`…) restant prioritaires ;
- page « Fournisseurs IA » dans Paramètres (administrateurs seulement) ;
- `getProviderKey(provider)` dans le kit, jamais exposé au client ; le client
  ne voit que « configurée » et les quatre derniers caractères, comme
  aujourd’hui ;
- migration : AI Image Gen lit le coffre, et à défaut son ancien
  `secrets.json`, qu’il recopie une fois dans le coffre.

### 2.8 Pages publiques de module

Tutoriels a besoin de pages consultables sans session, comme les albums
publics du catalogue.

- Route générique `app/(catalog)/p/[moduleName]/[slug]/page.tsx`.
- Un module déclare dans `module.json` : `"public": { "resolver": "getPublicPage" }`.
  Seule cette fonction est appelable sans session, et uniquement par cette
  route (jamais par `call-function`).
- Elle reçoit un `slug` et renvoie une description sérialisable de la page,
  ou `null` (404). Le rendu HTML est fait par la route, avec les composants du
  kit, pas par du HTML fourni par le module.
- Les médias d’une page publique sont copiés dans un sous-dossier `public/`
  du module et servis par une route dédiée qui ne sert que ce dossier.
- Métadonnées SEO via `lib/seo`, `noindex` par défaut, activable par page.

## 3. Partie vidéo

### 3.1 `ffmpeg` dans l’image

- Installer un **binaire statique épinglé** (version, empreinte SHA-256
  vérifiée dans le Dockerfile) dans l’étape `runner`, comme le binaire Codex
  aujourd’hui. Coût estimé : 80 à 120 Mo sur l’image.
- `ffprobe` est livré avec.
- Aucune accélération matérielle : le VPS n’a pas de GPU.

### 3.2 Enveloppe `lib/media/ffmpeg.ts`

```ts
interface FfmpegRun {
  args: string[];
  /** Durée de la sortie attendue, pour calculer un pourcentage. */
  expectedDurationMs?: number;
  signal?: AbortSignal;
  onProgress?(ratio: number, detail: { speed: number; outTimeMs: number }): void;
  timeoutMs?: number;
}

function runFfmpeg(run: FfmpegRun): Promise<{ stderrTail: string }>;
function probe(path: string): Promise<MediaInfo>; // ffprobe -of json
```

- Toujours lancé par `spawn`, jamais par un shell : aucun argument n’est
  interprété, ce qui ferme la porte aux injections par nom de fichier.
- `-nostdin -hide_banner -progress pipe:1 -nostats` : la progression arrive
  sur la sortie standard sous forme `clé=valeur` (`out_time_us`, `speed`),
  convertie en ratio.
- Priorité réduite (`nice -n 10`) et `-threads 2` par défaut : deux cœurs
  restent libres pour Next, MongoDB et Ascencia ID.
- Annulation : `signal` envoie `SIGTERM`, puis `SIGKILL` après 5 s.
- Dossier de travail temporaire par travail (`data/tmp/<jobId>/`), supprimé
  par `cleanup` de la file.
- Toute exécution passe par la ressource partagée `media-encode`.

**Ordres de grandeur sur la production** (4 cœurs, `-threads 2`,
`libx264 -preset veryfast`) : un clip 1080p de 30 s s’encode en 15 à 40 s
selon les filtres, avec 250 à 500 Mo de mémoire. Un GIF de 10 s en 720 px
avec palette optimisée prend environ 10 s. Ces chiffres sont à mesurer dès le
premier module et à consigner ici.

### 3.3 Vidéo dans les uploads et la galerie

> **État (27/09/2026).** Réalisé : type `videos` (désactivé par défaut) et
> limite `limits.maxVideoSize` (95 Mo), contrôle par signature, couverture
> et métadonnées, lecture avec `Range`, vignettes, visionneuse et envoi des
> clips de Clip Studio dans la galerie. Écarts avec ce qui suit : `ffmpeg`
> n’est pas dans l’image Docker, il est téléchargé au démarrage dans
> `data/tools/` depuis une version épinglée de ffmpeg-static, vérifiée par
> SHA-256 (`src/lib/media/ffmpeg.ts`) ; durée et dimensions sont lues dans
> la sortie de `ffmpeg -i`, sans `ffprobe` ; le `.mkv` n’est pas accepté ;
> l’aperçu au survol lit la vidéo d’origine, sans version réduite à 480 px.
> Les vidéos des albums publics apparaissent aussi dans le catalogue.

**Types et limites.**

- Nouvelle catégorie `videos` dans `allowedTypes` (`mp4`, `webm`, `mov`,
  `mkv` en entrée ; `mp4` et `webm` en sortie de modules), désactivée par
  défaut, avec sa propre limite dans `limits.maxFileSizeByType`.
- Contrôle par signature (`ftyp` pour MP4 et MOV, EBML pour WebM et MKV), en
  plus de l’extension.
- Nginx : `client_max_body_size` relevé **uniquement** sur `location
  /api/upload` et `/api/modules/*/upload`, avec `proxy_request_buffering off`.
- Cloudflare limite une requête à 100 Mo sur l’offre gratuite : la limite
  effective des vidéos est donc fixée à **95 Mo** en v1. Au-delà, il faudra un
  envoi par morceaux (protocole tus ou équivalent), traité en v2.
- Côté ShareX, le fichier `.sxcu` généré doit déclarer aussi
  `FileUploader` pour que les enregistrements d’écran passent par
  ShareX Manager.

**Miniatures et métadonnées.**

- À l’arrivée d’une vidéo, un travail léger extrait une image de couverture
  (`-ss 1 -frames:v 1`, repli sur la première image pour une vidéo plus
  courte) dans le dossier des miniatures, et lit durée, dimensions et codecs
  avec `ffprobe`.
- Ces métadonnées sont gardées dans `data/media-meta.json`, indexé par nom de
  fichier, et ajoutées à `FileInfo` (`kind: "video"`, `durationMs`, `width`,
  `height`).
- `/api/thumbnails/<nom>` sert la couverture pour une vidéo.

**Affichage.**

- `FileCard` : couverture, badge de durée, aperçu animé au survol (lecture
  muette de la vidéo à 480 px, seulement après 400 ms de survol, pour ne pas
  saturer la bande passante en parcourant la grille).
- `FileViewer` : `<video controls preload="metadata" playsInline>` sur la
  route avec `Range` ; flèches gauche et droite réservées au changement de
  fichier, `Espace` à la lecture.
- La section « Modules » du menu contextuel s’applique aux vidéos comme aux
  images, par `fileActions` et `fileTypes`.

## 4. Découpage

### Partie images

| Étape | Contenu | Livrable vérifiable |
| --- | --- | --- |
| I-0 | Corriger `modules/hello-world/index.ts`, rétablir `tsc` sur tout le projet, dresser la liste des erreurs de types existantes | `bunx tsc --noEmit` s’exécute jusqu’au bout |
| I-1 | Kit : client, magasin JSON atomique, file de travaux, ressource partagée ; AI Image Gen migré dessus | Le studio fonctionne à l’identique, ses tests passent |
| I-2 | Kit UI : `ModuleShell` piloté par `module.json`, `MediaPicker`, `useMediaIntake`, `JustifiedGrid`, `MenuKit` | AI Image Gen n’a plus de copie locale de ces composants |
| I-3 | Registre des pages généré | Ajouter une page à un module ne touche plus au code de l’application |
| I-4 | Références de médias et route de données v2 (flux, `Range`, ETag) | Tests unitaires du résolveur, dont les tentatives de traversée |
| I-5 | Rendu SVG serveur et polices dans l’image | Une scène de test rendue à l’identique dans le navigateur et en PNG |
| I-6 | Coffre de clés partagé et page « Fournisseurs IA » | AI Image Gen lit ses clés dans le coffre |
| I-7 | Pages publiques de module | Une page de démonstration servie sans session |

### Partie vidéo

| Étape | Contenu | Livrable vérifiable |
| --- | --- | --- |
| V-1 | `ffmpeg` statique (téléchargé au démarrage), couverture et métadonnées | Réalisée |
| V-2 | Type `videos`, contrôle par signature, limites Nginx | Réalisée |
| V-3 | Couvertures, métadonnées, `FileCard` et `FileViewer` vidéo | Réalisée |
| V-4 | Upload direct vers un module | Envoi d’un fichier de 90 Mo sans pic de mémoire |

## 5. Critères d’acceptation transverses

- Aucun module ne modifie un fichier de l’application pour exister, hormis
  sa ligne de volume dans `docker-compose.yml`.
- Deux encodages lancés depuis deux modules différents s’exécutent l’un après
  l’autre, sans chute de `MemAvailable` sous 500 Mo.
- Toute route qui sert un fichier refuse `..`, les chemins absolus et les
  liens symboliques sortant du dossier autorisé.
- Aucun média n’est chargé entièrement en mémoire pour être servi.
- Toute écriture dans les uploads apparaît dans une galerie ouverte sans
  rechargement.

## 6. Questions ouvertes

- Faut-il une vraie base (SQLite, comme `albums.db` et `logs.db`) plutôt que
  des fichiers JSON pour les projets de Clip Studio et de Tutoriels ? Le
  magasin JSON atomique suffit tant qu’un module garde moins de quelques
  milliers d’objets ; au-delà, basculer sur `bun:sqlite`.
- Les vidéos de plus de 95 Mo justifient-elles un sous-domaine d’envoi non
  proxifié par Cloudflare, ou un envoi par morceaux ?
