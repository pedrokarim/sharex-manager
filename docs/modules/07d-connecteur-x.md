# 07d – Le connecteur X

Dossier court du connecteur `x` des comptes connectés (dossier 07, § 8). Il
suit le modèle du connecteur YouTube (§ 8.4 à 8.8) et s’appuie sur les
extensions du cœur en cours de réalisation : publication d’un texte seul,
limites déclarées par le connecteur, jetons renouvelés par le cœur. Les liens
publics temporaires ne servent pas ici (X reçoit les octets, il ne va pas les
chercher), ni la connexion de plusieurs comptes par autorisation : une
autorisation X désigne un seul compte.

Le propriétaire publie aujourd’hui sur @ascencia64 par une extension de
navigateur qui remplit le composeur de x.com. Ce connecteur en est
l’alternative par l’API officielle ; la section 1 dit ce qu’elle coûte, la
section 10 pourquoi l’extension est elle-même un risque.

Toute la documentation citée a été lue le 12/10/2026 ; le journal des
changements de l’API s’arrête au 02/10/2026 [S3], la spécification OpenAPI
lue est la version 2.170 [S14]. Les numéros entre crochets renvoient aux
« Sources », en fin de dossier.

- **Identifiant** : `x` (déjà inscrit `planned` dans
  `src/lib/connections/connectors/planned.ts`)
- **Nom d’un compte** : « compte », « comptes »
- **Préfixe d’environnement** : `X` (`X_CLIENT_ID`, `X_CLIENT_SECRET`)
- **Capacités** : `publish.text`, `publish.image`, `publish.video`,
  `posts.list`, `posts.manage` (suppression seulement)

## 1. Le coût d’abord

### 1.1 Il n’existe plus d’offre gratuite ni d’abonnement

Depuis le 06/02/2026, l’API X est vendue **à l’usage** : on achète des
crédits d’avance dans la console, chaque requête les consomme, sans
abonnement ni minimum mensuel [S1] [S3] [S5].

| Offre | État au 12/10/2026 | Source |
| --- | --- | --- |
| Free (ancien palier gratuit) | Retirée. Les comptes « récemment actifs » ont reçu un bon unique de 10 $ en passant à l’usage | [S3] [S5] [S6] |
| Basic (200 $ par mois) | Retirée. Les abonnés ont été basculés à l’usage à la fin de leur période, après le 01/06/2026 ; la bascule est définitive | [S4] [S7] |
| Pro (5 000 $ par mois) | Présentée comme « ancien modèle » ; un membre de l’équipe X écrit que Free, Basic et Pro sont abandonnés | [S4] [S6] |
| Paiement à l’usage | **Seule offre en libre-service** ; plafond de 3 millions de lectures de publications par cycle mensuel | [S1] [S8] |
| Enterprise | Sur demande, pour les gros volumes | [S1] [S8] |
| Public Utility | Accès gratuit réservé aux applications d’intérêt public que l’équipe X accepte ; on ne peut pas s’y inscrire soi-même | [S5] [S30] |

Le journal du 06/02/2026 disait encore « Basic and Pro plans remain
available » [S3] ; l’annonce de migration de Basic [S7] et la réponse de
l’équipe X du 13/02/2026 [S6] l’ont démenti depuis. Pour un nouveau compte
développeur, il n’y a que le paiement à l’usage.

### 1.2 Ce que coûte chaque action

Tarifs de la documentation [S1], identiques à ceux de la page publique
[S4], en vigueur depuis le 20/04/2026 [S3] :

| Action du connecteur | Appel | Prix |
| --- | --- | --- |
| Publier un message, une image ou une vidéo | `POST /2/tweets` (« Post: Create ») | **0,015 $** |
| Publier un texte qui **contient une adresse** | `POST /2/tweets` (« Post: Create (with URL) ») | **0,20 $**, soit treize fois plus |
| Envoyer l’image ou la vidéo | `/2/media/upload/…` | aucune ligne de tarif ne le mentionne [S1] |
| Texte alternatif d’une image | `POST /2/media/metadata` (« Media Metadata ») | 0,005 $ |
| Lister ses propres publications | `GET /2/users/{id}/tweets` (« Owned Reads ») | 0,001 $ par publication rendue, **si le compte connecté est propriétaire de l’application** ; sinon 0,005 $ (« Posts: Read ») |
| Lire le profil du compte | `GET /2/users/me` (« User: Read ») | 0,010 $ |
| Supprimer une publication | `DELETE /2/tweets/{id}` | non identifié avec certitude : 0,010 $ (« Interaction: Delete ») ou 0,005 $ (« Content: Manage ») |

