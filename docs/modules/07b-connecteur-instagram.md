# 07b – Connecteur Instagram

Dossier court du connecteur `instagram` des comptes connectés (dossier 07,
§ 8). Il publie des Reels et des images sur un **compte professionnel**
Instagram (créateur ou entreprise) et liste ses publications. Il s’appuie sur
le cœur tel que l’étend le chantier en cours : plusieurs comptes par
autorisation, jetons longue durée sans jeton d’actualisation, liens publics
temporaires vers un fichier, publication de messages, limites déclarées par
connecteur.

- **Identifiant** : `instagram` (déjà inscrit `planned` dans
  `connectors/planned.ts`)
- **Logo** : entrée `instagram` de `BrandLogo` (logo officiel)
- **Compte** : « compte » / « comptes »
- **Préfixe d’environnement** : `INSTAGRAM` (`INSTAGRAM_CLIENT_ID`,
  `INSTAGRAM_CLIENT_SECRET`)
- **Documentation vérifiée le 12/10/2026** sur les pages officielles de Meta
  (liste en fin de dossier, numéros entre crochets). Version de l’API citée
  par ces pages : v25.0 [14][18].

En bref :

- voie retenue : **Instagram API with Instagram Login** (Business Login for
  Instagram), sans Page Facebook ;
- aucune revue d’application nécessaire pour le compte du propriétaire de
  l’instance (accès standard) ;
- Instagram **va chercher** le fichier à une adresse publique : pas d’envoi
  direct depuis le serveur dans cette voie, d’où le besoin d’un lien public
  temporaire ;
- ni suppression ni modification de légende par l’API dans cette voie ;
- 50 publications par 24 heures glissantes et par compte, lues à l’exécution.

## 1. Quelle voie choisir

Meta propose deux configurations de l’API Instagram [1] :

| | Instagram API with Instagram Login | Instagram API with Facebook Login |
| --- | --- | --- |
| Connexion | identifiants Instagram (Business Login for Instagram) | identifiants Facebook (Facebook Login for Business) |
| Page Facebook liée | **non** | obligatoire, avec les tâches voulues sur la Page [23] |
| Hôte | `graph.instagram.com` | `graph.facebook.com` (+ `rupload.facebook.com`) |
| Jeton | Instagram User, 60 jours, renouvelable | Facebook User ou Page |
| Autorisations pour publier | `instagram_business_basic`, `instagram_business_content_publish` | `instagram_basic`, `instagram_content_publish`, `pages_read_engagement` (+ `ads_management`, `ads_read` selon le rôle) |
| Publication (images, Reels, carrousels, stories) | oui | oui |
| Envoi reprenable d’un fichier local (`rupload`) | **non** | oui |
| Suppression d’une publication | **non** | oui (`instagram_manage_contents`) |
| Recherche de hashtags, identification de produits, partenariats | non | oui |

Sources : [1] pour les deux premiers blocs, [12] et [13] pour l’envoi
reprenable (« Only for apps that have implemented Facebook Login for
Business »), [18] pour la suppression (« This api only supports Instagram API
with Facebook login only »), [1] et [12] pour le reste.

**Recommandation pour un créateur seul : Instagram Login.**

- Pas de Page Facebook à créer ni à lier, pas de tâches de Page à vérifier :
  Meta décrit lui-même le passage de « 12 étapes en moyenne » à deux pour
  cette voie [5].
- Deux autorisations suffisent pour publier [12], là où Facebook Login en
  demande trois ou cinq selon le rôle du compte dans le Business Manager.
- Le cas « mon application ne sert que des comptes que je possède ou gère »
  relève de l’accès standard, **sans revue d’application**, dans les deux
  voies [8] : la voie Facebook n’apporte donc rien de ce côté.
- Le seul manque gênant est l’envoi direct du fichier. Il est comblé par le
  lien public temporaire que le cœur prépare de toute façon (§ 12).

**Quand revenir sur ce choix** : si Karim veut supprimer une publication
depuis ShareX Manager, ou s’il refuse d’exposer un fichier même quelques
minutes. Il faudrait alors une Page Facebook liée au compte, Facebook Login
for Business, et une **seconde application Meta** : une application ne porte
qu’une des deux configurations [8][9].

## 2. Préparer l’application Meta

Marche à suivre affichée dans la configuration du connecteur (`setupSteps`),
d’après [9] et [3] :

1. Avoir un compte Instagram **professionnel** (créateur ou entreprise) : un
   compte personnel n’est pas servi par l’API [1][18]. Le passage se fait dans
   l’application Instagram.
2. Se déclarer développeur Meta et créer une application de type
   **Business** : une application d’un autre type ne convient pas [4][5].
3. Ajouter le cas d’usage « Manage messaging and content on Instagram », puis
   choisir **API setup with Instagram Login** [9]. La page affiche
   l’**Instagram app ID** et l’**Instagram app secret** : ce sont eux, et non
   l’identifiant de l’application Meta, qui servent de `client_id` et de
   secret [1][3].
4. Dans « Generate access tokens », **ajouter le compte Instagram** du
   propriétaire (« Add account », connexion à Instagram) [9]. C’est ce qui
   place le compte dans le périmètre de l’accès standard : « Standard Access
   if your app serves Instagram professional accounts you own or manage and
   have added to your app in the App Dashboard » [3].
