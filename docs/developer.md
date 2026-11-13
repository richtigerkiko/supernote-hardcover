# Developer guide

How to build, test and release the plugin. To install and use it, see the [README](../README.md).

The plugin is a React Native app (TypeScript) built on Supernote's `sn-plugin-lib`, with a small native module (file read, delete, stat) and a SQLite database (`react-native-sqlite-storage`, vendored in `node_change/`) for the sign-in tokens and the per-file data. It talks to Hardcover through `@hardcover/sdk`.

## Prerequisites

- Node 22.13 or newer (the store tests use `node:sqlite`; CI uses 22)
- JDK 17
- Android SDK with platform 35, build-tools 35.0.0 and NDK 27.1.12297006
- A Hardcover OAuth client id (below)
- To try it on a device: a Supernote with plugin support and `adb`

## Hardcover OAuth client id

The package holds no token and no secret, only a public OAuth client id. Users sign in on the device with the OAuth device grant. The id used for the published releases is a CI secret, so for your own builds create one:

1. Open [New Developer App](https://hardcover.app/account/developer-apps/new) on hardcover.app.
2. Application type: **Mobile, desktop, or CLI**. Give it a name; users see it on the consent screen.
3. Leave **Device Authorization Grant** on. No redirect URI is needed.
4. Allow these scopes (the list is `SCOPES` in [`src/hardcover/auth.ts`](../src/hardcover/auth.ts)): `read:me:content`, `read:library`, `write:library`, `read:catalog`, `write:reviews`, `read:social`, `write:social`, `read:journal`.
5. Give the client id to the build, either as the environment variable `HARDCOVER_OAUTH_CLIENT_ID` or in a `.env` file in the repo root (gitignored):

   ```
   HARDCOVER_OAUTH_CLIENT_ID=your-client-id
   ```

`scripts/write-client-id.js` copies it into `src/clientId.generated.js` (gitignored) before each build. Hardcover's own guide is [Getting started with OAuth: native clients](https://docs.hardcover.app/api/oauth/getting-started-device/).

## Build, test, lint

```sh
npm ci
npm test            # jest
npx tsc --noEmit    # type check
npm run lint        # eslint
```

These three checks run in CI on every pull request ([`.github/workflows/test.yml`](../.github/workflows/test.yml)).

Build the package:

```powershell
# Windows (PowerShell)
npm run build
```

```sh
# Linux and macOS (this is what CI runs)
node scripts/write-client-id.js
bash scripts/buildPlugin.sh
```

Both write `build/outputs/supernote-hardcover.snplg`, about 7 MB. A package well under 1 MB has no native code (`app.npk`: the `HardcoverNative` module and the SQLite package) in it and will not work: the Gradle step failed, so check its output.

## Install your build on a device

The Supernote installer only accepts a package whose `versionCode` is higher than the one installed, and the name does not matter. The checked-in `PluginConfig.json` holds a low baseline, while released builds have codes like `60005`. So before a local build, raise `versionCode` in `PluginConfig.json` above what is on your device (do not commit that change). Otherwise the device answers "This plugin version is too low."

```sh
adb push build/outputs/supernote-hardcover.snplg /storage/emulated/0/MyStyle/supernote-hardcover.snplg
```

In Git Bash on Windows, set `MSYS_NO_PATHCONV=1` first, or the device path is rewritten.

Then on the device: Settings > Apps > Plugins > Select Plugin Package, pick the file, tap Install.

Logs: `adb logcat -s ReactNativeJS`. Lines from the plugin start with `[hardcover]`.

Note that `adb shell input tap` does not reach the plugin's touch listener, so progress tracking can only be tested with real touches.

## Layout

| Path | What is in it |
|---|---|
| `index.js`, `src/plugin.ts` | Entry point; boot and wiring. |
| `src/device/` | The only code that touches the Supernote SDK and the native module: reading the open document, permissions, files, the SQLite database. |
| `src/hardcover/` | The Hardcover API client and sign-in. |
| `src/core/` | Pure logic and shared types: EPUB metadata (a PDF has none: the reader picks book and edition), book matching, the progress tracker, journal and quote formatting. |
| `src/page/` | What the plugin does for the pages, built with injected dependencies so tests can pass fakes. |
| `src/ui/` | The pages (book page, journal, review, edition picker, messages) and the theme. Never imports the SDK. |
| `android/` | The React Native host app and the `HardcoverNative` module (file read, delete, stat). |
| `node_change/` | The vendored, Android-only `react-native-sqlite-storage` (patched so the database opens in the plugin's private directory). |
| `__tests__/` | Jest tests, mirroring `src/`. |
| `scripts/` | Build scripts, `write-client-id.js`, `next-version.js` (release versions). |

Imports go one way: `ui` -> `page`/`core`, `page` -> `core`/`hardcover`/`device`, and `core` imports only `core`. Everything outside `src/plugin.ts` and `src/device/` is SDK-free and unit tested.

The internals (how tracking decides when to send, what was measured on the device, the sign-in details, API findings) are in [CLAUDE.md](../CLAUDE.md). It is written for AI coding agents, but it is the most complete reference.

## Branches, commits and releases

- Open pull requests against **`dev`**. They are squash-merged, so the PR title becomes the commit.
- Commit messages and PR titles follow [Conventional Commits](https://www.conventionalcommits.org): `<type>(<scope>): <summary>`, for example `fix(sync): keep the edition when a read already exists`. Types: `feat fix docs style refactor perf test build ci chore revert`.
- A release is a PR from `dev` to `main`, merged with a **merge commit** (not squashed, so every `feat` and `fix` title reaches `main`). The push to `main` publishes the release ([`.github/workflows/release.yml`](../.github/workflows/release.yml)).
- Every push to a `dev` to `main` PR also publishes a `-dev` pre-release for testers. For a test build of another branch, run the Release workflow by hand on it (`gh workflow run release.yml --ref <branch>`).
- CI computes the version from the commits since the last tag (`scripts/next-version.js`): `feat` bumps minor, `fix` and `perf` bump patch, a breaking change bumps major; `docs`, `chore`, `ci`, `refactor` and the rest release nothing. The version in the repo is only a baseline and CI never commits back.
- `versionCode` is `(major*10000 + minor*100 + patch)*100 + build`, so it only ever rises. Tags look like `v0.6.0-60005`.

## Other Supernote models

Only the Nomad (A6 X2) has been tested on hardware. The pages are sized for its screen and scaled uniformly on others, which is untested. Each time a page opens, the plugin logs a line like `[hardcover] window 749x998 dp, density 1.875, scale 1 device type 4`. If you try another model, that line and a screenshot in an issue help a lot.
