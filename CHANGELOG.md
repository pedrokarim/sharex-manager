# Changelog – serveur ShareX Manager

Les changements notables du serveur web et de son API sont documentés ici. La
politique complète se trouve dans [`docs/versioning.md`](docs/versioning.md).

## [Unreleased]

### Added

- Image de marque, « Style de référence » : une marque adopte le montage
  d’un short qu’elle aime. La vidéo déposée est mesurée par ffmpeg, sans IA
  (durée des plans, part de plans animés et zooms, place et taille des
  sous-titres, mots à l’écran, bruitages par minute, chacun avec sa
  fiabilité ; ce qui n’a pas pu être mesuré est dit), puis effacée. Le
  relevé s’affiche en panneau (histogramme, silhouette d’écran) et
  s’applique à la marque : les clips suivent alors le rythme « D’après la
  vidéo de référence », dans les bornes de lisibilité et de rythme de la
  direction artistique.
- AI Image Gen, images de référence : chaque image jointe porte un numéro
  et un rôle. Par défaut, « Auto » : le message dit ce qu’on en fait, en la
  désignant par son numéro (« sers-toi de l’image 1 comme référence pour
  modifier l’image 2 », « le style de l’image 1 », « cette image »),
  et la vignette affiche aussitôt le rôle compris, marqué « d’après votre
  message ». Le rôle se choisit aussi dans un menu : Inspiration, Style,
  Sujet, Composition, Couleurs ou Retouche, chacun décrit. Le rôle devient
  une consigne numérotée pour le modèle ; sans image désignée à modifier,
  il crée une image nouvelle. Une image peut être enregistrée dans « Mes
  références », avec un nom et son rôle, puis rejointe en un clic depuis
  le sélecteur d’images (recherche, retrait). Dans le fil et la
  conversation, chaque image envoyée affiche son numéro et le rôle qu’elle
  a joué. « Retoucher » une image du fil garde les références déjà
  jointes. Les ancres d’une série partent comme références de sujet.
- Interface plus vivante, d’après libraries.dev et transitions.dev :
  pastille d’onglet en goutte liquide qui glisse d’un onglet à l’autre
  (`liquid-gooey`, toutes les barres d’onglets) ; étoile de favori qui
  éclate en particules (galerie, AI Image Gen) ; chiffres des
  statistiques d’envoi qui défilent comme un compteur ; coche dessinée
  pour « Enregistré » ; visage animé des assistants d’Image de marque
  et de Clip Studio, au travail pendant une génération (`bot-avatars`) ;
  lueur qui parcourt une carte tant que son travail tourne (file de
  génération, analyse et traduction d’un chapitre, `border-beam`) ;
  pastille « Pro » en métal liquide dans le menu du compte (`metal-fx`).
  Tout respecte le mouvement réduit.
- Administration › Intelligence artificielle (`/admin/ai`) : ce que l’application
  consomme chez chaque IA et service à quota. Limites en jauges, les plus
  tendues d’abord (offre gratuite Azure, plafonds de Scan Studio, soldes lus
  chez ElevenLabs, DeepL, trace.moe et SerpApi) ; tableau des fournisseurs
  (accès, consommation du mois, échecs, dernier appel, modules) ; tiroir de
  détail avec les trente derniers jours, la répartition par module et les
  derniers appels. Un registre commun (`data/ai-usage/`) note chaque appel
  réel : Codex (appels et jetons), OpenAI, Google, Stability, voix, traduction,
  recherche inversée, Openverse. Les modules y déclarent leurs limites par
  `aiUsage` dans `module.json`.
- Clip Studio : la mascotte d’une marque prend à chaque segment la pose de son
  émotion (écrite par le script de l’assistant), jamais deux fois la même
  d’affilée, tournée vers le contenu (miroir au besoin), en grand et sans jamais
  couvrir un texte.
- Clip Studio : rythme du montage pour les clips créés par une marque ou
  l’assistant – plans de 1 à 2,5 s, sous-titres mot à mot, icône qui arrive sur
  le mot qui la nomme, bruitages synthétisés sur l’accroche, la révélation et la
  fin ; réglage de la marque « Rythme du montage » (calme, normal, vif).
- Clip Studio : la musique s’efface sous la voix off (environ 12 dB dessous
  pendant qu’elle parle) et remonte entre les répliques.
- Réglages de direction artistique dans l’interface. Image de marque, section
  Vidéo : le « Rythme du montage » se choisit sur trois cartes (calme, normal,
  vif), chacune avec sa phrase et ses coupes dessinées, et s’applique aux clips
  créés ensuite dans Clip Studio comme par l’assistant. Inspecteur de Clip
  Studio : « Miroir » d’une image ou d’une pose de la mascotte, visible aussitôt
  dans l’aperçu et à l’export ; « Creux sous la voix » d’une musique (activé ou
  non, profondeur de 3 à 24 dB, pour toute la piste), entendu aussitôt, même
  pendant la lecture.
- Image de marque, mascotte : bibliothèque de poses étiquetées (dossier 07f,
  D2, partie marque). Chaque pose porte une émotion, un geste, un cadrage et le
  côté vers lequel elle regarde, modifiables sous sa vignette ; compteur par
  émotion et filtre par geste. Les poses d’avant reçoivent des étiquettes
  proposées d’après leur libellé. Une pose ajoutée sur fond vert (ou sur fond
  transparent avec une lueur) est détourée et recadrée d’office. « Générer des
  poses » dessine les poses manquantes d’après la fiche de modèle et
  l’identité de la mascotte, sur fond vert puis détourées, chacune à accepter
  ou à rejeter, avec le suivi de la génération. `pickPose` choisit la pose d’un
  segment (émotion exacte, voisine, puis neutre, jamais deux fois la même
  d’affilée), prête pour le moteur.
- Comptes connectés : connecteur TikTok (dossier 07e). Connexion par Login Kit
  (`TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET`, ou saisie dans « Comptes
  connectés »), jetons renouvelés et révoqués à la déconnexion. Publication
  d’une vidéo en brouillon dans la boîte de réception de TikTok par défaut,
  envoyée en morceaux et suivie jusqu’à la note « Envoyé en brouillon dans
  TikTok » ; publication directe prête, activée par la case « Application
  auditée par TikTok », avec l’écran que TikTok exige (pseudo et réglages lus
  à l’affichage, visibilité sans valeur d’avance, interactions, contenu
  commercial, consentement). Quota de 15 publications directes et 5 brouillons
  par compte sur 24 heures, liste des vidéos publiques, profil en lecture avec
  liens vers l’application.
- Clip Studio : écran « Idées » qui propose des sujets de vidéos, chacun
  avec titre, accroche, angle, concept, « pourquoi maintenant » (source https
  datée de moins de 72 heures pour une actualité), modèle, nombre d’éléments,
  durée et prompt initial prêt pour l’assistant. Réglages : marque, nombre,
  part d’actualité, modèles permis, format, thème. Mélange conseillé (concepts
  prouvés, actualité, reprise d’un succès récent) et filtre avant d’écrire
  affichés ; idées dédoublonnées contre les vidéos déjà faites et les idées
  écartées. « Créer cette vidéo » ouvre « Créer » en mode Assistant,
  préremplie, et l’idée passe dans « Faites » quand le projet existe ;
  « Garder », « Écarter » et « Autres accroches » sur chaque carte.
- Clip Studio, « Étudier la niche » : chaînes de référence par marque
  (ajoutées à la main ou proposées par Codex avec le web, à valider), leurs
  30 dernières vidéos courtes lues par l’API YouTube avec le compte connecté,
  score de chaque vidéo (vues ÷ médiane de la chaîne hors trois plus récentes)
  et banque de concepts par marque (pari ou recette, moule, rythme, flops) qui
  nourrit les idées. Coût affiché avant de lancer : 3 à 5 unités de quota par
  chaîne, jamais la recherche à 100 unités ; sans compte YouTube connecté,
  l’étude est indisponible et les idées restent possibles au web seul.
- Comptes connectés : lecture publique des vidéos d’une chaîne YouTube
  (`readChannelVideos`, par `@nom` ou la sienne), chaque appel compté dans le
  quota du connecteur.
- Comptes connectés : adresses de rappel de Meta (Facebook, Instagram, Threads)
  pour le retrait de l’autorisation et la suppression des données, vérifiées par
  la signature de l’application ; affichées à copier dans la configuration du
  service.
- Clip Studio, assistant : le débit et, pour une voix locale, l’intonation se
  choisissent dans la fenêtre « Créer », à côté de la voix ; « Écouter » joue
  la voix ainsi réglée, et ces choix sont gardés dans le navigateur.
- Image de marque : une marque peut avoir sa voix off (source et voix, débit,
  intonation), réglée dans la section « Assistant IA ». La fenêtre « Créer »
  de Clip Studio la préremplit quand la marque est choisie, modifiable pour
  le clip ; l’assistant la prend quand une demande ne précise aucune voix.
  Voix indisponible (clé Azure absente, Edge en panne) : repli sur la voix
  locale par défaut, signalé dans le suivi, sans échec du clip.
