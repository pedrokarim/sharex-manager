# 07c – Le connecteur Threads

Dossier court du connecteur `threads` des comptes connectés (dossier 07,
§ 8). Il suit le modèle du connecteur YouTube (§ 8.4 à 8.8) et s’appuie sur
les extensions du cœur en cours de réalisation : jetons longue durée sans
jeton d’actualisation, liens publics temporaires vers un fichier, publication
d’un texte seul, limites déclarées par le connecteur. La connexion de
plusieurs comptes par autorisation ne sert pas ici : une autorisation Threads
désigne un seul profil.

Toute la documentation citée a été lue le 12/10/2026 ; le journal des
changements de l’API s’arrête au 12/08/2026 [S17]. Les numéros entre crochets
renvoient aux « Sources », en fin de dossier.

- **Identifiant** : `threads` (déjà inscrit `planned` dans
  `src/lib/connections/connectors/planned.ts`)
- **Nom d’un compte** : « profil », « profils »
- **Préfixe d’environnement** : `THREADS` (`THREADS_CLIENT_ID`,
  `THREADS_CLIENT_SECRET`)
- **Capacités** : `publish.text`, `publish.image`, `publish.video`,
  `posts.list`, `posts.manage` (suppression seulement)

## 1. Ce qui est faisable sans revue d’application

Meta n’exige l’App Review que pour les personnes **sans rôle** sur
l’application : « If your app will only be used by app users who have a role
on the app itself, App Review is not required » [S5]. Pour Threads, le rôle
qui compte est **Threads Tester** : les testeurs peuvent accorder toutes les
autorisations « at any time » [S2], et sans accès avancé à
`threads_content_publish` on ne publie que « for your account and your app’s
tester accounts » [S6].

Pour une instance personnelle, tout ce dossier fonctionne donc avec une
application restée en développement, **sans revue et sans publication de
l’application**, à condition que chaque profil connecté soit invité comme
Threads Tester et ait accepté l’invitation. La revue n’est nécessaire que pour
ouvrir la connexion à des profils extérieurs.

## 2. Préparer l’application Meta

Marche à suivre affichée dans la configuration du connecteur :

1. Ouvrir <https://developers.facebook.com/apps/creation/> avec un compte
   développeur Meta [S4]. Nom de l’application et adresse de contact.
2. Cas d’usage : **« Accéder à l’API Threads »** (*Access the Threads API*).
   Un cas d’usage ne peut plus être retiré une fois ajouté, et certains sont
   incompatibles entre eux (la connexion Facebook classique, par exemple) [S4] :
   créer une application dédiée à Threads, distincte de celle de Facebook et
   d’Instagram.
3. Portefeuille d’entreprise : « I don’t want to connect a business portfolio
   yet ». Il n’est demandé que pour accéder aux données de tiers [S4].
4. *Use cases › Customize* : `threads_basic` est présent d’office ; ajouter
   `threads_content_publish` et `threads_delete` [S3]. Rien d’autre.
5. *Settings* du cas d’usage : recopier le **Threads App ID** et le **Threads
   App secret**. L’application en a deux paires ; c’est celle de Threads qu’il
   faut, pas l’identifiant de l’application Meta [S2]. Dans *Valid OAuth
   Redirect URIs*, coller `<AUTH_URL>/api/connections/threads/callback`. Le
   tableau de bord ajoute parfois une barre oblique finale : vérifier que
   l’adresse enregistrée est identique, caractère pour caractère, à celle
   qu’affiche ShareX Manager [S7]. La même page demande une adresse de
   *Deauthorize callback* et de *Data Deletion Requests* [S3] (voir § 10).
6. *Add or Remove Threads Test Users*, puis *App roles › Roles › Add People ›
   Threads Tester* : saisir le nom du profil Threads à connecter [S2] [S3].
7. Sur Threads (site ou application), connecté au profil invité :
   *Paramètres › Compte › Autorisations des sites web* (*Website
   permissions*), accepter l’invitation [S2].
8. Renseigner l’identifiant et le secret dans l’environnement ou dans la page
   « Comptes connectés ».

