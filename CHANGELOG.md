# Changelog – serveur ShareX Manager

Les changements notables du serveur web et de son API sont documentés ici. La
politique complète se trouve dans [`docs/versioning.md`](docs/versioning.md).

## [Unreleased]

### Added

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

### Changed

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

- Rendu de skins Minecraft : page, route de test, scripts NameMC et commande
  de rendu. Le service MCInfo assure cette fonction.
- Page « Test Couleurs ».
- `ThemeWrapper`, désactivé de longue date et en doublon avec le
  `ThemeProvider`, ainsi que son crochet et la dépendance `next-themes` devenue
  inutilisée.

### Fixed

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
