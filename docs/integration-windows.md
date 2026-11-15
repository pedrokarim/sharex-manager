# Configuration sous Windows (ShareX)

Sous Windows, on utilise **[ShareX](https://getsharex.com)**, le client officiel. ShareX Manager génère un fichier `.sxcu` que ShareX importe en un double-clic.

---

## Prérequis

- **[ShareX](https://getsharex.com)** installé (gratuit, open-source).

---

## 1. Récupérer la configuration `.sxcu` depuis ShareX Manager

1. Connecte-toi à ShareX Manager.
2. Va dans **Paramètres → Intégrations**, panneau **ShareX** (Windows).
3. Onglet **« Créer une clé »** : garde ou change le nom et les permissions, puis crée la clé.
4. Clique sur **« Télécharger le fichier .sxcu »** (le fichier s’appelle `sharex-windows.sxcu` pour le nom proposé). La clé ne s’affiche qu’une fois : télécharge le fichier avant de fermer.

Tu as déjà une clé ? Onglet **« J’ai déjà une clé »** : colle-la, le fichier est fabriqué dans le navigateur sans que la clé parte au serveur.

---

## 2. Importer dans ShareX

**Méthode rapide :** double-clique sur le fichier `sharex-manager.sxcu` → ShareX propose d'importer l'uploader personnalisé → **Oui**.

**Méthode manuelle :** dans ShareX → **Destinations → Custom uploader settings… → Import → From file** (ou *From clipboard* si tu as juste copié la config).

ShareX configure automatiquement la/les destination(s) (image / fichier / texte) selon les permissions de ta clé.

---

## 3. Activer la destination

Dans **Destinations**, vérifie que **« ShareX Upload »** (l'uploader importé) est bien sélectionné comme :

- **Image uploader**
- **File uploader** (si tu uploades aussi des fichiers)
- **Text uploader** (si activé)

---

## 4. Capturer

Utilise le raccourci de capture de ShareX (par défaut **Impr. écran** pour la capture de région), ou personnalise-le dans **Hotkey settings**.

Après la capture, ShareX envoie l'image à ShareX Manager et **copie l'URL** dans le presse-papier.

---

## Dépannage

| Symptôme | Cause / solution |
| --- | --- |
| L'URL n'est pas copiée | **After upload tasks** → active *Copy URL to clipboard* |
| Erreur **401 / 403** | Clé API invalide, expirée, ou permission manquante pour ce type de fichier → recrée une clé |
| Mauvaise destination utilisée | Vérifie l'uploader actif dans **Destinations** |
| L'upload échoue silencieusement | Ouvre **ShareX → History / Debug log** pour voir la réponse du serveur |

---

📖 Voir aussi : **[Configuration sous Linux (Flameshot + fu)](integration-linux.md)**.