L’application reste en mode développement. La publier n’est exigé que pour
ouvrir les autorisations aux personnes sans rôle [S2] et pour recevoir des
webhooks [S3] ; elle demanderait une icône, une politique de confidentialité,
une adresse de suppression des données et, pour un fournisseur technique, la
revue [S3]. Rien de cela ne sert à une instance personnelle.

## 3. Autorisation et jetons

| Étape | Appel |
| --- | --- |
| Fenêtre d’autorisation | `https://threads.com/oauth/authorize?client_id=…&redirect_uri=…&scope=…&response_type=code&state=…` [S7] |
| Échange du code | `POST https://graph.threads.com/oauth/access_token`, corps `client_id`, `client_secret`, `code`, `grant_type=authorization_code`, `redirect_uri` [S7] |
| Jeton longue durée | `GET https://graph.threads.net/access_token?grant_type=th_exchange_token&client_secret=…&access_token=<jeton court>` [S8] |
| Renouvellement | `GET https://graph.threads.net/refresh_access_token?grant_type=th_refresh_token&access_token=<jeton long>` [S8] |
| Portées accordées | `GET https://graph.threads.net/v1.0/debug_token?access_token=<jeton>&input_token=<jeton>` [S9] |

- **Paramètres** : `state` est accepté et rendu [S7]. La documentation ne
  mentionne pas PKCE : `pkce: false`. Les portées se séparent par une virgule
  ou par une espace encodée [S7] ; la jonction par espace du cœur convient.
- **Code** : valable une heure, utilisable une seule fois [S7]. Threads ajoute
  `#_` à l’adresse de retour [S7] ; le fragment ne parvient pas au serveur, il
  reste seulement dans la barre d’adresse jusqu’à la redirection vers
  « Comptes connectés ».
- **Refus** : retour avec `error=access_denied`, `error_reason=user_denied`
  [S7], déjà traité par le cœur.
- **Réponse de l’échange** : `access_token`, `token_type`, `user_id` [S7],
  **sans** `expires_in`, sans `scope` et sans jeton d’actualisation. Une erreur
  prend la forme `{ "error_type": "OAuthException", "code": 400,
  "error_message": "…" }` [S7], et non `{ "error": "…" }`.
- **Durées** : jeton court, une heure ; jeton long, 60 jours ; renouvelable
  s’il a **au moins 24 heures** et n’a pas expiré ; chaque renouvellement
  repart pour 60 jours ; un jeton non renouvelé en 60 jours est perdu [S2]
  [S8]. Les deux réponses longue durée rendent `expires_in` [S8].
- **Validité de l’accord** : les autorisations d’un profil public valent
  90 jours, prolongées de 90 jours à chaque renouvellement du jeton [S2]. Pour
  un profil privé, la page « Get Started » dit que l’accord ne peut pas être
  prolongé [S2], la page des jetons longue durée qu’il peut l’être désormais
  [S8]. Les deux pages se contredisent ; en pratique, un profil privé peut
  devoir se reconnecter tous les 90 jours, et l’interface le dit.
- **Portées accordées** : la réponse ne les donne pas ; `debug_token` les
  liste (`scopes`) avec `expires_at` et `data_access_expires_at` [S9]. Il exige
  le jeton d’un Threads Tester de la même application [S9], ce qu’est le
  profil connecté. À défaut, on retient les portées demandées.
- **Révocation** : aucun point d’accès documenté. La déconnexion efface le
  jeton chez nous et indique où retirer l’application sur Threads
  (*Paramètres › Compte › Autorisations des sites web*).
- **Hôtes** : `graph.threads.com` et `graph.threads.net` sont équivalents
  depuis le 06/06/2025 [S1] [S17]. On garde les adresses exactes de la
  documentation (ci-dessus) et `https://graph.threads.net/v1.0` pour le reste.
- **Second profil** : la fenêtre d’autorisation prend la session ouverte sur
  threads.com. Pour connecter un autre profil, s’y déconnecter ou changer de
  profil d’abord ; ce profil doit lui aussi être Threads Tester.

