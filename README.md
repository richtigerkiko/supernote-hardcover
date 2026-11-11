# HardcoverSync (Supernote plugin)

Keeps your [Hardcover](https://hardcover.app) reading progress up to date while you read EPUBs in DOC on a Supernote. Switch it on for a book, then just read.

It runs fully on the device. The only network traffic is to the Hardcover API.

## What it does

- **Tracks the book you have open.** Every page turn is sent, forwards or backwards, at most once every 10 seconds; pages turned in between go out with the next touch after that.
- **Finds the book by itself.** Title, author and ISBN come from the EPUB's metadata, not the filename, and are matched against your Hardcover library.
- **Uses your edition.** Pick the edition you own and page counts are computed against it. Font size and orientation changes don't matter.
- **Off by default, per book.** A Tracking toggle on each book's page decides what gets sent.
- **Book page.** The **Hardcover** toolbar button opens a full-screen page with progress, cover, genres, moods and tags, the description, your reading status and the edition picker. It also shows the last sync, or the error if there was one.
- **Quotes and notes.** Select text, then tap the plugin's button in the selection toolbar. A card saves the passage as a quote (with your thoughts under it if you add any) or a note to your Hardcover reading journal, on the page you are at. Entries are private unless you choose otherwise.

## Install

Copy `HardcoverSync.snplg` to the device's `MyStyle` folder, then Settings > Apps > Plugins > Add Plugin and select it. Open an EPUB, tap **Hardcover**, and turn Tracking on.

## Build from source

Needs Node, JDK 17 and the Android SDK (platform 35, build-tools 35.0.0, NDK 27.1.12297006), and your Hardcover OAuth client id (a public client with the device grant) as `HARDCOVER_OAUTH_CLIENT_ID` in `../../.env`.

```powershell
npm install
npm run build   # writes build\outputs\HardcoverSync.snplg
npm test
```

No token is bundled: open the Hardcover page on the device and sign in with the code it shows.

## Notes

- EPUB only. PDFs are not supported yet.
- Tracking follows your touches, not a timer, so a page turned at the last tap is reported at your next touch.
- How it works, measurements from the device and build details are in [CLAUDE.md](CLAUDE.md).