5. « Set up Instagram business login » : ajouter l’URI de redirection
   `<AUTH_URL>/api/connections/instagram/callback`, puis vérifier dans
   « Business login settings » qu’aucune barre oblique finale n’a été
   ajoutée : l’URI doit correspondre exactement [3]. Les champs
   « Deauthorization callback URL » et « Data deletion request URL » se
   remplissent au même endroit [9] (voir § 12).
6. Renseigner l’identifiant et le secret dans l’environnement
   (`INSTAGRAM_CLIENT_ID`, `INSTAGRAM_CLIENT_SECRET`) ou dans la page
   « Comptes connectés ».
7. Ne **pas** demander de revue : elle n’est exigée que pour servir des
   comptes qu’on ne possède pas (fournisseur technique) [8][9]. Les webhooks
   ne sont pas utilisés, l’application n’a donc pas besoin d’être publiée
   pour eux [9].

**Mode développement.** Une application neuve est en mode développement ;
elle ne peut alors demander des autorisations qu’aux personnes qui ont un rôle
sur elle [10]. Le propriétaire est administrateur, rôle qui peut accorder toute
autorisation en développement [11], et son compte Instagram est
ajouté à l’étape 4 : la connexion fonctionne sans quitter ce mode. Meta
précise toutefois que les données créées en mode développement, « such as
test posts », ne sont visibles que des personnes ayant un rôle [10]. La page
ne dit pas si cela vaut pour une publication Instagram : c’est le premier
point à vérifier en réel (§ 11).

## 3. Autorisation et jetons

### 3.1 Demande d’autorisation

`GET https://www.instagram.com/oauth/authorize` [3] :

| Paramètre | Valeur |
| --- | --- |
| `client_id` | Instagram app ID |
| `redirect_uri` | `<AUTH_URL>/api/connections/instagram/callback` |
| `response_type` | `code` |
| `scope` | liste séparée par des virgules ou par des espaces encodées |
| `state` | jeton anti-CSRF du cœur, rendu tel quel |
| `force_reauth` | `true` : force la saisie des identifiants même si une session Instagram est ouverte [3] ; Meta le recommande [20] |

- **PKCE** : la page ne le mentionne pas [3]. Le connecteur déclare
  `pkce: false` et s’appuie sur `state` et le cookie signé du cœur.
- `enable_fb_login` (par défaut `true`) affiche ou masque l’option « se
  connecter avec Facebook » [3]. Le journal des modifications l’a d’abord
  annoncé déprécié (14/06/2025), puis de nouveau pris en charge
  (06/02/2026) [20] : on ne l’envoie pas.
- Refus de l’utilisateur : retour avec `error=access_denied`,
  `error_reason=user_denied` [3], déjà traité par le cœur.
- Le code arrive suivi de `#_`, qui ne fait pas partie du code [3]. Le
  fragment n’atteint pas le serveur, rien à faire côté route.
- Les anciennes valeurs `business_basic`, `business_content_publish`… sont
  dépréciées depuis le 27/01/2025 [2][3] : seules les valeurs
  `instagram_business_*` sont employées.

### 3.2 Échange du code

`POST https://api.instagram.com/oauth/access_token`, corps en formulaire :
`client_id`, `client_secret`, `grant_type=authorization_code`,
`redirect_uri`, `code` [3]. Le code vaut **une heure** et ne sert qu’une
fois [3].

La réponse **n’est pas** celle d’OAuth 2.0 classique, ce qui interdit de
réutiliser tel quel `tokenRequest` du cœur [3] :

```json
{
  "data": [
    {
      "access_token": "EAACEdEose0...",
      "user_id": "1020...",
      "permissions": "instagram_business_basic,instagram_business_content_publish"
    }
  ]
}
```

- les portées accordées sont dans `permissions` (chaîne séparée par des
  virgules), pas dans `scope` ;
- en cas d’erreur, le corps est `{ "error_type", "code", "error_message" }` [3],
  pas `{ "error" }` ;
- le connecteur accepte aussi une réponse « à plat » (`access_token` à la
  racine) : la documentation montre la forme en tableau, mais c’est un point
  de format à ne pas laisser casser la connexion.

Le jeton obtenu est **court** : une heure [1][3].

### 3.3 Jeton longue durée

Immédiatement après, côté serveur seulement (le secret y figure) [3][6] :

```
GET https://graph.instagram.com/access_token
  ?grant_type=ig_exchange_token
  &client_secret=<INSTAGRAM_APP_SECRET>
  &access_token=<SHORT_LIVED_TOKEN>
```

Réponse : `access_token`, `token_type: "bearer"`, `expires_in` en secondes,
de l’ordre de 60 jours (5 183 944 dans l’exemple) [3][6]. C’est ce jeton que
le cœur chiffre et range. Il n’y a **pas de jeton d’actualisation** : le
jeton longue durée se renouvelle lui-même.

### 3.4 Renouvellement

```
GET https://graph.instagram.com/refresh_access_token
  ?grant_type=ig_refresh_token
  &access_token=<LONG_LIVED_TOKEN>
```

Conditions, toutes trois nécessaires [3][7] :