**Profil** (`fetchProfile`) : `GET /v1.0/me?fields=id,username,name,threads_profile_picture_url`
[S10]. `externalId` = `id`, `handle` = `@username`, `name` = `name` (à défaut
`username`), `avatarUrl` = `threads_profile_picture_url`, `url` =
`https://www.threads.com/@<username>`.

## 4. Portées et capacités

| Portée | Capacités |
| --- | --- |
| `threads_basic` (obligatoire, toujours accordée) | `posts.list` (`GET /me/threads`) [S11] |
| `threads_content_publish` | `publish.text`, `publish.image`, `publish.video` [S6] |
| `threads_delete` | `posts.manage`, réduit à la suppression [S12] |

Deux jeux proposés à la connexion :

- « Tout » : `threads_basic`, `threads_content_publish`, `threads_delete` ;
- « Publication seulement » : `threads_basic`, `threads_content_publish` ; la
  suppression reste grisée.

`threads_manage_replies` n’est jamais demandée à la connexion : elle
s’ajoute à la demande pour le premier commentaire, publié comme une
réponse à sa propre publication (`reply_to_id` ; dossier 07, § 8.9 ;
dossier 01 ter, § 6).

Non demandées : `threads_read_replies`,
`threads_manage_insights`, `threads_manage_mentions`,
`threads_keyword_search`, `threads_location_tagging`,
`threads_profile_discovery` [S3], `threads_share_to_instagram` [S17]. Le
réglage « qui peut répondre » (`reply_control`) se passe à la création du
conteneur [S13] [S25], mais la référence des autorisations le range sous
`threads_manage_replies` [S14] : on vérifiera à la réalisation s’il passe avec
la seule `threads_content_publish`, et le champ ne sera proposé que dans ce
cas.

## 5. Publication

Threads ne reçoit **jamais** le fichier : ses serveurs le téléchargent depuis
une adresse publique au moment de la création du conteneur [S2] [S6]. Toute
publication suit deux étapes [S6] :

1. **Conteneur** : `POST /v1.0/<user-id>/threads` avec `media_type` (`TEXT`,
   `IMAGE`, `VIDEO`), `text`, et `image_url` ou `video_url` ; la réponse donne
   l’identifiant du conteneur.
2. **Publication** : `POST /v1.0/<user-id>/threads_publish` avec
   `creation_id` ; la réponse donne l’identifiant de la publication.

Entre les deux, Meta recommande d’attendre en moyenne 30 secondes [S6] et
d’interroger `GET /v1.0/<conteneur>?fields=status,error_message` **une fois
par minute, cinq minutes au plus** [S15]. États : `IN_PROGRESS`, `FINISHED`
(prêt), `PUBLISHED`, `ERROR`, `EXPIRED` (non publié en 24 heures) [S15].

À l’inverse de YouTube, le traitement a lieu **avant** la publication : tout
se fait dans `publish()`, qui rend l’adresse définitive ; `checkProcessing`
n’est pas utilisé.

**Déroulé dans `publish()`**, l’état de reprise étant enregistré à chaque pas :

1. Vérifier le budget du jour (`threads_publishing_limit`, § 7).
2. Image ou vidéo : demander au cœur un lien public temporaire vers le fichier.
3. Créer le conteneur ; `resume = { containerId, createdAt }`.
4. Texte : interroger l’état tout de suite. Image ou vidéo : attendre
   30 secondes, puis interroger chaque minute, cinq minutes au plus (dix pour
   une vidéo proche de 1 Go, au-delà de la recommandation, avec un
   avertissement dans le journal).
5. `FINISHED` : retirer le lien public, puis publier ; `resume.published = true`
   avant de rendre la main.
6. Lire `GET /v1.0/<publication>?fields=permalink,shortcode` pour l’adresse.
   `permalink` est absent quand la publication contient un contenu protégé par
   le droit d’auteur [S11] : l’adresse du profil sert alors de secours, avec un
   avertissement.

**Reprise** (redémarrage, coupure, erreur 5xx) :