Une même ressource lue plusieurs fois dans la journée (UTC) n’est facturée
qu’une fois, « soft guarantee » [S1]. Les tarifs ont changé deux fois en
2026 (lancement le 06/02, puis 0,01 → 0,015 $ et adresses à 0,20 $ le 20/04)
[S3] ; X prévient qu’ils peuvent encore changer [S1].

**Une vidéo coûte donc comme un message** : 0,015 $, sans abonnement. Ce qui
fait monter la note, c’est une adresse dans le texte (le lien vers la vidéo
YouTube, par exemple), pas le fichier.

### 1.3 Budget réaliste pour @ascencia64

| Usage mensuel | Calcul | Total |
| --- | --- | --- |
| 20 clips + 20 messages, sans lien | 40 × 0,015 + 20 × 0,005 (texte alternatif) + 4 listages de 50 publications × 0,001 | **≈ 0,90 $** |
| Les mêmes, chacun avec un lien | 40 × 0,20 + 0,30 | **≈ 8,30 $** |

À ce prix, la contrainte n’est pas le montant mais la mécanique : une **carte
bancaire** enregistrée, des crédits achetés d’avance, et des requêtes
bloquées dès que le solde atteint zéro (il peut même passer légèrement en
négatif) [S1].

### 1.4 La voie gratuite réaliste

- **20 $ offerts** quand le compte développeur enregistre sa première carte
  (crédit ou débit, pas prépayée, jamais récompensée ailleurs, aucun paiement
  antérieur) ; **jusqu’à 50 $** de plus en miroir de la première recharge
  automatique réussie. Ces crédits sont dépensés en premier et **expirent au
  bout de trois mois** [S2]. Le programme est « en cours de déploiement » au
  02/10/2026 [S2] [S3] : il n’est pas garanti.
- Avec 20 $, on publie environ 1 300 messages sans lien (ou 100 avec lien)
  pendant trois mois : de quoi essayer et faire tourner l’usage courant
  d’@ascencia64 au début **sans rien payer**, mais la carte reste obligatoire.
- Au-delà : une recharge manuelle de quelques dollars par trimestre. La
  recharge automatique a un minimum de 5 $ [S2].
- Réglages conseillés dans la console : **plafond de dépense** par cycle
  (les requêtes sont bloquées une fois atteint) [S1], recharge automatique
  coupée ou à 5 $.

Il n’existe aucune voie gratuite **durable** par l’API.

## 2. Préparer l’application X

Marche à suivre affichée dans la configuration du connecteur :

1. Ouvrir <https://console.x.com> en étant connecté à x.com avec
   **@ascencia64** (le compte qui publiera), accepter le contrat développeur et
   décrire l’usage [S9]. Le compte qui crée l’application en est le
   propriétaire : c’est la condition du tarif « Owned Reads » [S1].
2. Créer une application : nom (il s’affichera comme **source** des
   publications, avec l’adresse du site [S20]), description, cas d’usage
   [S9] [S10].
3. Paramètres d’authentification de l’application : activer **OAuth 2.0**,
   type **« Web App »** (client confidentiel : un secret est délivré) [S10]
   [S11]. Adresse de rappel : `<AUTH_URL>/api/connections/x/callback`,
   identique au caractère près, barre oblique finale comprise, en `https`
   (dix adresses au plus ; `http://127.0.0.1` seulement en développement,
   jamais `localhost`) [S10] [S11]. Mettre l’adresse de l’instance comme site.
   Les droits « Read and write » ne concernent qu’OAuth 1.0a [S10] ; les
   choisir quand même ne gêne pas.
4. Recopier le **Client ID** et le **Client Secret** (affichés une seule fois)
   [S9] [S10] dans l’environnement ou dans la page.
5. Facturation : enregistrer une carte (20 $ offerts, § 1.4), fixer un
   plafond de dépense, acheter des crédits si besoin [S1] [S2].
6. Profil @ascencia64 : s’il publie sans intervention humaine, X demande
   l’étiquette « Automatisé » (*Paramètres › Votre compte › Automatisation*),
   une mention dans la bio et le lien vers un compte tenu par un humain [S10]
   [S27]. Une publication déclenchée à la main depuis ShareX Manager n’en a
   pas besoin.

## 3. Autorisation et jetons