- le jeton a **au moins 24 heures** ;
- il n’a **pas expiré** ;
- le compte a accordé `instagram_business_basic`.

Le nouveau jeton vaut 60 jours à partir du renouvellement [7]. « Tokens that
have not been refreshed in 60 days will expire and can no longer be
refreshed » [3] : un jeton expiré oblige à reconnecter le compte.

**Conséquence pour le cœur** : la règle actuelle de `getAccessToken`
(renouveler une minute avant l’expiration) ne convient pas. Un compte qui ne
publie pas pendant deux mois serait perdu, et une panne du serveur au mauvais
moment aussi. Stratégie retenue :

- ranger l’instant d’émission (`issuedAt`) avec le jeton ;
- **renouvellement planifié** : une passe quotidienne (au démarrage puis toutes
  les 24 heures) renouvelle tout jeton émis depuis plus de 24 heures et dont
  il reste moins de **30 jours** ; un renouvellement a donc lieu environ une
  fois par mois, et l’instance peut rester arrêtée un mois sans perdre le
  compte ;
- **renouvellement à l’usage** : même règle avant une publication ;
- échec du renouvellement avec un jeton invalide (code 190 de la Graph API,
  « Le token d’accès a expiré » [21]) ou jeton déjà expiré : compte « à
  reconnecter ».

### 3.5 Déconnexion

Aucune adresse de révocation n’est documentée pour cette voie (les pages
[3], [6] et [7] ne citent que `authorize`, `access_token` et
`refresh_access_token`). La déconnexion efface le compte et ses jetons dans
ShareX Manager, puis la page indique de retirer l’application dans les
réglages Instagram (applications et sites web). `oauth.revokeUrl` reste
absent.

### 3.6 Identité du compte et plusieurs comptes

`fetchProfile` : `GET https://graph.instagram.com/v25.0/me` avec
`fields=user_id,username,name,account_type,profile_picture_url,followers_count,media_count` [4].

| Champ Instagram | `AccountProfile` |
| --- | --- |
| `user_id` (identifiant du compte professionnel, `<IG_ID>`) | `externalId` |
| `name`, à défaut `username` | `name` |
| `username` | `handle` (« @… ») |
| `profile_picture_url` | `avatarUrl` |
| `https://www.instagram.com/<username>/` | `url` |

- `id` est l’identifiant propre à l’application ; c’est `user_id` qui désigne
  le compte et sert dans `/<IG_ID>/media` [4].
- `account_type` vaut `Business` ou `Media_Creator` [4] : affiché dans la
  fiche, sans autre effet.
- Les identifiants Instagram dépassent la précision des nombres JavaScript
  (17 chiffres dans les exemples [17][18]). Ils sont **toujours lus comme
  chaînes** : on prend `user_id` dans `/me`, où la documentation le rend en
  chaîne [4], et non le `user_id` de l’échange du code.
- `profile_picture_url` est une adresse de CDN ; elle est rafraîchie à chaque
  vérification du compte plutôt que tenue pour durable.
- **Une autorisation = un compte.** Le jeton Instagram User désigne un seul
  compte professionnel [1][3] : la capacité « plusieurs comptes par
  autorisation » du cœur ne sert pas ici. Pour un second compte, on
  reconnecte ; `force_reauth=true` évite de retomber sur la session ouverte.

## 4. Portées et capacités

| Portée | Capacités |
| --- | --- |
| `instagram_business_basic` | `posts.list` |
| `instagram_business_content_publish` | `publish.video` (Reels), `publish.image` |

`instagram_business_basic` est exigée pour tout appel et pour le
renouvellement [3][7] ; `instagram_business_content_publish` pour les
conteneurs, la publication et la lecture des limites [12][16][17].
`instagram_business_manage_comments` ne permet que d’activer ou couper les
commentaires d’une publication [18] et `instagram_business_manage_messages`
la messagerie [1] : ni l’une ni l’autre n’est demandée.

Deux jeux proposés à la connexion :

| Jeu | Portées | Effet |
| --- | --- | --- |
| « Publier » (`publish`) | `instagram_business_basic`, `instagram_business_content_publish` | publication et liste |
| « Lecture seule » (`read`) | `instagram_business_basic` | liste seulement ; la publication reste grisée |

Ni `posts.manage`, ni `profile.banner`, ni `profile.watermark` (§ 10).

Attention au nom : la valeur de portée est `instagram_business_content_publish`
[3], mais la page de revue nomme la même autorisation
`instagram_business_content_publishing` [8]. Le connecteur n’envoie que la
première.

## 5. Publier un Reel

### 5.1 Principe

La publication passe par un **conteneur** : on le crée en donnant l’adresse
du fichier, Meta va chercher la vidéo et la traite, puis on publie le
conteneur [12]. « We cURL media used in publishing attempts, so the media must
be hosted on a publicly accessible server at the time of the attempt » [12].
L’envoi reprenable vers `rupload.facebook.com`, qui accepterait un fichier
local, est réservé à Facebook Login [12][13]. Dans la voie retenue, la vidéo
est donc servie par un **lien public temporaire** du cœur.

Tous les appels vont à `https://graph.instagram.com/v25.0/`, jeton en en-tête
`Authorization: Bearer` [12]. La version est rangée dans une constante.