| État lu | Conduite |
| --- | --- |
| pas de `containerId` | repartir du début |
| `IN_PROGRESS` | reprendre l’attente (lien public renouvelé s’il a expiré) |
| `FINISHED` | publier |
| `PUBLISHED` | **ne pas republier** ; retrouver la publication dans `GET /me/threads` (la plus récente postérieure à `createdAt` dont le texte correspond), sinon terminer avec l’adresse du profil et un avertissement |
| `EXPIRED` | recréer le conteneur |
| `ERROR` | échec, avec `error_message` traduit (`FAILED_DOWNLOADING_VIDEO`, `INVALID_DURATION`, `INVALID_FRAME_RATE`, `INVALID_BIT_RATE`… [S15]) |

`threads_publish` n’est pas idempotent : après une coupure pendant cet appel,
on relit toujours l’état du conteneur avant de réessayer. La lecture d’un
conteneur ne rend que `id`, `status` et `error_message` [S13], d’où la
recherche par texte et par date.

`auto_publish_text` publie un texte dès la création du conteneur [S13] [S17] ;
on ne l’emploie pas, pour garder une seule logique de reprise.

## 6. Champs de publication

| Clé | Paramètre Threads | Forme | Source | Limite |
| --- | --- | --- | --- | --- |
| `text` | `text` | textarea, rôle `caption` | texte court de publication | 500 caractères, un émoji comptant pour son nombre d’octets UTF‑8 [S6] ; obligatoire pour un texte seul |
| `topicTag` | `topic_tag` | text | premier tag de la marque | 1 à 50 caractères, ni `.` ni `&` ; un seul sujet par publication [S6] |
| `linkAttachment` | `link_attachment` | text (texte seul) | – | adresse publique ; texte seul uniquement [S6] |
| `altText` | `alt_text` | textarea (image, vidéo) | – | 1 000 caractères [S13] ; sans effet sur un texte seul [S16] |
| `spoiler` | `is_spoiler_media` | toggle (image, vidéo) | faux | médias seulement [S18] |
| `replyControl` | `reply_control` | select | « tout le monde » | `everyone`, `accounts_you_follow`, `mentioned_only`, `followers_only` [S13] [S25] ; sous réserve (§ 4) |

- **Liens** : sans `link_attachment`, la première adresse d’un texte seul
  devient l’aperçu [S6]. **Cinq liens distincts au plus** : au-delà, la création
  échoue avec `THREADS_API__LINK_LIMIT_EXCEEDED` depuis le 22/12/2025 [S6]
  [S17]. `normalizeOptions` compte les adresses comme Meta (adresses uniques
  du texte, plus `link_attachment` s’il diffère) et refuse avant l’envoi.
- **Sujet** : le paramètre `topic_tag` est préféré ; le `#sujet` dans le texte
  n’est gardé que pour compatibilité [S6]. Un `#` suivi d’un nombre n’est pas
  un sujet [S6].
- **Mentions** : la documentation de publication ne décrit aucun paramètre de
  mention ; l’API des mentions sert à lire les publications où le profil est
  cité [S19]. Un « @nom » écrit dans le texte part tel quel ; sa transformation
  en mention n’est pas garantie.
- **Non proposés pour l’instant** : sondage (`poll_attachment`, texte seul,
  2 à 4 choix de 25 caractères [S20]), pièce jointe de texte long
  (`text_attachment`, 10 000 caractères, texte seul [S21]), publication
  éphémère (`is_ghost_post`, archivée après 24 heures [S22]), GIF (GIPHY
  seulement [S6]), limitation par pays, lieu, partage en story Instagram. Ils
  s’ajouteront en champs si le besoin vient.

## 7. Limites

| Limite | Valeur | Source |
| --- | --- | --- |
| Publications par l’API | **250 par profil sur 24 heures glissantes**, un carrousel comptant pour une | [S1] [S6] |
| Suppressions | 100 par profil sur 24 heures glissantes | [S1] [S12] |
| Appels | 4 800 × impressions du profil sur 24 heures, impressions comptées 10 au minimum (soit 48 000 appels au moins), par couple application-profil | [S1] |
| Texte | 500 caractères, émojis comptés en octets UTF‑8 | [S6] |
| Image | JPEG ou PNG, 8 Mo, rapport 10:1 au plus, largeur ramenée entre 320 et 1 440 px, sRGB | [S1] [S6] |
| Vidéo | MP4 ou MOV, *moov* en tête, sans liste d’édition ; H.264 ou HEVC, balayage progressif, GOP fermé, 4:2:0 ; AAC, 48 kHz au plus, mono ou stéréo ; 23 à 60 i/s ; 1 920 px de large au plus ; rapport entre 0,01:1 et 10:1, 9:16 recommandé ; 100 Mb/s au plus ; **5 minutes** et **1 Go** au plus | [S1] [S6] |
| Conteneur non publié | expire après 24 heures | [S15] |

