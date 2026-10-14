# 07e – Le connecteur TikTok

Dossier court du connecteur `tiktok` des comptes connectés (dossier 07,
§ 8). Il suit le modèle des connecteurs Threads et Instagram (dossiers 07b
et 07c) et s’appuie sur les extensions du cœur déjà réalisées (jetons
renouvelés par la tâche de fond, file de publication avec reprise, quotas
par compte, profil en lecture seule), plus trois petites extensions
décrites au § 11.

Toute la documentation citée a été lue le 14/10/2026 sur
developers.tiktok.com. Les numéros entre crochets renvoient aux « Sources »,
en fin de dossier.

- **Identifiant** : `tiktok`
- **Nom d’un compte** : « compte », « comptes »
- **Variables d’environnement** : `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET`
  (TikTok parle de *client key*, pas de *client id*)
- **Capacités** : `publish.video`, `posts.list`
- **Réglage d’application** : « Application auditée par TikTok » (case à
  cocher, décochée par défaut)

## 1. Voie retenue

TikTok offre deux façons de publier par la Content Posting API [S6] :

| Mode | Portée | Ce qui se passe |
| --- | --- | --- |
| **Upload** (brouillon) | `video.upload` | La vidéo arrive dans la boîte de réception de l’application TikTok ; la personne touche la notification, finit l’édition (texte, son, visibilité) et publie [S7] [S10]. |
| **Direct Post** | `video.publish` | La vidéo est publiée tout de suite, avec texte, visibilité et réglages fixés par l’application [S6] [S9]. |

**Le connecteur publie en brouillon par défaut**, et ne propose la
publication directe que lorsque l’application est déclarée auditée
(réglage « Application auditée par TikTok ») et que le compte a accordé
`video.publish`. Raisons :

- Un client **non audité** ne peut publier directement que sur un compte
  **réglé en privé au moment de publier**, en visibilité `SELF_ONLY`, et
  pour **cinq comptes au plus sur 24 heures** : « Unaudited API Clients can
  allow up to 5 users to post in a 24 hour window », « All user accounts
  using the API client to post must be set to private at the time of
  posting », « Unaudited API Clients can only post contents in `SELF_ONLY`
  viewership » [S14]. Un compte public reçoit l’erreur
  `unaudited_client_can_only_post_to_private_accounts` dès
  l’initialisation [S9]. Ce n’est donc pas une visibilité forcée : le compte
  lui-même doit être privé.
- L’audit risque d’être refusé à ShareX Manager : parmi les usages « Not
  acceptable », TikTok cite « A utility tool to help upload contents to the
  account(s) you or your team manages » [S14]. C’est exactement l’usage
  d’une instance personnelle.
- Le brouillon laisse la personne finir dans l’application, avec les sons
  et les effets de TikTok, ce que l’API ne sait pas faire.

### Ce que la documentation dit du mode Upload sans audit

**Rien d’explicite.** Le guide « Get started – Upload » demande seulement
« Your app must be approved for the `video.upload` scope » et que la
personne ait autorisé cette portée [S7] ; il ne parle ni d’audit, ni de
compte privé, ni de bac à sable. Les restrictions « unaudited » de [S14]
sont écrites pour la publication directe. La page du bac à sable dit
seulement qu’il « does not offer access to Content Posting API for public
videos » [S17], sans parler des brouillons.

Conclusion retenue : le brouillon **ne dépend pas de l’audit de la
publication directe**, mais il **dépend de l’approbation de la portée
`video.upload`**, donc de la revue de l’application en production. À
vérifier dès la première mise en place, dans cet ordre :

1. en bac à sable, avec un compte cible : un envoi en brouillon arrive-t-il
   dans la boîte de réception ?
2. en production, après la revue : idem, sans audit Direct Post.

Le mode Upload a sa propre limite : « at most 5 pending shares within any
24-hour period » (`spam_risk_too_many_pending_share`) [S10].

## 2. Préparer l’application TikTok

Marche à suivre affichée dans la configuration du connecteur :

1. Sur <https://developers.tiktok.com/apps/>, **Manage apps › Connect an
   app** [S15]. Une organisation est conseillée.
2. **Informations de base** : icône de 1 024 × 1 024 px (JPEG ou PNG, 5 Mo),
   catégorie, description (affichées sur l’écran d’autorisation), plateforme
   **Web** avec l’adresse du site, liens vers les **conditions
   d’utilisation** et la **politique de confidentialité** [S15]. Pour une
   application créée après le 9 septembre 2024, ces adresses doivent être
   vérifiées (*Verify properties*) : par domaine (enregistrement DNS,
   conseillé) ou par préfixe d’adresse (fichier de signature) [S18].