| Étape | Appel |
| --- | --- |
| Fenêtre d’autorisation | `https://x.com/i/oauth2/authorize?response_type=code&client_id=…&redirect_uri=…&scope=…&state=…&code_challenge=…&code_challenge_method=S256` [S11] [S12] |
| Échange du code | `POST https://api.x.com/2/oauth2/token`, formulaire `code`, `grant_type=authorization_code`, `redirect_uri`, `code_verifier`, en-tête `Authorization: Basic` (client confidentiel) [S12] |
| Renouvellement | même adresse, `grant_type=refresh_token`, `refresh_token`, en-tête `Basic` [S11] [S12] |
| Révocation | `POST https://api.x.com/2/oauth2/revoke`, `token`, en-tête `Basic` [S12] |

- **PKCE** obligatoire dans le flux, `S256` accepté [S11] : `pkce: true`.
  `state` jusqu’à 500 caractères [S11].
- **Code** : valable **30 secondes** [S11]. Le rappel du cœur l’échange
  aussitôt ; aucune étape (lecture du profil, écran) ne doit s’intercaler.
- **Client** : `clientAuth: "basic"`, déjà prévu par le cœur.
- **Jeton d’accès** : deux heures [S11] [S13].
- **Jeton d’actualisation** : délivré seulement avec `offline.access` [S11] ;
  **à usage unique**, chaque renouvellement en rend un nouveau, valable
  « environ six mois » [S13]. Le cœur garde déjà le nouveau jeton rendu
  (`oauth.ts`) sous un verrou par compte : il faut qu’il l’enregistre
  **avant** de s’en servir, sinon une coupure entre la réponse et
  l’écriture oblige à reconnecter.
- **Second compte** : la fenêtre prend la session ouverte sur x.com. Pour
  connecter un autre compte, changer de compte sur x.com d’abord.
- **Retrait par l’utilisateur** : page des applications connectées,
  <https://x.com/settings/connected_apps> [S12] ; le renouvellement répond
  alors `invalid_grant`, déjà traité.

**Profil** (`fetchProfile`) : `GET /2/users/me?user.fields=profile_image_url,subscription_type,verified_type`
[S29]. `externalId` = `id`, `handle` = `@username`, `name` = `name`,
`avatarUrl` = `profile_image_url`, `url` = `https://x.com/<username>`.
`subscription_type` (`None`, `Basic`, `Premium`, `PremiumPlus`, rendu
seulement pour le compte authentifié) [S25] va dans `data.subscription` :
il fixe les limites vidéo du compte (§ 7). Chaque lecture coûte 0,010 $
(§ 1.2) : pas de vérification périodique, seulement à la connexion et sur
le bouton « Vérifier ».

## 4. Portées et capacités

Portées exigées par endpoint, d’après la spécification OpenAPI [S14] :

| Endpoint | Portées |
| --- | --- |
| `POST /2/tweets`, `DELETE /2/tweets/{id}` | `tweet.read`, `users.read`, `tweet.write` |
| `/2/media/upload/…`, `POST /2/media/metadata` | `media.write` |
| `GET /2/users/me`, `GET /2/users/{id}/tweets` | `tweet.read`, `users.read` |

| Capacité | Portées (dans le jeu « Tout ») |
| --- | --- |
| `publish.text` | `tweet.write` |
| `publish.image`, `publish.video` | `media.write` (et `tweet.write`) |
| `posts.list` | `tweet.read` |
| `posts.manage` | `tweet.write` (suppression seulement, § 8) |

Deux jeux proposés à la connexion :

- **« Tout »** : `tweet.read users.read tweet.write media.write offline.access` ;
- **« Messages seulement »** : le même sans `media.write`.

`tweet.read`, `users.read` et `offline.access` sont dans les deux jeux. Le
cœur accorde une capacité dès qu’une des portées listées est présente ; les
capacités média demandent en réalité deux portées. Comme `tweet.write` est
dans chaque jeu, déclarer `media.write` seul suffit en pratique (§ 11).

## 5. Publication

Tout passe par `publish()`. X traite le média **avant** la création de la
publication : quand `publish()` rend l’identifiant, la publication est en
ligne. Pas de `checkProcessing`.

### 5.1 Texte seul

`POST /2/tweets` avec `{ "text": … }` et les options du § 6 [S19]. Réponse
`201`, `data.id` et `data.text` [S14]. Adresse :
`https://x.com/<username>/status/<id>`.

### 5.2 Image ou vidéo : envoi par morceaux

