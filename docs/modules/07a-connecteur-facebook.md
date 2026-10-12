# 07a – Connecteur Facebook (publication sur une Page)

Dossier court du connecteur `facebook` des comptes connectés (dossier 07,
§ 8). Il dit ce que Meta permet, ce qu’il faut préparer chez Meta, et ce que
le connecteur fournit au cœur. Il suppose acquises les extensions du cœur en
cours : plusieurs comptes par autorisation, jetons longue durée sans jeton
d’actualisation, liens publics temporaires vers un fichier, publication de
texte et limites déclarées par connecteur.

- **Identifiant** : `facebook` ; `accountNoun` : « page » / « pages ».
- **Ce qu’on publie** : sur une **Page Facebook** dont le propriétaire de
  l’instance est administrateur. Jamais sur un profil personnel ni dans un
  groupe (§ 10).
- **API** : Graph API, version figée dans une constante du connecteur
  (`GRAPH_VERSION = "v26.0"`). La v26.0 est sortie le 29/07/2026, sa fin de vie
  n’est pas encore fixée ; la v25.0 reste disponible jusqu’au 29/07/2028
  (journal des versions, consulté le 12/10/2026). Les exemples des guides de
  Meta sont encore écrits en v25.0 ; les références sont en v26.0.
- **Revue de l’application** : **inutile** tant que seules des personnes qui
  ont un rôle sur l’application s’en servent (§ 2.2). C’est le cas d’une
  instance personnelle.

Toutes les affirmations ci-dessous viennent de la documentation officielle de
Meta, consultée le 12/10/2026 (§ 14). Aucune des pages consultées n’affiche de
date de mise à jour. Ce qui n’est pas documenté est signalé comme tel, avec le
choix retenu.

## 1. Ce que fait le connecteur

| Capacité | Sur Facebook |
| --- | --- |
| `publish.video` | Un **Reel de Page** (vertical, 3 à 90 s) ou une **vidéo de Page** (jusqu’à 40 min et 2 Go) |
| `publish.image` | Une photo publiée sur la Page, avec sa légende |
| `publish.text` | Un message publié dans le fil de la Page, avec un lien facultatif |
| `posts.list` | Les publications de la Page (100 par appel) |
| `posts.manage` | Modifier le texte d’une publication créée par l’application, supprimer une publication ou une vidéo |

Ni bannière ni filigrane : `profile.banner` et `profile.watermark` ne sont pas
proposés (§ 10).

## 2. Préparer l’application Meta

### 2.1 Pas à pas

Marche à suivre affichée dans la configuration du connecteur (`setupSteps`),
avec `consoleUrl` = `https://developers.facebook.com/apps/` :

1. **Compte développeur.** Se connecter à Meta for Developers avec le compte
   Facebook qui administre la Page, et accepter les conditions de développeur.
2. **Créer l’application.** « Créer une application », choisir le cas
   d’usage **« Manage everything on your Page »** (Pages API). Meta ajoute
   d’office `business_management`, `pages_show_list` et `public_profile`, qu’on
   ne peut pas retirer. L’application est de type **Business** : c’est le type
   qu’exige Facebook Login for Business, et un type Business n’a pas de mode
   « Développement » ou « En ligne », seulement des niveaux d’accès.
3. **Ajouter les autorisations.** Dans le cas d’usage, « Ajouter » en face de
   `pages_manage_posts` et `pages_read_engagement`. Rien d’autre (§ 4).
4. **Facebook Login for Business, réglages.** URI de redirection OAuth valide
   `<AUTH_URL>/api/connections/facebook/callback` (affichée par la page, prête
   à copier). Laisser « Client OAuth login » et « Web OAuth login » activés,
   ainsi que « Enforce HTTPS ».
5. **Facebook Login for Business, configuration.** Créer une configuration
   avec le type de jeton **« Jeton d’accès utilisateur »** (pas « utilisateur
   système ») et les autorisations `pages_show_list`, `pages_read_engagement`,
   `pages_manage_posts`. Meta rend un **identifiant de configuration** : le
   recopier dans la page (réglage propre au connecteur, § 12) ou dans
   `FACEBOOK_CONFIG_ID`.
6. **Identifiants.** « Paramètres > Général » : recopier l’identifiant et la
   clé secrète de l’application dans la page, ou dans `FACEBOOK_CLIENT_ID` et
   `FACEBOOK_CLIENT_SECRET`.
7. **Sécurité (conseillé).** « Paramètres > Avancé > Sécurité » : activer
   « Exiger la clé secrète » ; le connecteur signe alors chaque appel avec
   `appsecret_proof` (§ 3.4).
8. **Tester, puis publier l’application si Meta le demande.** Cliquer « Prêt à
   tester » sur le cas d’usage. Certains cas d’usage demandent ensuite une
   publication (« Publier ») : il faut une icône (512 × 512 à 1024 × 1024, moins
   de 5 Mo), une URL de politique de confidentialité
   (`<AUTH_URL>/legal/privacy` convient), une URL ou un rappel de suppression
   des données, et un contact de délégué à la protection des données pour une
   activité dans l’Union européenne. **Ne pas soumettre de revue** : elle ne
   sert qu’à ouvrir l’application à des personnes sans rôle.
9. **Vérifier la visibilité.** Après la première publication, ouvrir la Page
   dans une fenêtre privée. Les données créées par une application en mode
   Développement ne sont visibles que des personnes qui ont un rôle sur elle
   (§ 11) : si la publication n’apparaît pas, l’application n’est pas du bon
   type ou pas publiée.