3. **Products** : ajouter **Login Kit** et **Content Posting API** [S15].
   Dans Login Kit, coller l’adresse de retour
   `<AUTH_URL>/api/connections/tiktok/callback` : HTTPS, absolue,
   statique, sans paramètre ni fragment, moins de 512 caractères, dix
   adresses au plus [S1].
4. **Scopes** : `user.info.basic` (ajoutée d’office avec Login Kit),
   `video.upload` ; `user.info.profile` pour le pseudo et la bio ;
   `video.list` pour lister les vidéos ; `video.publish` seulement pour la
   publication directe, avec la **Direct Post configuration** activée dans
   Content Posting API [S3] [S6].
5. **Bac à sable** (*Sandbox*) : cinq au plus, avec dix comptes cibles
   (*Target users*) au plus, qui doivent vous appartenir (connexion avec
   leurs identifiants) [S17]. Le bac à sable a sa propre *client key*.
6. **Revue** pour la production : site qui ne soit ni une page vide ni une
   page de connexion, liens de confidentialité et de conditions visibles,
   une à cinq vidéos de démonstration de 50 Mo au plus montrant chaque
   produit et chaque portée sur le domaine déclaré, une justification par
   portée [S16]. Aucun délai n’est annoncé.
7. **Audit Direct Post** (facultatif) : soumis à part, d’après les
   Content Sharing Guidelines (§ 6) [S14]. Une fois obtenu, cocher
   « Application auditée par TikTok » dans la configuration du service.
8. Recopier la **Client key** et le **Client secret** dans l’environnement
   (`TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET`) ou dans « Comptes
   connectés ».

Le transfert par `PULL_FROM_URL` exigerait aussi un domaine ou un préfixe
d’adresse vérifié [S11] : le connecteur envoie le fichier lui-même
(`FILE_UPLOAD`) et n’en a pas besoin.

## 3. Autorisation et jetons

| Étape | Appel |
| --- | --- |
| Fenêtre d’autorisation | `https://www.tiktok.com/v2/auth/authorize/?client_key=…&response_type=code&scope=…&redirect_uri=…&state=…` [S1] |
| Échange du code | `POST https://open.tiktokapis.com/v2/oauth/token/`, formulaire `client_key`, `client_secret`, `code`, `grant_type=authorization_code`, `redirect_uri` [S2] |
| Renouvellement | même adresse, `grant_type=refresh_token`, `refresh_token` [S2] |
| Révocation | `POST https://open.tiktokapis.com/v2/oauth/revoke/`, formulaire `client_key`, `client_secret`, `token` [S2] |

- **Identifiant du client** : le paramètre s’appelle `client_key`, à
  l’autorisation comme à l’échange [S1] [S2] (extension du cœur, § 11).
- **Portées** : séparées par des **virgules** [S1]. La personne peut en
  refuser certaines ; le retour les liste (`scopes`) et la réponse de jeton
  aussi (`scope`) [S1] [S2].
- **PKCE** : absent de la page Web [S1] ; la page des jetons réserve
  `code_verifier` aux applications mobiles et de bureau [S2]. Le connecteur
  n’en envoie pas (`pkce: false`) ; `state` protège l’échange. Sur bureau,
  TikTok encode le défi en **hexadécimal** et non en base64url [S21] : à
  garder en tête si un jour une autre plateforme est visée.
- **Réponse** : `access_token` (`expires_in` = 86 400, 24 heures),
  `refresh_token` (`refresh_expires_in` = 31 536 000, un an), `open_id`,
  `scope`, `token_type` = `Bearer` [S2]. « The returned refresh_token may be
  different than the one passed in the payload » : le cœur garde toujours le
  dernier rendu.
- **Erreurs OAuth** : forme normée `{ error, error_description, log_id }`
  [S2], lue par le cœur.
- **Renouvellement** : par la tâche de fond, deux heures avant l’échéance du
  jeton d’accès ; le jeton d’actualisation est ainsi utilisé chaque jour et
  ne s’approche jamais de son année de validité.
- **Révocation** : corps vide en cas de succès ; l’application disparaît des
  autorisations du compte [S2]. Faite à la déconnexion.

