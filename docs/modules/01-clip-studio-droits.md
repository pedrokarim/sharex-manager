# 01 quater – Clip Studio : droits des musiques et blocages des publications

Rattaché à [01 – Clip Studio](01-clip-studio.md) (étape 6, banque de
musique), à [01 ter – exporter et publier](01-clip-studio-exports.md) et à
[07 – Image de marque](07-image-de-marque.md) (comptes connectés, § 8).

Dossier ouvert le 15/11/2026, après le premier blocage d’un Short publié par
Clip Studio.

## 1. Le cas qui a ouvert ce dossier

Le Short « 7 animés de 2027 classés par leur promesse » (export
`exp-mwgzb2h2fl3z`, projet `clip-mwgyswszrdov92`, vidéo YouTube
`TdSclzwxnYo`) a été publié le 14/11/2026 sur YouTube, Instagram et Threads
depuis la fiche de l’export. YouTube Studio affiche le lendemain :

| Champ | Valeur relevée dans Studio |
| --- | --- |
| Morceau revendiqué | « Memories », Soundrider |
| Type | Droits d’auteur, audio |
| Demandeur | HAAWK for a 3rd Party, au nom de Soundrider |
| Partie concernée | 0:01 à 1:04 (toute la musique de fond) |
| Effet | Vidéo bloquée dans le monde entier, aucune monétisation |
| Avertissement | Aucun : ce n’est pas un avertissement pour atteinte aux droits d’auteur |

Studio précise que le Short est bloqué parce que le contenu revendiqué
« dépasse les limites de durée définies par le titulaire des droits ».

La musique du projet est « Epic Hip-Hop » de Soundrider/Dope, prise dans la
sélection de base (`modules/clip-studio/music/library.json`, ajoutée le
27/09/2026 par le commit `5189614`). Sa fiche Openverse, relue le
15/11/2026, la donne toujours sous CC BY 3.0 :

- identifiant Openverse `cafeace9-eb96-4459-8705-f4f246658804`, indexé le
  01/08/2022 ;
- page Jamendo `https://www.jamendo.com/track/1670662`, artiste
  `https://www.jamendo.com/artist/520047/DOPE_Music` ;
- le fichier audio se télécharge toujours chez Jamendo (3 Mo, `audio/mpeg`).

La mention exigée par CC BY figure dans la description YouTube :
« « Epic Hip-Hop » par Soundrider/Dope, CC BY 3.0 (lien Jamendo) ».

La page Jamendo du morceau affiche « Désolé, une erreur s’est produite »,
mais celle d’un autre morceau de la sélection aussi : le site de Jamendo
échoue sur toutes les pages de morceau ce jour-là. Ce n’est pas la preuve
d’un retrait. Les 32 morceaux de `library.json` sont encore sur Openverse,
avec la licence enregistrée.

La fiche de l’export, elle, affiche toujours « Publié il y a 18 heures »
pour YouTube : rien dans ShareX Manager ne signale le blocage.

## 2. Ce que vaut la revendication

Le demandeur revendique, au nom du même artiste, un morceau que cet artiste
a publié sous CC BY 3.0.

- La licence CC BY 3.0 est perpétuelle pour l’œuvre reçue sous cette
  licence (section 7 b) : l’auteur peut cesser de la diffuser sous CC BY,
  mais il ne peut pas retirer l’autorisation déjà donnée à qui respecte la
  mention.
- Les distributeurs qui inscrivent des titres dans Content ID (CD Baby,
  FUGA, iMusician, MusicHub) excluent les œuvres publiées sous Creative
  Commons ou sous licence non exclusive. Une inscription de ce genre produit
  des revendications que ces distributeurs jugent eux-mêmes invalides.

Deux réserves, qu’on ne peut pas lever d’ici :

- Content ID nomme le titre « Memories » et non « Epic Hip-Hop ». Soit le
  même enregistrement circule sous deux titres, soit « Epic Hip-Hop »
  reprend un autre morceau. Seule l’écoute de l’extrait dans Studio
  tranche.
- Si l’artiste a mis sur Jamendo une œuvre dont il n’avait pas les droits,
  la licence CC BY ne vaut rien. Rien ne l’indique ici : le demandeur agit
  au nom de Soundrider, l’artiste crédité.