### 2.2 Ce qui marche sans revue de l’application

D’après les pages « App Review », « Access Levels », « App Modes » et
« Release » :

- « If your app will only be used by app users who have a role on the app
  itself, App Review is not required. »
- Les applications Business reçoivent d’office l’**accès standard** à toutes
  les autorisations de leur type ; une autorisation en accès standard ne peut
  être demandée qu’aux personnes qui ont un rôle sur l’application.
- L’**accès avancé**, lui, passe par la revue et, depuis le 01/02/2023, par une
  **vérification d’entreprise**.

Conséquence pour une instance personnelle : l’administrateur de l’instance,
**administrateur de l’application** (rôle donné d’office à son créateur) et
**administrateur de la Page**, connecte ses Pages et publie sans revue ni
vérification d’entreprise. Pour connecter la Page d’une autre personne, il faut
lui donner un rôle (développeur ou testeur) sur l’application ; au-delà, revue
et accès avancé sont obligatoires.

### 2.3 Business Manager (portefeuille d’entreprise)

**Pas nécessaire** dans le parcours retenu. La documentation ne l’exige que pour
un jeton d’**utilisateur système** (« System-user access token »), utile quand
une configuration a besoin d’un accès continu aux ressources d’une entreprise,
et pour l’accès avancé (vérification d’entreprise).

Variante écartée, gardée en réserve : une Page rangée dans un portefeuille
d’entreprise peut être confiée à un utilisateur système, dont le jeton n’expire
pas par défaut. Elle évite la dépendance à un compte personnel, mais demande de
créer le portefeuille, d’y rattacher l’application et la Page, et de passer par
`business_management`. Trop lourd pour le besoin.

## 3. Autorisation et jetons

### 3.1 Dialogue d’autorisation

- `authorizeUrl` : `https://www.facebook.com/v26.0/dialog/oauth`.
- Paramètres : `client_id`, `redirect_uri`, `state`, `response_type=code` et
  `config_id` (identifiant de configuration de Facebook Login for Business).
  Avec une configuration à jeton utilisateur, `scope` reste accepté mais Meta
  le déconseille. Le cœur l’ajoute toujours, ce qui ne gêne pas : la
  configuration fait foi.
- `scope` accepte des virgules ou des espaces : la jointure par espace du cœur
  convient.
- **PKCE : non.** Le flux manuel n’en parle pas ; le seul flux PKCE documenté
  est le flux OIDC, que Meta dit encore « still in testing ». Donc
  `pkce: false`, et la protection repose sur `state` (cookie signé du cœur) et
  sur l’échange côté serveur avec la clé secrète.
- Annulation : retour avec `error=access_denied` et
  `error_reason=user_denied`, à traiter comme un abandon, pas comme une panne.
- Pour redemander une autorisation refusée : `auth_type=rerequest`.

Au consentement, Facebook laisse choisir **les Pages** à partager avec
l’application. Seules celles-là seront visibles.

### 3.2 De l’autorisation aux jetons de Page

1. **Code → jeton utilisateur de courte durée** :
   `GET https://graph.facebook.com/v26.0/oauth/access_token` avec `client_id`,
   `redirect_uri`, `client_secret` et `code`. Réponse : `access_token`,
   `token_type`, `expires_in` (une à deux heures).
2. **Courte durée → longue durée**, toujours côté serveur :
   `GET /oauth/access_token` avec `grant_type=fb_exchange_token`, `client_id`,
   `client_secret` et `fb_exchange_token`. Le jeton utilisateur de longue durée
   vit **environ 60 jours** ; c’est une nouvelle chaîne qui remplace l’ancienne.
3. **Liste des Pages** : `GET /<id-utilisateur>/accounts` avec le jeton de
   longue durée, champs `id,name,access_token,tasks,category,picture`. Pour
   chaque Page, Meta rend un **jeton de Page** ; obtenu à partir d’un jeton
   utilisateur de longue durée, il **n’a pas de date d’expiration**. Il est
   propre au trio Page, administrateur et application.
4. **Un compte par Page** : `externalId` = identifiant de la Page, `name`,
   `avatarUrl` (`picture.data.url`), `url` = `https://www.facebook.com/<id>`.
   Une Page dont `tasks` ne contient pas `CREATE_CONTENT` n’a pas les
   capacités de publication (§ 4).
5. **Vérification** : `GET /debug_token` avec `input_token` et un jeton
   d’application rend `is_valid`, `expires_at` (0 pour un jeton sans
   expiration), `data_access_expires_at`, `scopes` et `granular_scopes` (avec
   `target_ids`, les Pages concernées). On y lit les portées réellement
   accordées, et on vérifie que `app_id` est bien celui de l’application.

**Ce qui est rangé** : seul le **jeton de Page** de chaque compte, chiffré. Le
jeton utilisateur ne sert qu’à la connexion et n’est pas conservé : tous les
appels du connecteur se font avec le jeton de Page (§ 5). Ainsi aucun compte ne
dépend d’un jeton de 60 jours.

### 3.3 Durée de vie, renouvellement, invalidation

- **Pas de jeton d’actualisation** chez Meta. Un jeton utilisateur expiré ne
  s’échange plus : il faut repasser par le dialogue.
