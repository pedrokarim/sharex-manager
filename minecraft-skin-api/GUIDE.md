# Minecraft Skin API — Guide d'utilisation

Microservice Docker autonome pour le rendu de skins Minecraft.
Extrait du projet Ascencia, il genere des images PNG de skins via Three.js + WebGL cote serveur.

---

## Ce que fait ce service

| Endpoint | Description | Rendu |
|----------|-------------|-------|
| `/api/namemc/mchead.png` | Tete du joueur (2D) | Image PNG |
| `/api/namemc/mcbody.png` | Corps anime du joueur (3D) | Image PNG |
| `/api/namemc/mccape.png` | Cape Mojang ou Optifine (2D) | Image PNG |
| `/api/namemc/mcskin.png` | Corps complet du joueur (2D) | Image PNG |
| `/api/namemc/texture/skin` | Texture brute du skin (proxy Mojang) | Image PNG |
| `/api/namemc/texture/cape` | Texture brute de la cape (proxy Mojang/Optifine) | Image PNG |
| `/api/namemc/profile` | Donnees profil Mojang (nom, textures, etc.) | JSON |
| `/api/namemc/uuid/:username` | Convertir un pseudo en UUID | JSON |
| `/api/namemc/namehistory/:uuid` | Historique des noms (via laby.net) | JSON |
| `/health` | Health check | JSON |

---

## 1. Lancer seul (pour tester)

```bash
# Build l'image
docker build -t minecraft-skin-api .

# Lance le conteneur
docker run -d -p 3089:3089 --name minecraft-skin-api minecraft-skin-api

# Teste dans le navigateur
# http://localhost:3089/health
# http://localhost:3089/api/namemc/mchead.png?skin=c64de681741b4937a9c456fce30d37b4&width=126&height=126
```

Ou avec le docker-compose inclus :

```bash
docker-compose up -d
```

---

## 2. Integrer dans un autre projet (docker-compose)

### Etape 1 : Copier le dossier

Copie le dossier `minecraft-skin-api/` a la racine de ton autre projet :

```
mon-projet/
├── docker-compose.yml      <-- ton compose principal
├── minecraft-skin-api/     <-- copie ce dossier ici
│   ├── Dockerfile
│   ├── package.json
│   ├── server.js
│   └── utils/
│       ├── skinNode.js
│       └── skinLayout.js
├── src/
└── ...
```

### Etape 2 : Ajouter le service dans ton docker-compose.yml

```yaml
version: "3.8"

services:
  # -------------------------------------------------------
  # Tes services existants
  # -------------------------------------------------------
  app:
    build: .
    ports:
      - "3000:3000"
    depends_on:
      minecraft-skin-api:
        condition: service_healthy

  # -------------------------------------------------------
  # Service Minecraft Skin API
  # -------------------------------------------------------
  minecraft-skin-api:
    build:
      context: ./minecraft-skin-api
      dockerfile: Dockerfile
    container_name: minecraft-skin-api
    restart: unless-stopped
    environment:
      - PORT=3089
    # Expose le port uniquement en interne (pas sur l'hote)
    expose:
      - "3089"
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3089/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 15s
```

> **Note :** On utilise `expose` au lieu de `ports` pour que le service soit
> accessible uniquement depuis les autres conteneurs du meme reseau Docker,
> pas depuis l'exterieur. Si tu veux aussi y acceder depuis ton navigateur
> (debug), remplace `expose` par `ports: - "3089:3089"`.

### Etape 3 : Appeler le service depuis ton code

Depuis n'importe quel autre conteneur du meme docker-compose, le service
est accessible via son nom de service : `minecraft-skin-api`.

**Node.js (fetch) :**

```js
const fetch = require('node-fetch');

// Tete 2D
const headUrl = 'http://minecraft-skin-api:3089/api/namemc/mchead.png?skin=c64de681741b4937a9c456fce30d37b4&width=126&height=126';
const response = await fetch(headUrl);
const imageBuffer = await response.buffer();

// Corps 3D
const bodyUrl = 'http://minecraft-skin-api:3089/api/namemc/mcbody.png?skin=c64de681741b4937a9c456fce30d37b4&model=classic&theta=-30&phi=20&time=90';
const response3D = await fetch(bodyUrl);
const bodyBuffer = await response3D.buffer();
```

**Python (requests) :**

```python
import requests

head = requests.get(
    "http://minecraft-skin-api:3089/api/namemc/mchead.png",
    params={"skin": "c64de681741b4937a9c456fce30d37b4", "width": 126, "height": 126}
)
with open("head.png", "wb") as f:
    f.write(head.content)
```

**cURL (depuis un autre conteneur) :**

```bash
curl "http://minecraft-skin-api:3089/api/namemc/mchead.png?skin=c64de681741b4937a9c456fce30d37b4&width=126&height=126" -o head.png
```

---