**Compte** (`fetchProfile`) : `GET /v2/user/info/?fields=open_id,union_id,avatar_url,display_name`
(`user.info.basic`), puis, à part, `fields=username,bio_description,profile_deep_link,is_verified`
(`user.info.profile`), dont un refus n’empêche pas la connexion [S4].
`externalId` = `open_id`, `name` = `display_name`, `handle` = `@username`,
`url` = `https://www.tiktok.com/@<username>`, `avatarUrl` = `avatar_url`.

## 4. Portées et capacités

| Portée | Ce qu’elle donne [S3] | Capacité |
| --- | --- | --- |
| `user.info.basic` | `open_id`, avatar, nom affiché | – |
| `user.info.profile` | pseudo, bio, lien du profil, compte vérifié | – (profil plus complet) |
| `user.info.stats` | compteurs d’abonnés, de mentions « J’aime », de vidéos | non demandée |
| `video.upload` | « Share content to creator’s account as a draft » | `publish.video` |
| `video.publish` | « Directly post content to a user’s TikTok profile » | `publish.video` |
| `video.list` | « Read a user’s public videos » | `posts.list` |

Deux jeux proposés à la connexion :

- « Brouillons » : `user.info.basic`, `video.upload` ;
- « Tout » : les mêmes, plus `user.info.profile`, `video.publish` et
  `video.list`.

La page des portées ne dit pas lesquelles passent par la revue [S3] ; les
guides de démarrage demandent que l’application soit « approved for »
`video.upload` et `video.publish` [S6] [S7]. Une portée absente de
l’application fait échouer l’autorisation : déclarer dans le portail toutes
celles du jeu choisi.

## 5. Publication

### Initialisation

| Mode | Appel | Corps |
| --- | --- | --- |
| Brouillon | `POST /v2/post/publish/inbox/video/init/` [S10] | `source_info` seulement : ni texte ni visibilité |
| Direct | `POST /v2/post/publish/video/init/` [S9] | `post_info` + `source_info` |

`source_info` : `source` = `FILE_UPLOAD`, `video_size`, `chunk_size`,
`total_chunk_count`. Réponse : `publish_id` (64 caractères au plus) et
`upload_url`, **valable une heure** [S9] [S10]. Six appels par minute et
par jeton [S9] [S10].

`post_info` (direct) : `title` (2 200 « UTF-16 runes » au plus, mots-dièse
et mentions analysés), `privacy_level` (obligatoire, parmi les options de
`creator_info`), `disable_comment`, `disable_duet`, `disable_stitch`,
`video_cover_timestamp_ms`, `brand_content_toggle`,
`brand_organic_toggle`, `is_aigc` [S9].

### Transfert en morceaux

`PUT` sur `upload_url`, en-têtes `Content-Type` (`video/mp4`,
`video/quicktime` ou `video/webm`), `Content-Length` et
`Content-Range: bytes <premier>-<dernier>/<total>` [S11] :

- morceaux de **5 Mo au moins, 64 Mo au plus**, le dernier jusqu’à
  **128 Mo** ; moins de 5 Mo : un seul morceau de la taille du fichier ; **1 à
  1 000 morceaux** ; `total_chunk_count` = taille ÷ `chunk_size`, **arrondi
  en dessous** (le dernier morceau garde le reste) ; envoi **dans l’ordre**
  [S11] ;
- réponses : 206 (il en manque), 201 (tout est reçu), 400 (en-têtes),
  403 (adresse expirée), 404 (envoi inconnu), 416 (`Content-Range` décalé),
  5xx (renvoyer le morceau) [S11].

Le connecteur prend des morceaux de 10 Mio (un seul morceau jusque-là),
lus un à un sur le disque. Une coupure ou une 5xx fait renvoyer le même
morceau après 1, 2, 4, 8 puis 16 s ; 403, 404 ou 416 font repartir d’une
nouvelle initialisation, sans recompter le quota. L’état de reprise garde
`publish_id`, l’adresse d’envoi et le prochain morceau : après un
redémarrage, l’envoi reprend au bon morceau tant que l’adresse vaut.

### Statut

`POST /v2/post/publish/status/fetch/`, corps `{ publish_id }`, 30 appels par
minute [S12]. États : `PROCESSING_UPLOAD`, `PROCESSING_DOWNLOAD`,
`SEND_TO_USER_INBOX`, `PUBLISH_COMPLETE`, `FAILED` ; `fail_reason`
(`file_format_check_failed`, `duration_check_failed`,
`frame_rate_check_failed`, `picture_size_check_failed`, `internal`,
`spam_risk_*`, `auth_removed`…) ; `publicaly_available_post_id` (orthographe
de l’API), liste d’identifiants int64, rendue seulement quand la vidéo est
publique **et** a passé la modération [S12]. Ces identifiants dépassent
2^53 : ils sont lus en chaînes (`parseJsonKeepingIds`).