Une seule voie pour les deux, l’envoi par morceaux v2 [S15] [S16] (l’envoi
simple `POST /2/media/upload` est réservé aux images [S15]) :

1. **Ouverture** : `POST /2/media/upload/initialize`, corps **JSON**
   `{ "media_type": "video/mp4", "total_bytes": …, "media_category": "tweet_video" }`
   (`tweet_image` pour une image, `tweet_gif` pour un GIF animé) [S16].
   Réponse : `data.id` (le `media_id`), `media_key`, `expires_after_secs`
   (86 400 s, 24 heures) [S16]. Ne **pas** envoyer `command=INIT` à
   `/2/media/upload` : c’est l’ancien protocole, remplacé le 01/09/2026 [S3]
   [S16].
2. **Morceaux** : `POST /2/media/upload/{id}/append`, `multipart/form-data`
   avec `segment_index` (0 à 9 999) et `media` [S14] [S16]. Morceaux de
   **4 Mio**, lus un à un sur le disque (5 Mo conseillés, 8 Mo au plus côté
   serveur [S16]). 8 Go font 2 048 morceaux, sous la borne de 10 000.
3. **Clôture** : `POST /2/media/upload/{id}/finalize` [S16]. Sans
   `processing_info` dans la réponse, le média est prêt.
4. **Traitement** : `GET /2/media/upload?command=STATUS&media_id=…`, en
   attendant `check_after_secs` entre deux lectures ; états `pending`,
   `in_progress`, `succeeded`, `failed` ; `progress_percent` [S14] [S16].
   Le travail reste en `uploading` pendant ce temps (la progression affichée
   passe des octets au pourcentage de traitement).
5. **Texte alternatif** (image, facultatif) : `POST /2/media/metadata`,
   `{ "id": …, "metadata": { "alt_text": { "text": … } } }`, 1 000 caractères
   au plus [S14] [S28].
6. **Publication** : `POST /2/tweets` avec `"media": { "media_ids": [id] }`
   [S16] [S18]. La durée et le poids sont **revérifiés** ici selon
   l’abonnement du compte qui publie : un média accepté à l’envoi peut être
   refusé avec `403` « This user is not allowed to post a video longer than
   N minutes » [S15] [S18].

### 5.3 Reprise

L’API ne dit pas quels morceaux elle a reçus (rien d’équivalent à
`Content-Range: bytes */…` chez YouTube) ; la documentation dit seulement
qu’un morceau en échec se renvoie seul [S16]. État de reprise enregistré par
`saveProgress` :

```ts
interface XUploadResume {
  mediaId?: string;
  /** Échéance du média (initialize + expires_after_secs). */
  mediaExpiresAt?: number;
  /** Prochain morceau à envoyer. */
  nextSegment?: number;
  finalized?: boolean;
  /** Publication créée : ne jamais la recréer. */
  postId?: string;
  /** Instant juste avant `POST /2/tweets`, pour retrouver une publication créée sans réponse. */
  postAttemptAt?: number;
}
```

- Coupure ou `5xx` : renvoyer le morceau `nextSegment`, attente de 1, 2, 4,
  8 puis 16 s, comme YouTube.
- Redémarrage : reprendre à `nextSegment`, ou à la lecture d’état si
  `finalized`. Un média expiré (`mediaExpiresAt` passé) ou un `404` sur
  `append` fait repartir d’`initialize`.
- **Doublon** : un `POST /2/tweets` dont la réponse s’est perdue a peut-être
  publié. Avant de le refaire, si `postAttemptAt` existe, lire les dernières
  publications du compte (`GET /2/users/{id}/tweets?start_time=…`, 0,001 $
  par publication) et chercher celle qui porte le `media_key` ou le même
  texte. On paie une lecture plutôt qu’une publication en double.
- `429` : attendre `x-rate-limit-reset` [S23] [S26].

### 5.4 Crédits épuisés

Solde nul ou plafond de dépense atteint : X bloque les requêtes [S1]. Le
code exact n’est pas documenté ; l’erreur de type `…/usage-capped` (`429`)
[S26] et un `402` éventuel sont traités comme « crédits épuisés » : le
travail s’arrête **sans réessayer en boucle** et la fiche du compte demande
de recharger dans la console (§ 11).

## 6. Champs de publication