### 5.2 Étapes et état de reprise

Le travail garde dans `resume` : `step`, `linkId` (et `coverLinkId`),
`containerId`, `containerCreatedAt`, `mediaId`, `attempts`.

1. **Vérifier la limite** :
   `GET /<IG_ID>/content_publishing_limit?fields=quota_usage,config` [17].
   Si `quota_usage >= config.quota_total`, le travail passe en
   `waiting-quota` (§ 8) sans créer de conteneur.
2. **Ouvrir le lien public** du fichier exporté (et de la couverture si une
   image de couverture est choisie) ; `step: "link"`.
3. **Créer le conteneur** : `POST /<IG_ID>/media` [14] avec
   - `media_type=REELS`, `video_url=<lien>` ;
   - `caption` (§ 7) ;
   - `share_to_feed` : le Reel apparaît aussi dans le fil ; Meta prévient
     qu’aucune valeur ne garantit l’apparition dans l’onglet Reels [14] ;
   - `cover_url` (JPEG public) **ou** `thumb_offset` en millisecondes, valeur
     par défaut 0 ; si les deux sont donnés, `cover_url` l’emporte [14] ;
   - `is_ai_generated=true` si le clip le déclare [12][20] ;
   - `trial_params={"graduation_strategy":"MANUAL"|"SS_PERFORMANCE"}` pour un
     Reel d’essai, montré d’abord aux non-abonnés [12][14].

   La réponse rend `id`, rangé dans `containerId` avec l’heure ;
   `step: "container"`, état `uploading`.
4. **Attendre le traitement** (§ 5.3) ; `step: "processing"`, état
   `processing`.
5. **Publier** : `step: "publishing"` est enregistré **avant** l’appel, puis
   `POST /<IG_ID>/media_publish` avec `creation_id=<containerId>` [12][15].
   La réponse rend l’identifiant du média, rangé dans `mediaId`.
6. **Lire l’adresse** : `GET /<mediaId>?fields=permalink,shortcode` [18] ;
   `permalink` devient `result.url`, `mediaId` `result.externalId`.
7. **Fermer le lien public** sans attendre son expiration, et
   `checkProcessing` répond `done` : une fois publié, le média n’a plus de
   traitement à suivre.

La progression en octets n’est pas connue de l’API : c’est le serveur du lien
public qui la mesure (§ 12), et `saveProgress` la reçoit de lui.

### 5.3 Attente du traitement

`GET /<containerId>?fields=status_code,status` [16] :

| `status_code` | Conduite |
| --- | --- |
| `IN_PROGRESS` | attendre |
| `FINISHED` | publier (étape 5) |
| `PUBLISHED` | déjà publié : retrouver le média (§ 5.4) |
| `ERROR` | lire `status`, qui porte le sous-code d’erreur [16], puis § 5.5 |
| `EXPIRED` | non publié dans les 24 heures [12][16] : recréer le conteneur |

Meta recommande une interrogation **par minute, pendant cinq minutes au
plus** [12]. Le connecteur s’y tient pour les cinq premières minutes
(première vérification à 30 secondes), puis espace à une vérification toutes
les cinq minutes jusqu’à une heure, pour les longs Reels. Au-delà, le travail
échoue avec « traitement anormalement long » mais garde `containerId` : le
conteneur vit 24 heures [14], « Réessayer » reprend l’attente sans recréer.

Chaque appel compte dans la limite d’appels de l’API (§ 8) : pas
d’interrogation plus serrée.

### 5.4 Reprise après une coupure ou un redémarrage

Au redémarrage (`src/instrumentation.ts`), un travail reprend selon `step` :

| `step` enregistré | Reprise |
| --- | --- |
| absent ou `link` | repartir de l’étape 1 |
| `container` ou `processing`, conteneur de moins de 24 heures | rouvrir le lien s’il a été fermé, reprendre l’attente (§ 5.3) |
| `container` ou `processing`, conteneur expiré | nouveau lien, nouveau conteneur |
| `publishing` sans `mediaId` | lire `status_code` : `FINISHED`, publier ; `PUBLISHED`, retrouver le média ; jamais de second `media_publish` sans cette lecture |
| `publishing` avec `mediaId` | reprendre à l’étape 6 |

**Retrouver le média d’un conteneur publié** : l’API ne relie pas le conteneur
au média. On lit `GET /<IG_ID>/media?fields=id,timestamp,caption,permalink&limit=5`
[4][14] et on retient le média dont `timestamp` suit `containerCreatedAt` et
dont la légende correspond. À défaut, le travail passe `done` avec un
avertissement « publié, adresse introuvable » plutôt que de republier.

### 5.5 Erreurs et conduite

D’après [19] sauf mention :