Conclusion pour ce cas : la contestation est fondée (motif « licence »,
avec la fiche Openverse et la mention dans la description). Elle reste
risquée : si le demandeur la rejette et que l’on fait appel, il peut
répondre par une demande de retrait, qui donne cette fois un avertissement.
Sur une vidéo à 0 vue, remplacer la musique et republier coûte moins cher.
Le morceau sort de toute façon du choix automatique de l’assistant (§ 4.3).

## 3. Le but

1. Savoir, pour chaque morceau, s’il est encore utilisable, avec la
   preuve de sa licence au jour où on l’a pris, avant le rendu et avant la
   publication.
2. Faire remonter les blocages dans ShareX Manager : une publication
   bloquée, revendiquée, rendue muette ou retirée se voit sur la fiche de
   l’export, dans la banque de musique et dans une notification, sans
   ouvrir YouTube Studio.
3. Régler le blocage depuis la fiche de l’export, avec l’assistant : il
   reçoit le blocage décrit en données, comprend quel élément du projet est
   en cause, propose des solutions, et applique celle qu’on choisit
   (remplacer la musique, couper, republier, rédiger la contestation).

Ce qui reste hors de portée : contester une revendication par l’API (seuls
les partenaires Content ID ont l’API de gestion des droits) et lire le
détail d’une revendication par l’API YouTube Data. L’assistant prépare la
contestation ; on la dépose à la main dans Studio.

## 4. Les droits d’un morceau

### 4.1 La preuve de licence

Au moment où un morceau entre dans la banque (sélection de base ou ajout
depuis l’onglet Découvrir), le serveur range une preuve :

- la réponse Openverse complète (`/v1/audio/<id>/`), avec la date de
  lecture ;
- l’empreinte SHA-256 du fichier audio téléchargé ;
- une capture Wayback Machine de la fiche Openverse (`save.web.archive.org`
  sur l’adresse de l’API, puisque la page Jamendo échoue) et son adresse ;
- l’adresse de la licence et le texte de mention calculé.

Pour la sélection de base, la preuve se constitue au premier démarrage qui
suit la mise en place, puis ne bouge plus : on garde la plus ancienne.

### 4.2 Les contrôles

| Contrôle | Quand | Ce qu’il lit |
| --- | --- | --- |
| Fiche Openverse | À l’ajout, chaque semaine, avant le rendu | Morceau encore listé, licence et version inchangées |
| Fiche Jamendo | Mêmes moments | Morceau et licence par l’API Jamendo v3 (clé `client_id` à créer, gratuite) ; le site seul ne suffit pas (§ 1) |
| Inscription Content ID | Mêmes moments | Le marquage « ID » de Jamendo Licensing sur les titres inscrits par Jamendo ; champ exact de l’API à trouver (question 1) |
| Historique de la chaîne | À chaque blocage remonté (§ 5) | Morceau ou artiste déjà revendiqué dans une de nos publications |
| Liste des demandeurs connus | À chaque blocage | HAAWK, Identifyy, AdRev… : un artiste revendiqué par l’un d’eux est suspect pour tous ses titres |

Le contrôle hebdomadaire passe par la tâche de fond des comptes connectés
(`src/lib/connections/maintenance.ts`, toutes les heures), qui ne lance les
contrôles de musique qu’une fois par semaine et un morceau à la fois, avec
une pause entre deux appels à Openverse.

### 4.3 Les états d’un morceau

| État | Sens | Effet dans Clip Studio |
| --- | --- | --- |
| `clear` | Listé, licence inchangée, aucun blocage connu | Utilisable partout |
| `at-risk` | Inscrit dans Content ID, ou artiste déjà revendiqué ailleurs | Visible dans la banque avec la raison ; l’assistant ne le choisit pas seul |
| `claimed` | Revendiqué sur une de nos publications | Comme `at-risk`, plus un avertissement dans l’éditeur et l’écran Exporter si un projet l’utilise |
| `withdrawn` | Retiré d’Openverse et de Jamendo, ou licence changée | Plus proposé ; les projets qui l’ont gardent leur fichier et leur preuve |
| `unknown` | Contrôle impossible (service injoignable) | L’état précédent reste affiché, avec la date du dernier contrôle réussi |