| Clé | Paramètre X | Forme | Source | Limite |
| --- | --- | --- | --- | --- |
| `text` | `text` | textarea, rôle `description` | modèle de description de la marque | 280 en longueur pondérée (§ 7) ; obligatoire pour un texte seul, facultatif avec un média [S14] |
| `replySettings` | `reply_settings` | select | « Tout le monde » (paramètre omis) | `following`, `mentionedUsers`, `subscribers`, `verified` [S14] |
| `madeWithAi` | `made_with_ai` | toggle, rôle `syntheticMedia` | coché quand le clip contient des images générées | « Disclose that the tweet contains AI-generated media » [S14] |
| `paidPartnership` | `paid_partnership` | toggle | faux | étiquette « partenariat rémunéré » [S3] [S19] |
| `altText` | `alt_text.text` (§ 5.2) | textarea (image) | – | 1 000 caractères [S14] ; 0,005 $ |

- **Texte de 280 caractères, même pour un compte Premium.** La documentation
  ne connaît que 280 [S24] ; elle sait **lire** les publications longues
  (`note_tweet`) [S3] [S25] mais ne dit nulle part qu’on peut en **écrire**
  par `POST /2/tweets`. On s’en tient à 280 ; un texte long pour un compte
  Premium sera essayé plus tard, sur un vrai compte, avant d’être proposé.
- **Adresses** : `normalizeOptions` les détecte et la fenêtre de publication
  affiche « 0,20 $ au lieu de 0,015 $ » avant l’envoi. Le modèle de
  description de la marque contient souvent un lien : pour X, une option
  « Retirer les liens » est cochée par défaut.
- **Mentions** : pas de mention non sollicitée par une publication
  automatisée [S27]. Un « @nom » écrit dans le texte part tel quel.
- **Cashtags** : un seul `$SYMBOLE` par publication en libre-service [S19]
  [S20] ; `normalizeOptions` refuse au-delà.
- **Non proposés pour l’instant** : sondage (`poll`, 2 à 4 choix de 1 à
  25 caractères, 5 minutes à 7 jours [S14] [S19]), géolocalisation,
  communauté, titre et description de la carte vidéo (`media.title`,
  `media.description`), identification de comptes dans une image,
  sous-titres (`subtitles`, 1 Mo [S16]). Ils s’ajouteront en champs si le
  besoin vient.

## 7. Limites

| Limite | Valeur | Source |
| --- | --- | --- |
| Texte | 280 en longueur pondérée : un caractère des plages 0–4351, 8192–8205, 8208–8223 et 8242–8247 compte 1, tout autre 2, un émoji (même composé) 2, une adresse 23 ; normalisation NFC | [S24] |
| Médias par publication | 4 images, **ou** 1 GIF animé, **ou** 1 vidéo | [S15] [S18] |
| Image | JPG, PNG, GIF, WEBP ; 5 Mo | [S15] [S17] |
| GIF animé | 15 Mo ; 1 280 × 1 080 et 350 images au plus | [S17] |
| Vidéo, compte standard | 0,5 s à **20 min** ; **8 Go** | [S15] [S17] |
| Vidéo, compte Premium ou vérifié | 0,5 s à **125 min** ; **16 Go** | [S15] [S17] |
| Vidéo, format | MP4 conseillé : H.264 High, AAC LC mono ou stéréo, 60 i/s au plus, YUV 4:2:0, balayage progressif, pas de GOP ouvert, pixels carrés, rapport de 1:3 à 3:1 | [S17] |
| Vidéo, dimensions | « between 32x32 and 1280x1024 », mais 720 × 1280 recommandé en portrait et 1080p accepté pour un compte abonné : la page se contredit | [S17] |
| Publication | 100 par 15 min et par compte, 10 000 par jour et par application (la page d’intégration dit 200 par 15 min, et 300 par 3 heures publications et reposts compris) | [S20] [S23] |
| Suppression | 50 par 15 min et par compte | [S20] [S23] |
| Lecture de ses publications | 900 par 15 min ; 5 à 100 par page ; les 3 200 dernières | [S14] [S21] [S23] |
| Média | 1 875 par 15 min pour `initialize`, `append`, `finalize` | [S23] |

**Conséquences pour Clip Studio** : il exporte en H.264 et AAC
(`engine/export.ts`), ce qui convient. Un export vertical 1080 × 1920 tombe
dans la contradiction ci-dessus : le premier essai réel le dira ; en cas de
refus, la fenêtre de publication proposera un export 720 × 1280. Les limites
vidéo dépendent de l’abonnement **du compte qui publie**, pas de l’offre
développeur [S3] [S15] : 20 minutes suffisent aux clips, mais la valeur doit
suivre `data.subscription` (§ 11).