| Code / sous-code | Sens | Conduite |
| --- | --- | --- |
| `9` / `2207042` | limite de publication atteinte | `waiting-quota` jusqu’à libération de la fenêtre (§ 8) |
| `9004` / `2207052` | le média n’a pas pu être téléchargé | vérifier le lien public (journal des accès) ; un nouvel essai, puis échec expliqué |
| `-2` / `2207003` | téléchargement trop long | un nouvel essai avec un nouveau conteneur |
| `-1` / `2207001`, `2207032`, `2207053` | erreur serveur, création ou envoi échoué | nouveau conteneur, deux essais au plus, attente exponentielle |
| `9007` / `2207027` | média pas encore prêt | retour à l’attente (§ 5.3) |
| `24` / `2207008` | conteneur introuvable ou expiré, souvent passager | un ou deux essais entre 30 secondes et 2 minutes, puis nouveau conteneur |
| `352` / `2207026` | format vidéo refusé | échec, message sur les spécifications (§ 8) |
| `1` / `2207057` | `thumb_offset` hors de la durée | échec ; ne devrait pas arriver, `normalizeOptions` borne la valeur |
| `36004` / `2207010`, `100` / `2207040` | légende trop longue, trop de mentions | échec ; ne devrait pas arriver après `normalizeOptions` |
| `4` / `2207051` | activité suspectée de spam | échec **sans nouvel essai** automatique |
| `25` / `2207050` | compte restreint | échec ; ouvrir l’application Instagram |
| `190` | jeton expiré ou invalide [21] | compte « à reconnecter » |
| `4`, `17` sans sous-code | trop d’appels [21] | attente puis nouvel essai |

## 6. Publier une image

Même déroulé que le Reel, avec `image_url=<lien>` et sans `media_type` [12][14].
Les images ne sont pas traitées longuement, mais l’état est quand même lu
avant `media_publish`.

**Le fichier doit être converti** : seul le JPEG est accepté (ni PNG, ni MPO,
ni JPS), 8 Mio au plus, rapport largeur sur hauteur entre **4:5 et 1,91:1**,
largeur ramenée entre 320 et 1 440 pixels, espace sRGB [12][14]. Une capture
ShareX est presque toujours un PNG, souvent hors de ce rapport.

- Conversion avec `sharp` (déjà dans les dépendances) : JPEG qualité 90,
  sRGB, largeur limitée à 1 440, fichier dérivé dans un dossier temporaire du
  cœur, servi par le lien public puis supprimé.
- Rapport hors limites : la fenêtre propose « Ajuster » (bandes de la couleur
  de fond de la marque, ou blanc) ; sans ce choix, `normalizeOptions` refuse
  avec le rapport mesuré et l’intervalle accepté. On ne recadre jamais en
  silence.
- `alt_text` : 1 000 caractères au plus, images seulement [14].

**Carrousel** : de 2 à 10 images ou vidéos, recadrées sur le rapport de la
première, une légende sur le conteneur parent seulement, un carrousel compte
pour une publication [12][14][19]. `PublishSource` ne désigne qu’un fichier :
le carrousel attend une source multiple dans le cœur (§ 12) et n’est pas dans
la première version.

**Story** : `media_type=STORIES`, image ou vidéo de 60 secondes et 100 Mo au
plus, sans légende ni autocollants [14]. Possible plus tard comme simple choix
« Format » ; hors première version.

## 7. Champs de publication

`publishFields` du connecteur, préremplis par la marque :

| Clé | Type | Libellé | Rôle | Limites et effet |
| --- | --- | --- | --- | --- |
| `caption` | `textarea` | Légende | `description` | 2 200 caractères, 30 hashtags, 20 mentions [14][19] ; reçoit le modèle de description de la marque, crédits musicaux compris |
| `hashtags` | `tags` | Hashtags | `tags` | ajoutés en fin de légende sous la forme `#mot`, comptés dans les 2 200 caractères et les 30 hashtags |
| `shareToFeed` | `toggle` | Afficher aussi dans le fil | – | Reels seulement ; vrai par défaut |
| `cover` | `select` | Couverture | – | Reels : « Première image » (`thumb_offset=0`), « Image du milieu », « Image à 1 s de la fin », et « Couverture du clip » quand Clip Studio fournit une image (→ `cover_url`) |
| `trial` | `select` | Diffusion | – | Reels : « Normale », « Essai, validation à la main » (`MANUAL`), « Essai, validation automatique » (`SS_PERFORMANCE`) [12] |
| `altText` | `text` | Texte alternatif | – | images seulement, 1 000 caractères [14] |
| `aiGenerated` | `toggle` | Contenu généré par IA | `syntheticMedia` | `is_ai_generated` ; même règle de précochage que pour YouTube |

`normalizeOptions(options, source)` :

- assemble la légende finale (texte puis hashtags), compte les `#` et les `@`
  et refuse au-delà de 30 et 20 avec un message qui donne le compte ;
  coupe à 2 200 caractères **avant** les hashtags si besoin, jamais au milieu
  d’un hashtag ; les fonctions de troncature de `templates.ts` servent ;
- calcule `thumb_offset` à partir de `source.durationMs`, toujours dans
  `[0, durée[` ;
- refuse une vidéo hors de 3 secondes à 15 minutes ou de plus de 300 Mo, une
  image de plus de 8 Mio après conversion (§ 8) ;
- ignore les champs qui ne s’appliquent pas au type de la source (`altText`
  pour une vidéo, `shareToFeed`, `cover` et `trial` pour une image).

