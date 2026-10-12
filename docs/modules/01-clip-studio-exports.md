# 01 ter – Clip Studio : exporter et publier

Rattaché à [01 – Clip Studio](01-clip-studio.md) et à
[07 – Image de marque](07-image-de-marque.md) (§ 3.7, § 8).

## 1. Ce qui ne va pas aujourd’hui

- **L’export est une petite fenêtre** posée sur l’éditeur : un seul réglage
  (normaliser le volume, annoncé « vers −16 dB » alors que le rendu vise
  −14 LUFS), une barre de progression, puis un lien. Rien ne dit avant le
  rendu si le clip respecte les durées des comptes liés à la marque, si une
  police manque ou si une image a des droits à vérifier.
- **Un export n’a pas d’écran à lui.** Il existe comme une carte dans la
  liste des projets, avec un menu : on ne voit ni d’où il vient, ni où il a
  été publié, ni ses crédits.
- **La publication est un tiroir.** Il fait le travail (comptes, champs de
  chaque service, liste de contrôle, suivi), mais tout se perd quand on le
  ferme : les textes ne sont rangés nulle part.
- **Un seul texte pour tous les services.** Le modèle de description de la
  marque sert aussi de légende Instagram et de texte Threads (500 caractères
  au plus) : il n’existe ni texte court de publication, ni premier
  commentaire, ni hashtags distincts des tags cachés de YouTube.
- **Les crédits sont incomplets** : seuls ceux des musiques passent dans la
  description : ceux des images trouvées sur le web et des voix n’y vont pas.

## 2. Le but

Trois écrans pleine largeur, comme l’éditeur, à la place des deux fenêtres :

| Écran | Adresse | Rôle |
| --- | --- | --- |
| **Exporter** | `/m/clip-studio/export?project=<id>` | Vérifier, régler et lancer le rendu d’un projet |
| **Export** (fiche) | `/m/clip-studio/exports?id=<id>` | Tout sur un fichier rendu : lecture, couverture, textes, crédits, publications |
| **Publier** | `/m/clip-studio/publish?export=<id>` | Choisir les comptes, ajuster les textes service par service, programmer, envoyer, suivre |

Sans `id`, `/m/clip-studio/exports` liste tous les exports (filtres : projet,
publié ou non, marque). La liste des projets garde sa rangée « Exports »,
dont chaque carte ouvre la fiche.

Et un **jeu de textes de publication** rangé avec chaque export : titre,
description, texte court, premier commentaire, hashtags, tags. Il est
prérempli par l’image de marque, peut être rédigé par l’assistant, se
décline par service et se réutilise à chaque publication.

## 3. Parcours

### 3.1 Exporter

1. Dans l’éditeur, « Exporter » enregistre le projet puis ouvre l’écran
   Exporter (plus de fenêtre).
2. À gauche, l’aperçu du clip (lecture seule) : à droite :
   - **Vérifications avant rendu**, calculées dans le navigateur :
     polices chargées, médias manquants, images aux droits à vérifier,
     durée et format comparés aux limites des comptes liés à la marque
     (« Trop long pour un Short : 3 min au plus »), éléments hors du cadre
     de sécurité. Chaque ligne dit quoi faire et mène à l’élément fautif
     dans l’éditeur.
   - **Réglages** : volume normalisé (−14 LUFS, crête −1 dB, libellé
     juste), plage à exporter (tout, ou de l’entrée à la sortie),
     sous-titres en fichier `.srt` à côté de la vidéo (à partir des
     sous-titres du projet ou des mots de la voix off).
   - **Crédits** relevés dans le projet (musiques, voix, images trouvées,
     images générées), qui suivront l’export.
3. « Lancer le rendu » : progression par étape (préparation, son, images,
   finalisation, envoi), temps restant, « Annuler ». Quitter l’onglet
   pendant le rendu demande confirmation.
4. Rendu fini : l’écran passe à la fiche du nouvel export.

