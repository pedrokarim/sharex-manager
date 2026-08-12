# Instructions pour les agents

Ce dossier complète les règles racine de [`AGENTS.md`](../AGENTS.md). Il sert
d'index opérationnel ; la politique de versioning canonique reste
[`docs/versioning.md`](../docs/versioning.md).

## Routage par périmètre

| Périmètre | Répertoires principaux | Instructions |
| --- | --- | --- |
| Serveur web et API | `app/`, `components/`, `lib/`, `modules/`, racine | [server.md](server.md) |
| Application mobile | `sharex-mobile/` | [mobile.md](mobile.md) |
| Versioning et releases | tout fichier de version, tag ou workflow | [`docs/versioning.md`](../docs/versioning.md) |

Une modification transversale doit respecter les deux guides. En cas de
contradiction, les instructions les plus proches du fichier concerné priment,
puis `AGENTS.md`, puis ce dossier.

## Règles communes

- Examiner l'état Git avant toute modification et conserver les changements
  sans rapport avec la tâche.
- Utiliser `server` et `mobile` comme scopes dans les commits et les tags.
- Ne pas considérer une compilation réussie comme une autorisation de publier.
- Ne pas modifier une version pour un simple build de test.
- Documenter tout changement visible par l'utilisateur dans la section
  `Unreleased` du changelog du composant concerné.
- Garder les secrets de signature dans GitHub Secrets, EAS Credentials ou le
  trousseau du poste de build, jamais dans le dépôt.