`GET /v1.0/<user-id>/threads_publishing_limit?fields=quota_usage,config,delete_quota_usage,delete_config`
donne l’usage réel et la limite (`quota_total`, `quota_duration` en secondes)
[S1] [S15]. Ces limites appartiennent au **profil**, pas à l’application, et
courent sur une fenêtre glissante : le connecteur les déclare au cœur et lit
l’usage réel avant chaque publication ou suppression, plutôt que de tenir un
compte local qui ignorerait les publications faites depuis l’application
Threads. Budget épuisé : le travail passe en `waiting-quota`, nouvel essai
une heure plus tard.

**Ce que produit Clip Studio** : MP4 H.264 et AAC à 48 kHz par Mediabunny
(`modules/clip-studio/engine/export.ts`) ; avec une `BufferTarget`, Mediabunny
place les métadonnées en tête du fichier [S23], ce que Threads exige. Restent
à contrôler par `normalizeOptions` : durée de 5 minutes, largeur de 1 920 px,
cadence entre 23 et 60 i/s, poids de 1 Go. L’absence de liste d’édition dans
la sortie de Mediabunny est à vérifier sur un vrai fichier.

**Captures ShareX** : une capture PNG de plus de 8 Mo, un WebP ou un GIF ne
passent pas tels quels ; il faut une conversion en JPEG (§ 10).

## 8. Gestion

| Action | Appel |
| --- | --- |
| Lister | `GET /v1.0/me/threads?fields=id,media_type,media_url,permalink,text,timestamp,thumbnail_url,topic_tag,shortcode,alt_text,link_attachment_url&limit=100`, pagination par curseurs `paging.cursors.after` ; 25 par défaut, 100 au plus [S10] [S11] |
| Supprimer | `DELETE /v1.0/<publication>` → `{ "success": true, "deleted_id": "…" }`, après confirmation [S12] |

- La liste ne contient pas les réponses [S11]. Les republications
  (`REPOST_FACADE`) [S11] sont écartées : elles appartiennent à un autre
  profil.
- `PostSummary` : `title` = début de la première ligne du texte, `description`
  = texte, `tags` = `[topic_tag]`, `thumbnailUrl` = `thumbnail_url` (vidéo) ou
  `media_url` (image), `publishedAt` = `timestamp`, `privacy` = `public`
  (Threads n’a pas de visibilité par publication). Vues et mentions « J’aime »
  demanderaient `threads_manage_insights` : non affichées.
- Meta autorise l’affichage des publications d’un profil « solely to the
  person who created it » [S1] : la liste reste réservée aux administrateurs
  de l’instance, ce qui est déjà le cas de « Comptes connectés ».

## 9. Ce qui est impossible

- **Modifier** une publication (texte, sujet, médias) : aucun point d’accès
  [S13]. `posts.update` n’existe pas pour Threads.
- **Changer la visibilité** ou **programmer** : aucun paramètre de date ni de
  visibilité [S13]. Une programmation ne pourrait venir que de la file du
  cœur, qui retarderait la publication.
- **Envoyer le fichier** directement : seulement une adresse que Meta
  télécharge [S2].
- **Changer le profil** (avatar, nom, biographie) : la lecture seule existe
  [S10].
- **Révoquer** le jeton par l’API (§ 3).
- **Publier pour un profil non testeur** sans App Review et application
  publiée [S2] [S5].
- **Carrousel** (2 à 20 médias [S6]) : possible chez Threads, mais une
  publication du cœur ne porte qu’un fichier. À reprendre si le cœur accepte
  plusieurs sources.

## 10. Risques