Pas de titre, pas de visibilité ni de programmation dans l’API : une
publication est publique dès `media_publish`, et la création de conteneur
n’a aucun paramètre de date [14]. Si le cœur programme une publication, la
file attend l’heure prévue **avant** de créer le conteneur, qui expirerait
sinon au bout de 24 heures [14].

Pas de `location_id` (il faut chercher une Page de lieu dans l’API des Pages
Facebook [14]), ni de `user_tags`, `collaborators` ou `audio_name` dans la
première version : peu utiles à un clip, et `collaborators` est marqué
« Facebook Login for Business only » dans [1] alors que [14] ne le restreint
pas.

`shortForm` : Instagram publie toute vidéo isolée en Reel. Pour une
publication seule, `media_type` vaut `REELS` ou `STORIES` ; `VIDEO` ne sert
plus qu’aux éléments de carrousel [13][14].

- `maxSeconds` : 900 ;
- vertical : « Publié en Reel ; le 9:16 évite recadrage et bandes. » ;
- horizontal : « Publié en Reel quand même, avec des bandes : préférez un
  export vertical. »

## 8. Limites

| Limite | Valeur | Source |
| --- | --- | --- |
| Publications par compte | **50** sur 24 heures glissantes (un carrousel compte pour une) | [15][17] ; [12] annonce aussi 100 |
| Conteneurs créés par compte | 400 sur 24 heures glissantes | [14] |
| Durée de vie d’un conteneur | 24 heures | [14][16] |
| Appels à l’API | 4 800 × nombre d’impressions du compte sur 24 heures glissantes, par couple application et compte | [1] |
| Reel : conteneur | MP4 ou MOV, sans liste d’édition, atome `moov` en tête | [14] |
| Reel : vidéo | H.264 ou HEVC, balayage progressif, GOP fermé, 4:2:0, 23 à 60 images/s, 1 920 colonnes au plus, débit variable de 25 Mb/s au plus | [14] |
| Reel : son | AAC, 48 kHz au plus, mono ou stéréo, 128 kb/s | [14] |
| Reel : format | rapport de 0,01:1 à 10:1, 9:16 recommandé | [14] |
| Reel : durée et poids | 3 secondes à 15 minutes, 300 Mo | [14] |
| Couverture de Reel | JPEG, 8 Mo, sRGB, recadrée au centre en 9:16 (et en 1:1 dans le fil) | [14] |
| Image | JPEG, 8 Mio, 4:5 à 1,91:1, largeur 320 à 1 440, sRGB | [12][14][19] |
| Story vidéo | 3 à 60 secondes, 100 Mo | [14] |
| Légende | 2 200 caractères, 30 hashtags, 20 mentions | [14][19] |
| Carrousel | 2 à 10 éléments, sans Reel | [14][19] |
| Adresses de média | caractères ASCII seulement | [14] |

**Limite de publication.** Les pages se contredisent : 100 dans le guide de
publication [12], 50 dans la référence de `media_publish` [15], dans la
section carrousel du guide [12] et dans l’exemple de `content_publishing_limit`,
où `quota_total` est décrit comme « currently 50 » [17]. Le connecteur
**déclare 50** et lit la valeur réelle (`config.quota_total`,
`config.quota_duration`) avant chaque publication. La fenêtre est glissante et
propre au compte : elle ne se remet pas à zéro à heure fixe comme celle de
YouTube (§ 12). Les limites appartiennent au compte, pas à l’application.

**Clip Studio** : l’export est fait par Mediabunny, H.264 et AAC, ce qui
convient. Deux points à vérifier par un test sur un fichier exporté, avant la
première publication : l’atome `moov` en tête (option `fastStart` du format
MP4) et un débit sous 25 Mb/s en 1080 × 1920.

## 9. Gestion des publications

| Action | Appel |
| --- | --- |
| Lister | `GET /<IG_ID>/media?fields=id,caption,media_type,media_product_type,permalink,thumbnail_url,media_url,timestamp,like_count,comments_count` [4][14][18], pages par curseurs (`paging.cursors`) [4] ; les 10 000 médias les plus récents au plus, stories exclues [14] |
| Modifier la légende | **impossible** : `POST /<IG_MEDIA_ID>` ne fait qu’activer ou couper les commentaires [18] |
| Supprimer | **impossible** dans cette voie : `DELETE /<IG_MEDIA_ID>` n’existe qu’avec Facebook Login et `instagram_manage_contents` [18][20] |

Correspondance avec `PostSummary` : `title` = première ligne de la légende
(100 caractères), `description` = légende, `tags` = hashtags extraits,
`privacy` = `public`, `url` = `permalink`, `thumbnailUrl` = `thumbnail_url`
(vidéo) ou `media_url` (image), `publishedAt` = `timestamp`, `likes` et
`comments`. Pas de vues : `view_count` n’est rendu que par Business Discovery
[18].

La référence marque `caption`, `media_product_type` et quelques compteurs
« Available for Instagram API with Facebook Login only » [18]. La liste doit
donc tolérer leur absence : sans `media_product_type`, un Reel se montre comme
une vidéo. À constater au premier appel réel.

La fiche du compte propose, pour chaque publication, « Ouvrir sur Instagram »
(`permalink`) : c’est là qu’on modifie ou supprime.

## 10. Ce qui est impossible dans cette voie