## 3. Reference des endpoints

### GET `/api/namemc/mchead.png`

Genere une image 2D de la tete du joueur.

| Parametre | Requis | Defaut | Description |
|-----------|--------|--------|-------------|
| `skin` | oui | — | UUID du joueur Minecraft (sans tirets) |
| `width` | non | `32` | Largeur en pixels (max 999) |
| `height` | non | `32` | Hauteur en pixels (max 999) |
| `flip` | non | `false` | Retourner l'image |

```
/api/namemc/mchead.png?skin=c64de681741b4937a9c456fce30d37b4&width=126&height=126
```

---

### GET `/api/namemc/mcbody.png`

Genere une image 3D du corps complet avec animation.

| Parametre | Requis | Defaut | Description |
|-----------|--------|--------|-------------|
| `skin` | oui | — | UUID du joueur Minecraft |
| `model` | non | `slim` | Modele du skin : `slim` ou `classic` |
| `theta` | non | `-30` | Rotation horizontale (degres) |
| `phi` | non | `20` | Rotation verticale (degres) |
| `time` | non | `90` | Frame d'animation (position des bras/jambes) |
| `flip` | non | `false` | Retourner le modele |

```
/api/namemc/mcbody.png?skin=c64de681741b4937a9c456fce30d37b4&model=classic&theta=-30&phi=20&time=90
```

---

### GET `/api/namemc/mccape.png`

Genere une image 2D de la cape (Mojang ou Optifine).

| Parametre | Requis | Defaut | Description |
|-----------|--------|--------|-------------|
| `skin` | oui | — | UUID du joueur Minecraft |
| `width` | non | `40` | Largeur en pixels (max 999) |
| `height` | non | `64` | Hauteur en pixels (max 1599) |
| `flip` | non | `false` | Retourner l'image |

```
/api/namemc/mccape.png?skin=c64de681741b4937a9c456fce30d37b4&width=100&height=160
```

> Retourne une erreur 404 si le joueur n'a pas de cape.

---

### GET `/api/namemc/mcskin.png`

Genere une image 2D du corps complet (vue de face, a plat).

| Parametre | Requis | Defaut | Description |
|-----------|--------|--------|-------------|
| `skin` | oui | — | UUID du joueur Minecraft |
| `cape` | non | `false` | Si `true`, affiche la cape au lieu du skin |
| `flip` | non | `false` | Retourner l'image |

```
/api/namemc/mcskin.png?skin=c64de681741b4937a9c456fce30d37b4
```

---

### GET `/api/namemc/texture/skin`

Retourne la **texture brute du skin** telle quelle depuis les serveurs Mojang
(image PNG 64x64 ou 64x32). Utile pour l'afficher cote client dans un viewer
Three.js ou pour la manipuler.

| Parametre | Requis | Defaut | Description |
|-----------|--------|--------|-------------|
| `skin` | oui | — | UUID du joueur Minecraft (sans tirets) |

```
/api/namemc/texture/skin?skin=c64de681741b4937a9c456fce30d37b4
```

Reponse : l'image PNG brute (Content-Type: image/png).

---

### GET `/api/namemc/texture/cape`

Retourne la **texture brute de la cape** (Mojang ou Optifine).

| Parametre | Requis | Defaut | Description |
|-----------|--------|--------|-------------|
| `skin` | oui | — | UUID du joueur Minecraft (sans tirets) |

```
/api/namemc/texture/cape?skin=c64de681741b4937a9c456fce30d37b4
```

Reponse : l'image PNG brute. Retourne 404 si pas de cape.

---

### GET `/api/namemc/profile`

Retourne les **donnees completes du profil Mojang** (nom, UUID, URLs des textures skin/cape).

| Parametre | Requis | Defaut | Description |
|-----------|--------|--------|-------------|
| `skin` | oui | — | UUID du joueur Minecraft (sans tirets) |

```
/api/namemc/profile?skin=c64de681741b4937a9c456fce30d37b4
```

Reponse (JSON) :
```json
{
  "id": "c64de681741b4937a9c456fce30d37b4",
  "name": "PedroKarim64",
  "properties": [
    {
      "name": "textures",
      "value": {
        "textures": {
          "SKIN": { "url": "http://textures.minecraft.net/texture/..." },
          "CAPE": { "url": "http://textures.minecraft.net/texture/..." }
        }
      }
    }
  ]
}
```

---

### GET `/api/namemc/uuid/:username`

Convertit un **pseudo Minecraft en UUID**.

Utilise la nouvelle API `minecraftservices.com` (l'ancienne `api.mojang.com`
est instable depuis janvier 2025 avec des erreurs 403 aleatoires).

```
/api/namemc/uuid/Notch
```

Reponse (JSON) :
```json
{ "id": "069a79f444e94726a5befca90e38aaf5", "name": "Notch" }
```

