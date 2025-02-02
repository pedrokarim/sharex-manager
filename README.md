# ShareX Manager

Une application web pour gérer facilement vos uploads ShareX avec une interface moderne et sécurisée.

## Screenshot

![Screenshot](./assets/brave_FlSkkG1Mow.jpg)
![Screenshot 2](./assets/brave_sBMTYLoYPj.png)

## Fonctionnalités

- 🖼️ **Galerie d'images** - Visualisez et gérez tous vos fichiers uploadés
- 📊 **Statistiques** - Suivez vos uploads avec des statistiques détaillées
- 🗂️ **Gestion des fichiers** - Organisez et gérez vos fichiers avec une interface intuitive
- 🔑 **Gestion des clés API** - Créez et gérez des clés API avec permissions personnalisées
- 🔒 **Sécurité** - Authentification des utilisateurs et gestion des permissions
- 📤 **Intégration ShareX** - Configuration automatique pour ShareX
- 🎨 **Interface moderne** - Design responsive avec thème clair/sombre
- 📱 **Multi-appareils** - Fonctionne sur desktop, tablette et mobile
- 🖼️ **Génération de miniatures** - Création automatique de thumbnails pour vos images
- 📂 **Historique des uploads** - Consultez l'historique complet de vos uploads

## Installation

1. Clonez le dépôt :
```bash
git clone https://github.com/AliasPedroKarim/sharex-manager.git
cd sharex-manager
```

2. Installez les dépendances :
```bash
bun install
```

3. Créez un fichier `.env.local` avec les variables d'environnement :
```bash
# Auth
AUTH_SECRET=votre_secret_auth
NEXTAUTH_URL=http://localhost:3000

# Application
NEXT_PUBLIC_API_URL=http://localhost:3000

```

4. Lancez le serveur de développement :
```bash
bun dev
```

5. Ouvrez [http://localhost:3000](http://localhost:3000) dans votre navigateur

## Configuration de ShareX

1. Créez une clé API dans l'interface d'administration
2. Utilisez la configuration générée automatiquement pour ShareX
3. Importez le fichier `.sxcu` dans ShareX
4. Commencez à uploader !

## Technologies utilisées

- [Next.js 14](https://nextjs.org/) - Framework React avec App Router
- [NextAuth.js v5](https://next-auth.js.org/) - Authentification
- [Tailwind CSS](https://tailwindcss.com/) - Styles
- [shadcn/ui](https://ui.shadcn.com/) - Composants UI
- [Lucide Icons](https://lucide.dev/) - Icônes
- [Bun](https://bun.sh/) - Runtime JavaScript
- [Sharp](https://sharp.pixelplumbing.com/) - Traitement d'images

## Structure du projet

```
sharex-manager/
├── app/                    # Routes et pages Next.js
│   ├── (app)/             # Routes protégées
│   ├── api/               # Routes API
│   └── auth/              # Routes d'authentification
├── components/            # Composants React réutilisables
│   ├── ui/               # Composants shadcn/ui
│   └── gallery/          # Composants de la galerie
├── hooks/                # Hooks React personnalisés
├── lib/                  # Utilitaires et configurations
├── public/              # Fichiers statiques
│   ├── uploads/         # Fichiers uploadés
│   └── uploads/thumbnails/  # Miniatures générées
├── styles/             # Styles globaux
└── types/              # Types TypeScript
```

## Licence

Ce projet est sous licence GNU General Public License v3.0. Voir le fichier `LICENSE` pour plus de détails.