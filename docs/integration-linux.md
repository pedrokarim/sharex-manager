# Configuration sous Linux (Flameshot + `fu`)

Sous Linux, ShareX n'existe pas. On utilise **[`fu` (flameshot-uploader)](https://github.com/pedrokarim/flameshot-uploader)**, un petit outil en ligne de commande qui lit **le même fichier `.sxcu`** que ShareX et envoie tes captures [Flameshot](https://flameshot.org) vers ShareX Manager.

> 💡 Le `.sxcu` généré par ShareX Manager fonctionne avec `fu` **sans aucune modification**.

---

## Prérequis

- Une distribution Linux **x86_64**. Le tutoriel des raccourcis montre **GNOME** (Ubuntu) ; les autres environnements (KDE, XFCE…) suivent le même principe.
- **Flameshot**, **xclip** (ou `xsel`) et **jq** :

```sh
# Debian / Ubuntu
sudo apt install flameshot xclip jq

# Arch
sudo pacman -S flameshot xclip jq

# Fedora
sudo dnf install flameshot xclip jq
```

> ⚠️ **`jq` est obligatoire** : `fu` l'utilise pour extraire l'URL renvoyée par ShareX Manager dans la réponse JSON. Sans `jq`, la capture est envoyée mais aucune URL n'est récupérée.

---

## 1. Installer `fu`

```sh
curl -fsSL https://pedrokarim.github.io/flameshot-uploader/install.sh | sh
```

Le binaire est installé dans `~/.local/bin` (l'installeur te prévient si ce dossier n'est pas dans ton `PATH`). Vérifie :

```sh
fu show
```

---

## 2. Récupérer la configuration `.sxcu` depuis ShareX Manager

1. Connecte-toi à ShareX Manager.
2. Va dans **Paramètres → Clés API**.
3. **Crée une clé API** en cochant les permissions voulues (images, fichiers, texte).
4. Ouvre le **détail de la clé** → onglet **« Configuration ShareX »**.
5. Clique sur **Copier**.
6. Colle le contenu dans un fichier, par exemple `~/sharex-manager.sxcu`.

La configuration ressemble à ceci :

```json
{
  "Version": "14.0.0",
  "Name": "ShareX Upload",
  "DestinationType": "ImageUploader, FileUploader",
  "RequestMethod": "POST",
  "RequestURL": "https://ton-domaine/api/upload",
  "Headers": { "x-api-key": "sk_xxxxxxxxxxxx" },
  "Body": "MultipartFormData",
  "FileFormName": "file",
  "URL": "{json:url}",
  "ThumbnailURL": "{json:thumbnail_url}",
  "DeletionURL": "{json:deletion_url}",
  "ErrorMessage": "{json:error}"
}
```

> ✅ Ce fichier est **100 % compatible avec `fu`** : il comprend les en-têtes (`x-api-key`), l'envoi `multipart/form-data` et la syntaxe `{json:url}` (équivalente à `$json:url$`).

---

## 3. Enregistrer l'uploader dans `fu`

```sh
fu add ~/sharex-manager.sxcu      # copie le .sxcu dans ~/.fu/uploaders/
fu default sharex-manager         # le nom = le fichier sans « .sxcu »
fu show                           # l'uploader par défaut s'affiche en gras
```

Test rapide :

```sh
fu gui     # Flameshot s'ouvre → sélectionne une zone → l'URL est copiée
```

---

## 4. Associer la touche **Impr. écran** à `fu gui` (GNOME)

Pour déclencher capture + upload d'une seule touche, on crée un raccourci clavier personnalisé.

### a. Ouvrir les raccourcis clavier

**Paramètres → Clavier → « Voir et personnaliser les raccourcis »**.

![Paramètres → Clavier](https://img.ascencia.re/NLStg105R6WO.png)

### b. Libérer la touche Impr. écran

GNOME associe par défaut **Impr. écran** à sa propre capture. Dans la catégorie **Captures d'écran**, passe **« Effectuer une capture d'écran interactivement »** sur **Désactivé** (sélectionne la ligne puis appuie sur **Retour arrière**). Sinon, la touche déclenchera l'outil GNOME au lieu de `fu`.

![Désactiver la capture interactive de GNOME](https://img.ascencia.re/mjGWdS4Trgmm.png)

### c. Ouvrir « Raccourcis personnalisés »

Reviens à la liste des catégories et ouvre **Raccourcis personnalisés**…

![Raccourcis personnalisés](https://img.ascencia.re/SLBgUnty7xqw.png)

…puis clique sur **+** pour en ajouter un.

![Ajouter un raccourci](https://img.ascencia.re/cHlLpq5Jydgj.png)

### d. Renseigner le raccourci

- **Nom** : `Trigger flameshot uploader`
- **Commande** : `fu gui`
- **Raccourci** : appuie sur la touche **Impr. écran** (Print)

![Définir le raccourci personnalisé](https://img.ascencia.re/Sv3oyLAPXNW0.png)

Valide – c'est prêt ! 🎉

---

## 5. Utilisation au quotidien

Appuie sur **Impr. écran** → Flameshot s'ouvre → sélectionne une zone → la capture part vers ShareX Manager et **l'URL est copiée dans le presse-papier** (avec une notification).

Autres commandes utiles :

| Commande | Effet |
| --- | --- |
| `fu gui` | Capture d'une zone (interface Flameshot) |
| `fu screen` | Capture de l'écran courant |
| `fu full` | Capture de tout le bureau |
| `fu gui -n` | Capture **sans** upload (copie seulement) |
| `fu show` | Liste des uploaders (le défaut en gras) |

---

## Dépannage

| Symptôme | Cause / solution |
| --- | --- |
| L'image est copiée mais rien n'est uploadé | Aucun uploader par défaut → `fu default sharex-manager` |
| Capture envoyée mais **aucune URL** | `jq` manquant → `sudo apt install jq` |
| Erreur **401 / 403** | Clé API invalide, expirée, ou permission manquante pour ce type de fichier → recrée une clé |
| `fu: command not found` | `~/.local/bin` absent du `PATH` → ajoute `export PATH="$HOME/.local/bin:$PATH"` à ton `~/.bashrc` / `~/.zshrc` |
| Impr. écran ouvre l'outil GNOME | L'étape **4.b** (désactivation) n'a pas été faite |

---

📖 Voir aussi : **[Configuration sous Windows (ShareX)](integration-windows.md)**.