### 3.2 La fiche d’un export

- **Lecteur** de la vidéo, avec ses caractéristiques (format, durée, taille,
  volume mesuré) et le projet d’origine (« le projet a changé depuis cet
  export » quand c’est le cas, avec « Exporter à nouveau »).
- **Couverture** : choisir une image du clip au curseur (ou une image de la
  galerie par `ImagePickerDialog`) : elle sert de miniature YouTube, de
  couverture Instagram et Facebook quand le service l’accepte.
- **Textes de publication** (§ 4), avec compteurs de caractères par service,
  « Rédiger avec l’assistant » et « Reprendre la marque ».
- **Crédits** : la liste figée au moment de l’export, copiable.
- **Publications** : chaque envoi de cet export, compte par compte, avec son
  état, son lien, la date programmée, le premier commentaire posé ou non :
  les actions (reprendre, annuler) restent celles de la file.
- Actions : Publier, Télécharger, Envoyer à la galerie, Supprimer.

### 3.3 Publier

L’écran remplace le tiroir et en garde tout (comptes, champs de chaque
service, liste de contrôle, connexion d’un compte en cours de route,
programmation, suivi). Ce qui change :

1. **Comptes** à gauche, groupés par service, avec leur quota restant et
   leur état : ceux liés à la marque du projet sont cochés d’avance.
2. **Textes** au centre, par onglet de service : chaque champ montre la
   valeur héritée du jeu de l’export (§ 4) : le modifier crée une variante
   pour ce service (« Personnalisé pour Instagram – revenir au texte
   commun »). Les limites de chaque champ s’affichent en direct
   (caractères, octets, nombre de hashtags, mentions).
3. **Aperçu** à droite, à la manière du service (titre et description sous
   la vidéo pour YouTube, légende sous le média pour Instagram, texte
   au-dessus pour Threads et Facebook), premier commentaire compris.
4. **Quand** : maintenant, ou une date commune, ou une date par compte
   (calendrier et heure) : décaler les comptes de quelques minutes est
   proposé d’un clic.
5. « Publier » : les travaux partent en file : l’écran devient le suivi, et
   la fiche de l’export les retrouve ensuite.
6. Les variantes modifiées ici sont **enregistrées dans le jeu de l’export**
   : publier une seconde fois repart des textes déjà relus.

À 390 px, les trois colonnes deviennent trois étapes (Comptes, Textes,
Envoi) avec l’aperçu dans un tiroir.

## 4. Les textes de publication

### 4.1 Les sortes de textes

| Texte | Sert à | Exemple de service |
| --- | --- | --- |
| `title` | Titre de la vidéo | YouTube, titre de la vidéo Facebook |
| `description` | Texte long sous la vidéo, liens, crédits, chapitres | YouTube |
| `caption` | Texte court affiché avec le média dans un fil | légende Instagram, texte Threads, message Facebook, X |
| `firstComment` | Premier commentaire posé juste après la publication | tous ceux qui le permettent (§ 6) |
| `hashtags` | Mots-dièse visibles, ajoutés selon la règle du service | Instagram, Threads (un seul sujet), Facebook, description YouTube |
| `tags` | Mots-clés cachés | YouTube |

### 4.2 Le jeu de textes d’un export

Un **texte commun** par sorte, plus des **variantes par service**
(identifiant du connecteur : `youtube`, `instagram`…), qui ne portent que
ce qui diffère. Tous les comptes d’un même service partagent sa variante.
La résolution est une fonction pure, la même dans le navigateur et sur le
serveur : variante du service, sinon texte commun, puis application de la
règle des hashtags du service et des limites du connecteur.