- **Le robot de Meta doit atteindre le fichier.** `ascencia.re` passe par
  Cloudflare : une règle anti-robots, un défi ou une restriction géographique
  sur le chemin des liens temporaires ferait échouer la création
  (`FAILED_DOWNLOADING_VIDEO`). À tester dès la première publication réelle,
  et à exclure explicitement des protections si besoin (règle ciblée, jamais
  sur toute la zone).
- **Fenêtre d’exposition** : le fichier est public tant que le lien vit.
  Lien à jeton aléatoire, durée courte, retiré dès `FINISHED`, `ERROR` ou
  annulation.
- **Jeton perdu après 60 jours d’inactivité** : sans renouvellement planifié,
  un profil peu utilisé se déconnecte. Le renouvellement doit tourner même
  sans publication.
- **Accord limité à 90 jours** pour un profil privé, selon la page lue (§ 3).
- **Documentation contradictoire ou mouvante** : hôte `.com` ou `.net`,
  adresse d’autorisation passée de `threads.net` à `threads.com` dans la page
  actuelle, statut des profils privés. Les adresses sont rangées dans une
  seule table du connecteur.
- **Publication perdue en vol** : réponse de `threads_publish` coupée ; traité
  par la relecture de l’état (§ 5), mais l’adresse peut manquer.
- **Fédivers** : si le profil partage vers le fédivers, les publications
  admissibles faites par l’API y partent aussi [S6] [S24]. La
  documentation ne dit pas qu’une suppression y est propagée.
- **Adresses de désautorisation et de suppression des données** : demandées
  par la page *Settings* [S3], exigées pour publier l’application. Pour une
  application en développement, si le tableau de bord refuse d’enregistrer
  sans elles, deux routes minimales du cœur suffiront (`deauthorize` passe le
  compte en « à reconnecter », `data-deletion` répond avec un code de suivi).
  À constater lors de la première mise en place.

## 11. Ce que le connecteur demande au cœur

Acquis par l’extension en cours, utilisés tels quels :

1. **Jetons longue durée sans jeton d’actualisation** : le connecteur fournit
   l’échange court → long (`th_exchange_token`, juste après l’échange du code)
   et le renouvellement (`th_refresh_token`) ; le cœur renouvelle quand le
   jeton a plus de 24 heures et qu’il lui reste moins de 50 jours, à l’usage
   **et** par une tâche quotidienne, pour qu’un profil inactif ne perde pas
   son jeton. Un refus passe le compte en « à reconnecter ».
2. **Liens publics temporaires** : adresse HTTPS sous `AUTH_URL`, sans
   session, à jeton aléatoire, avec `Content-Type` et `Content-Length` exacts
   et prise en charge de `Range`, durée d’une heure renouvelable à la reprise,
   retirée par le connecteur.
3. **Publication d’un texte seul** : `enqueuePublish` sans fichier,
   `normalizeOptions` recevant une source absente.
4. **Limites déclarées** par profil, sur fenêtre glissante (250 publications,
   100 suppressions), avec lecture de l’usage réel par le connecteur.

Demandes propres à Threads, petites :

5. **Échange du code** : la réponse n’a ni `expires_in` ni `scope`, et ses
   erreurs portent `error_type` et `error_message`. Le cœur doit lire ces
   erreurs (ou laisser le connecteur les lire) et demander au connecteur les
   portées accordées (`debug_token`), avec repli sur les portées demandées.
6. **Pas de `revokeUrl`** : la déconnexion affiche où retirer l’application
   chez Threads (`app.disconnectHelp` ou équivalent).
7. **`posts.update` facultatif** : `posts.manage` se réduit ici à la
   suppression ; l’interface masque modification et visibilité quand le
   connecteur n’a pas `update`.
8. **Champs conditionnels** : un champ peut ne valoir que pour certains types
   de source (`kinds: ["text"]` pour `linkAttachment`, `["image", "video"]`
   pour `altText` et `spoiler`).
9. **Mesure du texte** : un mode de comptage où l’émoji vaut ses octets
   UTF‑8, partagé entre le navigateur (compteur) et le serveur (validation).
