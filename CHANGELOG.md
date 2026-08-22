# Changelog — serveur ShareX Manager

Les changements notables du serveur web et de son API sont documentés ici. La
politique complète se trouve dans [`docs/versioning.md`](docs/versioning.md).

## [Unreleased]

### Added

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

### Changed

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
- Page « Gestion des modules » : catégorie ramenée à côté du nom au lieu de
  chevaucher l'interrupteur, quatrième colonne sur très large écran, et raccourci
  « Ouvrir » sur les modules qui exposent des pages.

### Deprecated

### Removed

### Fixed

- Page « Gestion des modules » : les actions des cartes se plaçaient à une
  hauteur différente dans chaque carte d'une même rangée, avec un vide sous
  elles. Le pied de carte est désormais ancré en bas.
- Carte d'installation d'un module : couleurs codées en dur qui ignoraient le
  thème sombre, et sélecteur d'onglets à un seul onglet.

### Security

> Aucun tag de release serveur n'existe encore. Les versions historiques ne
> doivent pas être déduites du seul champ `version` de `package.json`.