La **règle des hashtags** (`HashtagRule`) dit où vont les hashtags d’un
service : fin de la description (YouTube, 15 au plus : au-delà, YouTube
les ignore tous), fin de la légende, premier commentaire, champ à part
(Instagram, qui les ajoute à la légende dans ses limites de 30 hashtags et
20 mentions), un seul sujet (Threads, tiré du premier hashtag, sans « . »
ni « & »), ou nulle part. Elle se déduit des champs du service
(`defaultHashtagRule`) et la marque peut la changer service par service.
Un hashtag déjà écrit dans le texte n’est pas ajouté une seconde fois.

### 4.3 Ce que la marque apporte

`BrandPublishing` (dossier 07, § 5.1) gagne :

- un modèle par sorte de texte : `titleTemplate` et `descriptionTemplate`
  (existants), `captionTemplate`, `firstCommentTemplate` ;
- des modèles par service, qui ne portent que ce qui diffère, et la règle
  des hashtags du service (`serviceTemplates`, douze services au plus) ;
- `hashtags` (visibles) distincts de `tags` (cachés) : une marque existante
  garde ses tags, recopiés en hashtags à la lecture de sa fiche tant
  qu’elle n’a pas de `hashtags` ;
- un bloc `links` (site, réseaux, lien d’affiliation…), écrit une fois :
  dix liens au plus, adresses http(s) seulement.

Variables des modèles : `{title}`, `{hook}`, `{summary}` (résumé du clip),
`{cta}` (appel à l’action du carton de fin), `{tags}`, `{hashtags}`,
`{links}`, `{credits}`, `{date}`, `{brand}`. Une variable vide disparaît
avec la ligne qu’elle laisserait vide. Sans `{credits}` dans le modèle de
description, les crédits dont la licence exige l’attribution (CC BY) sont
ajoutés à la fin quand même. Les modèles se remplissent par
`renderTemplate` (`src/lib/connections/templates.ts`), le jeu d’un export
par `postFromBrand` (`lib/post-texts.ts`).

Dans l’éditeur de marque, la section Publication a un onglet « Commun »
et un onglet par service prêt à publier une vidéo (`listPublishServices`) :
chaque texte y reprend le modèle commun ou devient propre au service,
avec l’aperçu tel qu’il partira (hashtags compris) et le compteur de la
limite du service.

### 4.4 L’assistant

« Rédiger avec l’assistant » (Codex, comme le script) propose tout le jeu
d’un coup, d’après :

- les textes du projet, et le sujet et le script quand le clip vient de
  l’assistant (rangés désormais dans le projet, `brief`) ;
- le ton de la marque (`tone`, `ai.scriptTone`), ses règles, sa langue,
  ses liens ;
- les règles d’écriture déjà suivies pour les scripts (tics d’IA,
  ouvertures interdites, typographie) ;
- les limites de chaque service visé, pour écrire une variante courte quand
  le texte commun ne tient pas.

Toutes ces données entrent dans la consigne comme des données (JSON entre
balises, « < » échappé). La proposition est relue par `checkPostTexts`
pour chaque service visé : au moindre dépassement, une seconde demande
cite les dépassements ; si elle dépasse encore, la variante du service est
recoupée à la fin d’une phrase (`fitText`). Une variante Threads tient
donc toujours en 500 caractères, un émoji comptant pour ses octets.

Les propositions arrivent dans les champs, marquées « à relire » : rien
n’est enregistré sans un geste. On peut ne régénérer qu’un champ.

## 5. Données

```ts
// modules/clip-studio/lib/post-types.ts – contrat partagé
type PostTextKind = "title" | "description" | "caption" | "firstComment";

interface PostTexts {
  title: string;
  description: string;
  caption: string;
  firstComment: string;
  hashtags: string[];
  tags: string[];
}

interface ExportPost {
  base: PostTexts;
  /** Par identifiant de connecteur, seulement ce qui diffère du texte commun. */
  variants: Record<string, Partial<PostTexts>>;
  /** Champs proposés par l’assistant et pas encore relus. */
  unreviewed?: string[];
  updatedAt: number;
}

// ClipExport (engine/types.ts) gagne :
post?: ExportPost;
cover?: { file: string; atMs?: number; width: number; height: number };
loudness?: { lufs: number; peakDb: number };
credits?: string[];           // figés au rendu
subtitles?: { file: string; language: string };
brandKitId?: string;          // marque du projet au moment du rendu
projectUpdatedAt?: number;    // pour « le projet a changé depuis »
```

