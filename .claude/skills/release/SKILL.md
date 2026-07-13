---
name: release
description: Cut a new version of the Yena Candidate Clipper — bump the version, sync the manifest, build, and validate the Web Store zip. Use when the user asks to release, ship, publish, or bump the version of the extension.
disable-model-invocation: true
---

# Release the extension

Cuts a Chrome Web Store-ready build. The version number lives in **`package.json`** —
`build.mjs` stamps it into `dist/manifest.json`. `src/manifest.json` must be bumped too or
the build prints a warning.

Take the bump level from the user's request (patch / minor / major). If they didn't say,
ask — don't guess.

## Steps

1. **Check the tree is clean.** `git status --short`. Uncommitted `src/` changes mean the
   release would ship work-in-progress — stop and ask.

2. **Bump both files to the same version:**
   - `package.json` → `version`
   - `src/manifest.json` → `version`

   These must match. Anything else is a build warning and a confusing store listing.

3. **Build:** `npm run build`. It must print `Built dist/ ...` with the new version and
   `Packaged yena-clipper.zip`, and no `!` warning line.

4. **Validate the package** before anyone uploads it:
   ```bash
   unzip -l yena-clipper.zip
   ```
   - contains `manifest.json`, `contentScript.js`, `background.js`, `popup.html`,
     `popup.js`, `icons/` (4 PNGs)
   - contains **no** `README.md`, no `_metadata/`, no `.env`, no source maps
   - the manifest version inside matches the bump

5. **Manifest sanity** — reject the release if any of these regressed:
   - `host_permissions` are still narrow (`*.yena.ai`, `localhost`, `127.0.0.1`). Broad
     hosts trigger a Chrome Web Store permission review.
   - `permissions` is still just `["storage"]`.
   - `background.js:allowedHost()` still mirrors `host_permissions`.
   - no hardcoded token, API key, or customer domain anywhere in `src/`.

6. **Smoke-test in Chrome** — the build is a file copy, so it proves nothing on its own.
   Tell the user to load `./dist` unpacked, open a LinkedIn profile, and exercise the
   panel. State clearly that this step is theirs to do (you cannot).

7. **Commit** the two version bumps only (`dist/` and the zip are gitignored) with a
   message like `chore: release v<version>`. Only push or tag if the user asks.

Finally, tell the user the zip is at `yena-clipper.zip` in the repo root, ready to upload
to the Chrome Web Store dashboard, and repeat anything from step 4/5 that looked off.