- Le **jeton de Page** n’expire pas avec le temps, mais il peut être invalidé
  « sous certaines conditions », que la page des jetons de longue durée ne
  détaille pas. La page « Error handling » donne les cas à traiter :

  | Erreur | Cause | Effet dans ShareX Manager |
  | --- | --- | --- |
  | 190, ou `OAuthException` sans sous-code | jeton expiré, révoqué ou invalide | compte « à reconnecter » |
  | sous-codes 458, 463, 467 | application retirée, jeton expiré ou invalide | compte « à reconnecter » |
  | sous-code 460 | mot de passe changé | compte « à reconnecter » |
  | sous-codes 459, 464 | point de contrôle de sécurité, compte non confirmé | « à reconnecter », avec le conseil de se connecter d’abord sur facebook.com |
  | sous-code 492 | la personne n’a plus de rôle adapté sur la Page | « à reconnecter », raison affichée |

- **Expiration de l’accès aux données** (90 jours sans activité de la
  personne) : elle ne touche pas les autorisations utilisées ici.
  `pages_show_list`, `pages_read_engagement` et `pages_manage_posts` figurent
  dans la liste des autorisations qui n’expirent pas.
- **Ajouter une Page** plus tard : reconnecter. Le dialogue repropose le choix
  des Pages, et les comptes déjà connus (même `externalId`) sont mis à jour.
- **Déconnexion** : aucun jeton utilisateur n’est gardé, et le flux manuel ne
  documente pas de révocation. « Déconnecter » efface le compte et la page
  affiche `disconnectHelp` : retirer l’application dans les paramètres
  Facebook (« Intégrations professionnelles »).

### 3.4 `appsecret_proof`

Si « Exiger la clé secrète » est activé, chaque appel porte `appsecret_proof`,
le HMAC-SHA256 du jeton d’accès avec la clé secrète de l’application pour clé
(exemple PHP officiel : `hash_hmac('sha256', $access_token, $app_secret)`, donc
en hexadécimal). Le connecteur l’ajoute toujours : sans le réglage, Meta
l’ignore ; avec, il devient obligatoire. Il faut donc la clé secrète au moment
des appels (§ 12).

## 4. Portées et capacités

D’après la référence des autorisations, `pages_manage_posts` dépend de
`pages_read_engagement` et `pages_show_list`, et couvre la création, la
modification et la suppression des publications, photos et vidéos d’une Page.
Les guides Vidéo et Reels ne demandent que ces trois autorisations.

| Portée | Capacités |
| --- | --- |
| `pages_manage_posts` (avec ses deux dépendances) | `publish.video`, `publish.image`, `publish.text`, `posts.manage` |
| `pages_read_engagement` | `posts.list` |
| `pages_show_list` | aucune seule : liste des Pages à la connexion |

En plus des portées, **par Page** : les capacités de publication et de gestion
exigent la tâche `CREATE_CONTENT` dans `tasks` (§ 3.2). Le guide des
publications cite aussi `MANAGE` et `MODERATE` ; on ne les exige pas, car les
références de `/{page-id}/feed`, `/photos` et `/videos` ne demandent que
`CREATE_CONTENT`.

Jeux proposés à la connexion :

- **« Tout »** : `pages_show_list`, `pages_read_engagement`,
  `pages_manage_posts`. Seul jeu utile en pratique.
- **« Lecture seule »** : `pages_show_list`, `pages_read_engagement`. La
  publication reste grisée.

**Écartées** :

- `publish_video` : la référence des autorisations la réserve à la **vidéo en
  direct**, et les guides de publication vidéo ne la demandent pas. La page
  « Manage a Page » dit au contraire de l’ajouter pour publier des vidéos :
  contradiction notée (§ 11). On ne la demande pas ; si un envoi de vidéo
  échoue en erreur 200 (autorisation), on l’ajoutera au jeu « Tout ».
- `pages_manage_engagement` (commentaires), `pages_read_user_content`,
  `pages_manage_metadata` (réglages, webhooks) : inutiles ici.
- `business_management` : ajoutée d’office par le cas d’usage, mais rien dans
  le connecteur ne s’en sert.

## 5. Publier une vidéo

### 5.1 Reel de Page ou vidéo de Page

| | Reel de Page | Vidéo de Page |
| --- | --- | --- |
| Point d’entrée | `POST /{page-id}/video_reels` | `POST /{page-id}/videos` |
| Durée | **3 à 90 s** | 1 s à **40 min** |
| Poids | non documenté | 1 Ko à **2 Go** |
| Format | 9:16 conseillé (rapport accepté entre 16:9 et 9:16), 1080 × 1920 conseillé, 540 × 960 au moins, 24 à 60 i/s constants, H.264 ou H.265, GOP fermé de 2 à 5 s, AAC 48 kHz stéréo d’au moins 128 kbit/s | 9:16 ou 16:9, MP4 parmi une longue liste de conteneurs, AAC 48 kHz jusqu’à 256 kbit/s |
| Visibilité | **publique seulement** | publique, brouillon, ou « secrète » (visible par son lien seulement) |
| Programmation | plus de 10 min, **29 jours** au plus | 10 min à **6 mois** |
| Limite de débit | **30 publications par Page sur 24 h glissantes** | non documentée |
| Jeton | jeton de Page | jeton de Page (§ 5.3) |