```ts
// Contrat, en plus (post-types.ts) :
type HashtagRule = "description" | "caption" | "firstComment" | "field" | "topic" | "none";

interface PublishTarget {
  accountId: string;
  options?: Record<string, unknown>; // l’emporte sur les options calculées par le serveur
  publishAt?: number;
  followUps?: { comment?: string | false; subtitles?: boolean; cover?: boolean };
}

interface ExportDetails {
  export: ClipExport;
  project: { exists: boolean; name?: string; updatedAt?: number; brandKitId?: string };
  projectChanged: boolean;
  brand: { id: string; name: string } | null;
  hashtagRules: Record<string, HashtagRule>; // choix de la marque, par service
}

// ClipProject (engine/types.ts) gagne :
brief?: { prompt: string; title?: string; script?: string[] };
```

**Fichiers.** Couverture et sous-titres sont rangés à côté de la vidéo,
dans `data/exports/` : `<vidéo>-cover-<hasard>.jpg` (JPEG réencodé par
sharp au cadre de la vidéo, 1 920 px et 2 Mo au plus, l’ancien est
supprimé) et `<vidéo>-subtitles.srt` (SubRip contrôlé, 512 Kio au plus).
La file les demande par `resolveExportFile(id, { file, purpose })` ; la
couverture d’une source a aussi l’identifiant `<export>-cover`.
`deleteExport` supprime les trois fichiers.

**Fonctions pures**, les mêmes dans le navigateur et sur le serveur :

| Fichier | Fonctions |
| --- | --- |
| `lib/post-texts.ts` | `resolvePostTexts`, `fieldValuesFor`, `postRulesFor`, `defaultHashtagRule`, `firstCommentFor`, `checkPostTexts`, `fitText`, `postFromBrand`, `hashtagRulesOf`, `projectSummary`, `sanitizeExportPost` |
| `lib/credits.ts` | `projectCreditList`, `projectCredits`, `unverifiedSources`, `usesGeneratedImages` |
| `lib/subtitles.ts` | `projectToSrt`, `groupCues`, `srtTimestamp`, `validateSrt` |

Les publications d’un export se retrouvent dans la file par la source
(`listJobs({ sourceModule: "clip-studio", sourceId: exportId })`) : plus
besoin de garder les identifiants des travaux dans le navigateur.

## 6. Ce que les services permettent

Vérifié dans la documentation officielle de chaque service le 12/10/2026
(sources en fin de section). Là où la documentation contredisait le
premier tableau, c’est elle qui a été suivie ; les écarts sont signalés
par « corrigé ».