Un état se lève à la main (« J’ai contesté et gagné », « Licence achetée »),
avec une note gardée dans l’historique du morceau.

Pour le cas du § 1, « Epic Hip-Hop » passe `claimed` et l’artiste
Soundrider/Dope `at-risk`.

### 4.4 Où on le voit

- Dans la banque de musique, l’état à côté de chaque morceau, la date du
  dernier contrôle, la preuve téléchargeable (JSON et lien d’archive).
- Dans l’éditeur, une piste dont le morceau n’est pas `clear` porte un
  avertissement qui ouvre le détail.
- Dans l’écran Exporter, la liste « Vérifications avant rendu » (dossier
  01 ter, § 3.1) a une ligne par morceau à risque, qui dit quoi faire et mène à la
  piste.
- Dans l’écran Publier, la même ligne est bloquante pour un morceau `claimed` ou
  `withdrawn` tant qu’on ne l’a pas confirmée.

## 5. Les blocages des publications

### 5.1 Ce que les services disent

| Service | Lecture | Ce qu’on en tire |
| --- | --- | --- |
| YouTube | `videos.list`, `part=status,contentDetails` (1 unité) | `status.uploadStatus` (`rejected`, `deleted`…) et `status.rejectionReason` (`claim`, `copyright`, `trademark`, `length`…) ; `contentDetails.regionRestriction` (`allowed` / `blocked`) pour un blocage par pays ou mondial |
| Instagram | Graph API, objet IG Media | `copyright_check_information` (état, correspondances trouvées), si le champ répond pour un média déjà publié (question 2) |
| Threads | – | Aucun champ connu : publication en lecture seule, contrôlée par sa présence |

À mesurer avant d’écrire le code : ce que `videos.list` renvoie pour
`TdSclzwxnYo`. Si un Short bloqué par Content ID ne montre ni
`regionRestriction` ni `rejectionReason`, le seul signal automatique reste
la disparition des vues et l’absence de lecture publique, et la saisie à la
main (§ 5.3) devient le chemin principal.

Le détail (titre revendiqué, demandeur, plage) n’existe que dans Studio et
dans l’e-mail que YouTube envoie au propriétaire de la chaîne.

### 5.2 Quand on lit

- À la fin du suivi de publication (les suites `comment`, `subtitles`,
  `cover` du connecteur YouTube), une lecture de `status,contentDetails`.
- Puis à 1 h, 6 h, 24 h, 72 h et 7 jours après la mise en ligne : la
  plupart des revendications Content ID arrivent dans les premières heures,
  certaines des jours plus tard.
- À chaque lecture des statistiques de la fiche de l’export (déjà gardées
  dix minutes) : on ajoute `contentDetails` à la même demande, sans unité
  de quota de plus.

### 5.3 La saisie à la main

Sur la ligne d’une publication, « Signaler un blocage » ouvre un formulaire
court : coller le texte de la page « Revendications » de Studio, ou remplir
titre revendiqué, demandeur, plage, effet. Codex lit le texte collé et
remplit les champs ; on relit avant d’enregistrer. C’est le chemin du cas
du § 1, et celui de tous les blocages que l’API ne montre pas.

### 5.4 Où on le voit

- Sur la fiche de l’export, dans la liste « Publications », la ligne passe de
  « Publié » à « Bloquée dans le monde entier » (ou « Bloquée dans 12 pays »,
  « Son coupé », « Retirée »), avec la plage en cause, et ouvre le dossier
  du blocage (§ 6).
- La liste des exports gagne un filtre « Bloqués ».
- Une notification part (et un e-mail si les réglages de l’admin le
  prévoient) : le blocage arrive hors de vue de la fiche, c’est le cas où
  une notification a sa place.
- Dans la banque de musique, le morceau passe `claimed` (§ 4.3).

## 6. Régler un blocage avec l’assistant

### 6.1 Le dossier du blocage

L’assistant reçoit un objet, pas un résumé en prose. Il contient :

- le blocage : service, effet, titre revendiqué, demandeur, plage, date,
  source (`api` ou `manual`) ;
- les éléments du projet qui recouvrent la plage : piste, type, source,
  début et fin, crédit, état des droits, preuve de licence ;