10. **Formats acceptés déclarés** (`image/jpeg`, `image/png`, 8 Mo ; MP4 ou
    MOV, 5 minutes, 1 Go, 1 920 px) : la fenêtre de publication écarte ou
    signale ce qui ne passe pas, et le cœur convertit une image trop lourde ou
    d’un autre format en JPEG avant de créer le lien.
11. **Rôle `topic`** pour préremplir le sujet depuis le premier tag de la
    marque (sinon, sans rôle et laissé vide).

## Sources

Documentation officielle de Meta, lue le 12/10/2026 (versions Markdown des
mêmes pages, suffixe `.md`).

- [S1] Overview (limites, hôtes, spécifications) :
  <https://developers.facebook.com/documentation/threads/overview>
- [S2] Get Started (application, autorisations, testeurs, durées) :
  <https://developers.facebook.com/documentation/threads/get-started>
- [S3] Customize the Threads API use case (autorisations du cas d’usage,
  réglages, rôles, publication) :
  <https://developers.facebook.com/documentation/development/create-an-app/threads-use-case>
- [S4] Create an App with Meta :
  <https://developers.facebook.com/documentation/development/create-an-app>
- [S5] App Review :
  <https://developers.facebook.com/documentation/resp-plat-initiatives/individual-processes/app-review>
- [S6] Threads Posts (conteneurs, carrousels, sujets, liens, GIF,
  spécifications) et Create Posts (accès sans revue, fédivers) :
  <https://developers.facebook.com/documentation/threads/posts>,
  <https://developers.facebook.com/documentation/threads/create-posts>
- [S7] Get Access Tokens :
  <https://developers.facebook.com/documentation/threads/get-started/get-access-tokens-and-permissions>
- [S8] Long-Lived Access Tokens :
  <https://developers.facebook.com/documentation/threads/get-started/long-lived-tokens>
- [S9] Debug Access Token :
  <https://developers.facebook.com/documentation/threads/troubleshooting/debug-access-token>
- [S10] Threads Profiles et référence User :
  <https://developers.facebook.com/documentation/threads/threads-profiles>,
  <https://developers.facebook.com/documentation/threads/reference/user>
- [S11] Retrieve User Posts :
  <https://developers.facebook.com/documentation/threads/retrieve-and-discover-posts/retrieve-posts>
- [S12] Delete Posts :
  <https://developers.facebook.com/documentation/threads/posts/delete-posts>
- [S13] Référence Publishing (paramètres de `POST /threads`, `threads_publish`,
  état d’un conteneur, `DELETE`) :
  <https://developers.facebook.com/documentation/threads/reference/publishing>
- [S14] Référence des autorisations (`threads_manage_replies`,
  `threads_delete`…) : <https://developers.facebook.com/docs/permissions>
- [S15] Troubleshooting (états d’un conteneur, `threads_publishing_limit`) :
  <https://developers.facebook.com/documentation/threads/troubleshooting>
- [S16] Accessibility (`alt_text`) :
  <https://developers.facebook.com/documentation/threads/posts/accessibility>
- [S17] Changelog (dernière entrée : 12/08/2026) :
  <https://developers.facebook.com/documentation/threads/changelog>
- [S18] Spoilers :
  <https://developers.facebook.com/documentation/threads/create-posts/spoilers>
- [S19] Mentions :
  <https://developers.facebook.com/documentation/threads/threads-mentions>
- [S20] Polls :
  <https://developers.facebook.com/documentation/threads/create-posts/polls>
- [S21] Text Attachments :
  <https://developers.facebook.com/documentation/threads/create-posts/text-attachments>
- [S22] Ghost Posts :
  <https://developers.facebook.com/documentation/threads/create-posts/ghost-posts>
- [S23] Mediabunny, Output formats (`fastStart`) :
  <https://mediabunny.dev/guide/output-formats>
- [S24] Partage vers le fédivers (aide Instagram, citée par [S6]) :
  <https://help.instagram.com/760878905943039>
- [S25] Reply Management (`reply_control`) :
  <https://developers.facebook.com/documentation/threads/reply-management>
- Index de la documentation Threads :
  <https://developers.facebook.com/documentation/threads/llms.txt>
