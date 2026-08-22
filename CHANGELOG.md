# Changelog — serveur ShareX Manager

Les changements notables du serveur web et de son API sont documentés ici. La
politique complète se trouve dans [`docs/versioning.md`](docs/versioning.md).

## [Unreleased]

### Added

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

### Security

> Aucun tag de release serveur n'existe encore. Les versions historiques ne
> doivent pas être déduites du seul champ `version` de `package.json`.