Choix par le champ `format` (§ 7). **« Automatique »** fait un Reel quand la
vidéo est verticale ou carrée et dure de 3 à 90 s, une vidéo de Page sinon ;
« Reel » et « Vidéo » forcent le choix, et `normalizeOptions` refuse un Reel
hors limites avec un message clair. Les exports 9:16 de Clip Studio en
1080 × 1920, H.264 et AAC remplissent déjà les conditions ; l’export doit
seulement garder une fréquence fixe et un GOP de 2 à 5 s (à vérifier dans
`engine/export.ts` à la réalisation).

`shortForm` : `maxSeconds: 90`, avec « Vertical et de 90 secondes au plus :
publié comme Reel de la Page » et « Horizontal ou plus long : publié comme
vidéo de la Page ».

### 5.2 Envoi d’un Reel

1. **Ouvrir** : `POST https://graph.facebook.com/v26.0/{page-id}/video_reels`
   avec `upload_phase=start`. Réponse : `video_id` et `upload_url`
   (`https://rupload.facebook.com/video-upload/{video-id}`). Enregistrer
   `video_id` dans `resume`.
2. **Envoyer** : `POST https://rupload.facebook.com/video-upload/v26.0/{video-id}`
   avec les en-têtes `Authorization: OAuth <jeton de Page>`, `offset: 0` et
   `file_size: <octets>`, corps binaire lu **en flux** depuis le disque.
   Réponse : `{"success": true}`.
   - Variante par lien : en-tête `file_url` au lieu du corps, avec un **lien
     public temporaire** du cœur. Meta exige HTTP ou HTTPS sans
     authentification, un `robots.txt` qui autorise `facebookexternalhit/1.1`,
     et refuse les liens fbcdn. Le flux binaire reste la voie par défaut : il
     ne dépend ni du `robots.txt` ni de Cloudflare (§ 11).
3. **Reprendre** : lire `GET /{video-id}?fields=status`, prendre
   `uploading_phase.bytes_transfered` (orthographe de Meta) et renvoyer la suite
   du fichier avec `offset` égal à cette valeur. Sur `OffsetInvalidError`, se
   recaler sur `bytes_transfered`. Même attente exponentielle que pour YouTube
   (1, 2, 4, 8, 16 s). Si la reprise échoue, ou si le statut vaut `expired`,
   repartir de l’étape 1.
4. **Publier** : `POST /{page-id}/video_reels` avec `video_id`,
   `upload_phase=finish`, `video_state` (`PUBLISHED`, `DRAFT` ou `SCHEDULED`),
   `description` (mots-clés `#` compris), `title` facultatif,
   `scheduled_publish_time` (horodatage Unix, avec `video_state=SCHEDULED`) et
   `is_ai_generated` (auto-déclaration, champ de la référence v26.0).

La référence v26.0 de `video_reels` ne liste que `START` et `FINISH` pour
`upload_phase` : l’envoi lui-même passe uniquement par `rupload.facebook.com`.

### 5.3 Envoi d’une vidéo de Page

Deux voies documentées, qui ne demandent pas le même jeton.

**Voie retenue : envoi par morceaux sur `/{page-id}/videos`, avec le jeton de
Page.** La référence v26.0 de `POST /{page-id}/videos` documente
`upload_phase` (`start`, `transfer`, `finish`, `cancel`), `upload_session_id`,
`start_offset`, `end_offset`, `video_file_chunk` (obligatoire en `transfer`)
et `file_size`. Déroulé :

1. `upload_phase=start` et `file_size` → `upload_session_id`, `video_id`,
   `start_offset`, `end_offset`, enregistrés dans `resume`.
2. `upload_phase=transfer`, `upload_session_id`, `start_offset` et
   `video_file_chunk` (le morceau `[start_offset, end_offset)` lu sur le disque,
   en `multipart/form-data`) → nouveaux `start_offset` et `end_offset`. Boucler
   jusqu’à `start_offset == end_offset`.
3. `upload_phase=finish` avec `upload_session_id`, `title`, `description`,
   `published`, `scheduled_publish_time`, `unpublished_content_type` et
   `secret`.

Reprise : on renvoie le morceau qui commence au dernier `start_offset`
enregistré. Une erreur 1363037 (« invalid start offset ») porte les bons
`start_offset` et `end_offset` dans ses données ; une erreur 1363041 (session
expirée) fait repartir du début.

**Voie de secours : Resumable Upload API.** C’est celle que le guide « Publish
Videos on Pages » met en avant. On ouvre une session par
`POST /{app-id}/uploads` (`file_name`, `file_length`, `file_type=video/mp4`),
qui rend `upload:<session>`. On envoie par `POST /upload:<session>` avec
`file_offset` et `Authorization: OAuth <jeton>`, qui rend une poignée `h`. On
reprend par `GET /upload:<session>`, qui rend `file_offset`. Puis on publie par
`POST https://graph-video.facebook.com/v26.0/{page-id}/videos` avec
`fbuploader_video_file_chunk=<h>`, `title` et `description`. Mais **l’envoi
exige un jeton utilisateur**, pas un jeton de Page : il faudrait garder le jeton
utilisateur de 60 jours et reconnecter la Page tous les deux mois. On ne la
code que si Meta retire `upload_phase`.

Troisième voie possible, non retenue par défaut : `file_url` sur
`/{page-id}/videos` avec un lien public temporaire. Elle est incompatible avec
`upload_phase` et soumise aux mêmes contraintes d’accès que pour les Reels.

### 5.4 Suivi du traitement (`checkProcessing`)

`GET /{video-id}?fields=status` toutes les trente secondes :