Conduite du connecteur, la main étant rendue à la file entre deux lectures
(`PublishPending`) :

| État | Conduite |
| --- | --- |
| `PROCESSING_*` | relire dans 5 s |
| `SEND_TO_USER_INBOX` | **fini**, sans adresse, avec la note « Envoyé en brouillon dans TikTok : ouvrez la boîte de réception de l’application pour publier. » |
| `PUBLISH_COMPLETE` avec identifiant | fini, adresse `https://www.tiktok.com/@<pseudo>/video/<id>` |
| `PUBLISH_COMPLETE` sans identifiant | vidéo privée : finie ; sinon relire chaque minute, quinze fois au plus, puis finir avec l’adresse du profil et une remarque |
| `FAILED` | échec, raison traduite ; l’état de reprise est effacé, « Reprendre » renvoie la vidéo |

Les webhooks (`post.publish.inbox_delivered`, `post.publish.complete`…)
[S12] ne sont pas utilisés : la lecture du statut suffit et n’exige pas
d’adresse joignable.

**Photos** : `POST /v2/post/publish/content/init/` avec `media_type=PHOTO`,
`post_mode` `DIRECT_POST` ou `MEDIA_UPLOAD`, seulement par `PULL_FROM_URL`
(35 images au plus, WebP ou JPEG) [S13] [S11]. Non pris en charge pour
l’instant : il faudrait un domaine vérifié (§ 2).

## 6. Écran de publication directe (Content Sharing Guidelines)

Exigé par TikTok pour la publication directe [S14], réalisé par le
formulaire lu à l’affichage (`publishForm`, § 11) :

1. **`creator_info` relu à chaque affichage** de l’écran Publier
   (`POST /v2/post/publish/creator_info/query/`, 20 appels par minute [S8])
   et **pseudo du compte affiché** (« Publié par @… »). S’il signale que le
   compte ne peut pas publier (`spam_risk_too_many_posts`,
   `spam_risk_user_banned_from_posting`, `reached_active_user_cap`, rendus
   avec un statut HTTP 200 [S8]), la publication directe disparaît pour ce
   compte et le brouillon reste proposé.
2. **Durée** comparée à `max_video_post_duration_sec` : limite de durée du
   compte dans la liste de contrôle.
3. **Visibilité** dans une liste déroulante, **sans valeur choisie
   d’avance**, avec exactement les options rendues (compte public :
   `PUBLIC_TO_EVERYONE`, `MUTUAL_FOLLOW_FRIENDS`, `SELF_ONLY` ; compte
   privé : `FOLLOWER_OF_CREATOR`, `MUTUAL_FOLLOW_FRIENDS`, `SELF_ONLY` [S8]) ;
   l’envoi est bloqué tant que rien n’est choisi.
4. **Commentaires, duo, collage** : décochés par défaut, grisés quand le
   compte les a coupés ; une interaction coupée reste coupée à l’envoi.
5. **Contenu commercial** : bascule désactivée par défaut qui fait
   apparaître « Votre marque » et « Contenu de marque » ; au moins une case
   exigée ; mention « Contenu promotionnel » ou « Partenariat rémunéré » ; un
   contenu de marque ne peut pas être visible de soi seul (« Branded content
   visibility cannot be set to private. ») [S14].
6. **Déclaration** près du bouton : « By posting, you agree to TikTok’s Music
   Usage Confirmation », ou, avec un contenu de marque, « …Branded Content
   Policy and Music Usage Confirmation » [S14], affichées en français avec le
   nom anglais des textes de TikTok.
7. **Consentement explicite** : case « J’ai relu la vidéo et j’accepte de la
   publier sur ce compte », exigée ; **aperçu** de la vidéo (colonne Aperçu) ;
   texte prérempli modifiable, sans filigrane ajouté ; remarque « la mise en
   ligne peut prendre quelques minutes » et suivi du statut [S14].

Les mêmes règles sont revérifiées par le serveur (`normalizeOptions`), puis
`creator_info` est relu juste avant l’initialisation : une visibilité qui
n’est plus proposée ou une vidéo trop longue sont refusées avec un message
clair.