- Clip Studio, assistant : calage de la voix sur une durée visée, réglable
  dans « Créer » (60 s au plus pour un short 9:16). Une voix un peu trop
  longue est relue plus vite (10 % au plus) ; bien trop longue, le script est
  raccourci par Codex, mêmes éléments dans le même ordre, puis relu. Deux
  tentatives au plus, chacune dite dans le suivi ; les sous-titres karaoké
  suivent la voix finale.

- Clip Studio, voix : les voix de la lecture à voix haute de Microsoft Edge,
  gratuites et sans clé, avec les instants des mots donnés par Microsoft pour
  les sous-titres. Accès non officiel, signalé comme tel ; en cas de
  changement chez Microsoft, un message clair renvoie vers Azure ou une voix
  locale, sans nouvel essai en boucle.
- Clip Studio, voix : Microsoft Azure (API officielle), clé et région par
  `AZURE_SPEECH_KEY` et `AZURE_SPEECH_REGION` ou dans « Voix en ligne ». Les
  caractères envoyés sont comptés par mois et affichés en jauge ; au-delà des
  500 000 caractères de l’offre gratuite, Clip Studio n’envoie plus rien. Un
  refus 429 donne un message clair.
- Clip Studio, voix : le choix d’une voix commence par la source (locales,
  Edge, Azure, OpenAI, Google, ElevenLabs), avec recherche, langue et genre ;
  chaque voix a un bouton « Écouter » (phrase d’exemple synthétisée une fois,
  puis gardée en cache).
- Clip Studio, voix : « Changer la voix de la piste… » (clic droit sur un
  extrait de voix, ou inspecteur) relit chaque extrait avec une autre voix, à
  sa place, sous-titres animés recalés, en une seule étape d’annulation ; un
  échec partiel garde l’ancienne voix des extraits concernés.
- Clip Studio, voix locales : réglage d’intonation (Régulière, Équilibrée,
  Expressive). Le texte lu est désormais gardé avec chaque voix.
- Image de marque : la mascotte entre dans les formats. Chaque format a sa
  pose (bannière accoudée au bandeau, avatar en portrait lisible à 40 px,
  en-tête X en pied à droite, carton de fin en grand sous le nom, couverture
  de short au choix), réglée dans la section Mascotte avec la vignette du
  format, ou proposée d’après la note et la forme des poses ; jamais sur le
  filigrane. La mise en scène suit l’esprit Riso : disque tramé à l’accent,
  bandeau à la seconde encre, croix de repérage en option. Sans pose, les
  formats ne changent pas.
- Image de marque : un format peut être une image finie, importée par le
  sélecteur d’images (« Utiliser une image finie… »), contrôlée, ramenée à
  sa taille et ré-encodée en PNG sans métadonnées. Elle remplace le rendu
  composé dans l’aperçu, l’export, l’onglet Chaîne des comptes connectés, le
  filigrane des captures et le carton de fin des vidéos ; « Revenir au rendu
  composé » la retire.
- Clip Studio : la mascotte de la marque dans les vidéos (« Dans les vidéos »,
  section Mascotte). Une pose accompagne l’accroche du début, puis une petite
  pose change à chaque segment, animée, jamais sur un texte ni sous
  l’interface d’un short. Elle part avec la marque ; l’assistant ne génère
  plus d’illustration de la mascotte quand ses réactions sont posées.
- Clip Studio : l’assistant vérifie les faits de ses scripts. La consigne
  porte la date du jour ; quand la demande parle de faits réels (jeux à
  venir, classement, quiz, noms propres, dates…) et que « Chercher aussi sur
  le web » est cochée, le script s’écrit en cherchant sur le web. Une étape
  « Vérification des faits » relit ensuite chaque segment avec Codex :
  corrigé, remplacé par un élément qui répond vraiment à la demande, retiré
  ou signalé douteux dans le suivi, avec ses sources, rangées dans le projet
  pour la description. Si elle échoue, le clip continue et l’étape le dit.
- Clip Studio : chaque export garde ses textes de publication (titre,
  description, légende, premier commentaire, hashtags, tags), un texte commun
  et des variantes par service, préremplis par l’image de marque. À la
  publication, le serveur calcule lui-même les textes de chaque compte
  (variante du service, règle des hashtags, limites), l’écran pouvant encore
  les ajuster, et joint premier commentaire, sous-titres et couverture.
- Clip Studio : un export range aussi ses crédits complets (musiques, voix,
  images trouvées, images générées), le volume mesuré, la marque du projet,
  un fichier de sous-titres `.srt` tiré des sous-titres animés ou des mots de
  la voix off, et une couverture (image du clip ou de la galerie, réencodée
  au cadre de la vidéo).
- Clip Studio : l’assistant rédige tout le jeu de textes d’un export d’après
  la demande et le script du clip, le ton et les liens de la marque, avec une
  variante courte pour chaque service dont les limites l’exigent (un texte
  Threads tient toujours en 500 caractères) ; rien n’est enregistré sans
  relecture.
- Clip Studio : l’export a son écran pleine largeur (`/m/clip-studio/export`)
  à la place de la fenêtre. L’aperçu du clip à gauche ; à droite le rendu par
  étapes (préparation, son, images, finalisation, envoi) avec le temps
  restant et « Annuler », des vérifications faites avant de lancer (polices,
  médias introuvables, images aux droits à vérifier, durée et format
  comparés aux comptes liés à la marque), le volume normalisé avec son vrai
  libellé (−14 LUFS, crête à −1 dB), une plage de l’entrée à la sortie, les
  sous-titres `.srt` et les crédits. Quitter l’onglet pendant le rendu
  demande confirmation ; fini, l’écran passe à la fiche du nouvel export.
- Clip Studio : chaque export a sa fiche (`/m/clip-studio/exports?id=…`) –
  lecteur et caractéristiques, projet d’origine (« le projet a changé
  depuis », « Exporter à nouveau »), couverture prise au curseur ou choisie
  dans la galerie, textes de publication par onglet (texte commun et
  variantes par service, compteurs, « Reprendre la marque », « Rédiger avec
  l’assistant » avec les champs « à relire »), crédits copiables, et ses
  publications retrouvées dans la file avec leur état et leurs suites. La
  liste de tous les exports se filtre par projet, marque et publication.
- Clip Studio : la publication devient un écran (`/m/clip-studio/publish`) :
  comptes groupés par service avec leur quota, textes par service dont les
  variantes sont rangées dans l’export, aperçu à la manière du service avec
  le premier commentaire, « Quand » (maintenant, même date, date par compte,
  décalage de quelques minutes), puis le suivi. Un compte qui n’a pas encore
  autorisé les commentaires propose « Autoriser… ». Sur téléphone, trois
  étapes et l’aperçu dans un tiroir.
- Fil d’Ariane : les pages d’un module portent le nom du module et de la page
  (« Clip Studio / Exports ») au lieu de « m / clip-studio / exports ».
- Image de marque : la section Publication a des modèles de légende et de
  premier commentaire, des modèles propres à chaque service avec l’aperçu tel
  qu’il partira, la règle des hashtags par service, des hashtags distincts
  des tags (une marque existante recopie ses tags) et une liste de liens. Les
  modèles gagnent les variables `{summary}`, `{cta}`, `{hashtags}`, `{links}`
  et `{credits}` ; une variable vide emporte sa ligne.
- Image de marque : l’interface est refaite autour des gestes. Liste avec
  recherche, vue en tableau et aperçu des formats au survol ; palette
  `Ctrl K` ; création dans un tiroir latéral, l’assistant suivi étape par
  étape ; éditeur en trois panneaux redimensionnables, où l’aperçu montre de
  lui-même le format concerné par la section ouverte ; couleurs réglées par
  paires avec leur contraste, polices choisies en les voyant, coin du
  filigrane cliqué sur un cadre, carton de fin joué à sa durée réelle,
  modèles de titre à variables avec leur aperçu. De nouveaux contrôles communs
  servent aux autres modules : sélecteur de couleur, sélecteur de position
  sur un cadre, champ de tags, champ à variables, compteur de caractères,
  sélecteur de police, frise d’étapes, zone de dépôt.