Le champ `id` est l'UUID a utiliser dans le parametre `skin` des autres routes.

---

### GET `/api/namemc/namehistory/:uuid`

Retourne l'**historique des changements de pseudo** d'un joueur.

> **Attention :** Mojang a **supprime** l'API officielle d'historique des noms
> en septembre 2022 pour des raisons de vie privee. Cette route utilise
> l'API tierce **laby.net** qui a mis en cache les donnees historiques.
> Les resultats peuvent etre incomplets, surtout pour les changements
> survenus apres septembre 2022.

```
/api/namemc/namehistory/069a79f444e94726a5befca90e38aaf5
```

Reponse (JSON) :
```json
{
  "uuid": "069a79f444e94726a5befca90e38aaf5",
  "source": "laby.net",
  "note": "Mojang removed the official name history API in September 2022...",
  "names": [
    { "name": "Notch" }
  ]
}
```

Si laby.net ne repond pas, la route retourne le nom actuel depuis le profil Mojang
avec `"source": "mojang-profile"`.

---

### GET `/health`

Health check pour Docker / orchestrateurs.

```json
{ "status": "ok", "service": "minecraft-skin-api" }
```

---

## 4. Comment obtenir l'UUID d'un joueur

L'UUID Minecraft (sans tirets) est necessaire pour les endpoints de rendu.
**Ce service inclut une route pour ca** :

```bash
# Via le service lui-meme
curl http://localhost:3089/api/namemc/uuid/Notch
```

Reponse :
```json
{ "id": "069a79f444e94726a5befca90e38aaf5", "name": "Notch" }
```

Le champ `id` est l'UUID a passer dans le parametre `skin`.

Exemple de workflow complet :
```bash
# 1. Recuperer l'UUID a partir du pseudo
UUID=$(curl -s http://localhost:3089/api/namemc/uuid/Notch | jq -r '.id')

# 2. Generer la tete
curl "http://localhost:3089/api/namemc/mchead.png?skin=${UUID}&width=126&height=126" -o head.png

# 3. Generer le corps 3D
curl "http://localhost:3089/api/namemc/mcbody.png?skin=${UUID}&model=classic" -o body.png

# 4. Recuperer la texture brute pour un viewer client
curl "http://localhost:3089/api/namemc/texture/skin?skin=${UUID}" -o skin_raw.png

# 5. Voir l'historique des noms
curl "http://localhost:3089/api/namemc/namehistory/${UUID}"
```

---

## 5. Configuration

| Variable d'env | Defaut | Description |
|-----------------|--------|-------------|
| `PORT` | `3089` | Port d'ecoute du serveur Express |

---

## 6. Stack technique

| Composant | Version | Role |
|-----------|---------|------|
| Node.js | 16 LTS | Runtime |
| Express | ^4.17.1 | Serveur HTTP |
| Three.js | 0.124.0 | Rendu 3D (scene, camera, geometrie) |
| node-canvas-webgl | ^0.2.6 | Canvas + WebGL en Node.js |
| node-fetch | ^2.6.1 | Requetes HTTP vers l'API Mojang |
| Xvfb | — | Serveur X11 virtuel (framebuffer en memoire) |
| Mesa | — | Implementation logicielle d'OpenGL (pas de GPU) |

### Pourquoi xvfb-run ?

```
Three.js WebGLRenderer
  -> node-canvas-webgl (canvas + WebGL context)
    -> headless-gl (contexte WebGL natif)
      -> ANGLE (traduit WebGL -> OpenGL)
        -> GLX (extension OpenGL pour X11)
          -> Xvfb (serveur X11 virtuel)
            -> Mesa (OpenGL logiciel, pas de GPU)
```

WebGL a besoin d'un serveur X11 pour creer un contexte OpenGL, meme sans
ecran physique. Xvfb fournit ce serveur en memoire. Mesa fait le rendu
3D entierement sur le CPU.

---

## 7. Troubleshooting

### Le build Docker echoue sur `npm install`

Verifier que les libs systeme sont bien installees dans le Dockerfile.
Le package `headless-gl` (dependance de `node-canvas-webgl`) a besoin de
compiler des addons natifs C++ avec les headers OpenGL/Mesa.

### Erreur "Cannot read property 'getExtension' of null"

Le contexte WebGL n'a pas pu etre cree. Xvfb ne tourne probablement pas.
Verifier que le CMD utilise bien `xvfb-run`.

### Erreur 404 sur un endpoint

Le joueur n'existe pas ou l'API Mojang est temporairement indisponible.
Le service fait un appel a `sessionserver.mojang.com` pour chaque UUID.

### Verifier que OpenGL fonctionne dans le conteneur

```bash
docker exec -it minecraft-skin-api xvfb-run glxinfo | grep "OpenGL version"
```

Doit afficher quelque chose comme : `OpenGL version string: 3.1 Mesa 20.x.x`