Pour le **brouillon**, la seule consigne documentée est de prévenir la
personne qu’elle « must click on inbox notifications to continue the
editing flow in TikTok » [S7] : c’est la remarque affichée dans les réglages
du compte et la note de fin du travail.

## 7. Limites et quotas

| Limite | Valeur | Source |
| --- | --- | --- |
| Publications directes | « typically around 15 posts per day/ creator account », variable selon le créateur, **partagée entre toutes les applications** | [S14] |
| Comptes actifs | plafond par application sur 24 heures (cinq sans audit) | [S14] |
| Brouillons en attente | cinq sur 24 heures | [S10] |
| Initialisation | 6 appels par minute et par jeton | [S9] [S10] |
| `creator_info` | 20 par minute et par jeton | [S8] |
| Statut | 30 par minute et par jeton | [S12] |
| User Info, liste des vidéos | 600 par minute (fenêtre glissante) | [S19] |
| Vidéo | MP4 (conseillé), WebM ou MOV ; H.264 (conseillé), H.265, VP8, VP9 ; 23 à 60 i/s ; côtés de 360 à 4 096 px ; 10 minutes au plus (moins pour certains comptes) ; 4 Go | [S11] |
| Texte (direct) | 2 200 unités UTF-16 | [S9] |

Le connecteur déclare au cœur un quota **par compte sur 24 heures
glissantes** : 15 publications directes et 5 brouillons. Le compte local ne
voit pas ce qui part d’ailleurs : un refus de TikTok
(`spam_risk_too_many_posts`, `spam_risk_too_many_pending_share`,
`reached_active_user_cap`, `rate_limit_exceeded`) met aussi le travail en
« attente du quota », avec une reprise automatique.

**Ce que produit Clip Studio** : MP4 H.264, ce que TikTok conseille. La
cadence n’est pas connue du cœur : TikTok la vérifie au traitement
(`frame_rate_check_failed`).

## 8. Gestion des publications et profil

| Action | Possible ? |
| --- | --- |
| Lister ses vidéos | Oui : `POST /v2/video/list/?fields=…`, corps `{ cursor, max_count }` (20 au plus), vidéos **publiques** seulement [S5]. Le connecteur lit cinq pages au plus. |
| Statistiques d’une vidéo | Oui, dans la liste (`view_count`, `like_count`, `comment_count`, `share_count`) [S5] |
| Modifier, changer la visibilité, supprimer | **Non** : aucune méthode documentée |
| Programmer | **Non** chez TikTok ; la file du cœur retarde l’envoi |
| Lire le profil | Oui : nom, photo (`user.info.basic`), pseudo, bio (`user.info.profile`) [S4] |
| Changer le profil (nom, pseudo, bio, photo) | **Non** : l’API « Display » ne fait que lire [S4] |

L’onglet Profil affiche donc chaque élément comme « à changer dans TikTok »,
avec le lien vers le profil, la bio de la marque à copier et la photo au
format avatar à télécharger. `cover_image_url` expire au bout de six heures
[S5] : la liste est relue plutôt que gardée.

## 9. Ce qui est impossible

- Publier directement sur un compte **public** sans audit (§ 1).
- Envoyer texte, visibilité ou interactions avec un **brouillon** : l’API
  ne prend que le fichier [S10].
- Modifier ou supprimer une vidéo, changer le profil (§ 8).
- Lister les brouillons ou les vidéos privées [S5].

## 10. Risques

- **Revue et audit** : la revue (pour `video.upload` en production) et
  l’audit (pour la publication directe publique) peuvent être refusés à un
  outil personnel ; l’exemple « A utility tool to help upload contents to
  the account(s) you or your team manages » est explicitement « Not
  acceptable » pour l’audit [S14]. Le bac à sable et ses dix comptes cibles
  restent la voie la plus sûre pour une instance personnelle, **sous
  réserve** qu’il accepte le brouillon (§ 1).
- **Mode Upload sans audit non documenté** : seule la pratique le
  confirmera (§ 1).
- **Plafond de publications variable** : « around 15 » et partagé avec les
  autres applications ; le compteur local peut laisser passer un envoi que
  TikTok refuse, d’où la reprise automatique.
- **Adresse d’envoi d’une heure** : un très gros fichier sur une liaison
  lente peut dépasser l’heure ; le connecteur repart alors d’une nouvelle
  initialisation, sans compter deux fois le quota.
- **Nommage incohérent** dans la documentation : `invalid_param` (pages de
  publication) contre `invalid_params` (page générale) [S9] [S20],
  `error.logid` contre `log_id` ; le connecteur lit les deux.