- Envoyer le fichier directement : Instagram doit le télécharger à une
  adresse publique [12][13].
- Supprimer une publication, modifier sa légende [18].
- Programmer une publication côté Instagram [14] (la file de ShareX Manager
  peut attendre, § 7).
- Choisir une musique de la bibliothèque : l’Audio API est réservée à
  Facebook Login [20].
- Identifier des produits, poser le libellé de partenariat rémunéré,
  rechercher des hashtags [1][12].
- Publier un PNG, une image hors de 4:5 à 1,91:1, des filtres, des
  autocollants de story [12][14].
- Changer la photo de profil, une bannière ou un filigrane : rien dans l’API
  (pas de `profile.*`).
- Servir un compte personnel [1].

## 11. Risques

- **Visibilité en mode développement.** La règle générale de Meta rend les
  publications créées en mode développement visibles des seuls rôles [10].
  Vérification au premier Reel : l’ouvrir dans un navigateur sans session. Si
  la publication reste cachée, passer l’application en mode **Live** : pour un
  usage sur ses propres comptes, la revue n’est pas requise [8], mais la mise
  en ligne peut exiger des réglages de l’application, dont une politique de
  confidentialité qui explique la suppression des données [9][22].
- **Lien public bloqué en amont.** `ascencia.re` passe par Cloudflare : un
  défi anti-robot ou une règle de pare-feu sur le chemin des liens ferait
  échouer le téléchargement de Meta (`2207052`). Le chemin des liens doit être
  exempté de défi, et la première publication le vérifiera.
- **Lien mis en cache.** Une réponse mise en cache par Cloudflare survivrait à
  l’expiration du lien : `Cache-Control: no-store` obligatoire.
- **Limite d’appels pour un petit compte.** La limite d’appels est
  proportionnelle aux impressions du compte [1] ; un compte récent en a peu.
  D’où l’interrogation espacée (§ 5.3) et l’absence de rafraîchissement
  automatique de la liste.
- **Jeton perdu après 60 jours** d’inactivité de l’instance [3] : la passe
  quotidienne de renouvellement et une alerte dans la fiche du compte à
  15 jours de l’échéance.
- **Documentation mouvante et contradictoire** : limite de 50 ou 100, champs
  réservés à Facebook Login sans cohérence d’une page à l’autre,
  `enable_fb_login` déprécié puis rétabli [12][15][17][20]. Les valeurs
  sensibles sont lues à l’exécution (`content_publishing_limit`) ou rangées
  dans une seule table.
- **Erreur « spam »** (`2207051`) en cas de publications rapprochées [19] :
  pas de nouvel essai automatique, et pas de publication en rafale depuis la
  file (un envoi à la fois, déjà la règle du cœur).
- **Droits d’auteur** : un Reel avec une musique protégée peut être muet ou
  bloqué dans certains pays ; `copyright_check_information` le dit après
  publication [18]. Lecture facultative en fin de travail, rendue en
  avertissement.

## 12. Ce que le connecteur demande au cœur

1. **Lien public temporaire vers un fichier**
   - adresse HTTPS publique sous `AUTH_URL`, sans session ni cookie, jeton
     aléatoire d’au moins 128 bits **dans le chemin**, caractères ASCII
     seulement [14], terminée par l’extension du fichier (`.mp4`, `.jpg`) ;
   - `GET` et `HEAD`, `Content-Type` exact (`video/mp4`, `image/jpeg`),
     `Content-Length`, requêtes `Range` acceptées, lecture en flux depuis le
     disque, `Cache-Control: no-store` ;
   - **réutilisable** pendant sa durée : Meta peut lire plusieurs fois
     (`HEAD`, nouvel essai) ;
   - **durée** fixée par le connecteur : 2 heures par défaut, prolongeable
     jusqu’à 24 heures (la vie d’un conteneur [14]), et **fermeture
     anticipée** dès que le conteneur quitte `IN_PROGRESS` ;
   - **poids** : jusqu’à 300 Mo pour un Reel, 100 Mo pour une story, 8 Mio pour
     une image ou une couverture [14] ;
   - fichier **dérivé** accepté : le connecteur dépose un JPEG converti dans un
     dossier temporaire du cœur, supprimé à la fermeture du lien ;
   - **journal des accès** (heure, octets servis, agent) : sert de progression
     (`saveProgress`) et de diagnostic quand Meta répond `2207052`.
2. **Jetons sans jeton d’actualisation** : crochets du connecteur pour
   l’échange du code (réponse en tableau `data`, `permissions`),
   l’échange longue durée et le renouvellement (`ig_refresh_token`, après
   24 heures) ; `issuedAt` rangé avec le jeton ; passe quotidienne de
   renouvellement (§ 3.4).
3. **Limites déclarées, glissantes et par compte** : 50 publications et
   400 conteneurs sur 24 heures glissantes, à côté du modèle « par service,
   remise à zéro quotidienne » de YouTube. `waiting-quota` reprend à l’instant
   où la plus ancienne publication de la fenêtre sort des 24 heures.
4. **Gestion partielle** : dans `Connector.posts`, `update` et `remove`
   facultatifs, Instagram ne déclarant que `list`.