- Image de marque : nouveau module à pages, pour donner à toutes les vidéos et
  à toutes les captures la même direction artistique.
  - Des images de marque nommées : palette par rôles (fond, encre, surface,
    accent…) avec contrôle de contraste, polices importées (TTF, OTF, WOFF2),
    styles de texte par rôle (titre, sous-titre, légende, étiquette, texte sur
    carte), logos, mascotte, filigrane, carton de fin, ton et règles
    d’écriture. Une marque neuve s’ouvre déjà remplie d’une maquette.
  - Aperçu des formats d’une chaîne dessinés par le moteur de Clip Studio
    (bannière YouTube avec sa zone sûre, avatar, filigrane, en-tête X, carton
    de fin, couverture de short), exportés en PNG ou envoyés dans la galerie.
  - Assistant de création : une phrase et quelques références suffisent ;
    Codex rédige la fiche, AI Image Gen crée logo, fond de bannière et
    mascotte dans une collection dédiée, et la pose de la mascotte est
    comparée à sa feuille de modèle avant d’entrer dans la marque.
  - Export et import d’une marque en archive ZIP, d’une instance à l’autre.
- Comptes connectés : une page d’administration où relier autant de comptes
  de publication que l’on veut, service par service. YouTube est le premier
  connecteur (connexion OAuth, jetons chiffrés, envoi reprenable après une
  coupure ou un redémarrage, programmation, gestion des vidéos, bannière et
  filigrane de la chaîne depuis une image de marque, suivi des quotas) ;
  Facebook, Instagram, Threads et X sont annoncés. Les modules demandent
  « qui sait publier une vidéo » et s’adaptent aux comptes reliés.
- Comptes connectés : connecter un compte devient un parcours en six étapes
  dans un tiroir (service, configuration au besoin, niveau d’accès,
  autorisation dans une fenêtre surgissante, choix des comptes trouvés,
  suites), ouvrable depuis la page des comptes, depuis « Publier » et depuis
  la section « Publication » d’une marque, avec des erreurs qui disent quoi
  faire. La page des comptes met en tête ceux à reconnecter ; la fiche d’un
  compte montre ses publications en tableau, ses quotas en graphique et sa
  file d’envoi en frise. « Publier » devient un tiroir avec un volet par
  compte, une liste de contrôle des limites du service, le coût quand il y en
  a un, et la programmation par calendrier, tenue par la file quand le service
  ne programme pas lui-même.
- Comptes connectés : Facebook, Instagram et Threads rejoignent YouTube.
  Facebook publie sur les pages (Reel, vidéo, photo, message, tout de suite ou
  programmé), Instagram sur un compte professionnel (Reels et images, sans
  page Facebook), Threads des messages, images et vidéos ; aucun ne demande
  de revue de l’application pour ses propres comptes. Les jetons longue durée
  se prolongent seuls, une publication dont la réponse s’est perdue n’est
  jamais doublée, et les images sont converties au format attendu. X reste
  annoncé.
- Comptes connectés : le cœur accepte désormais plusieurs comptes par
  connexion (avec le choix de ceux à garder), des jetons longue durée
  prolongés automatiquement, l’autorisation dans une fenêtre surgissante, la
  publication d’un texte seul ou de plusieurs images, la publication
  programmée tenue par la file, les limites et le coût propres à chaque
  service (avec un budget mensuel), et des liens publics temporaires vers un
  fichier pour les services qui vont le chercher eux-mêmes. Un compte dont
  l’accès est refusé pendant un envoi passe « à reconnecter » et son envoi
  attend.
- Comptes connectés : une publication peut emporter des suites, faites une
  fois qu’elle est en ligne : premier commentaire (YouTube, Facebook,
  Instagram, et réponse à sa propre publication sur Threads), sous-titres
  (YouTube, Facebook) et couverture (miniature YouTube et Facebook ; pour
  Instagram, envoyée avec le Reel). Sur YouTube, le commentaire attend que la
  vidéo soit publique ou non répertoriée, et une vidéo programmée le reçoit à
  sa mise en ligne ; l’API ne sachant pas épingler, son lien est donné. Une
  suite se réessaie après une coupure, survit à un redémarrage et son échec
  ne fait jamais échouer la publication, qui garde un avertissement.
- Comptes connectés : ajouter une autorisation à un compte déjà relié
  (« Autoriser les commentaires ») relance sa connexion avec cette seule
  permission en plus ; la première connexion n’en demande jamais davantage.
  Facebook passe pour cela par une seconde configuration de connexion.
- Comptes connectés : les publications se retrouvent par leur source (toutes
  celles d’un export), et chaque service dit quels textes il attend :
  légende, premier commentaire, hashtags visibles distincts des tags cachés,
  couverture, sous-titres.
- Clip Studio : « Publier » sur un export, vers un ou plusieurs comptes
  connectés, avec les champs de chaque service préremplis par l’image de
  marque du projet.
- Clip Studio : l’assistant écrit trois accroches, les note et garde la
  meilleure, suit des règles de rythme (accroche dite en trois secondes,
  phrases courtes, relance à mi-parcours) et évite les tournures qui
  trahissent une IA. La durée parlée du script est estimée.
- Clip Studio : l’assistant cherche une image qui existe avant d’en générer
  une. Le script dit, segment par segment, s’il faut trouver (un jeu, un lieu,
  une espèce réelle) ou générer (une idée, la mascotte) ; la recherche passe
  par Openverse (licences CC0, domaine public et CC BY seulement), puis, si on
  l’autorise, par le web avec Codex. Chaque image trouvée est téléchargée par
  le serveur, contrôlée et réencodée, et garde sa mention ; celles du web
  sont marquées « droits à vérifier ».
- Clip Studio : l’assistant pose, à côté du nom d’un jeu, d’un film, d’une
  appli ou d’une marque, son icône ou son logo officiel, cherché sur le web en
  plus de l’illustration et reconnu par Codex sur une planche contact ; une
  icône dont il n’est pas sûr est écartée. Les modèles classement, quiz (à la
  révélation), diaporama et libre lui réservent un emplacement aux coins
  arrondis, avec une petite ombre et une apparition animée, qui suit l’image
  de marque et ne change rien sans icône.
- Clip Studio : onglet « Trouver » du panneau Médias, pour chercher à la main
  dans la banque libre Openverse, sur le web ou parmi les icônes officielles ;
  licence, auteur et page source sont visibles, et un clic importe l’image
  dans les médias du projet avec sa mention et l’état de ses droits.
- Clip Studio : un nouveau moteur d’animation, à pistes d’images clés, avec
  une bibliothèque de courbes complète (familles classiques, Bézier, ressorts,
  marches), la rotation, l’échelle par axe, le flou, la luminosité, la couleur
  et une phase de mise en avant ; les animations existantes rendent à
  l’identique. Les textes s’animent lettre par lettre, mot par mot ou ligne
  par ligne (accents, émojis et typographie française gardés entiers). La
  bibliothèque compte 77 animations d’éléments (entrées, sorties, mises en
  avant, boucles) et 78 animations de texte (lettre par lettre, mot par mot,
  masques, flous et lumières, titres, mises en avant, boucles), chacune
  vérifiée image par image.
- Clip Studio : les animations gagnent des effets et des calques. Un texte
  peut se décoder lettre par lettre, se taper avec un curseur qui clignote,
  compter jusqu’à son nombre au format français (« 0 → 1 250 »), se
  surligner, se souligner, se barrer, ou arriver sur un bandeau qui se
  déroule ; un élément peut s’ouvrir par un masque (iris, losange, biais,
  tache d’encre, stores, horloge, mosaïque), briller, s’entourer d’un halo,
  laisser une traîne, se dédoubler en rouge et cyan ou glitcher en tranches.
  Les lettres peuvent s’espacer une à une et tourner autour d’un point choisi.
  Cinquante animations de plus, et neuf animations existantes reçoivent
  enfin leur halo, leur lueur, leur reflet ou leur traîne. Un décodage tire
  les mêmes caractères à l’aperçu et à l’export.
- Clip Studio : vingt mises en avant, boucles et grilles de plus (tada,
  élastique, balancement, battement de cœur, clignotant, rebond, lettres
  nerveuses, apesanteur ; image ou liste qui se reconstitue en carreaux, en
  spirale, en diagonale, en lamelles). Une boucle s’arrête net avec la sortie
  de l’élément.
- Clip Studio : transitions, mouvements de caméra et effets d’impact passent
  aux pistes d’images clés : 29 transitions de plus (poussées, recouvrement,
  balayages, iris, portes, horloge, stores, pixels, encre, flou croisé, zoom
  traversant, fouetté, flash, fuite de lumière, tourbillon, retournement,
  chute…), 12 mouvements de caméra (Ken Burns, plan grue, zoom coup de
  poing, secousse, tremblement d’impact, caméra à l’épaule, mise au point…)
  et 8 effets de plan posés sur une piste (flash, secousse du cadre, impact,
  aberration, surexposition). Les cinq transitions et les sept mouvements
  d’origine rendent à l’identique.
- Clip Studio : toute la bibliothèque d’animations se choisit dans
  l’éditeur. Dans l’inspecteur, un sélecteur par phase (entrée, sortie, mise
  en avant) range les animations par catégorie, avec une recherche, des
  favoris et des vignettes qui jouent l’animation au survol, dessinées par le
  moteur de la vidéo ; seules celles qui conviennent à l’élément sont
  proposées. Les réglages de chaque animation (intensité, direction…) et la
  mise en avant (début, passages, boucle) se règlent sous le sélecteur. Le
  clic droit de la timeline propose le même catalogue, et la durée de
  l’entrée et de la sortie se voit au bord de chaque élément et se règle en
  tirant sa poignée.
