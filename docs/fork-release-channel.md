# DDonlien fork release channel

This fork keeps bento/slides' update trust and live-collaboration trust
separate:

- app shells verify update manifests with the DDonlien public P-256 key in
  `kernel/src/update.ts`;
- shells check
  `https://ddonlien.github.io/bento/releases/slides/manifest.json`;
- optional language packs continue to verify against bento.page's official
  public key; this does not let that key authorize app-shell updates;
- collaboration remains on `wss://sync.bento.page` through
  `kernel/src/sync/online.ts` unless a document already carries a different
  Relay URL in `doc.collab.room`.

The private release key lives only at
`~/.bento/ddonlien-release-key.json` on the maintainer's machine. Never commit
it, copy it into CI, or print its contents. Losing it or rotating it without a
transition strands every shell already shipped from this fork.

## Build and sign locally

Build from a clean, reviewed revision and keep the numeric package version
strictly increasing:

```sh
cd slides
npm ci
npm run build:single
cd ..
node scripts/shell-gate.mjs slides/dist-single/Bento_Slides.bento.html
node scripts/sign-release.mjs slides/dist-single/Bento_Slides.bento.html \
  --key ~/.bento/ddonlien-release-key.json \
  --url https://ddonlien.github.io/bento/releases/slides/Bento_Slides.bento.html \
  --out slides/dist-single/manifest.json
```

The GitHub Pages origin must contain the signed `manifest.json` and the exact
shell bytes whose SHA-256 the manifest pins. Do not rebuild the shell after
signing. The Pages site is deliberately not enabled by source changes alone;
publishing remains a separate maintainer action.

## First migration of an existing deck

An upstream shell trusts the upstream public key, so it cannot accept the first
DDonlien-signed update. Re-shell it once with `scripts/reshell-file.mjs`. That
copies the existing plaintext `#bento-doc` block byte-for-byte into the new
shell, preserving `docId`, encryption envelopes, collaboration credentials and
saved CRDT state. After that bootstrap, the file trusts this channel.

Changing the update key does not migrate or invalidate a live room. Changing
the Relay host does: existing `doc.collab.room` values keep their original host,
and moving them requires rotating collaboration keys and redistributing fresh
copies.
