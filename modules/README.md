# Guide de création de modules pour ShareX Manager

Ce guide explique comment créer des modules personnalisés pour ShareX Manager. Les modules permettent d'étendre les fonctionnalités de l'application en ajoutant de nouvelles options de traitement d'images.

## Table des matières

1. [Structure d'un module](#structure-dun-module)
2. [Fichier de configuration](#fichier-de-configuration)
3. [Architecture des fichiers principaux](#architecture-des-fichiers-principaux)
4. [Interface utilisateur](#interface-utilisateur)
5. [Traductions](#traductions)
6. [Dépendances](#dépendances)
7. [Exemples](#exemples)
8. [Bonnes pratiques](#bonnes-pratiques)

## Structure d'un module

Un module doit respecter la structure de dossiers suivante :

```
modules/
└── nom-du-module/
    ├── module.json       # Configuration du module
    ├── index.ts          # Point d'entrée du module (interfaces et UI)
    ├── index.process.ts  # Logique de traitement d'image
    ├── ui.tsx            # Interface utilisateur (optionnel)
    ├── locales/          # Traductions (optionnel)
    │   ├── fr.json       # Traduction française
    │   └── en.json       # Traduction anglaise
    └── translations.ts   # Chargeur de traductions (optionnel)
```

## Fichier de configuration

Le fichier `module.json` définit les métadonnées et la configuration du module. Voici un exemple :

```json
{
  "name": "MonModule",
  "version": "1.0.0",
  "description": "Description de mon module",
  "author": "Votre nom",
  "enabled": true,
  "entry": "index.ts",
  "icon": "https://exemple.com/icone.png",
  "category": "Édition",
  "supportedFileTypes": ["jpg", "jpeg", "png", "webp"],
  "hasUI": true,
  "npmDependencies": {
    "sharp": "^0.32.1",
    "autre-dependance": "^1.0.0"
  },
  "settings": {
    "option1": "valeur1",
    "option2": 42
  }
}
```

### Propriétés obligatoires

- `name` : Nom du module (doit être unique)
- `version` : Version du module
- `description` : Description courte du module
- `author` : Auteur du module
- `enabled` : État initial du module (activé/désactivé)
- `entry` : Fichier d'entrée du module (généralement `index.ts`)

### Propriétés optionnelles

- `icon` : URL ou chemin vers l'icône du module
- `category` : Catégorie du module (Édition, Marque, Effets, Filtres, etc.)
- `supportedFileTypes` : Types de fichiers pris en charge
- `hasUI` : Indique si le module a une interface utilisateur
- `npmDependencies` : Dépendances npm requises
- `settings` : Paramètres par défaut du module

## Architecture des fichiers principaux

Pour une meilleure organisation du code, les modules sont structurés en deux fichiers principaux :

1. `index.process.ts` : Contient toute la logique de traitement d'image et les fonctions non liées à l'interface utilisateur
2. `index.ts` : Importe les fonctions de traitement depuis index.process.ts et gère les interfaces utilisateur

### Fichier index.process.ts

Le fichier `index.process.ts` contient la logique métier et les fonctions de traitement d'image. Il doit exporter un objet qui implémente l'interface `ModuleHooks`.

```typescript
import { ModuleHooks } from "../../types/modules";
import sharp from "sharp";

// Récupération des paramètres du module depuis module.json
let settings: {
  // Définition des paramètres du module
  option1: string;
  option2: number;
};

// Fonction principale de traitement d'image
export async function processMyImage(
  imageBuffer: Buffer,
  customSettings?: any
): Promise<Buffer> {
  try {
    // Utiliser les paramètres personnalisés ou par défaut
    const options = customSettings || settings || { option1: "default", option2: 42 };
    
    console.log("Traitement avec les paramètres:", options);
    
    // Logique de traitement d'image avec sharp
    const result = await sharp(imageBuffer)
      // Opérations de traitement...
      .toBuffer();
      
    return result;
  } catch (error) {
    console.error("Erreur lors du traitement de l'image:", error);
    return imageBuffer; // Retourner l'image originale en cas d'erreur
  }
}

// Hooks du module
export const moduleHooks: ModuleHooks = {
  onInit: () => {
    console.log("Module initialisé");
  },
  onEnable: () => {
    console.log("Module activé");
  },
  onDisable: () => {
    console.log("Module désactivé");
  },
  processImage: async (imageBuffer: Buffer) => {
    return await processMyImage(imageBuffer);
  },
};

// Fonction pour initialiser les paramètres du module
export function initModule(config: any) {
  settings = config.settings;
  return moduleHooks;
}

export default moduleHooks;
```

### Fichier index.ts

Le fichier `index.ts` est le point d'entrée du module. Il importe les fonctions de traitement depuis `index.process.ts` et gère les interfaces utilisateur.

```typescript
import { ModuleHooks } from "../../types/modules";
import React from "react";
import { Icon } from "lucide-react"; // Remplacer par l'icône appropriée
import dynamic from "next/dynamic";
import { moduleHooks, processMyImage, initModule } from "./index.process";

// Import dynamique de l'interface utilisateur
const ModuleUIComponent = dynamic(() => import("./ui"), {
  ssr: false,
  loading: () => React.createElement("div", {}, "Chargement de l'interface..."),
});

// Interface utilisateur du module
export const renderUI = (fileInfo: any, onComplete: (result: any) => void) => {
  return React.createElement(ModuleUIComponent, {
    fileInfo: fileInfo,
    onComplete: onComplete,
  });
};

// Icône d'action du module
export const getActionIcon = () => {
  return {
    icon: Icon,
    tooltip: "Description de l'action",
  };
};

// Exporter les hooks du module avec les fonctions d'interface utilisateur
export const enhancedModuleHooks: ModuleHooks = {
  ...moduleHooks,
  renderUI,
  getActionIcon,
};

// Réexporter les fonctions de traitement pour les rendre disponibles
export { processMyImage, initModule };

// Exporter par défaut les hooks améliorés
export default enhancedModuleHooks;
```

### Avantages de cette architecture

Cette séparation offre plusieurs avantages :

1. **Séparation des préoccupations** : La logique de traitement d'image est séparée de l'interface utilisateur
2. **Testabilité** : Les fonctions de traitement peuvent être testées indépendamment de l'interface
3. **Réutilisabilité** : Les fonctions de traitement peuvent être réutilisées dans d'autres contextes
4. **Maintenabilité** : Le code est plus facile à maintenir et à faire évoluer
5. **Performance** : Permet un chargement optimisé des modules

## Interface utilisateur

Si votre module a une interface utilisateur (`hasUI: true`), vous devez créer un fichier `ui.tsx` qui exporte un composant React.

```tsx
"use client";

import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { useTranslation, useModuleTranslations } from "@/lib/i18n";
import moduleTranslations from "./translations";

// Interface pour les props du composant
interface ModuleUIProps {
  fileInfo: {
    name: string;
    url: string;
    size: number;
    type: string;
  };
  onComplete: (result: any) => void;
}

export default function ModuleUI({ fileInfo, onComplete }: ModuleUIProps) {
  // Enregistrer les traductions du module
  useModuleTranslations("nom-du-module", moduleTranslations);
  
  const { t } = useTranslation();
  const [value, setValue] = useState(50);

  // Fonction appelée lorsque l'utilisateur clique sur "Appliquer"
  const handleApply = () => {
    // Envoyer les paramètres au module
    onComplete({
      value: value,
      // Autres paramètres...
    });
  };

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Label>{t("modules.nom-du-module.option_label")}</Label>
        <Slider
          value={[value]}
          min={0}
          max={100}
          step={1}
          onValueChange={(values) => setValue(values[0])}
        />
        <div className="flex justify-between">
          <span className="text-sm text-muted-foreground">0%</span>
          <span className="text-sm text-muted-foreground">{value}%</span>
          <span className="text-sm text-muted-foreground">100%</span>
        </div>
      </div>

      <div className="flex justify-end">
        <Button onClick={handleApply}>{t("modules.nom-du-module.apply")}</Button>
      </div>
    </div>
  );
}
```

## Traductions

Pour internationaliser votre module, vous pouvez ajouter des traductions dans le dossier `locales`.

### Structure des fichiers de traduction

1. Créez un dossier `locales` dans votre module
2. Ajoutez des fichiers JSON pour chaque langue (fr.json, en.json, etc.)
3. Créez un fichier `translations.ts` pour charger les traductions

### Exemple de fichier de traduction (fr.json)

```json
{
  "title": "Titre du module",
  "description": "Description du module",
  "option_label": "Option",
  "apply": "Appliquer",
  "advanced": {
    "title": "Options avancées",
    "option1": "Option 1",
    "option2": "Option 2"
  },
  "help": {
    "tip1": "Astuce 1",
    "tip2": "Astuce 2"
  }
}
```

### Fichier de chargement des traductions

```typescript
import { Language } from "@/lib/atoms/preferences";

// Import des fichiers de traduction JSON
import fr from "./locales/fr.json";
import en from "./locales/en.json";

/**
 * Traductions spécifiques au module
 */
const translations: {
  [language in Language]?: Record<string, any>;
} = {
  fr,
  en
};

export default translations;
```

### Utilisation des traductions dans l'interface utilisateur

```tsx
import { useTranslation, useModuleTranslations } from "@/lib/i18n";
import moduleTranslations from "./translations";

export default function ModuleUI({ fileInfo, onComplete }: ModuleUIProps) {
  // Enregistrer les traductions du module
  useModuleTranslations("nom-du-module", moduleTranslations);
  
  const { t } = useTranslation();
  
  // Utilisation des traductions
  return (
    <div>
      <h2>{t("modules.nom-du-module.title")}</h2>
      <p>{t("modules.nom-du-module.description")}</p>
      {/* ... */}
    </div>
  );
}
```

## Dépendances

Si votre module nécessite des dépendances npm, vous pouvez les spécifier dans le fichier `module.json` :

```json
{
  "npmDependencies": {
    "sharp": "^0.32.1",
    "autre-dependance": "^1.0.0"
  }
}
```

Ces dépendances seront automatiquement installées lorsque le module sera chargé pour la première fois.

## Exemples

Consultez les modules existants pour des exemples concrets :

- `modules/crop` : Module de recadrage avec interface utilisateur interactive
- `modules/resize` : Module de redimensionnement avec préréglages
- `modules/watermark` : Module d'ajout de filigrane avec options de personnalisation

## Bonnes pratiques

1. **Architecture** : Séparez la logique de traitement (index.process.ts) de l'interface utilisateur (index.ts)
2. **Nommage** : Utilisez des noms clairs et descriptifs pour votre module
3. **Traductions** : Fournissez des traductions pour au moins le français et l'anglais
4. **Performances** : Optimisez le traitement des images pour de bonnes performances
5. **Interface utilisateur** : Créez une interface intuitive et responsive
6. **Validation** : Validez les entrées utilisateur pour éviter les erreurs
7. **Documentation** : Documentez votre code et expliquez comment utiliser votre module
8. **Tests** : Testez votre module avec différents types et tailles d'images

## Intégration avec l'API

Votre module sera automatiquement intégré à l'API de ShareX Manager. Lorsqu'un utilisateur applique votre module à une image, l'API appellera la fonction appropriée (processImage, cropImage, etc.) avec les paramètres fournis par l'interface utilisateur.

## Débogage

Pour déboguer votre module, vous pouvez utiliser les outils de développement du navigateur et les logs du serveur. Les erreurs seront affichées dans la console du navigateur et dans les logs du serveur.

## Contribution

Si vous avez créé un module utile, n'hésitez pas à le partager avec la communauté ShareX Manager !

---

Pour toute question ou suggestion, veuillez ouvrir une issue sur le dépôt GitHub du projet. 