- `video_status` : `uploading`, `upload_complete`, `processing`, `ready`,
  `error`, `upload_failed`, `expired` ;
- `processing_phase.status` et `processing_phase.error` ;
- pour un Reel, `publishing_phase.publish_status` (`published`, `scheduled`,
  `draft`, `error`) et `publish_time`.

Fin : `ready` et, pour un Reel, un `publish_status` conforme à `video_state`.
`error`, `upload_failed` ou `expired` : échec, avec le message de
`processing_phase.error`. La documentation emploie tantôt `complete`, tantôt
`completed` pour une phase terminée : accepter les deux.

Adresse rendue : `https://www.facebook.com/{post-id}` quand l’identifiant de
publication est connu (`post_id` de la réponse de `video_reels`), sinon
`https://www.facebook.com/{video-id}`, remplacée par `permalink_url` dès que
la vidéo est lisible.

## 6. Publier une image ou un message

**Image** (`publish.image`) : `POST /{page-id}/photos` avec le fichier en
`multipart/form-data` (nom de champ indifférent, `source` par habitude) ou
`url` (lien public temporaire), et `caption` (`message` est déprécié au profit
de `caption`), `published`, `scheduled_publish_time`, `alt_text_custom`.
Réponse : `id` (la photo) et `post_id` (la publication).

- Formats : JPEG, BMP, PNG, GIF, TIFF, **4 Mo au plus**. Meta conseille moins
  de 1 Mo pour un PNG, sinon l’image est pixellisée. Facebook retire la
  géolocalisation et redimensionne.
- Une capture PNG plus lourde est réencodée côté serveur avec `sharp` (déjà
  une dépendance) : JPEG qualité 90, puis 80, jusqu’à passer sous 4 Mo. La
  capture d’origine n’est pas touchée.
- La référence v26.0 marque `provenance_info` (`is_gen_ai`) et
  `provenance_type` comme « obligatoires » dans son tableau, alors que les
  exemples n’en envoient pas. À vérifier au premier envoi ; si Meta les exige
  vraiment, le connecteur envoie `is_gen_ai` d’après le champ « Contenu
  généré » (§ 7).
- Plusieurs images (hors du périmètre initial) : envoyer chaque photo avec
  `published=false`, puis `POST /{page-id}/feed` avec `attached_media[n]`.

**Message** (`publish.text`) : `POST /{page-id}/feed` avec `message`, `link`
facultatif, `published` et `scheduled_publish_time`. Réponse : `id` de la
publication. Adresse : `https://www.facebook.com/{page_post_id}`.

## 7. Champs de publication (`publishFields`)

| Clé | Type | Rôle | Pour | Envoyé comme |
| --- | --- | --- | --- | --- |
| `title` | `text` | `title` | vidéo | `title` (vidéo et Reel) |
| `description` | `textarea` | `description` | vidéo, image | `description` (vidéo, Reel), `caption` (image) ; pour un texte, le `message` est `source.text` |
| `link` | `text` | – | texte | `link` |
| `format` | `select` (Automatique, Reel, Vidéo) | – | vidéo | choix du point d’entrée (§ 5.1) |
| `privacy` | `select` (Publique, Brouillon) | `privacy` | vidéo | Reel : `video_state=DRAFT` ; vidéo : `published=false` et `unpublished_content_type=DRAFT` |
| `scheduledAt` | `datetime` | `scheduledAt` | tous les types | `scheduled_publish_time` (secondes Unix) ; Reel : `video_state=SCHEDULED` ; autres : `published=false` |
| `aiGenerated` | `toggle` | `syntheticMedia` | vidéo, image | `is_ai_generated` (Reel), `provenance_info.is_gen_ai` (image, § 6) |

La colonne « Pour » devient `sourceKinds` dans la description du champ.

- **Visibilité** : une Page est publique. Le Reel n’a que « Public » (le guide
  demande de ne proposer que cette option). « Brouillon » n’est offert que
  pour une vidéo. Le `PostPrivacy` du cœur se traduit ainsi : `public` →
  publiée, `private` → brouillon, `unlisted` → refusé pour un Reel,
  `secret=true` pour une vidéo de Page (option réservée, absente de la fenêtre
  au départ).
- **Programmation** : Meta publie quatre fourchettes différentes (Reel : plus
  de 10 min et 29 jours au plus ; vidéo : 10 min à 6 mois ; fil : 10 min à
  30 jours dans le guide, 75 jours dans la référence). Le connecteur applique
  **10 min à 29 jours** partout : une seule règle, la plus stricte, dite dans
  l’aide du champ.
- **Longueurs** : aucune limite de titre ni de texte n’est documentée dans les
  références consultées. Choix interne, non tiré de Meta : titre borné à
  255 caractères, texte à 10 000 ; une erreur 100 de Meta reste affichée telle
  quelle.
- **Tags, catégorie, « conçu pour les enfants »** : pas d’équivalent, la
  marque n’en envoie pas. Les `#` vont dans la description.

## 8. Limites

