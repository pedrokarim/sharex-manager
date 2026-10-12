# 07 bis – Refonte de l’interface : Image de marque, comptes connectés, publication

Rattaché à [07 – Image de marque](07-image-de-marque.md).

## Pourquoi

Les premiers écrans de ce chantier ont été montés avec presque toujours les
mêmes pièces : boutons, champs, listes déroulantes et fenêtres modales. Le
dépôt offre bien plus, et un logiciel de travail se juge à cela : un geste
long ne se fait pas dans une fenêtre qui masque tout, une recherche ne se fait
pas dans une liste déroulante, une programmation ne se tape pas à la main.

**Ergonomie d’abord.** Chaque pièce riche doit rendre un geste plus simple,
plus rapide ou plus sûr ; sinon on reste simple. Pas d’ingéniosité pour
rien : on pense un parcours complet (de l’intention au résultat, en un
minimum d’étapes, en voyant l’effet là où il compte), pas une collection de
composants. Chaque élément ci-dessous se justifie par le geste qu’il améliore,
et ce qui ne s’en justifie pas est écarté à la réalisation.

Règles qui ne changent pas : back-office léger (en-tête icône, titre,
phrase ; ni badge d’en-tête, ni tuiles de chiffres, ni encadré dans
l’encadré), pages de travail en pleine largeur, chargements localisés,
animations discrètes, typographie française, et **passe d’intégrité
visuelle** (clair et sombre, cinq largeurs, données extrêmes) avant toute
livraison.

## Ce que le dépôt offre

`src/components/ui/` : accordion, attachment, avatar, button-group, calendar,
time-picker, carousel, chart, command, drawer, sheet, empty, field,
input-group, item, kbd, hover-card, popover, menubar, navigation-menu,
pagination, progress, resizable, scroll-area, sidebar, skeleton,
slider-with-stops, bounded-number-control, table, tabs, toggle-group, tooltip.
Ailleurs : `data-table.tsx` (tableau triable et filtrable), `timeline/`
(frise), `chart-area-interactive.tsx`, `copy-button.tsx`, `ai-elements/`.
Ce qui manque se développe dans `src/components/ui/` pour servir à tous.

## Image de marque

**Liste des marques**

- Barre d’outils : recherche, tri, et un groupe de bascules « Grille /
  Liste ».
- Grille : la carte montre la bannière exportée ; au survol, un aperçu
  (`hover-card`) fait défiler les formats (avatar, carton de fin, couverture)
  dans un carrousel.
- Liste : un tableau de données (nom, palette, polices, comptes liés avec
  leurs avatars, dernière modification), triable.
- Palette de commandes (`command`, raccourci `Ctrl K`, rappelé par `kbd`) :
  ouvrir une marque, en créer une, lancer l’assistant.
- Création : un **tiroir latéral** (`sheet`) au lieu d’une fenêtre, à deux
  onglets ; l’assistant y affiche ses étapes en **frise** (`timeline`) avec
  la progression de chaque visuel, et les références jointes en pièces
  (`attachment`) qu’on peut retirer.
- État vide (`empty`) illustré, avec les deux portes d’entrée.

**Éditeur**

- **Panneaux redimensionnables** (`resizable`) : sections à gauche,
  formulaire au centre, aperçu des formats à droite ; tailles retenues par le
  navigateur. Raccourcis `1` à `8` pour les sections (`kbd` dans la
  navigation).
- Champs groupés (`field`, `input-group`) avec aide et compteur de caractères
  (accroche, appel à l’action).
- **Couleurs** : pastilles cliquables qui ouvrent un sélecteur (`popover` +
  sélecteur de couleur), saisie hexadécimale, pipette quand le navigateur la
  propose ; le contraste de chaque paire s’affiche en pastille de couleur et
  en ratio, avec l’aperçu du texte sur le fond.
- **Typographie** : sélecteur de police en palette de commandes, chaque
  police écrite dans sa propre fonte ; taille, graisse et espacement par
  curseurs à paliers (`slider-with-stops`) ; aperçu de chaque rôle sur image
  voilée et sur aplat, côte à côte.
- **Logos et mascotte** : grille de pièces (`attachment`) avec dépôt par
  glisser, aperçu agrandi au survol, menu clic droit ; feuilles et poses de la
  mascotte en carrousel ; état du contrôle de cohérence (« vérifiée », « à
  relire ») en texte et icône.
- **Vidéo** : le coin du filigrane se choisit **sur un petit cadre 9:16**
  (quatre zones cliquables), taille et opacité par curseurs, et un aperçu
  animé du carton de fin joue sa durée réelle.
- **Publication** : comptes liés en éléments (`item`) avec avatar et logo du
  service ; modèles de titre et de description avec les variables insérables
  d’un clic (`{title}`, `{hook}`…) et l’aperçu rempli juste en dessous.
- **Aperçu des formats** : onglets par format, zoom, zone sûre en bascule ;
  l’export de tous les formats montre une progression par format.

## Comptes connectés

### Connecter un compte : un parcours, pas une suite de fenêtres

Le geste visé : « je veux publier sur ce service », et en sortir avec un
compte prêt à publier, sans quitter ce qu’on faisait ni recopier quoi que ce
soit à la main deux fois.

**On y entre de partout où le besoin apparaît** : le bouton de la page
« Comptes connectés », mais aussi la fenêtre « Publier » de Clip Studio quand
aucun compte ne convient, et la section « Publication » d’une image de marque.
Le parcours revient ensuite à l’endroit d’où l’on venait, avec le nouveau
compte déjà coché.

**Un seul panneau qui avance par étapes** (tiroir large, étapes visibles en
haut, retour possible à chaque étape) :

