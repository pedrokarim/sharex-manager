# Guide agent — serveur

Le serveur correspond à l'application Next.js située à la racine du dépôt et à
ses modules locaux.

## Avant de modifier

1. Lire le bloc Next.js de [`AGENTS.md`](../AGENTS.md).
2. Lire le guide pertinent dans `node_modules/next/dist/docs/` avant d'écrire du
   code Next.js : cette version du framework possède des conventions qui ne
   doivent pas être déduites d'anciennes versions.
3. Pour une modification de version ou de release, lire intégralement
   [`docs/versioning.md`](../docs/versioning.md).

## Sources et version

- Identifiant du composant : `server`.
- Version publique : champ `version` du [`package.json`](../package.json).
- Changelog : [`CHANGELOG.md`](../CHANGELOG.md).
- Tags : `server-vMAJEUR.MINEUR.CORRECTIF`.
- Les modules privés dans `modules/` suivent la version serveur tant qu'ils ne
  sont pas publiés comme paquets autonomes.

## Vérifications usuelles

```sh
bun install
bunx vitest run
bun --bun next build
```

Adapter les commandes à la portée de la modification. Ne pas réparer des tests
sans rapport avec la tâche et ne pas effacer les données locales de
développement.