**Typographie française et longueur pondérée** : l’espace insécable U+00A0,
les guillemets « », l’apostrophe ’ et le tiret demi-cadratin – comptent 1 ;
l’espace fine insécable U+202F et les points de suspension « … » (U+2026)
comptent **2** [S24]. Le compteur de la fenêtre doit le montrer.

## 8. Gestion

| Action | Appel |
| --- | --- |
| Lister | `GET /2/users/{id}/tweets?max_results=50&exclude=retweets&tweet.fields=created_at,public_metrics,attachments&expansions=attachments.media_keys&media.fields=preview_image_url,type`, page suivante par `pagination_token` [S14] [S21] |
| Supprimer | `DELETE /2/tweets/{id}`, après confirmation ; seulement les publications du compte authentifié [S19] |

`PostSummary` : `title` = première ligne du texte, `description` = texte,
`thumbnailUrl` = `preview_image_url` du média, `privacy` = toujours
`public`, `publishedAt` = `created_at`, `views` = `impression_count`,
`likes` = `like_count`, `comments` = `reply_count` [S14].

La liste n’est lue qu’à l’ouverture de l’onglet et sur « Actualiser », par
pages de 50 : chaque publication rendue coûte 0,001 $ (§ 1.2).

**Pas de modification** : l’édition exige X Premium, sa propre publication et
une fenêtre courte, une heure selon le journal [S3], 30 minutes et cinq
modifications selon la page d’édition [S22] ; chaque modification crée un
nouvel identifiant [S22]. `posts.update` est absent ; l’interface masque
modification et visibilité (§ 11).

## 9. Ce qui est impossible

- **Publier gratuitement dans la durée** (§ 1).
- **Programmer chez X** : `POST /2/tweets` n’a aucun champ de date [S14].
  Une publication programmée attend dans la file de ShareX Manager (§ 11) ;
  l’instance doit tourner à l’heure dite.
- **Visibilité** : une publication X est publique (sauf compte protégé) ; ni
  brouillon, ni privé, ni « non répertorié ».
- **Répondre** à la publication d’un autre, sauf s’il a mentionné ou cité le
  compte (« summoned ») ; règle du 23/02/2026 pour le libre-service [S3]
  [S20]. Un fil sur ses propres publications n’est pas décrit : à essayer
  avant de le proposer.
- **Citer** une publication (`quote_tweet_id`) : réservé à Enterprise [S18].
- **Aimer, suivre** par l’API : retirés de toutes les offres en libre-service
  le 20/04/2026 [S3].
- **Bannière et avatar** : aucun point d’accès v2 dans la spécification
  [S14]. La bannière X de la marque (1 500 × 500, dossier 07 § 4.3) se
  télécharge et se pose à la main.
- **Modifier** une publication (§ 8).

## 10. Risques

- **Coût qui change** : trois grilles en huit mois [S3]. Les prix sont rangés
  dans une seule table (`connectors/x/pricing.ts`) avec leur date, affichée
  dans la fiche du compte.
- **Lien surtaxé** : 0,20 $ au lieu de 0,015 $ [S1] ; d’où l’option « Retirer
  les liens » cochée par défaut (§ 6). La documentation ne dit pas si
  l’adresse ajoutée par X à un média compte comme lien ; le premier envoi
  d’image se vérifie dans l’historique d’usage de la console.
- **Crédits à zéro** : publications bloquées sans préavis [S1]. Le plafond
  de dépense protège de la note, pas de la panne.
- **Suspension** : X suspend l’application ou bannit le compte pour spam,
  publications identiques sur plusieurs comptes, mentions non sollicitées ou
  dépassement des limites [S27]. Le connecteur refuse la même source vers deux
  comptes X dans un même envoi.
- **L’extension actuelle est elle-même le risque le plus fort** : les règles
  développeur classent « Browser scripting, scraping, any automation outside
  official API » parmi les activités interdites, sanctionnées par
  « permanent suspension » [S27]. Remplir le composeur et laisser le
  propriétaire cliquer reste une zone grise ; cliquer à sa place ne l’est
  plus. L’API supprime ce risque pour quelques centimes par publication.
- **Règles mouvantes** : réponses restreintes, likes et abonnements retirés,
  citations réservées à Enterprise en 2026 [S3]. Les tests du connecteur
  couvrent les messages d’erreur, pas seulement les cas heureux.