- Clip Studio : les 34 transitions, les 19 mouvements de caméra et les 8
  effets de plan du moteur se choisissent dans l’éditeur. L’inspecteur et le
  clic droit de la timeline les rangent par catégorie, avec une recherche,
  des favoris et des vignettes dessinées par le moteur (passage d’un aplat
  à l’autre, image témoin qui bouge ou qui encaisse l’impact). Un effet de
  plan se pose au clic droit sur une piste (« Ajouter un effet de plan
  ici »), se voit comme une marque en haut de la piste, se déplace en la
  tirant ou aux flèches, et s’ouvre d’un clic pour régler son instant et sa
  durée, le changer ou le retirer ; tout s’annule par Ctrl Z. Sur un
  téléphone, ces choix s’ouvrent en tiroir. Les anciens identifiants gardent
  leur nom, un identifiant inconnu s’affiche « Inconnue (…) ».
- Clip Studio : une « Zone de sécurité » grise sur l’aperçu d’un short
  ce que cachent les boutons et la légende des plateformes.
- Filigrane : le module sait poser le logo d’une image de marque, à son
  coin, à sa taille et à son opacité, à la main sur une image de la galerie ou
  à chaque envoi (« Utiliser pour chaque envoi », pour un administrateur).
  Il charge désormais son logo depuis l’application et non depuis un site
  tiers.
- Clip Studio : les modèles (quiz, classement, diaporama, libre, avant /
  après) et les recettes suivent l’image de marque choisie (couleurs, polices,
  styles, filigrane, carton de fin), à la création comme après coup depuis
  l’inspecteur, et une annulation la retire. L’assistant écrit dans le ton de
  la marque et illustre dans son style. Sans marque, le rendu ne change pas.

- Scan Studio : nouveau module à pages, pour traduire les pages d’un scan.
  - Bibliothèque à trois étages (dossiers, chapitres, pages) ; import d’images,
    d’archives `.zip` ou `.cbz` et de fichiers de la galerie.
  - Atelier : on trace les zones de texte (rectangle ou contour libre), on
    masque l’original (forme, couleur prélevée sur la page, retouche au
    pinceau) et on pose la traduction dans un bloc librement déplaçable,
    tournable et redimensionnable, dont la taille s’ajuste à la bulle. Cinq
    polices libres, historique, enregistrement automatique, export à la
    résolution de la page.
  - Analyse automatique des pages en anglais, dans le navigateur : les zones
    de texte sont repérées sur les pixels puis lues par Tesseract, sans rien
    envoyer nulle part. Les lectures douteuses sont signalées.
  - Analyse du japonais, du chinois (simplifié, traditionnel) et du coréen,
    en colonnes comme en lignes, toujours dans le navigateur : le sens
    d’écriture est relevé bulle par bulle, les colonnes d’une bulle font une
    seule zone, les furigana sont écartés et le texte est nettoyé selon sa
    langue. Les données d’une langue ne sont téléchargées que pour un chapitre
    de cette langue. Les bandes de webtoon sont analysées par tranches, avec
    leur avancement ; choisir une langue d’origine propose le format qui va
    avec elle (manga, manhua, webtoon).
  - Traduction par DeepL et LibreTranslate, l’un relayant l’autre : une
    requête par page, glossaire et mémoire de traduction par dossier, cache,
    plafond mensuel, mise à l’écart d’un moteur après trois échecs, et une
    estimation affichée avant chaque lot. Rien ne part sans un clic.
  - Page « Moteurs » (clés, ordre d’appel, consommation) et glossaire par
    dossier.
  - Page « Polices » : ajoutez vos polices de lettrage (TTF, OTF, WOFF2), avec
    une phrase d’essai, un nom modifiable et un retrait qui ne laisse aucune
    page sans police ; une table des styles par dossier donne une police à
    chaque registre (dialogue, cri, pensée et récitatif, onomatopée). Les
    polices ajoutées se retrouvent dans l’atelier, à l’aperçu comme à l’export.
  - Atelier : le masque peut reconstruire le fond sous le texte (aplat,
    dégradé, trame), dans le navigateur et sans IA ; un outil « Onomatopée »
    pose un bruit sur le dessin, avec l’espacement et l’étirement de ses
    lettres ; la poignée de rotation ne fait plus sauter le bloc quand on la
    saisit, et la pipette recolore aussi les retouches au pinceau.
  - IA en dernier recours, pour les chapitres réglés au niveau 3 seulement :
    relire une zone, traduire avec le contexte, ou traduire la page entière
    en une version gardée à part et comparable. Un appel par clic, jamais
    retenté, avec le modèle choisi dans la palette d’AI Image Gen, un plafond
    mensuel d’appels et la trace de chaque appel sur la zone.
  - Import d’un chapitre par son lien : le site est reconnu d’après le lien,
    par un adaptateur ; MangaDex est le premier, par son API publique. Une
    seule page, « Import par lien » : le lien, son aperçu et le suivi en haut,
    les sites gérés en dessous, à activer ou désactiver, avec l’icône de
    chacun. Un import à la fois, les pages l’une après l’autre,
    et un message propre à chaque cas d’échec.
    Un lien suffit : le chapitre se range dans le dossier de sa série, créés
    l’un et l’autre s’ils n’existent pas, et la couverture de la série, quand
    le site en donne une, illustre le dossier.
    Quatre autres sites gérés, lus par leurs pages ordinaires : lelscanfr.com,
    lelscans.net, mushokutensei-manga.com et cocomic.co.
  - Pages « à laisser telles quelles » (couvertures, bannières) : l’analyse et
    la traduction les ignorent, et l’analyse d’un chapitre propose d’écarter
    celles qui semblent n’avoir rien à traduire.
  - Les pages envoyées dans la galerie y entrent en privé.
  - Lecture publique : un chapitre est privé, public par son lien (adresse
    imprévisible, hors indexation) ou listé au catalogue ; un dossier donne
    une visibilité à ses nouveaux chapitres. Seules les pages exportées sont
    servies, jamais les images d’origine ni les données de travail ; un
    chapitre sans page exportée ne se publie pas, et le repasser en privé
    coupe l’accès tout de suite. Le lecteur suit le format (page par page de
    droite à gauche ou de gauche à droite, ou en bande), au clavier et au
    doigt, avec chapitre précédent et suivant, la source et le crédit notés à
    l’import, et un lien pour signaler un problème.
  - Lot sur un dossier : analyser ou traduire tous ses chapitres, un à la
    fois, dans une file qu’on arrête quand on veut. La traduction passe par
    le même chemin qu’un chapitre (une requête par page, mêmes écarts, même
    plafond) et s’arrête dès qu’aucun moteur ne répond ; l’estimation du
    dossier entier est montrée avant de partir.
  - Export `.cbz` d’un chapitre, ou d’un dossier (une archive par chapitre) :
    pages exportées dans l’ordre, numérotées avec des zéros.
  - Rendu en lot : « Rendre toutes les pages traduites » d’un chapitre, ou
    de tous les chapitres d’un dossier, par la même chaîne que le bouton
    « Exporter » de l’atelier (polices, fonds reconstruits). Les pages sans
    zone, sans traduction ou laissées telles quelles ne sont pas touchées.
  - Atelier : une zone tracée à la main (rectangle ou contour libre) autour
    d’un texte que l’analyse n’a pas vu est lue aussitôt, sur place, et son
    texte d’origine se remplit ; « Lire le texte de la zone » relit n’importe
    quelle zone. La page s’ouvre sur l’original tant que rien n’est traduit, et
    la vue affichée est le seul segment en couleur.
  - Atelier : l’enregistrement se voit. Le témoin dit « Enregistrement
    automatique », puis l’heure du dernier enregistrement ; quitter la page
    envoie d’abord ce qui reste et le confirme, ou retient le départ si
    l’enregistrement échoue ; Ctrl+S enregistre tout de suite.
  - Analyse : un détecteur de bulles et de texte, entraîné sur des pages de
    manga, de webtoon et de manhua, repère désormais le texte à la place du
    repérage par les pixels : il trouve les petites bulles et le texte hors
    bulle, et donne à chaque texte sa bulle. Il tourne dans le navigateur
    (ONNX Runtime Web), rien ne quitte la machine, et ce n’est pas une IA
    générative. Deux variantes au choix dans « Moteurs », précise (44 Mo) ou
    rapide (11 Mo) ; le modèle se télécharge une fois sur le serveur, vérifié
    par son empreinte. Sans modèle, ou si le navigateur ne peut pas le faire
    tourner, l’analyse garde son repérage par les pixels et le dit.
  - Chapitre : l’analyse et la traduction se lancent sur les pages que l’on
    coche, et tournent en arrière-plan. La fenêtre se ferme aussitôt ; la
    planche montre l’état de chaque page (en attente et en cours en ambre,
    traitée en vert, en échec en rouge) et une barre dit où en est le
    traitement, avec de quoi l’arrêter. Il continue quand on ouvre une page
    ou qu’on va ailleurs dans l’application, tant que l’onglet reste ouvert.
  - Texte traduit : sa taille ne dépasse plus celle du lettrage d’origine,
    relevée à l’analyse, si bien que les bulles d’une page gardent une taille
    voisine au lieu de grossir chacune jusqu’à remplir sa bulle. Dans une
    bulle ovale, le texte se cale sur un rectangle qui tient dans l’ovale et
    ne mord plus sur le trait ; le masque couvre tout le texte repéré, même
    quand la lecture en a perdu une ligne.
  - Traduction : une réponse de MyMemory qui recopie la phrase d’origine, ou
    qui traduit une autre phrase tirée de sa mémoire publique, n’est plus
    prise pour une traduction. Relancer « Analyser » remplace aussi une zone
    dont la traduction n’est qu’une proposition jamais retouchée.
  - Atelier : un bouton « Traduire » à côté d’« Analyser » traduit les zones
    de la page ouverte, et « Traduire cette zone », dans le panneau de droite,
    une seule bulle. Jusque-là, la traduction ne se lançait que depuis la page
    du chapitre. Le sélecteur de vue s’appelle désormais « Affichage »
    (« Original », « Version traduite », « Côte à côte »), pour ne plus
    passer pour un bouton qui traduit.
  - Traduction : un troisième moteur, MyMemory, qui marche sans clé. Tant
    que ni DeepL ni LibreTranslate ne sont réglés, c’est lui qui traduit : la
    traduction fonctionne donc dès l’installation. Il ne prend qu’une phrase
    par requête (une page part bulle après bulle, une seconde entre deux) et
    s’arrête à son quota du jour, 5 000 caractères, ou 50 000 avec une adresse
    de contact facultative.
  - Moteurs : « Lire le quota » demande à DeepL ce que le compte a
    consommé, en une requête et sans texte envoyé.
  - L’estimation de traduction d’un long chapitre part par paquets au lieu
    d’être refusée au-delà de 400 phrases ; une image déposée qui n’a pas pu
    être rattachée à un chapitre est effacée du serveur ; supprimer une page
    emporte ses versions traduites par IA ; la barre de l’atelier passe sur
    deux lignes quand la place manque au lieu de couper un bouton.
  - Envoi dans la galerie : les pages « laissées telles quelles » partent
    aussi, telles qu’elles sont et à leur place, et les pages du chapitre sont
    réunies dans un album privé. Une archive de plus de 300 images s’importe
    désormais en plusieurs paquets au lieu d’être refusée d’un bloc.
  Dossier de conception : `docs/modules/06-scan-studio.md` ; banc d’essai de
  la lecture : `docs/modules/06-scan-studio-banc-essai.md`.
