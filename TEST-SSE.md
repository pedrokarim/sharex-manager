# 🧪 Test du système SSE - ShareX Manager

Ce guide explique comment tester le système Server-Sent Events (SSE) qui permet les mises à jour en temps réel dans ShareX Manager.

## 🎯 Objectif

Tester que :
- Les fichiers uploadés apparaissent automatiquement dans la galerie (sans refresh)
- Les statistiques se mettent à jour automatiquement
- Le système SSE fonctionne correctement

## 📋 Prérequis

1. **Serveur lancé** : `bun run dev`
2. **Utilisateur de test** : Les credentials par défaut sont configurés dans `data/users.json`
3. **Navigateur** : Pour voir les mises à jour en temps réel
4. **Bun** : Pour exécuter le script de test TypeScript

## 🚀 Script de test ultra-simple

### Le script principal : `upload-test.ts`

Script **ULTRA-simple** qui fait exactement ce que vous demandez :

```bash
# Juste uploader l'image via API ShareX
bun upload-test.ts
```

**Ce que fait le script :**
1. ✅ Lit `test-image.jpg`
2. ✅ POST vers `/api/upload` avec la clé API `sk_n7-kK56IUsmUQmBTbF4yrmzRPI-Y_2V-`
3. ✅ Affiche succès/échec
4. ✅ SSE se déclenche automatiquement côté serveur

### Vérification du SSE

Après l'upload :
1. Ouvrez `http://localhost:3000/gallery`
2. L'image devrait apparaître **automatiquement** (grâce au SSE)
3. Les statistiques se mettent à jour en temps réel

### Modification du script

Pour changer la clé API ou l'URL, éditez directement `upload-test.ts` :

```typescript
const response = await fetch("http://localhost:3000/api/upload", {
  method: "POST",
  headers: { "x-api-key": "VOTRE_CLE_API" }, // Changez ici
  body: formData
});
```

## 🔄 Procédure de test

### 1. Préparer l'environnement

```bash
# Terminal 1 : Lancer le serveur
bun run dev

# Terminal 2 : Ouvrir la galerie dans le navigateur
# Aller sur http://localhost:3000/gallery et se connecter
```

### 2. Tester l'upload SSE

```bash
# Terminal 3 : Lancer le script ultra-simple
bun run test:sse
```

### 3. Vérifier les résultats

✅ **Dans la galerie** : Le fichier devrait apparaître automatiquement
✅ **Dans les statistiques** : Les compteurs devraient se mettre à jour
✅ **Dans les logs du serveur** : Vous devriez voir les événements SSE

## 🔧 Personnalisation

### Utiliser votre propre image

```bash
# Remplacer test-image.jpg par votre image
cp /chemin/vers/votre/image.jpg test-image.jpg

# Puis lancer le script
bun run test:sse
```

### Changer la clé API

Éditez `upload-test.ts` et changez la clé API dans les headers. Vous pouvez trouver vos clés dans `data/api-keys.json`.

## 🐛 Dépannage

### Problème : "Serveur non accessible"
```bash
# Vérifier que le serveur tourne
curl http://localhost:3000

# Vérifier le port
netstat -an | grep :3000
```

### Problème : "Échec de la connexion"
```bash
# Vérifier les credentials dans data/users.json
cat data/users.json

# Le mot de passe est hashé avec bcrypt
# Utilisez le mot de passe en clair dans le script
```

### Problème : "Fichier n'apparaît pas"
```bash
# Vérifier les logs du serveur pour les erreurs SSE
tail -f logs du serveur

# Vérifier que le navigateur reçoit les événements SSE
# Ouvrir les outils de développement > Network > WS/SSE
```

### Problème : "Erreur 401 Unauthorized"
```bash
# Vérifier que la clé API est correcte dans data/api-keys.json
cat data/api-keys.json

# Vérifier que la clé dans upload-test.ts correspond
```

## 📊 Logs à surveiller

### Serveur (succès)
```
[SSE] Nouvelle connexion ajoutée: files-xxx
[SSE] Événement broadcasté à 1 connexions
File uploaded successfully via API
```

### Navigateur (console)
```
Nouveau fichier uploadé via SSE: {name: "test-image.png", ...}
```

## 🔍 Tests avancés

### Test de charge
```bash
# Uploader plusieurs fichiers rapidement
for i in {1..5}; do
    bun run test:sse &
    sleep 0.5
done
```

### Vérifier les statistiques après upload
```bash
# Après upload, vérifier les stats mises à jour
curl http://localhost:3000/api/stats
```

### Vérifier les fichiers uploadés
```bash
# Lister les fichiers récents
curl "http://localhost:3000/api/files?page=1&limit=5"
```

## 🎉 Validation du test

Si tout fonctionne :
- ✅ Les fichiers apparaissent instantanément dans la galerie
- ✅ Les statistiques se mettent à jour automatiquement
- ✅ Aucune erreur SSE dans les logs
- ✅ Performance fluide sans rechargement de page

Le système SSE est opérationnel ! 🚀