- **Documentation contradictoire** sur trois points (débit de publication,
  fenêtre d’édition, dimensions vidéo, § 7 et § 8) : on retient la valeur la
  plus prudente et on vérifie au premier usage réel.
- **Jeton d’actualisation** : six mois sans usage, ou une écriture perdue
  après un renouvellement (§ 3), et le compte est à reconnecter.

## 11. Ce que le connecteur demande au cœur

Acquis par l’extension en cours, utilisés tels quels :

1. **Publication d’un texte seul** (`PublishTextSource`), bornée par
   `limits.text`.
2. **Limites déclarées** (`limits.video`, `limits.image`), vérifiées avant
   tout envoi.
3. **Jetons** : `refresh_token` standard, nouveau jeton gardé à chaque
   renouvellement, verrou par compte, `clientAuth: "basic"`, `revokeUrl`.

Demandes propres à X :

4. **Longueur pondérée** : un mode de comptage `weighted` dans `limits.text`
   (règles du § 7, adresses à 23), partagé entre le navigateur (compteur) et
   le serveur (validation). Écrit dans le cœur (une soixantaine de lignes,
   d’après la configuration publique de `twitter-text` [S24]) plutôt que par
   la bibliothèque `twitter-text`, figée depuis 2022 et tirant `core-js` 2.
5. **Limites par compte** : la durée et le poids d’une vidéo dépendent de
   l’abonnement du compte (`data.subscription`). Une fonction
   `limitsFor(account)` facultative, à défaut de laquelle `limits` vaut.
6. **Coût en argent** : le connecteur déclare le prix de chaque action ; la
   fenêtre de publication affiche le coût estimé (et la surtaxe d’un lien) ;
   le cœur tient un total local par cycle mensuel et refuse au-delà d’un
   budget fixé par l’administrateur. Les quotas actuels sont journaliers et
   en unités : il faut un compartiment mensuel en dollars, ou une brique
   `billing` à côté de `quota`.
7. **Crédits épuisés** : un état d’attente distinct de `waiting-quota`, sans
   reprise automatique (rien ne revient seul à minuit), repris à la main
   après recharge.
8. **Renouvellement à l’usage seulement** : le jeton d’accès vit deux heures ;
   la tâche horaire du cœur le renouvellerait toutes les deux heures, et
   chaque rotation est une occasion de perdre le jeton (§ 3). Il faut un
   réglage `tokenLifetime` qui coupe le renouvellement en tâche de fond, plus
   un renouvellement d’entretien si le dernier date de plus de 30 jours,
   pour ne pas atteindre les six mois.
9. **`posts.update` facultatif** (même demande que Threads) : `posts.manage`
   se réduit à la suppression.
10. **Publication différée par la file** : le champ « date de publication »
    est tenu par la file (le travail reste `queued` jusqu’à la date) pour un
    service sans programmation.
11. **Toutes les portées d’une capacité** : une forme `allOf` facultative
    dans `capabilities`, pour que `publish.video` exige `media.write` **et**
    `tweet.write`. Non bloquant (§ 4).

## 12. Réalisation et tests

Fichiers : `connectors/x/index.ts` (description, portées, champs, limites),
`api.ts` (profil, liste, suppression, erreurs), `upload.ts` (morceaux,
traitement, reprise, doublon), `text.ts` (adresses, cashtags, retrait des
liens ; le comptage pondéré va au cœur), `pricing.ts` (table des prix
datée). Le logo officiel d’X est ajouté à `BrandLogo`.

Tests avec `fetch` simulé : échange du code en `Basic` ; profil et
`subscription_type` ; texte seul ; image avec texte alternatif ; vidéo de
trois morceaux, coupure au deuxième puis reprise ; média expiré ; traitement
`failed` ; `403` de durée à la publication ; réponse de publication perdue
puis publication retrouvée par la lecture ; `429` avec `x-rate-limit-reset` ;
crédits épuisés ; longueur pondérée (accents, U+00A0, U+202F, « … », émoji
composé, adresse) ; adresse détectée et surtaxe affichée ; deux cashtags
refusés.

## Sources

Documentation officielle d’X, lue le 12/10/2026 sur docs.x.com et dans son
dépôt source (`xdevplatform/docs`, dernier commit du 12/10/2026).

- [S1] Pricing (tarifs, Owned Reads, déduplication, solde, recharge,
  plafond) : <https://docs.x.com/x-api/getting-started/pricing>