- Catalogue public : un module peut y apporter une rubrique
  (`catalogSections` dans son `module.json`), avec ses collections, ses
  éléments et un lecteur d’images. Le catalogue ne connaît aucun module : la
  rubrique n’apparaît que si le module est activé et a quelque chose de listé,
  et disparaît avec lui (404). Première rubrique : « Scans », par Scan Studio.
- Galerie : séparations par jour à l’intérieur de chaque mois (« Aujourd’hui »,
  « Hier », puis la date). En grille, les jours se suivent sans case perdue :
  plusieurs jours partagent une rangée, l’étiquette de chacun se pose au-dessus
  de sa première carte, et un jour trop long continue à la rangée suivante.
  Chaque étiquette permet de sélectionner la journée. Activé par défaut.
- Galerie : bandeau « À la une », une rangée de raccourcis illustrés en tête de
  page : souvenir d’une année précédente, favoris, fichiers privés, dernier
  album, et la dernière création de chaque module activé qui déclare une source
  (`gallerySources`). Un module coupé disparaît du bandeau sans autre réglage.
  Désactivé par défaut.
- Préférences : section « Éléments de la galerie », pour allumer ou éteindre ces
  deux éléments. Ces réglages sont rattachés au compte et le suivent d’un
  appareil à l’autre.
- Albums : trois visibilités au lieu d’un simple public/privé. Un album est
  privé à sa création, peut devenir public par lien (accessible à qui connaît
  son adresse, absent du catalogue) ou public au catalogue. Le réglage est
  présent partout où un album se manipule : création, modification, menu de la
  carte et menu contextuel, page de l’album ; une icône rappelle la visibilité
  là où un album est cité (ajout d’un fichier depuis la galerie, visionneuse).
  Les albums déjà publics restent au catalogue. L’API accepte `visibility` à
  la création et à la modification.
- Préférences : « Ouverture d’un fichier », pour choisir une fois pour toutes
  si la visionneuse s’ouvre en plein écran ou dans une fenêtre.
- Thème global : 42 palettes prêtes à l’emploi, avec un aperçu, à retoucher
  couleur par couleur pour le clair et pour le sombre.
- Modules : identité visuelle. Un module range son logo dans son dossier
  (`branding/`, déclaré dans `module.json`) ; il s’affiche dans le menu
  latéral, la gestion des modules, l’en-tête du module et la page d’accueil.
  AI Image Gen, Clip Studio et Recherche inversée ont chacun le leur.
- Barre de filtres commune (`FilterBar`), condensée sur une ligne : recherche,
  listes et période. L’historique des envois l’utilise, et ses filtres, restés
  sans effet jusque-là, filtrent réellement la liste.
- Gabarits de chargement : chaque page de l’application montre la forme de
  son contenu pendant qu’il arrive (galerie, albums, historique,
  administration, réglages), et les vignettes apparaissent en fondu.
- Vignettes : `?size=large` sert une version de 1200 px, pour les couvertures
  affichées en grand.
- Site GitHub Pages refait au dessin de la page d’accueil, avec le logo et de
  nouvelles captures ; il vit désormais dans `docs/website/`.
- Recherche inversée : nouveau module à pages, qui remplace « anime-trace ».
  On dépose, colle ou désigne une image (ordinateur, lien, fichier de la
  galerie par le menu contextuel) et plusieurs moteurs répondent côte à côte :
  trace.moe et IQDB sans rien configurer, SauceNAO avec sa clé gratuite,
  Google Lens et Yandex avec une clé SerpApi. Tous les moteurs, TinEye,
  ascii2d et Bing compris, s’ouvrent aussi dans un onglet avec l’image déjà
  transmise, par son adresse publique ou par un lien temporaire de trente
  minutes. Les recherches sont gardées dans un historique, sauf en mode
  éphémère, où rien n’est écrit sur le disque.
- Sélecteur d’image commun (`ImagePickerDialog`) : galerie, modules activés
  qui détiennent des images, ordinateur ou lien. La recherche inversée s’en
  sert pour choisir son image ; les modules s’y branchent par `gallerySources`,
  qui gagne un champ `kinds`.
- Galerie : frise chronologique à la place de la barre de défilement. Elle
  apparaît quand on défile ou qu’on approche du bord droit, étage les années
  selon la quantité de contenu, pose un point par mois et nomme dans une bulle
  le mois visé ; un clic ou un glisser y amène la galerie, même à une date pas
  encore chargée. Les séparateurs de mois ouvrent « Aller à une date » (année,
  puis mois). Disponible dans la galerie, la recherche, les favoris, les
  fichiers sécurisés, les albums, et côté public dans la galerie du catalogue
  et les albums ; les albums sont désormais groupés par mois d’ajout.
- Galerie : fenêtre « Ajouter », qui réunit toutes les provenances : fichiers
  de l’ordinateur, image d’un autre site par son lien (téléchargée par le
  serveur, adresses internes refusées), et contenus des modules activés
  (rendus d’AI Image Gen, clips de Clip Studio). Les modules déclarent leurs
  sources dans `gallerySources` ; la copie se fait côté serveur.
- Outils : « Origine d’une image », premier outil hébergé sur place, ouvert
  sans compte depuis `/tools`. On y dépose (ou colle) une image pour lire ce
  qu’elle déclare : image générée ou capture, manifeste C2PA et sa signature,
  EXIF, XMP, paramètres de génération. Rien n’est enregistré.
- Galerie : origine des fichiers. Une pastille signale les images signées ou
  déclarées générées, et la visionneuse détaille ce que le fichier porte.
  Présent partout où des images s’affichent en grille : galerie (grille et
  liste), albums, favoris, fichiers sécurisés, et côté public la galerie du
  catalogue, les albums et leur visionneuse.