| Service | Premier commentaire | Autorisation en plus | Couverture | Sous-titres |
| --- | --- | --- | --- | --- |
| YouTube | `commentThreads.insert` [Y1], 50 unités [Y4] ; posé une fois la vidéo publique ou non répertoriée (choix du cœur : une vidéo programmée est reprise à sa date de mise en ligne, une vidéo privée revue toutes les six heures) ; **l’API ne sait pas épingler** : on le dit, avec le lien du commentaire pour l’épingler à la main. Aucune longueur maximale documentée (erreur `commentTextTooLong` seulement) : borne interne de 10 000 caractères | `youtube.force-ssl` pour le commentaire et les sous-titres ; **corrigé** : rien pour la miniature, que `youtube.upload` permet déjà [Y3] | `thumbnails.set` [Y3], environ 50 unités, JPEG ou PNG de **50 Mo** au plus (corrigé : pas 2 Mo) ; refusé (403) sans le droit aux miniatures personnalisées, réservé à une chaîne validée [Y5] | `captions.insert` [Y2], **400 unités** (corrigé : le coût manquait), `youtube.force-ssl` ou `youtubepartner`, 100 Mo au plus, nom de piste de 150 caractères au plus |
| Facebook | `POST /{object-id}/comments` (`message`) [F1] sur la publication, la photo ou la vidéo ; **la personne connectée doit avoir la tâche MODERATE sur la Page** (ajouté) ; aucune longueur documentée : borne interne de 8 000 caractères ; une publication programmée ou un brouillon font attendre le commentaire | `pages_manage_engagement` ; **corrigé** : la miniature demande aussi `pages_read_user_content` [F3] ; **ajouté** : Facebook Login for Business fixe les autorisations par configuration (`config_id` remplace `scope`) [F4], une seconde configuration est donc nécessaire pour les ajouter | `POST /{video-id}/thumbnails` (`source`, `is_preferred`) [F3], 10 Mo au plus ; le guide des Reels y renvoie pour la couverture d’un Reel | `POST /{video-id}/captions` (`captions_file`) [F2] : SRT nommé `nom.fr_FR.srt`, 200 Ko au plus ; gérer la Page suffit (rien en plus de `pages_manage_posts`) |
| Instagram | `POST /{ig-media-id}/comments` (`message`) [I1] ; pas de commentaire sur une vidéo en direct ; aucune longueur documentée : borne de la légende, 2 200 caractères | `instagram_business_manage_comments` (avec `instagram_business_basic`) [I1] ; **corrigé** dans le dossier 07b : elle ne sert pas qu’à couper les commentaires | à la publication seulement : `cover_url` (JPEG, 8 Mo, prioritaire) ou `thumb_offset` [I2] ; aucune modification après coup | non (aucun paramètre dans l’API) [I2] |
| Threads | réponse à sa propre publication : conteneur `media_type=TEXT` avec `reply_to_id`, puis `threads_publish` [T1] ; 500 caractères, un émoji comptant pour ses octets ; 1 000 réponses par profil sur 24 heures [T3] | `threads_manage_replies` (avec `threads_content_publish`) : la page « Create Replies » se contente d’être l’auteur de la publication [T1], le guide « Retrieve and Manage Replies » demande cette portée pour tout appel POST sur les réponses [T2] ; on la demande, par prudence | non | non |
| X (plus tard) | réponse (`in_reply_to_tweet_id`), payante | – | non | non |

- Le premier commentaire, les sous-titres et la couverture sont des
  **suites** du travail de publication (`enqueuePublish({ followUps })`,
  dossier 07, § 8.9) : la file les exécute quand la publication est faite,
  les réessaie comme le reste (quota, réseau), et leur échec ne fait
  jamais échouer la publication (le travail reste `done`, avec un
  avertissement).
- Une autorisation manquante n’est pas une erreur : la suite est rangée
  « non faite » (`skipCode: "unauthorized"`), le champ est grisé avec
  « Autoriser les commentaires », qui relance la connexion du compte avec
  la permission en plus (`connect?account=<id>&add=comment.create`). La
  première connexion n’en demande jamais plus que le jeu choisi.
- Nouveaux rôles de champ dans le cœur : `caption`, `firstComment`,
  `hashtags`, `cover`, `subtitles`. La légende Instagram, le texte Threads
  et le message Facebook (la `description` d’une vidéo ou d’un Reel et la
  `caption` d’une photo, le texte affiché dans le fil) passent du rôle
  `description` au rôle `caption` ; les hashtags Instagram de `tags` à
  `hashtags` ; le choix de couverture d’Instagram prend le rôle `cover`. Les
  clés d’options ne changent pas.

Sources :