- **API d’identité en migration** : la page User Info annonce « There is a
  migration plan related to this API », sans détail [S4].

## 11. Ce que le connecteur demande au cœur

Réalisé avec le connecteur :

1. **Nom du paramètre de l’identifiant** : `oauth.clientIdParam`
   (`client_key`) à l’autorisation et à l’échange ; `app.envNames` pour des
   variables nommées `TIKTOK_CLIENT_KEY` et `TIKTOK_CLIENT_SECRET` ;
   `app.credentialLabels` pour afficher « Client key » et « Client secret »
   dans la configuration.
2. **Réglage d’application à cocher** : `AppSetting.kind = "toggle"`
   (« Application auditée par TikTok »), rangé « true » ou absent, remis au
   connecteur dans `appSettings`, et passé avec les portées du compte à
   `normalizeOptions(options, source, { appSettings, scopes })`.
3. **Formulaire lu à l’affichage** : `Connector.publishForm(context, { scopes,
   media })` rend un `LivePublishForm` (identité, champs, règles entre
   champs, remarques, déclarations, blocages, limites du compte) ; action
   `publishFormAction` ; `ConnectorInfo.livePublishForm`. L’écran Publier de
   Clip Studio l’appelle pour chaque compte coché, à chaque affichage, et
   bloque l’envoi pendant la lecture.
4. **Champs génériques** : choix sans valeur d’avance (`noDefault`) et exigé
   (`required`), case exigée (consentement), champ figé (`disabled`), champ
   conditionnel (`showWhen`, un champ masqué ne part pas et compte comme
   vide), règles entre champs (`PublishFieldRule`) ; rien ne change pour les
   autres services.
5. **Note de fin** : `PublishResult.note` gardée avec le travail fini et
   affichée ; une adresse vide (brouillon) masque le lien « Voir la
   publication ».

## Sources

Documentation officielle de TikTok, lue le 14/10/2026 (les adresses
`/doc/…` redirigent vers `/docs/en/…`).

- [S1] Login Kit for Web : <https://developers.tiktok.com/doc/login-kit-web>
- [S2] Manage User Access Tokens : <https://developers.tiktok.com/doc/oauth-user-access-token-management>
- [S3] Scopes : <https://developers.tiktok.com/doc/tiktok-api-scopes> et
  <https://developers.tiktok.com/doc/scopes-overview>
- [S4] Get User Info : <https://developers.tiktok.com/doc/tiktok-api-v2-get-user-info>
- [S5] List Videos et Video Object : <https://developers.tiktok.com/doc/tiktok-api-v2-video-list>,
  <https://developers.tiktok.com/doc/tiktok-api-v2-video-object>
- [S6] Content Posting API – Get Started (Direct Post) : <https://developers.tiktok.com/doc/content-posting-api-get-started>
- [S7] Content Posting API – Get Started (Upload) : <https://developers.tiktok.com/doc/content-posting-api-get-started-upload-content>
- [S8] Query Creator Info : <https://developers.tiktok.com/doc/content-posting-api-reference-query-creator-info>
- [S9] Direct Post : <https://developers.tiktok.com/doc/content-posting-api-reference-direct-post>
- [S10] Upload : <https://developers.tiktok.com/doc/content-posting-api-reference-upload-video>
- [S11] Media Transfer Guide : <https://developers.tiktok.com/doc/content-posting-api-media-transfer-guide>
- [S12] Get Post Status : <https://developers.tiktok.com/doc/content-posting-api-reference-get-video-status>
- [S13] Photo Post : <https://developers.tiktok.com/doc/content-posting-api-reference-photo-post>
- [S14] Content Sharing Guidelines : <https://developers.tiktok.com/doc/content-sharing-guidelines>
- [S15] Create an App : <https://developers.tiktok.com/doc/getting-started-create-an-app>
- [S16] App Review Guidelines : <https://developers.tiktok.com/doc/app-review-guidelines>
- [S17] Add a Sandbox : <https://developers.tiktok.com/doc/add-a-sandbox>
- [S18] Development configuration (vérification des adresses) : <https://developers.tiktok.com/doc/set-up-development-configuration>
- [S19] Rate Limits : <https://developers.tiktok.com/doc/tiktok-api-v2-rate-limit>
- [S20] Error Handling : <https://developers.tiktok.com/doc/tiktok-api-v2-error-handling>
- [S21] Login Kit for Desktop (PKCE) : <https://developers.tiktok.com/doc/login-kit-desktop>