- Galerie : deux téléchargements pour chaque image, l’original ou une version
  sans métadonnées (pixels identiques, sans recompression), depuis la carte,
  la liste, le menu contextuel, la visionneuse et la visionneuse publique. Un
  fichier marqué privé reste réservé aux comptes connectés.
- AI Image Gen : origine des images. Un indicateur sur chaque vignette et un
  panneau « Origine » dans la visionneuse montrent ce que le fichier porte :
  manifeste C2PA (générateur, nature de l’image, actions, signature contrôlée
  contre son certificat, empreintes), XMP, EXIF et textes. Deux
  téléchargements : l’original, ou une version sans métadonnées produite sans
  recompression, pixels identiques.
- AI Image Gen : studio repensé. Les rendus forment une mosaïque justifiée,
  groupée par jour, qui remplit toute la largeur ; une génération en cours y
  occupe déjà sa place, et un échec s'y affiche avec son message et son
  journal. Le formulaire latéral et la colonne « File d'attente » cèdent la
  place à un compositeur flottant au pied de la page (moteur, format, qualité,
  nombre, styles, réglages avancés en pastilles) et à un panneau « Activité ».
- AI Image Gen : image de départ depuis les uploads ShareX (recherche par nom,
  filtre par date ou par période), depuis les rendus du studio, depuis
  l'ordinateur ou depuis un lien, importé par le serveur avec refus des
  adresses internes. Une image se joint aussi par glisser-déposer n'importe
  où sur la page ou par collage (Ctrl + V).