| Limite | Valeur | Traitement |
| --- | --- | --- |
| Reels publiés par l’API | **30 par Page sur 24 h glissantes**, appliqué à `POST /{page_id}/video_reels` ; Meta conseille à l’application de l’appliquer aussi, programmation comprise | quota par compte, fenêtre glissante, refus clair avant l’envoi |
| Débit des appels avec un jeton de Page | « Business Use Case » : **4 800 × nombre d’utilisateurs engagés** sur 24 h | lecture de l’en-tête `X-Business-Use-Case-Usage` ; `estimated_time_to_regain_access` (en minutes) donne `retryAt` |
| Erreurs de débit | 4, 17, 32, 613, 80001 (« too many calls to this Page account ») | `QuotaExceededError` pour ce seul compte, travail en `waiting-quota` |
| Abus | 368 (« deemed abusive ») | échec sans nouvel essai, message affiché |
| Vidéo de Page | 1 Ko à 2 Go, 1 s à 40 min (codes 1363022, 1363023, 1363025, 1363026) | vérifié avant l’envoi d’après la source |
| Reel | 3 à 90 s, rapport de 16:9 à 9:16, 540 × 960 au moins, 24 à 60 i/s (codes 1363040, 1363127, 1363128, 1363129) | vérifié avant l’envoi d’après `width`, `height`, `durationMs` |
| Photo | 4 Mo | réencodage (§ 6) |
| Lecture du fil | 100 publications par appel, environ 600 publications publiées par an | pagination, la page le dit |

Pas de quota journalier par application comme chez Google : `quota` reste
absent, les limites passent par `accountQuota` et `limits` (§ 12).

## 9. Gérer les publications

| Action | Appel | Remarque |
| --- | --- | --- |
| Lister | `GET /{page-id}/published_posts?fields=id,message,created_time,permalink_url,full_picture,status_type,is_published&limit=100` | 100 par appel, environ 600 par an ; les vidéos ne sont listées qu’à un administrateur de la Page (c’est le cas) |
| Lister les Reels | `GET /{page-id}/video_reels` (`since`, `until`) | documenté dans le guide Reels, mais la référence v26.0 dit « GET non pris en charge » : on s’en tient à `published_posts` |
| Lire une vidéo | `GET /{video-id}?fields=status,permalink_url,picture,title,description,length` | – |
| Modifier le texte | `POST /{page_post_id}` avec `message` | **seulement les publications créées par l’application** |
| Modifier une vidéo | `POST /{video-id}` (`title`, `description`) | opération listée par la référence de l’API Vidéo, paramètres modifiables non détaillés : à vérifier |
| Supprimer | `DELETE /{page_post_id}` ou `DELETE /{video-id}` | après confirmation ; réponse `{"success": true}` |

Correspondance avec `PostSummary` : `title` = première ligne du message (ou
titre de la vidéo), `description` = message, `tags` vide, `thumbnailUrl` =
`full_picture`, `url` = `permalink_url`, `privacy` = `public` (ou `private` si
`is_published` est faux), `publishedAt` = `created_time`, `publishAt` =
`scheduled_publish_time`. Pas de vues : plusieurs métriques d’impressions et de
vues sont retirées avec la v26.0, et le reste relève de l’API Insights (§ 10).

`PostPatch` : seuls `description` (le message) et, pour une vidéo, `title` sont
pris en compte. `privacy` et `publishAt` sont refusés avec un message : aucun
changement de visibilité ni de reprogrammation n’est documenté pour une
publication existante.

## 10. Impossible ou réservé

- **Profil personnel et groupes** : on ne publie que sur une Page. Le guide des
  Reels le dit (« Only Facebook Pages ») ; publier pour une personne
  demanderait d’autres autorisations et la revue.
- **Page dont on n’est pas administrateur** : accès avancé, donc revue et
  vérification d’entreprise.
- **Visibilité fine d’un Reel** : public seulement.
- **Modifier une publication créée ailleurs** (dans Facebook, ou par une autre
  application) : refusé par Meta.
- **Couverture, photo de profil, filigrane** : hors du connecteur. La page
  propose les fichiers au téléchargement, comme l’avatar YouTube.
- **Statistiques** : plusieurs mesures d’impressions et de vues ont été
  retirées avec la v26.0 (journal de la v25.0). À reprendre avec la question
  « Statistiques dans le temps » du dossier 07.
- **Stories de Page**, **collaborateurs** de Reels (10 invitations par Page
  et par 24 h), **ciblage géographique** : documentés, laissés de côté.
- **Vidéo en direct** : hors sujet (`publish_video`).

## 11. Risques et pièges

- **Visibilité des publications d’une application en Développement** : « Any
  data generated while an app is in Development mode, such as test posts, can
  only be seen by role users. » Une application Business n’a pas de mode, mais
  les cas d’usage peuvent demander une publication (« Publier »). D’où
  l’étape 9 du § 2.1, et un rappel dans la page tant qu’aucune publication n’a
  été vérifiée.
- **`robots.txt` et Cloudflare** pour les liens publics temporaires : le
  `robots.txt` actuel (`src/app/robots.ts`) interdit `/api/` à tous les robots,
  et Meta exige que `facebookexternalhit/1.1` puisse lire le fichier. Si le
  cœur sert les liens sous `/api/connections/media/…`, il faut une règle
  propre à ce robot pour ce chemin, et vérifier que Cloudflare ne lui oppose
  pas de défi. C’est pourquoi le connecteur envoie le fichier lui-même par
  défaut.