- l’historique : autres blocages sur ce morceau, cet artiste, ce demandeur ;
- ce que le service permet : contester (oui, à la main), modifier la vidéo
  publiée (Studio seulement, pas l’API), republier (oui) ;
- les morceaux `clear` de même ambiance et de durée suffisante, déjà
  filtrés par le serveur.

L’assistant de l’éditeur (`lib/editor-chat.ts`) lit ce dossier quand on
l’ouvre depuis la ligne bloquée : son premier message dit ce qu’il a
compris (« La musique Epic Hip-Hop est revendiquée de 0:01 à 1:04 par
HAAWK pour Soundrider ; elle couvre toute la vidéo »), puis numérote les
solutions.

### 6.2 Les solutions proposées

1. Contester : l’assistant rédige le texte de contestation (en anglais,
   motif « licence ») avec la licence, la fiche Openverse archivée, la date
   d’ajout et la mention présente dans la description. Proposé seulement si
   le morceau a une preuve (§ 4.1). On le dépose dans Studio ; la fiche
   garde l’état « Contestée le … » et la réponse se saisit comme un blocage.
2. Remplacer la musique : il propose deux ou trois morceaux `clear` de la
   même ambiance, de préférence sous CC0 et d’artistes jamais revendiqués,
   avec une écoute ; celui qu’on choisit remplace la piste dans une copie du
   projet, au même volume et sur la même plage.
3. Retirer le passage quand le média revendiqué ne couvre qu’une partie
   de la vidéo et que le reste tient seul.
4. Remplacer un visuel quand la revendication porte sur une vidéo ou une
   image (bande-annonce, extrait) : même logique que la musique, avec la
   recherche de l’onglet « Trouver ».

Après 2, 3 ou 4 : rendu d’un nouvel export lié au précédent, puis écran
Publier avec les textes repris. La vidéo bloquée se supprime ou passe en
privé sur confirmation, jamais d’office.

### 6.3 Les règles que l’assistant suit

- Il ne repropose jamais un morceau `claimed` ou `withdrawn`, et un morceau
  `at-risk` seulement si on le demande.
- Il ne lance ni rendu ni publication sans un clic de confirmation.
- Chaque solution dit son coût : délai, nouvelle mise en ligne, perte des
  vues et commentaires de la vidéo bloquée.
- Ce qu’on écrit dans le message s’applique (« garde la même musique mais
  coupe-la à 0:30 ») : la solution retenue est affichée avant d’être
  appliquée.

## 7. Données

Fichiers du module, sous `data/` de Clip Studio, comme `music-added.json`.

```ts
/** Preuve et contrôles d'un morceau de la banque. */
interface TrackRights {
  trackId: string;
  state: "clear" | "at-risk" | "claimed" | "withdrawn" | "unknown";
  reason?: string;
  evidence?: {
    capturedAt: string;
    openverse: unknown; // réponse complète de /v1/audio/<id>/
    audioSha256: string;
    archiveUrl?: string;
    license: string;
    licenseUrl?: string;
    attribution: string;
  };
  checks: Array<{
    at: string;
    source: "openverse" | "jamendo" | "content-id" | "history";
    ok: boolean;
    listed?: boolean;
    license?: string;
    note?: string;
  }>;
  overrides: Array<{ at: string; state: TrackRights["state"]; note: string }>;
}

/** Blocage d'une publication, relevé par l'API ou saisi à la main. */
interface PublicationIssue {
  id: string;
  exportId: string;
  jobId: string; // travail de publication (PublishJob)
  service: "youtube" | "instagram" | "threads";
  externalId: string;
  kind: "copyright-claim" | "blocked" | "muted" | "removed" | "rejected";
  scope?: { worldwide: boolean; countries?: string[] };
  claim?: { title?: string; claimant?: string; onBehalfOf?: string; startMs?: number; endMs?: number; media: "audio" | "video" | "image" };
  source: "api" | "manual";
  raw?: unknown; // réponse du service ou texte collé
  detectedAt: string;
  resolution?: {
    state: "disputed" | "replaced" | "trimmed" | "released" | "accepted";
    at: string;
    note?: string;
    newExportId?: string;
  };
}

/** Artistes et demandeurs vus dans nos blocages. */
interface ClaimantRecord {
  name: string;
  kind: "artist" | "claimant";
  issueIds: string[];
}
```

