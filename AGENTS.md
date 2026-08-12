<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# ShareX Manager repository rules

This repository is a monorepo with two independently versioned products:

- `server`: the Next.js application at the repository root;
- `mobile`: the Expo/React Native application in `sharex-mobile/`.

Before changing code, read [`.agents/README.md`](.agents/README.md) and the
component guide that matches the files being changed. Before changing any
version, tag, changelog, build number, or release workflow, read
[`docs/versioning.md`](docs/versioning.md) completely.

## Release safety

- Normal fixes and features do not bump a version by themselves.
- Only prepare a version bump when the user explicitly asks for a release or a
  version change.
- Never create or move a Git tag, publish a GitHub Release, submit to a store,
  or rotate signing credentials without an explicit request.
- Keep server and mobile versions independent. A change affecting only one
  component must not bump the other component.
- Never commit signing certificates, keystores, provisioning profiles, API
  keys, Expo tokens, or their passwords.

## Validation

- Server changes: run the smallest relevant tests, then `bun run build` when a
  production build is relevant.
- Mobile TypeScript changes: run `cd sharex-mobile && npx tsc --noEmit`.
- Mobile dependency or native changes: also run
  `cd sharex-mobile && npx expo-doctor` and a native production build when the
  task requires an installable artifact.
- Preserve unrelated work in a dirty worktree.