- **Documentation contradictoire**, à garder à l’œil : l’hôte
  `graph-video.facebook.com` est dit déprécié dans la présentation de l’API
  Vidéo mais employé dans le guide de publication ; `publish_video` est
  demandé par « Manage a Page » et réservé au direct ailleurs ; il existe
  quatre fourchettes de programmation ; `GET /video_reels` est documenté puis
  refusé ; les limites de poids et de durée des vidéos diffèrent selon les
  pages (2 Go et 40 min dans les codes d’erreur, 1,75 Go et 45 min dans une
  ancienne référence). Le connecteur retient les chiffres les plus stricts et
  range les constantes dans un seul fichier.
- **Version de l’API** : chaque version vit environ deux ans. La v26.0 n’a pas
  encore de fin annoncée ; la constante `GRAPH_VERSION` sera à relever quand
  Meta l’annoncera.
- **Compte personnel au cœur du dispositif** : les jetons de Page viennent du
  compte Facebook de l’administrateur. Un mot de passe changé, un point de
  contrôle de sécurité, un rôle retiré sur la Page ou une restriction du
  compte coupent la publication (§ 3.3). Le compte passe « à reconnecter » et
  la file s’arrête pour lui sans perdre le travail.
- **Restrictions de la Page ou de l’application** : erreur 368, ou
  application restreinte par Meta. La page des autorisations mentionne un
  **contrôle annuel de l’utilisation des données** (« Data Use Checkup ») ;
  s’il est demandé et pas rempli, l’application peut être bloquée. À
  surveiller dans le tableau de bord Meta.
- **Revue** : inutile ici, mais à prévoir si l’on veut un jour laisser
  d’autres personnes connecter leurs Pages (captures vidéo du parcours,
  vérification d’entreprise).
- **Droits d’auteur** : un Reel peut être vérifié
  (`copyright_check_information`). Une musique de la banque mal licenciée peut
  faire bloquer la vidéo ; le connecteur affiche l’état sans le bloquer.

## 12. Ce que le connecteur demande au cœur

**Déjà prévu par le cœur** (extensions en cours), et utilisé ainsi :

| Point d’extension | Usage Facebook |
| --- | --- |
| `exchangeToken` | jeton utilisateur court → long (`fb_exchange_token`) |
| `fetchAccounts` | `/<id-utilisateur>/accounts` : un `DiscoveredAccount` par Page, avec son `token` (jeton de Page, sans `expiresAt`) et des `capabilities` restreintes si `CREATE_CONTENT` manque |
| `fetchGrantedScopes` | `debug_token` (`scopes`, `granular_scopes`) |
| `fetchProfile` avec `account` | vérification d’une Page déjà connue : `GET /{page-id}?fields=id,name,link,picture` |
| `tokenLifetime.defaultMs: null` | jeton de Page sans expiration, jamais renouvelé |
| `app.disconnectHelp` | « Retirez l’application dans Paramètres Facebook > Intégrations professionnelles. » Aucun jeton utilisateur n’est gardé, donc aucune révocation par l’API |
| `accountQuota` | compartiment « Reels », 30 sur une fenêtre de 24 h, compté à `video_reels.finish` |
| `QuotaExceededError` avec `scope: "account"` | erreurs 4, 17, 32, 613, 80001 ; `retryAt` tiré d’`estimated_time_to_regain_access` |
| `limits` | `video` : 1 s à 40 min, 2 Go, rapport de 0,5625 à 1,778 ; `text` : 10 000 caractères ; **pas** de `maxBytes` sur `image`, le connecteur réencode au-delà de 4 Mo |
| `publicUrl` | variante `file_url` (Reel, vidéo) et `url` (photo), non utilisée par défaut |
| `sourceKinds` | « Format » et « Brouillon » pour `video` seulement, `link` pour `text` seulement |
| `PublishTextSource.text` | le `message` d’une publication texte |

**Reste à ajouter au cœur** :

1. **Réglage propre au connecteur** : l’identifiant de configuration de
   Facebook Login for Business (`config_id`), saisi dans la page ou lu dans
   `FACEBOOK_CONFIG_ID`, et ajouté au dialogue d’autorisation. `extraParams`
   est statique et ne peut pas le porter. Forme proposée :
   `app.settings?: { key, label, env, required }[]`, la valeur étant reportée
   dans l’adresse d’autorisation sous `key`.
2. **Clé secrète au moment des appels**, pour `appsecret_proof` (§ 3.4) :
   `ConnectorContext` ne la donne pas, seul `TokenHookContext` l’a. Mieux
   qu’exposer la clé : une fonction `appSecretProof(token)` fournie par le cœur.
3. **Passage « à reconnecter » sur erreur d’usage** : aujourd’hui seul le
   renouvellement fait passer un compte « à reconnecter ». Un jeton de Page qui
   ne se renouvelle jamais n’est découvert invalide qu’à l’usage : une
   `ReconnectRequiredError` levée par `publish`, `checkProcessing` ou `posts`
   doit marquer le compte, avec sa raison.
4. **Méthode de l’échange du code** : le cœur l’envoie en `POST` ; Meta ne
   documente que le `GET`. À vérifier au premier essai, sinon une option
   `oauth.tokenMethod: "GET"`.
5. Facultatif : une route de rappel de **suppression des données** et de
   **désautorisation** (`signed_request` de Meta), pour remplir l’étape 8 du
   § 2.1 sans page manuelle.