- [Y1] YouTube Data API, [`commentThreads.insert`](https://developers.google.com/youtube/v3/docs/commentThreads/insert) (mise à jour le 14/09/2026)
- [Y2] YouTube Data API, [`captions.insert`](https://developers.google.com/youtube/v3/docs/captions/insert) (mise à jour le 14/09/2026)
- [Y3] YouTube Data API, [`thumbnails.set`](https://developers.google.com/youtube/v3/docs/thumbnails/set) (mise à jour le 14/09/2026)
- [Y4] YouTube Data API, [Quota Calculator](https://developers.google.com/youtube/v3/determine_quota_cost) (mise à jour le 08/10/2026)
- [Y5] Aide YouTube, [Ajouter des miniatures](https://support.google.com/youtube/answer/72431)
- [F1] Graph API, [Object Comments](https://developers.facebook.com/docs/graph-api/reference/object/comments/)
- [F2] Graph API, [Video Captions](https://developers.facebook.com/docs/graph-api/reference/video/captions/)
- [F3] Graph API, [Video Thumbnails](https://developers.facebook.com/docs/graph-api/reference/video/thumbnails/)
- [F4] [Facebook Login for Business](https://developers.facebook.com/docs/facebook-login/facebook-login-for-business)
- [I1] Instagram Platform, [IG Media Comments](https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-media/comments)
- [I2] Instagram Platform, [IG User Media](https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-user/media)
- [T1] Threads API, [Create Replies](https://developers.facebook.com/documentation/threads/retrieve-and-manage-replies/create-replies)
- [T2] Threads API, [Retrieve and Manage Replies](https://developers.facebook.com/docs/threads/retrieve-and-manage-replies)
- [T3] Threads API, [Troubleshooting](https://developers.facebook.com/docs/threads/troubleshooting) (limites : 250 publications et 1 000 réponses par 24 heures)

## 7. Fonctions serveur (Clip Studio)

| Fonction | Accès | Rôle |
| --- | --- | --- |
| `getExport(id): ExportDetails` | user | Un export, son projet d’origine (« a changé depuis »), sa marque et ses règles de hashtags |
| `updateExportPost(id, post, expectedUpdatedAt?): ExportPost` | user | Enregistre le jeu de textes : validé et borné (`sanitizeExportPost` : longueurs, 20 variantes, services connus) ; refusé si `expectedUpdatedAt` ne correspond plus |
| `setExportCover(id, { file, atMs? } \| { galleryFile } \| null): ClipExport` | user | Fixe la couverture : image du clip déposée par la route d’upload du module (PNG, JPEG, WebP), ou image de la galerie ; `null` la retire |
| `draftPostTexts(id, { connectors, fields?, instructions? }): DraftResult` | user | Propositions de l’assistant, non enregistrées : `{ post, unreviewed, problems, attempts }` |
| `defaultPostTexts(id): ExportPost` | user | Le jeu tiré de la marque, pour « Reprendre la marque » |
| `listExportPublications(id): PublishJobSummary[]` | admin | Travaux de la file pour cet export |
| `publishExport({ exportId, targets: PublishTarget[] })` | admin | Chaque cible reçoit les textes de l’export résolus pour son service, calculés par le serveur (`resolvePostTexts` puis `fieldValuesFor`) et surchargés par les options de l’écran, et `followUps` (premier commentaire, sous-titres, couverture) |
| `registerExport({ …, credits?, loudness?, subtitles?: { srt, language? }, brandKitId?, projectUpdatedAt? })` | user | Reçoit aussi crédits, volume mesuré, sous-titres et marque ; préremplit les textes par la marque |
| `resolveExportFile(id, { file, purpose }?)` | serveur | Vidéo, couverture ou sous-titres, pour la file |

Les sous-titres partent avec l’appel `registerExport` (texte SubRip
calculé par `projectToSrt` dans le navigateur) : la route d’upload des
modules ne reconnaît que les images, les vidéos et les sons.

Côté navigateur, `lib/client.ts` donne les mêmes appels typés :
`getExport`, `updateExportPost`, `defaultPostTexts`, `draftPostTexts`,
`setExportCoverFromImage`, `setExportCoverFromGallery`,
`removeExportCover`, `listExportPublications`, `publishExport`, et
`saveExport(project, blob, durationMs, onProgress?, extras?)`.

## 8. Découpage

| Étape | Contenu | Critère |
| --- | --- | --- |
| E1 | Contrat (`post-types.ts`), champs de `ClipExport`, fonctions serveur, résolution pure des textes, modèles de la marque étendus (types, valeurs par défaut, validation, section Publication de l’éditeur de marque) | Tests de résolution : variante, hashtags par service, limites, variable vide |
| E2 | Cœur : rôles de champ, suites de publication (premier commentaire, sous-titres, couverture), filtre `sourceId`, autorisations en plus, connecteurs YouTube, Facebook, Instagram, Threads | Tests de la file : suite posée après publication, réessayée, sans faire échouer la publication |
| E3 | Écran Exporter (vérifications, réglages, rendu) | Le rendu est identique à celui de la fenêtre actuelle |
| E4 | Fiche d’un export et liste des exports | Publications retrouvées par la source après rechargement |
| E5 | Écran Publier | Une variante modifiée à la publication est retrouvée à la suivante |
| E6 | Rédaction par l’assistant | Une variante Threads tient en 500 caractères |
| E7 | Passe d’intégrité visuelle des trois écrans | Clair et sombre, 1920, 1440, 1280, 1024 et 390 px, noms et textes très longs, aucun compte, vingt comptes |

**État de E3 à E5 (12/10/2026)** – écrits, sans passe visuelle (E7 à faire).

- **E3** : `pages/export.tsx`. Le rendu appelle `exportProject` comme
  l’ancienne fenêtre ; une plage passe par `sliceProject`
  (`lib/export-screens.ts`), qui ramène le projet à la plage sans toucher au
  moteur. Le volume est relu dans le fichier rendu (`integratedLoudness`).
  Les éléments hors du cadre de sécurité ne sont pas vérifiés : aucune
  fonction ne l’exposait (la zone n’existe que dans `preview-stage.tsx`).
  Une ligne de vérification mène à l’éditeur, pas encore à l’élément fautif
  (l’éditeur ne sait pas sélectionner un élément par l’adresse).
- **E4** : `pages/exports.tsx` (liste et fiche), `components/export-card.tsx`,
  `components/export-cover.tsx`. Les publications viennent de
  `listExportPublications` ; dans la liste, le filtre « publié » les lit
  export par export, quatre à la fois.
- **E5** : `pages/publish.tsx`, `components/post-texts-editor.tsx`,
  `components/post-preview.tsx`, `components/publish-shared.tsx`. Les
  variantes sont enregistrées dans l’export peu après la frappe, et avant
  l’envoi ; le serveur calcule les textes, l’écran n’envoie que les
  réglages (visibilité, catégorie…) et la date. Les anciennes
  `export-dialog.tsx` et `publish-dialog.tsx` sont supprimées ; l’ancienne
  adresse `?publish=<id>` mène à l’écran Publier.

## 9. Questions ouvertes

- **Chapitres** dans la description YouTube (« 00:00 Intro ») à partir des
  segments du projet : utile pour les vidéos longues, sans objet pour un
  Short. À proposer quand le clip dépasse une minute :
- **Plusieurs langues** : une variante par langue en plus de la variante par
  service (titre et description traduits, `localizations` de YouTube) :
- **Liens suivis** : ajouter des paramètres de suivi (UTM) aux liens de la
  marque, par service :
- **Modifier après publication** : reporter une modification des textes
  sur les publications déjà faites quand le service le permet (YouTube,
  Facebook, pas Instagram) :
- **Statistiques** : vues et réactions par publication dans la fiche de
  l’export, à partir de `posts.list` des connecteurs :