## 8. Fonctions serveur

| Fonction | Fichier | Rôle |
| --- | --- | --- |
| `captureTrackEvidence(track)` | `lib/music-rights.ts` | Preuve à l’ajout d’un morceau |
| `checkTrackRights(trackId)` | `lib/music-rights.ts` | Contrôles du § 4.2, met à jour l’état |
| `runWeeklyRightsCheck()` | `lib/music-rights.ts`, appelée par la maintenance | Un morceau à la fois, pause entre deux |
| `readPublicationHealth(context, videoId)` | `src/lib/connections/connectors/youtube/api.ts` | `videos.list` `status,contentDetails`, ramené à un `PublicationIssue` ou rien |
| `recordPublicationIssue(input)` | `lib/publication-issues.ts` | Enregistre, passe le morceau en `claimed`, notifie |
| `parseStudioClaim(text)` | `lib/publication-issues.ts` | Codex lit le texte collé depuis Studio et renvoie les champs |
| `buildIssueBrief(issueId)` | `lib/publication-issues.ts` | Le dossier du § 6.1, pour l’assistant |
| `resolvePublicationIssue(id, resolution)` | `lib/publication-issues.ts` | Contestée, remplacée, levée… |

Routes : `GET/POST /api/modules/clip-studio/music/rights`,
`GET/POST /api/modules/clip-studio/exports/<id>/issues`, avec les mêmes
contrôles d’accès que les autres routes du module.

## 9. Découpage

Les étapes R1, R2 et R3 sont indépendantes et peuvent avancer en parallèle
(une session ou un agent chacune) ; R4 attend R2 et R3.

| Étape | Contenu | Fini quand |
| --- | --- | --- |
| R0 | Mesurer `videos.list` sur `TdSclzwxnYo` ; passer « Epic Hip-Hop » en `claimed` à la main (ou le retirer de `library.json`) | Champs relevés et notés dans ce dossier ; l’assistant ne choisit plus ce morceau |
| R1 | Preuve et contrôles des morceaux (§ 4.1 à 4.3), état dans la banque | Les 32 morceaux ont une preuve et un état ; un morceau retiré d’Openverse passe `withdrawn` dans un test |
| R2 | Lecture de santé YouTube et saisie à la main (§ 5) | Le blocage du § 1, saisi depuis le texte de Studio, s’affiche sur la fiche de l’export et dans la liste filtrée |
| R3 | Avertissements dans l’éditeur, l’écran Exporter et l’écran Publier (§ 4.4) | Ouvrir le projet `clip-mwgyswszrdov92` montre l’avertissement sur la piste de musique |
| R4 | Dossier du blocage et solutions de l’assistant (§ 6) | Depuis la ligne bloquée, « Remplacer la musique » produit un nouvel export avec un morceau `clear`, prêt à publier |
| R5 | Instagram, quand la question 2 est tranchée | – |

## 10. Critères d’acceptation

- Un morceau ajouté depuis Découvrir a sa preuve dans la minute, archive
  comprise quand la Wayback Machine répond.
- Un blocage YouTube visible par l’API apparaît sur la fiche de l’export au
  plus tard au contrôle suivant (§ 5.2), sans action.
- Un blocage saisi à la main met le morceau en `claimed` et l’assistant ne
  le propose plus, ni dans « Créer » ni dans l’éditeur.
- L’écran Publier refuse d’envoyer un projet qui contient un morceau
  `claimed` sans confirmation explicite.
- Le premier message de l’assistant ouvert depuis un blocage cite le média
  en cause, la plage et le demandeur.
- Aucune vidéo n’est supprimée ni passée en privé sans clic.

## 11. Questions ouvertes

1. Quel champ de l’API Jamendo v3 dit qu’un titre est inscrit dans
   Content ID ? À défaut, la fiche Jamendo Licensing le montre-t-elle
   sans compte ?
2. `copyright_check_information` répond-il pour un média Instagram déjà
   publié, ou seulement pour un conteneur avant publication ?
3. Faut-il une banque « sûre » à part, limitée à CC0 et aux artistes qui
   déclarent ne pas utiliser Content ID, pour les choix automatiques de
   l’assistant ?
4. Pour la vidéo du § 1 : contester, remplacer la musique, ou les deux ?