- [S2] Free credit incentives :
  <https://docs.x.com/x-api/getting-started/free-credits>
- [S3] Changelog (06/02/2026 paiement à l’usage, 23/02/2026 réponses,
  20/04/2026 tarifs, 01/09/2026 limites média et chemins v2, 02/10/2026
  crédits offerts, 03/10/2025 édition, 22/08/2025 palier Free) :
  <https://docs.x.com/changelog>
- [S4] Page publique de tarification, « Paiement à l’utilisation vs.
  Abonnement » : <https://developer.x.com/#pricing>
- [S5] Annonce du paiement à l’usage, équipe X, 06/02/2026 :
  <https://devcommunity.x.com/t/announcing-the-launch-of-x-api-pay-per-use-pricing/256476>
- [S6] « No free plan? », réponse de l’équipe X du 13/02/2026 :
  <https://devcommunity.x.com/t/no-free-plan/257026>
- [S7] Migration des offres Basic vers le paiement à l’usage, équipe X :
  <https://devcommunity.x.com/t/important-update-legacy-x-api-basic-plans-are-moving-to-pay-per-use-ppu/266305>
- [S8] Post cap : <https://docs.x.com/x-api/fundamentals/post-cap>
- [S9] Getting access :
  <https://docs.x.com/x-api/getting-started/getting-access>
- [S10] Apps (types OAuth 2.0, adresses de rappel, étiquette automatisée) :
  <https://docs.x.com/fundamentals/developer-apps>
- [S11] OAuth 2.0 Authorization Code Flow with PKCE (portées, durées, code de
  30 secondes) :
  <https://docs.x.com/fundamentals/authentication/oauth-2-0/authorization-code>
- [S12] OAuth 2.0, requêtes au nom d’un utilisateur (échange, renouvellement,
  révocation) :
  <https://docs.x.com/fundamentals/authentication/oauth-2-0/user-access-token>
- [S13] Migrating OAuth 1.0a user tokens to OAuth 2.0 (jeton d’actualisation
  à usage unique, environ six mois) :
  <https://docs.x.com/fundamentals/authentication/oauth-2-0/oauth-1-0a-token-exchange>
- [S14] Spécification OpenAPI 2.170 (portées par endpoint, champs de
  `POST /2/tweets`, `initialize`, `append`, état d’un média, métadonnées,
  `public_metrics`) :
  <https://github.com/xdevplatform/docs/blob/main/openapi.json>
- [S15] Media upload, introduction (limites, revérification à la
  publication) : <https://docs.x.com/x-api/media/introduction>
- [S16] Chunked Media Upload :
  <https://docs.x.com/x-api/media/quickstart/media-upload-chunked>
- [S17] Media best practices (formats, codecs, dimensions) :
  <https://docs.x.com/x-api/media/quickstart/best-practices>
- [S18] Create or Edit Post (citations réservées à Enterprise, médias) :
  <https://docs.x.com/x-api/posts/create-post>
- [S19] Manage Posts, introduction (réponses, cashtag, sondage, partenariat,
  suppression) : <https://docs.x.com/x-api/posts/manage-tweets/introduction>
- [S20] Manage Posts, integration guide (restrictions du libre-service,
  débits, libellé de source) :
  <https://docs.x.com/x-api/posts/manage-tweets/integrate>
- [S21] Timelines : <https://docs.x.com/x-api/posts/timelines/introduction>
- [S22] Edit Posts : <https://docs.x.com/x-api/fundamentals/edit-posts>
- [S23] Rate limits : <https://docs.x.com/x-api/fundamentals/rate-limits>
- [S24] Counting characters, et configuration v3 de `twitter-text` (plages
  pondérées) : <https://docs.x.com/fundamentals/counting-characters>,
  <https://github.com/twitter/twitter-text/blob/master/config/v3.json>
- [S25] Data dictionary (`subscription_type`, `note_tweet`) :
  <https://docs.x.com/x-api/fundamentals/data-dictionary>
- [S26] Response codes and errors :
  <https://docs.x.com/x-api/fundamentals/response-codes-and-errors>
- [S27] Developer guidelines (activités interdites, automatisation) :
  <https://docs.x.com/developer-guidelines>
- [S28] Create Media metadata :
  <https://docs.x.com/x-api/media/create-media-metadata>
- [S29] Get my User : <https://docs.x.com/x-api/users/get-my-user>
- [S30] Exhibit, programme Public Utility : <https://docs.x.com/exhibit>