1. **Le service.** Une carte par connecteur avec son logo officiel, ce qu’il
   permet en une phrase (« publier des vidéos et des Reels sur une page »), et
   son état : prêt, à configurer une fois, ou bientôt. Les comptes déjà reliés
   à ce service sont rappelés sous la carte, pour ne pas reconnecter par
   erreur.
2. **La configuration, seulement si elle manque**, sans sortir du parcours :
   la marche à suivre du service en étapes numérotées et cochables, chaque
   lien de la console du service ouvert dans un nouvel onglet, l’adresse de
   retour dans un champ à copier, puis l’identifiant et le secret collés ici.
   Ce qui vient de l’environnement du serveur est affiché comme tel et ne se
   saisit pas. Une vérification immédiate dit si les valeurs ont la bonne
   forme.
3. **Le niveau d’accès**, en deux ou trois choix rédigés en clair (« Publier
   et gérer », « Publier seulement »), avec ce que chacun permet et ne permet
   pas.
4. **L’autorisation chez le service dans une fenêtre surgissante**, pas une
   redirection de toute la page : le panneau reste ouvert et attend. La page
   de retour ferme la fenêtre et prévient le panneau (message limité à
   l’origine de l’application) ; si la fenêtre est bloquée par le navigateur,
   on retombe sur la redirection classique, qui ramène au parcours.
5. **Les comptes trouvés.** Pour un service qui donne plusieurs comptes d’un
   coup (les pages Facebook, les comptes Instagram liés), la liste avec avatar
   et nom, tous cochés : on décoche ceux qu’on ne veut pas garder.
6. **C’est prêt.** Le ou les comptes, leur avatar, ce qu’ils permettent, et
   les suites naturelles : « Revenir à la publication » (si l’on venait de
   là), « Lier à une image de marque », « Voir le compte ».

**Les erreurs disent quoi faire** : une adresse de retour refusée montre
l’adresse attendue avec son bouton de copie et le lien vers l’écran de la
console où la coller ; un accès refusé chez le service propose de
recommencer ; un service injoignable le dit sans jargon.

**Le suivi ensuite** : sur la page « Comptes connectés », un compte dont le
jeton expire bientôt ou doit être reconnecté remonte en tête, avec son action
(« Prolonger », « Reconnecter ») sur la ligne même ; reconnecter rouvre le
parcours directement à l’étape 4.

### Les écrans

- **Liste** : un tableau de données groupé par service (logo, avatar, nom,
  identifiant, état en point coloré et texte, dernière vérification), filtre
  par service et par état, menu « … » et clic droit identiques.
- **Connecter** : une palette de commandes des services (logo, ce que chacun
  permet, état prêt, à configurer ou bientôt).
- **Configurer un service** : un **tiroir latéral** avec les étapes numérotées
  (marche à suivre), l’adresse de retour dans un champ à bouton de copie, et
  l’état de chaque variable (environnement ou saisie).
- **Fiche d’un compte** :
  - Publications : tableau de données (vignette, titre, visibilité, date,
    vues, j’aime), aperçu au survol, pagination, actions en lot.
  - Quotas : un **graphique** de la consommation du jour par compartiment et
    l’historique des derniers jours.
  - File : une **frise** des envois (en attente, en cours avec progression,
    terminés, en erreur), avec Reprendre et Annuler sur chaque étape.
  - Programmer ou reprogrammer : **calendrier et heure** (`calendar`,
    `time-picker`), jamais une date tapée.

## Publication depuis Clip Studio

- Un **tiroir latéral large** au lieu d’une fenêtre : l’export joué à gauche,
  les comptes à droite.
- Un **accordéon par compte coché** (logo, avatar, nom), avec les champs que
  le service accepte, dessinés depuis ses `publishFields`.
- Compteurs de caractères et d’octets en direct (titre 100, description
  5 000 octets…), tags en jetons supprimables, catégorie en palette.
- Programmation par calendrier et heure ; visibilité en groupe de bascules
  (Privée, Non répertoriée, Publique), la publique demandant une confirmation.
- Une **liste de contrôle** des limites du service (format, durée, poids,
  droits des images) en icônes : ce qui bloque est rouge et empêche l’envoi.
- Un **aperçu** de la publication telle qu’elle apparaîtra (vignette, titre,
  début de la description).
- Le suivi de l’envoi reste visible dans le tiroir, puis dans la fiche du
  compte.

## Ailleurs dans Clip Studio et le filigrane

- **Choix de la marque** (fenêtre « Créer », inspecteur) : une liste avec
  recherche (`command` dans un `popover`), aperçu de la marque au survol
  (palette, polices, logo).
- **Sélecteur d’animations** (étape A7 de la bibliothèque d’animations) :
  tiroir avec onglets par phase, catégories en navigation, grille de
  vignettes animées au survol, recherche en palette, favoris, réglages
  (durée, intensité, direction, découpe) en curseurs et bascules.
- **Filigrane des captures** : la position se choisit en cliquant sur
  l’aperçu (neuf zones), taille et opacité par curseurs à paliers, couleur
  par sélecteur, et la bascule « Texte / Image de marque » en groupe de
  bascules.

## Ordre de réalisation

1. Composants manquants, communs à tous (sélecteur de couleur en popover,
   sélecteur de position sur cadre, champ de tags en jetons, champ à variables
   insérables) dans `src/components/ui/`.
2. Image de marque (liste, création, éditeur).
3. Publication depuis Clip Studio et comptes connectés.
4. Choix de la marque, filigrane, puis le sélecteur d’animations.
5. Passe d’intégrité visuelle sur chaque écran refait.