5. **Champs selon le type de source** : un `appliesTo?: ("video" | "image")[]`
   sur `PublishField`, pour que la fenêtre cache `altText` devant une vidéo et
   `shareToFeed` devant une image.
6. **Couverture** : que Clip Studio puisse joindre une image de couverture à
   l’export (JPEG 9:16), servie par un second lien.
7. **Facultatif** : routes publiques de désautorisation et de suppression des
   données, qui vérifient le `signed_request` (HMAC-SHA256 avec le secret de
   l’application) et rendent `{ url, confirmation_code }` [22] ; utiles si
   l’application passe en mode Live (§ 11).
8. **Plus tard** : source multiple (`PublishSource[]`) pour le carrousel.

## 13. Découpage et effort

`src/lib/connections/connectors/instagram/` :

| Fichier | Contenu |
| --- | --- |
| `index.ts` | description du connecteur, portées, capacités, `setupSteps`, `shortForm` |
| `api.ts` | appel Graph (`graph.instagram.com`, version en constante), lecture des erreurs `code` / `error_subcode`, correspondance avec la table du § 5.5 |
| `auth.ts` | échange du code, jeton longue durée, renouvellement, `fetchProfile` |
| `metadata.ts` | `publishFields`, `normalizeOptions`, assemblage de la légende |
| `image.ts` | conversion JPEG, contrôle du rapport, bandes |
| `publish.ts` | automate des conteneurs, attente, reprise, retrouver le média |
| `limits.ts` | limites déclarées, lecture de `content_publishing_limit` |

Tests (Vitest sous Node, `fetch` simulé) : légende (troncature, comptes de `#`
et `@`), `thumb_offset` borné, réponses d’échange du code dans les deux
formes, identifiants lus comme chaînes, chaque ligne du tableau de reprise
(§ 5.4) dont « publié mais réponse perdue », chaque erreur du § 5.5,
conversion d’un PNG hors rapport.

**Effort estimé**, le cœur étendu étant disponible : deux jours pour le
connecteur et ses tests, une demi-journée pour la conversion d’image, une
demi-journée de mise en place réelle (application Meta, premier Reel,
vérification de la visibilité et du lien derrière Cloudflare). Le carrousel et
les stories ajouteraient chacun environ une demi-journée.

## Sources

Pages officielles de Meta, consultées le 12/10/2026 (versions Markdown
obtenues par l’index `llms.txt` de la documentation Instagram Platform) :

1. Overview – Instagram Platform :
   https://developers.facebook.com/documentation/instagram-platform/overview
2. Instagram API with Instagram Login :
   https://developers.facebook.com/documentation/instagram-platform/instagram-api-with-instagram-login
3. Business Login for Instagram :
   https://developers.facebook.com/documentation/instagram-platform/instagram-api-with-instagram-login/business-login
4. Get Started (Instagram Login) :
   https://developers.facebook.com/documentation/instagram-platform/instagram-api-with-instagram-login/get-started
5. Migrate your App :
   https://developers.facebook.com/documentation/instagram-platform/instagram-api-with-instagram-login/migration-guide
6. Access Token (référence) :
   https://developers.facebook.com/documentation/instagram-platform/reference/access_token
7. Refresh Access Token (référence) :
   https://developers.facebook.com/documentation/instagram-platform/reference/refresh_access_token
8. App Review for Instagram API :
   https://developers.facebook.com/documentation/instagram-platform/app-review
9. Customize the Manage messaging and content on Instagram Use Case :
   https://developers.facebook.com/documentation/development/create-an-app/instagram-use-case
10. App Modes :
    https://developers.facebook.com/documentation/development/build-and-test/app-modes
11. App Roles :
    https://developers.facebook.com/documentation/development/build-and-test/app-roles
12. Content Publishing :
    https://developers.facebook.com/documentation/instagram-platform/content-publishing
13. Upload Video to Meta Servers (envoi reprenable) :
    https://developers.facebook.com/documentation/instagram-platform/content-publishing/resumable-uploads
14. IG User Media :
    https://developers.facebook.com/documentation/instagram-platform/instagram-graph-api/reference/ig-user/media
15. IG User Media Publish :
    https://developers.facebook.com/documentation/instagram-platform/instagram-graph-api/reference/ig-user/media_publish
16. IG Container :
    https://developers.facebook.com/documentation/instagram-platform/instagram-graph-api/reference/ig-container
17. IG User Content Publishing Limit :
    https://developers.facebook.com/documentation/instagram-platform/instagram-graph-api/reference/ig-user/content_publishing_limit
18. IG Media :
    https://developers.facebook.com/documentation/instagram-platform/reference/instagram-media
19. Error Codes :
    https://developers.facebook.com/documentation/instagram-platform/instagram-graph-api/reference/error-codes
20. Changelog for Instagram Platform :
    https://developers.facebook.com/documentation/instagram-platform/changelog
21. Graph API, gestion des erreurs :
    https://developers.facebook.com/docs/graph-api/guides/error-handling
22. Data Deletion Request Callback :
    https://developers.facebook.com/documentation/development/create-an-app/app-dashboard/data-deletion-callback
23. Facebook Login for Business (Instagram) :
    https://developers.facebook.com/documentation/instagram-platform/instagram-api-with-facebook-login/business-login-for-instagram
