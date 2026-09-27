# Guide de création de modules pour ShareX Manager

Un module étend ShareX Manager de deux façons, qui peuvent se combiner :

- **traitement d’image** : il transforme une capture (filigrane, recadrage,
  redimensionnement), à la demande depuis la galerie ou automatiquement à
  chaque envoi ;
- **module à pages** : il a son propre espace de travail sous `/m/<module>`
  (AI Image Gen, Clip Studio).

Un module peut aussi seulement **analyser** une image sans la modifier
(anime-trace) : il a une interface, mais pas de `processImage`.

## Table des matières

1. [Structure d’un module](#structure-dun-module)
2. [module.json](#modulejson)
3. [Traitement d’image : index.process.ts](#traitement-dimage--indexprocessts)
4. [Interface de réglage : ui.tsx](#interface-de-réglage--uitsx)
5. [Réglages, activation et traitement à l’envoi](#réglages-activation-et-traitement-à-lenvoi)
6. [Actions sur les fichiers](#actions-sur-les-fichiers-fileactions)
7. [Traductions](#traductions)
8. [Dépendances](#dépendances)
9. [Bonnes pratiques](#bonnes-pratiques)

## Structure d’un module

```
modules/
└── nom-du-module/
    ├── module.json       # Configuration et valeurs par défaut
    ├── index.process.ts  # Code serveur : chargé par le gestionnaire de modules
    ├── ui.tsx            # Fenêtre de réglage dans la galerie (si hasUI)
    ├── translations.ts   # Chargeur de traductions (facultatif)
    └── locales/          # fr.json, en.json (facultatif)
```

`index.process.ts` est **le seul fichier chargé côté serveur** : c’est lui que
désigne `entry`. `ui.tsx` est chargé par le navigateur à l’ouverture de la
fenêtre de réglage. Il n’y a pas d’autre point d’entrée.

## module.json

```json
{
  "name": "Watermark",
  "version": "1.0.0",
  "description": "Ajoute un watermark aux screenshots",
  "author": "ShareX Manager",
  "enabled": true,
  "entry": "index.process.ts",
  "icon": "https://exemple.com/icone.png",
  "category": "Marque",
  "hasUI": true,
  "supportedFileTypes": ["jpg", "jpeg", "png", "gif", "webp"],
  "settings": {
    "position": "bottom-right",
    "opacity": 0.7,
    "text": "© ShareX Manager"
  }
}
```

| Propriété | Rôle |
| --- | --- |
| `name` | Nom unique, lettres, chiffres, `-` et `_` |
| `version`, `description`, `author` | Métadonnées affichées dans la page des modules |
| `enabled` | État **par défaut** ; l’administrateur le change ensuite (voir plus bas) |
| `entry` | Toujours `index.process.ts` |
| `icon` | URL de l’icône |
| `category` | `Édition`, `Marque`, `analysis`… ; `Édition` propose « Enregistrer comme nouvelle version » |
| `hasUI` | Le module a une fenêtre de réglage (`ui.tsx`) |
| `supportedFileTypes` | Extensions traitées, ou `["*"]` ; vide pour un module sans traitement |
| `settings` | Réglages **par défaut**, fusionnés sous ceux de l’interface |
| `manualOnly` | Le traitement demande un choix à la main (zone à recadrer) : il ne peut pas s’appliquer à chaque envoi |
| `fileActions` | Actions de la galerie vers les pages du module (voir plus bas) |
| `pages`, `navItems` | Pages sous `/m/<module>` et entrée du menu |
| `functions` | Fonctions serveur appelables par un compte connecté (`"user"`) ; les autres sont réservées aux admins |
| `uploads` | Autorise l’envoi direct de médias dans `data/assets/` du module |
| `npmDependencies` | Pour un module tiers seulement (voir [Dépendances](#dépendances)) |

Les capacités (`processImage`…) ne se déclarent pas : elles sont détectées
d’après ce qu’exporte `index.process.ts`.

## Traitement d’image : index.process.ts

Le gestionnaire appelle `processImage(image, réglages)` et attend une image
modifiée. Les réglages reçus sont ceux de `module.json`, enregistrés par
l’administrateur, puis ceux envoyés par la fenêtre de réglage, dans cet ordre
de priorité croissante.

```typescript
import { ModuleHooks } from "@/types/modules";
import sharp from "sharp";

export interface MyOptions {
  amount: number;
}

export async function processImage(image: Buffer, options?: Partial<MyOptions>): Promise<Buffer> {
  const amount = Number(options?.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("Choisissez une intensité supérieure à zéro.");
  }
  return sharp(image).modulate({ brightness: 1 + amount / 100 }).toBuffer();
}

export const moduleHooks: ModuleHooks = { processImage };

export function initModule() {
  return moduleHooks;
}

export default moduleHooks;
```

**Une règle à ne jamais enfreindre : en cas de problème, lever une erreur.**
Ne jamais attraper l’erreur pour rendre l’image d’origine. Sinon l’application
enregistre une copie identique et annonce « appliqué ». Le message de l’erreur
est affiché tel quel à l’utilisateur : il doit être en français et dire quoi
faire.

De même, une image rendue identique à l’originale est refusée par
l’application (« Le module n’a rien changé à l’image ») : inutile de la
signaler soi-même.

Le format de sortie est libre (un recadrage rond produit du PNG pour la
transparence) : la nouvelle version prend l’extension de son format réel.

Pour dessiner du texte, passer par un SVG composé avec sharp et **échapper le
texte** (`&`, `<`, `>`…). L’image Docker fournit la police DejaVu Sans.

## Interface de réglage : ui.tsx

```tsx
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

interface ModuleUIProps {
  fileInfo: { name: string; url: string; size: number; type: string };
  onComplete: (settings: unknown) => void;
}

export default function ModuleUI({ fileInfo, onComplete }: ModuleUIProps) {
  const [amount, setAmount] = useState(20);
  return (
    <div className="space-y-6">
      {/* réglages… */}
      <Button onClick={() => onComplete({ amount })}>Appliquer</Button>
    </div>
  );
}
```

- `onComplete(réglages)` envoie les réglages au serveur, qui applique
  `processImage` et crée la nouvelle version.
- L’aperçu s’affiche en réduction : toute mesure (zone, taille de texte,
  marge) doit être **relative à l’image** (pourcentage, ou taille pour une
  largeur de référence), jamais en pixels d’écran.
- Pour un module d’analyse, sans `processImage`, `onComplete()` ferme
  simplement la fenêtre.

## Réglages, activation et traitement à l’envoi

`module.json` fait partie du code : il n’est jamais réécrit par
l’application. Les choix de l’administrateur sont enregistrés dans
`data/modules-state.json`, dans le volume de données, et survivent donc aux
déploiements :

- **activation** (page des modules) ;
- **réglages** (`PUT /api/modules/<nom>/settings`) ;
- **« Appliquer à chaque envoi »** : le module traite automatiquement chaque
  capture reçue, avec ses réglages enregistrés. Désactivé par défaut,
  indisponible pour un module `manualOnly`. En cas d’erreur pendant un envoi,
  la capture est gardée telle quelle et l’erreur est journalisée.

## Actions sur les fichiers (`fileActions`)

Un module qui possède ses propres pages peut proposer d’y ouvrir des fichiers
de la galerie. Ses actions apparaissent dans la section « Modules » du menu
contextuel (fichier seul ou sélection) et dans la barre des modules de la
visionneuse, **uniquement si le module est activé** et si l’action accepte le
type de chaque fichier sélectionné.

```json
"fileActions": [
  {
    "id": "edit",
    "label": "Retoucher dans le studio",
    "description": "Garde la composition, ne change que ce que vous décrivez",
    "icon": "PenLine",
    "fileTypes": ["png", "jpg", "jpeg", "webp"],
    "maxFiles": 1,
    "page": "",
    "params": { "role": "edit-target" }
  }
]
```

- `fileTypes` : extensions acceptées, ou `["*"]` ;
- `maxFiles` : nombre maximal de fichiers ; absent, la sélection est libre ;
- `page` : page du module à ouvrir (`""` pour la racine) ;
- `params` : paramètres ajoutés à l’adresse.

La page reçoit les fichiers dans l’adresse :
`/m/<module>/<page>?files=a.png,b.png&role=edit-target`. Elle les lit via
`/api/files/<nom>`, puis retire ces paramètres de l’adresse.

Les modules de traitement (`supportedFileTypes`) apparaissent aussi dans ce
menu : sans interface, ils s’appliquent à toute la sélection ; avec interface,
ils ouvrent leur fenêtre de réglages pour une image.

## Traductions

1. Créer `locales/fr.json` et `locales/en.json` ;
2. les regrouper dans `translations.ts` :

```typescript
import { Language } from "@/lib/atoms/preferences";
import fr from "./locales/fr.json";
import en from "./locales/en.json";

const translations: { [language in Language]?: Record<string, any> } = { fr, en };

export default translations;
```

3. les enregistrer dans l’interface :

```tsx
import { useTranslation, useModuleTranslations } from "@/lib/i18n";
import moduleTranslations from "./translations";

useModuleTranslations("nom-du-module", moduleTranslations);
const { t } = useTranslation();
t("modules.nom-du-module.title");
```

## Dépendances

Les modules livrés avec ShareX Manager utilisent les dépendances de
l’application (`sharp`, `react-image-crop`, `react-colorful`…), déclarées dans
le `package.json` à la racine : ils n’ont ni `package.json` ni verrou propres.

Un module **tiers**, installé depuis une archive, peut déclarer des
`npmDependencies` supplémentaires, installées dans son dossier par « Installer
les dépendances ». Il ne doit pas y redéclarer une dépendance déjà fournie
(`sharp` notamment) : deux copies de sharp dans le même processus entrent en
conflit.

## Bonnes pratiques

1. **Échouer franchement** : une erreur claire vaut mieux qu’un faux succès.
2. **Valider les réglages** : les borner, avec des valeurs par défaut sûres.
3. **Mesures relatives** : l’aperçu et le résultat doivent coïncider.
4. **Tester** le traitement seul (voir `tests/modules/image-modules.test.ts`),
   y compris sur une petite image et avec des réglages invalides.
5. **Traductions** : au moins le français et l’anglais.

Exemples : `modules/watermark`, `modules/crop`, `modules/resize`, et
`modules/anime-trace` pour un module d’analyse.