- AI Image Gen : trois vues du fil au choix, retenues d'une visite à l'autre :
  mosaïque, liste (prompt complet et détails à côté des images) et
  conversation (prompt en bulle, réponse du studio avec les images, dans
  l'ordre chronologique). L'en-tête du studio reste en haut sur grand écran.
- AI Image Gen : menus contextuels dans le fil (clic droit sur une image, une
  légende, une ligne ou une bulle du chat), identiques au bouton « … ».
  « Reprendre » remet texte, réglages et images de départ dans le
  compositeur pour modifier puis relancer ; s'y ajoutent « Reprendre le texte
  seul », « Relancer à l'identique », retouche, inspiration, variantes,
  agrandissement, copie de l'image, série, galerie et suppression. Les images
  de départ sont désormais archivées avec chaque génération.
- AI Image Gen : le compositeur se vide après « Générer » (texte et images),
  réglable dans Moteurs › Préférences.
- Galerie : section « Modules » dans le menu contextuel, pour un fichier ou
  une sélection. Elle propose les actions des modules activés compatibles
  avec les fichiers : ouvrir une page du module (« Retoucher dans le studio »,
  « S'en inspirer dans le studio »), appliquer un traitement à toute la
  sélection ou ouvrir ses réglages. Les mêmes actions rejoignent la barre des
  modules de la visionneuse. Les modules les déclarent dans `fileActions`.
- AI Image Gen : changer d'onglet ne remplace plus toute la page par un
  spinner (pages préchargées, indicateur limité à l'onglet cliqué) ; le fil et
  le brouillon du compositeur sont conservés entre deux visites. Les tuiles, le
  plateau d'images et la file d'activité s'animent à l'arrivée, au départ et
  au réordonnancement, dans le respect du réglage « réduire les animations ».
- Assistant d'installation `bun run setup` : choix entre l'authentification
  intégrée (par défaut) et Ascencia ID, génération de l'environnement avec
  sauvegarde, création du premier administrateur intégré et mode non interactif
  pour les déploiements automatisés.
- Connexion Ascencia ID via OIDC avec PKCE, validation des jetons signés et
  traduction configurable des rôles Ascencia en administrateur ShareX Manager.
- Page d'accueil refondue : héros avec capture de l'application, sections
  alternées texte/capture, mise en route en trois étapes avec le fichier
  `.sxcu`, mur d'images et renvoi vers les services annexes. Les chiffres et
  les vignettes viennent du catalogue public réel, lus côté serveur.
- Page « Outils » transformée en passerelle vers Just Tools et MCInfo, avec la
  capture, le logo et le contenu de chaque service. Une section de l'accueil y
  renvoie.
- Référencement : `metadataBase`, gabarit de titre, description, lien
  canonique, Open Graph et carte Twitter sur toutes les pages publiques. Les
  pages privées passent en `noindex` via le layout de leur groupe.
- `app/robots.ts` et `app/sitemap.ts`, ce dernier listant les pages publiques et
  un lien par album public.
- Images Open Graph : une image par défaut générée, et une image dédiée par
  album public composée de ses quatre premières images. Chacune porte le logo
  de sa surface, celui de la plateforme ou celui du catalogue.
- Titre dynamique sur la fiche d'un album public et sur les pages de module.
- Module AI Image Gen : génération d'images par un agent en ligne de commande
  déjà authentifié sur le serveur (Codex CLI validé, Gemini CLI et Claude Code
  détectés), sans clef API. La page Moteurs liste les agents installés avec leur
  version, leur compte et le chemin de l'exécutable, et accepte un chemin imposé
  quand le serveur ne voit pas le même PATH que le terminal.
- Module AI Image Gen : moteur « commande locale », pour brancher n'importe
  quel programme du serveur à partir d'un gabarit d'arguments.
- Module AI Image Gen : moteurs Google AI (Gemini 2.5 Flash Image, Imagen 4).
- Module AI Image Gen : file d'attente des générations, avec avancement,
  journal de l'agent et annulation.
- Module AI Image Gen : pipelines enregistrés enchaînant génération, variantes,
  retouche, agrandissement et envoi en galerie.
- Module AI Image Gen : séries, qui joignent une trame, un style partagé et des
  repères visuels à chaque scène.
- Module AI Image Gen : consignes négatives, variantes et agrandissement local
  depuis la carte d'une génération.
- Module AI Image Gen : icône dédiée, produite par le module lui-même.
- Déploiement : l'image Docker embarque le CLI Codex, version épinglée, avec
  son bac à sable `bwrap`. La session vit dans le volume `./codex-home`, la
  connexion se fait une fois avec `docker compose exec sharex-manager codex
  login --device-auth`, sans navigateur sur le serveur.
- Module AI Image Gen : mode d'isolation réglable pour les agents CLI qui en
  proposent un, le mécanisme du noyau n'étant pas toujours disponible en
  conteneur.
- Comptes connectés : l’onglet « Chaîne / Profil » d’un compte rassemble
  tout ce qui fait son identité, en deux groupes. « Modifiable depuis
  ShareX Manager » : valeur actuelle lue chez le service, valeur proposée
  depuis l’image de marque (modifiable), ce qui change, puis « Envoyer » ou
  « Tout envoyer », avec relecture après l’envoi et « Autoriser… » quand une
  autorisation manque. « À changer chez {service} » : ce que l’API ne permet
  pas, dit franchement, avec l’image rendue depuis la marque à télécharger,
  le texte à copier et le lien vers la bonne page du service.
- YouTube : description, mots-clés, langue, pays, bande-annonce pour les
  non-abonnés et traductions du nom et de la description modifiables depuis
  l’application (`channels.update`, en renvoyant le reste et le nom
  inchangés), sections de la page d’accueil (ajout, ordre, retrait, 10 au
  plus) et playlists (création, titre, description, visibilité, ajout de
  vidéos). Nom, identifiant, photo de profil et liens restent à changer dans
  YouTube Studio.
- Facebook : description et site web de la Page modifiables, avec
  l’autorisation `pages_manage_metadata` ajoutée à la demande (seconde
  configuration Facebook Login for Business) ; nom, photo et couverture à
  changer chez Facebook. Instagram et Threads : profil lu, tout est à changer
  dans l’application, avec les textes et la photo de la marque.
- Image de marque : section « Publication », groupe « Profil des comptes » :
  modèle de description de la chaîne, bio courte et pays, qui préremplissent
  l’onglet « Chaîne / Profil » ; les marques existantes les reçoivent à la
  lecture.

### Changed

- Compte connecté : les onglets « Envois en cours », « Quotas » et « Chaîne »
  sont refaits en écrans de logiciel. Envois en tableau filtrable et paginé,
  quotas en panneaux de jauges avec échéance et état, chaîne en écran de
  réglages (source et changements à envoyer dans une colonne collante,
  panneaux Identité, Images, À changer chez le service, Page d’accueil,
  Playlists).
- Clip Studio, images de marque : lisibilité garantie des textes (dossier
  07f, D1). Aucun texte n’est plus posé nu sur une image : le moteur regarde
  ce qu’il y a dessous et pose une étiquette aux couleurs de la palette, garde
  le contour épais que la marque dessine, ou se contente de l’aplat uni quand
  il suffit ; le contraste texte / fond atteint toujours 4,5:1 (3:1 pour un
  titre de plus de 7 % de la hauteur), en dernier recours en noir ou en blanc.
  Le titre garde son ombre colorée décalée. Les sous-titres mot à mot reçoivent
  un contour épais et un mot prononcé lisible. Le voile clair qui délavait les
  images disparaît : elles restent éclatantes. Trame d’imprimerie légère en
  option sur les aplats unis (« Trame d’imprimerie » dans la typographie de la
  marque). Les clips sans marque gardent exactement leur rendu.
- Image de marque, typographie : une police de titre et une police de texte
  lisible (nouveau choix « Polices des vidéos »). Une police monospace
  (Courier, « Mono », « Code »…) ne sert plus de police de texte : l’éditeur
  l’annonce, les vidéos prennent la police de texte de la marque (Poppins par
  défaut), et une marque qui en avait une est corrigée à la lecture, avec un
  avertissement. Une marque neuve et l’assistant de marque ne proposent plus
  que des polices de texte pour les rôles de texte, à des couleurs lisibles
  sur leur fond.
- Messages d’action affichés là où l’on regarde, au lieu de toasts au coin
  de l’écran : l’erreur d’un formulaire ou d’une fenêtre s’ouvre au-dessus
  de son bouton d’envoi et s’efface quand on corrige la saisie (connexion,
  contact, albums, réglages, moteurs…) ; « Enregistré » apparaît à côté
  du bouton qui a enregistré ; l’erreur d’une carte ou d’une ligne
  s’affiche sur elle ; une copie se lit sur l’icône du bouton. Socle commun
  `src/components/feedback/` (`useFeedback`, `FormStatus`, `ActionStatus`).
  Le toast reste pour ce qui se passe hors de vue : travail de fond qui se
  termine, fichier reçu en direct, écran fermé après l’action, annulation
  proposée.
- Chargements refaits dans toute l’application, sur un socle commun
  (`src/components/loading/`) : orbes de points animées (moteur de
  `thinking-orbs`, encre aux couleurs du thème) pour les pages, les modules et
  les travaux de fond ; matrice de points à la place des spinners ; texte
  d’attente scintillant ; squelettes traversés d’un reflet ; boutons
  `loading` qui gardent leur libellé lisible. L’ouverture d’un module montre
  l’orbe au centre de la zone de contenu au lieu d’un petit spinner en haut,
  et l’icône d’un lien de la barre latérale indique la page qui arrive. Le
  mouvement réduit est respecté partout.
- Comptes connectés, écran Publier : un service peut lire chez lui les
  réglages d’un compte à l’affichage (identité, choix permis, déclarations à
  montrer avant l’envoi) ; un choix peut n’avoir aucune valeur d’avance et
  être exigé, une case être obligatoire ou figée, un réglage n’apparaître que
  selon un autre. Une publication finie peut garder une remarque, affichée
  dans le suivi.
- Clip Studio : la recherche d’images vise le titre exact et les visuels
  officiels (key art, captures des stores et des kits presse) ; un produit
  commercial récent (jeu, film, série, appli) est cherché directement sur le
  web, Openverse ne le connaissant pas. Le suivi de l’assistant dit combien
  d’illustrations ont été trouvées, sur le web ou sur Openverse, combien ont
  été créées, et combien d’icônes officielles ont été posées.
- Clip Studio : le volume d’un export est réglé sur une vraie mesure
  d’intensité (ITU-R BS.1770, −14 LUFS, celle des plateformes de vidéos
  courtes) au lieu d’un niveau moyen à −16 dB ; une crête déjà au-dessus de
  −1 dB est toujours ramenée sous ce plafond.
- Scan Studio : le contrôle des polices ajoutées est partagé avec Image de
  marque, sans changement visible.
- Pages publiques : catalogue, albums publics, connexion, inscription, mot de
  passe oublié, outils, contact, pages légales et pages d’information suivent
  le dessin de la page d’accueil (photos de nature, titres en Fraunces,
  boutons en pastille, largeurs de colonne variées) et partagent un socle
  commun (`src/components/front/`).
- Thème : il n’y a plus qu’un thème, celui du site. La page « Thème global »
  ne règle que le mode et les couleurs ; chaque navigateur choisit ensuite
  clair, sombre ou système, depuis le menu latéral.
- Menu latéral : logo sans cadre, bouton clair/sombre dans l’en-tête, section
  « Administration » à plat (vue d’ensemble, utilisateurs, logs, thème global,
  configuration système, modules, sécurité) au lieu d’un sous-menu du même
  nom. La section s’affiche dès le premier rendu, sans attendre une
  vérification côté navigateur, et les liens ne rechargent plus la page.
- Administration : pages allégées, avec une icône, un titre et une phrase
  pour en-tête, sans carte d’en-tête, pastille ni tuiles d’information.
- Visionneuse : le sélecteur « Plein écran / Modal » quitte la visionneuse
  pour les préférences, et la présentation ne figure plus dans l’adresse. La
  fenêtre occupe désormais presque toute la largeur.
- Galerie : la première page est lue directement par le serveur, sans requête
  vers sa propre API.
- Images générées (logos, photos des pages publiques) : métadonnées et
  signatures retirées avant leur entrée dans le dépôt.
- Galerie : les cartes n’affichent plus leur rangée de quatre boutons. Les
  actions (télécharger, copier le lien, ouvrir, supprimer, favori) apparaissent
  au survol de l’image ; le nom, la taille et la date tiennent sur deux lignes.
- Galerie : barre d’outils allégée. Vue, tri, période et actualisation
  automatique sont rangés derrière « Affichage » ; un seul bouton « Ajouter »
  remplace le bouton flottant et l’ancienne fenêtre d’envoi à un fichier. La
  galerie charge 24 fichiers par page, et le faux chargement pleine page à
  l’ouverture disparaît.
- Page « Mon compte » entièrement refondue et intégrée au shell de
  l’application : profil réel, rôle, fournisseur d’identité, état de session
  et raccourcis utiles remplacent les cartes vides « bientôt ».
- Typographie : Geist remplacé par Plus Jakarta Sans et JetBrains Mono,
  servies par `next/font` donc auto-hébergées. Site vitrine aligné.
- Cartes de navigation des écrans « Administration » et « Réglages » unifiées
  dans un composant commun, avec leurs libellés déplacés dans les traductions.
- Ajout de fichiers à un album : la sélection part par lots de cinquante,
  album par album, avec la progression affichée et un état partiel signalé
  comme tel.
- Visionneuse de fichiers : les modules quittent le panneau flottant du coin
  haut-droit pour un bandeau révélé depuis le bas de la zone image, au-dessus
  de la barre d'outils. Un bouton rond en bas à gauche l'ouvre, une rangée de
  filtres resserrée le trie par catégorie, Échap le referme sans fermer la
  visionneuse. Les deux rangées défilent horizontalement, le système de modules
  n'ayant ni nombre ni catégories connus à l'avance.
- Module AI Image Gen : le catalogue de modèles est construit côté serveur à
  partir de ce qui est réellement installé et connecté. Un modèle indisponible
  est affiché avec la raison au lieu d'échouer à l'exécution.
- Module AI Image Gen : le studio dépose un travail au lieu d'attendre la
  réponse HTTP, ce qu'une génération par agent (une minute ou plus) ne permettait
  pas de tenir.
- Module AI Image Gen : la détection des agents est mise en cache une minute.
  Elle lançait deux processus par CLI installé à chaque ouverture du studio, ce
  qui se voit sur une machine modeste. Le bouton de la page Moteurs la forçe.
- Page « Gestion des modules » : catégorie ramenée à côté du nom au lieu de
  chevaucher l'interrupteur, quatrième colonne sur très large écran, et raccourci
  « Ouvrir » sur les modules qui exposent des pages.

### Deprecated

### Removed

- Thème personnel : page `/settings/theme`, route `/api/settings/theme`,
  synchronisation avec le thème global et mode selon l’heure.
- Éditeur de thème complet (polices, rayons, espacements, ombres, assistant) et
  ses composants ; restent le mode et les couleurs.
- Ancien logo complet (`logo-sxm.png`) et anciennes captures de la page
  d’accueil.
- Module « anime-trace » : remplacé par « Recherche inversée », qui reprend
  trace.moe. Sa fenêtre dans la visionneuse disparaît au profit de l’action
  « Rechercher l’origine de l’image » du menu contextuel.
- Rendu de skins Minecraft : page, route de test, scripts NameMC et commande
  de rendu. Le service MCInfo assure cette fonction.
- Page « Test Couleurs ».
- `ThemeWrapper`, désactivé de longue date et en doublon avec le
  `ThemeProvider`, ainsi que son crochet et la dépendance `next-themes` devenue
  inutilisée.

### Fixed

- AI Image Gen : le rôle d’une image jointe était ignoré par OpenAI et
  Gemini. Toute image partait vers l’API de retouche d’OpenAI, si bien
  qu’une simple inspiration était retouchée ; Gemini recevait les images
  sans savoir à quoi elles servaient. Le prompt dit désormais, image par
  image, ce que le modèle doit en prendre, comme pour les moteurs en ligne
  de commande.
- Clip Studio : un export de plus de 100 Mo (clip de plus d’une minute et
  demie environ) était refusé par Cloudflare ; les fichiers de plus de 48 Mo
  partent désormais en morceaux, recollés par le serveur (500 Mo par fichier).
- Envois de fichiers : origine contrôlée sur les envois par session (modules,
  galerie), taille annoncée bornée avant lecture, type vérifié dès le premier
  morceau, envois en cours limités par compte, plafond de pixels pour les
  miniatures, export accepté seulement s’il est une vidéo MP4.
- Clip Studio, voix locales : débit moins irrégulier par défaut (intonation
  « Équilibrée », bruit de Piper abaissé de 0,667 / 0,8 à 0,6 / 0,6). La chaîne
  audio ne déformait rien : ni fréquence mal lue, ni étirement de la voix.
- Clip Studio : « Exporter » et « Publier » n’apparaissent plus dans le menu
  latéral (le champ `menu` des pages d’un module était perdu au chargement),
  et le fil d’Ariane continue de les nommer.
- Clip Studio, fiche d’un export et écran Publier : les onglets des services
  qui passent à la ligne ne recouvrent plus les champs, les boutons de la
  couverture restent dans leur colonne, et les longs noms se coupent avec
  leur texte complet en infobulle.
- Clip Studio, écran Exporter : « Annuler » rend la main tout de suite, même
  pendant la préparation des médias, et le temps écoulé avance chaque
  seconde. Une limite de taille d’un seul côté ne s’affiche plus
  « 1920 × ? px ».
- Clip Studio, éditeur sur téléphone : le panneau des médias et l’inspecteur
  passent par-dessus l’aperçu au lieu de sortir de l’écran, l’en-tête et la
  barre de la timeline tiennent dans la largeur, et les animations du clic
  droit s’ouvrent dans le tiroir du sélecteur.
- Clip Studio : la page des projets ne montre plus que les douze derniers
  exports, avec un lien vers tous ; les catégories du sélecteur
  d’animations passent à la ligne sur grand écran, et « Mise en avant » tient
  en entier dans son onglet.
- Clip Studio : un top des « prochains » jeux ne contient plus un jeu déjà
  sorti, et la bonne réponse d’un quiz est contrôlée avant le montage.
- Le bouton de fermeture des fenêtres et des tiroirs s’annonce « Fermer »
  aux lecteurs d’écran, et non plus « Close ».
- Fenêtres et listes déroulantes : un nom ou un texte long ne les élargit
  plus hors de l’écran ; leur hauteur reste dans l’écran, avec défilement
  interne sur un téléphone, et la croix de fermeture ne recouvre plus le
  titre.
- Clip Studio : les cartes des exports ne se chevauchent plus quand un nom
  est long ; le bouton « Zone de sécurité » ne cache plus le haut de
  l’aperçu.
- Boutons « Supprimer » et « Déconnecter » des confirmations à nouveau
  rouges et lisibles en thème sombre.
- Clip Studio : un texte ne se coupe plus sur une espace insécable : un
  « ! » ou un « : » ne part plus seul à la ligne.
- Liens officiels : la page Contact renvoyait vers un compte GitHub homonyme
  qui n’est pas celui du projet, et les pages Support et Feedback vers l’ancien
  nom du dépôt. Toutes les adresses (dépôt, tickets, wiki, Discord de support,
  compte X, site d’Ascencia, e-mail) viennent désormais d’un seul fichier,
  `src/config/links.ts`. La page Contact gagne le Discord de support et le
  compte X, avec leurs logos.
- Galerie : au rechargement, la page pouvait s’ouvrir sur « Aucune image »
  quand l’adresse d’API configurée ne désignait pas le serveur en cours. Elle
  montre maintenant ses fichiers d’emblée, et un gabarit tant qu’un
  chargement est en cours.
- Pages de réglages : le dernier bloc ne touche plus le bas de la zone de
  défilement.
- Fenêtres larges (visionneuse en fenêtre, détails d’une clé API) : elles
  restaient bloquées à 512 px, leur contenu débordait.
- Galerie : une nouvelle version produite par un module, ou une image
  envoyée depuis le studio AI Image Gen, apparaît tout de suite dans les
  galeries ouvertes. Seuls les uploads ShareX étaient annoncés jusqu'ici.
- Ascencia ID : les rôles administrateur (`ASCENCIA_ADMIN_ROLES`) sont
  désormais appliqués. better-auth expose le modèle de route du callback OIDC,
  si bien que chaque compte Ascencia était ramené au rôle `user`.
- Image Docker : ajout des certificats racine. L'image de base n'en contenait
  aucun, Bun embarquant les siens ; le CLI Codex, qui valide TLS avec ceux du
  système, échouait sur « error sending request » dès la connexion au compte.
- Build Docker : Bun 1.3.14 segfaute en fermant ses workers, après que
  `next build` a terminé son travail. Le build échouait en sortie 132 alors que
  `.next/standalone` et `.next/static` étaient complets. L'étape ne tolère ce
  code de sortie que si les deux répertoires existent, une vraie erreur de
  compilation continue donc d'arrêter le build.
- Polices : Plus Jakarta Sans et JetBrains Mono n'étaient appliquées nulle
  part, malgré leur déclaration dans le layout racine. Leurs variables étaient
  posées sur `<body>` alors que les jetons du thème sont déclarés sur `:root`,
  où un `var()` vers une variable invisible rend toute la déclaration invalide.
  L'application retombait donc silencieusement sur la police système. Les
  variables sont remontées sur `<html>`.
- Thèmes : les styles enregistrés avant le changement de police pointaient
  encore vers `--font-geist-sans` et `--font-geist-mono`, qui n'existent plus.
  Ces variables sont désormais remplacées à la lecture, sans migration de base.
- Galerie : démarrer une sélection ramenait la vue en haut de la liste. La
  carte changeait de composant d'enveloppe selon le mode, ce qui démontait la
  grille entière (bouton qui venait d'être cliqué compris), et le navigateur
  replaçait alors le défilement. La racine du menu contextuel est désormais
  unique et stable : seul son contenu change. Le défilement, le focus et les
  images restent en place, en vue grille comme en vue liste.
- Galerie : en vue liste et en vue détails, le rond de sélection ne faisait
  rien. La vue ne recevait pas le gestionnaire qui démarre la sélection.
- Flash au chargement : la page s'affichait en clair avant de basculer en
  sombre. Le thème est désormais décidé au rendu serveur (classe sur `<html>`,
  variables dans le `<head>`), et le mode « système » est résolu en CSS par le
  navigateur, sans JavaScript. Effet de bord corrigé : un thème « système »
  suit maintenant un changement de mode du système d'exploitation en direct.
- Contrôle d'accès du proxy : sa liste blanche contenait `"/"` testé avec
  `startsWith`, donc toute route passait pour publique et les deux contrôles
  n'étaient jamais atteints. `/account`, `/dashboard` et `/upgrade`
  s'affichaient sans session.
- Ajout à un album au-delà de cinquante fichiers : la requête était rejetée
  et aucun fichier n'était ajouté, pour un message d'erreur générique.
- Défilement de l'application : au-delà d'un écran de contenu, c'était la
  fenêtre qui défilait et l'encart perdait ses marges et ses coins arrondis.
- Espacements des cartes de statistiques : neuf recettes de padding écrites
  à la main s'ajoutaient au `py-6` de la carte shadcn v4 au lieu de le
  remplacer, soit quarante pixels de vide en haut et en bas de chaque carte.
- Sections de l'accueil décentrées : trois largeurs de conteneur différentes
  et des marges négatives qui décalaient le bloc visible.
- Cartes de l'écran d'administration : le dégradé posé dans le `CardHeader`
  laissait deux bandes vides, le `py-6` de la carte le maintenant à l'intérieur.
- Échelle de crénage : `--tracking-*` n'était défini nulle part, les
  utilitaires `tracking-tight` n'avaient donc aucun effet.
- Polices d'un thème publié : la feuille Google n'était chargée que dans
  l'éditeur, l'application retombait sur la police système.
- Traductions : la clé racine `home` était présente deux fois dans
  `en.json`, tout le premier bloc était mort.
- Page « Gestion des modules » : les actions des cartes se plaçaient à une
  hauteur différente dans chaque carte d'une même rangée, avec un vide sous
  elles. Le pied de carte est désormais ancré en bas.
- Carte d'installation d'un module : couleurs codées en dur qui ignoraient le
  thème sombre, et sélecteur d'onglets à un seul onglet.
- Accueil du catalogue : la section « Albums à découvrir » n'avait aucune marge
  basse, ses cartes touchaient le pied de page.

### Security

> Aucun tag de release serveur n'existe encore. Les versions historiques ne
> doivent pas être déduites du seul champ `version` de `package.json`.
