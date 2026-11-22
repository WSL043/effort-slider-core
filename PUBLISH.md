# Publishing

The code is ready. These are the steps that need a human, because they depend
on where the repository lives.

## 1. Fill in the metadata

`package.json` has no `repository`, `homepage`, `bugs`, or `author` fields on
purpose: inventing a URL is worse than an empty one. Add the first three once
the repository exists, so the npm page links somewhere:

```json
"repository": { "type": "git", "url": "git+<remote>.git" },
"homepage": "<project page>",
"bugs": { "url": "<issues page>" }
```

`author` can stay out; npm shows the publishing account anyway.

## 2. Verify

```sh
npm install
npm test              # 35 tests, plain Node, no DOM
npm run build         # demo.html and dist/
npm pack --dry-run    # 29 files, ~175 kB packed
```

Things to check in that output:

- The packed size stays under 250 kB. `docs/` is 85 kB of the total, all of it
  quantised README screenshots. Replacing them with fresh captures without the
  same optimisation puts ~200 kB back.
- Every path in `exports` resolves (the test suite asserts this).
- `demo.html` still opens from disk and animates.

## 3. Version

`version` in `package.json` and the assertion in `tests/core.test.mjs` move
together. Bump both, and add a `CHANGELOG.md` entry.

## 4. Publish

```sh
npm publish           # prepack runs the build
```

Then, in the repository, tag the release so the tarball and the source match:

```sh
git tag v2.1.0 && git push --tags
```

## 5. After publishing

- The README images use relative paths, so they render on npm only if `docs/`
  stays in `files`.
- Keep `demo.html` in the repository: it is the fastest way for a reader to see
  what the package does, and it needs no toolchain.