**Fichiers du connecteur** : `connectors/facebook/index.ts` (description,
portées, jeux), `graph.ts` (appels, `appsecret_proof`, lecture des erreurs et
de l’en-tête de débit), `auth.ts` (échange, Pages), `reels.ts`, `videos.ts`
(envoi par morceaux), `posts.ts` (photo, message, liste, gestion) et
`metadata.ts` (champs, `normalizeOptions`, constantes de limites), avec leurs
tests sur un faux Graph API : reprise d’un Reel à `bytes_transfered`, reprise
d’un envoi par morceaux sur 1363037, passage « à reconnecter » sur 190, 460 et
492, limite de 30 Reels, choix automatique entre Reel et vidéo, réencodage
d’une photo de plus de 4 Mo, bornes de programmation.

## 13. Effort estimé

- Connecteur et tests : environ deux jours (sept fichiers, de l’ordre de
  900 lignes et 400 lignes de tests), le plus délicat étant les deux envois
  reprenables.
- Ajouts au cœur restants (§ 12, points 1 à 4) : une demi-journée.
- Essai réel sur une Page : une demi-journée, pour trancher les points
  contradictoires (§ 11) et vérifier la visibilité publique.

## 14. Sources

Toutes consultées le 12/10/2026. Aucune n’affiche de date de mise à jour ; les
dates citées sont celles des versions de l’API.

- Journal des versions de la Graph API (v26.0 du 29/07/2026, v25.0 disponible
  jusqu’au 29/07/2028) : https://developers.facebook.com/docs/graph-api/changelog
- Journal de la v26.0 : https://developers.facebook.com/docs/graph-api/changelog/version26.0
- Journal de la v25.0 (18/02/2026, retrait des métriques d’impressions avec
  la v26.0) : https://developers.facebook.com/docs/graph-api/changelog/version25.0
- Changements hors version, 2025 : https://developers.facebook.com/docs/graph-api/changelog/non-versioned-changes/nvc-2025
- Publications d’une Page (Pages API) : https://developers.facebook.com/docs/pages-api/posts
- Premiers pas, Pages API : https://developers.facebook.com/docs/pages-api/getting-started
- Gérer une Page : https://developers.facebook.com/docs/pages-api/manage-pages
- Présentation de la Pages API : https://developers.facebook.com/documentation/pages-api
- Créer une application pour la Pages API (cas d’usage, publication) : https://developers.facebook.com/documentation/pages-api/create-an-app
- Référence `/{page-id}/feed` (v26.0) : https://developers.facebook.com/docs/graph-api/reference/page/feed/
- Référence `/{page-id}/photos` (v26.0) : https://developers.facebook.com/docs/graph-api/reference/page/photos/
- Référence `/{page-id}/videos` (v26.0) : https://developers.facebook.com/docs/graph-api/reference/page/videos/
- Référence `/{page-id}/video_reels` (v26.0) : https://developers.facebook.com/docs/graph-api/reference/page/video_reels/
- Référence `/{page-id}/published_posts` (v26.0) : https://developers.facebook.com/docs/graph-api/reference/page/published_posts/
- Référence Post (v26.0) : https://developers.facebook.com/docs/graph-api/reference/post/
- Référence Video (v26.0) : https://developers.facebook.com/docs/graph-api/reference/video/
- Publication de Reels : https://developers.facebook.com/docs/video-api/guides/reels-publishing
- Publication de vidéos sur une Page : https://developers.facebook.com/docs/video-api/guides/publishing et https://developers.facebook.com/documentation/video-api/guides/publishing
- Présentation de l’API Vidéo (hôte `graph-video` déprécié) : https://developers.facebook.com/docs/video-api/overview
- Référence de l’API Vidéo (formats, mise à jour, suppression) : https://developers.facebook.com/documentation/video-api/reference
- Codes d’erreur de l’API Vidéo (2 Go, 40 min) : https://developers.facebook.com/documentation/video-api/reference/error-codes
- Resumable Upload API : https://developers.facebook.com/docs/graph-api/guides/upload
- Jetons d’accès : https://developers.facebook.com/docs/facebook-login/guides/access-tokens
- Jetons de longue durée et jetons de Page : https://developers.facebook.com/docs/facebook-login/guides/access-tokens/get-long-lived
- Flux de connexion manuel : https://developers.facebook.com/docs/facebook-login/guides/advanced/manual-flow
- Flux OIDC avec PKCE (« still in testing ») : https://developers.facebook.com/documentation/facebook-login/guides/advanced/oidc-token
- Facebook Login for Business : https://developers.facebook.com/docs/facebook-login/facebook-login-for-business
- Authentification et accès aux données (90 jours, autorisations qui
  n’expirent pas) : https://developers.facebook.com/docs/facebook-login/auth-vs-data/
- `debug_token` (v26.0) : https://developers.facebook.com/docs/graph-api/reference/debug_token/
- Sécuriser les requêtes (`appsecret_proof`) : https://developers.facebook.com/docs/graph-api/securing-requests
- Référence des autorisations : https://developers.facebook.com/docs/permissions
- Niveaux d’accès : https://developers.facebook.com/docs/graph-api/overview/access-levels
- Modes de l’application : https://developers.facebook.com/docs/development/build-and-test/app-modes
- Types d’application : https://developers.facebook.com/docs/development/create-an-app/app-dashboard/app-types
- Publier une application : https://developers.facebook.com/documentation/development/release
- Revue de l’application : https://developers.facebook.com/docs/app-review et https://developers.facebook.com/docs/app-review/introduction
- Limites de débit : https://developers.facebook.com/docs/graph-api/overview/rate-limiting
- Gestion des erreurs : https://developers.facebook.com/docs/graph-api/guides/error-handling
