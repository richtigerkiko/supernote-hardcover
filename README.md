# Hardcover for Supernote

[![Latest release](https://img.shields.io/github/v/release/richtigerkiko/supernote-hardcover)](https://github.com/richtigerkiko/supernote-hardcover/releases/latest)
[![License: MIT](https://img.shields.io/github/license/richtigerkiko/supernote-hardcover)](LICENSE)

A Supernote plugin that keeps your [Hardcover](https://hardcover.app) reading progress up to date while you read EPUBs. Switch it on for a book, then just read.

<p>
  <img src="docs/images/book-page.png" width="200" alt="The book page: cover, edition, progress, genres and description">
  <img src="docs/images/editions.png" width="200" alt="Choosing the edition">
  <img src="docs/images/quote.png" width="200" alt="Saving a selected passage as a quote">
  <img src="docs/images/review.png" width="200" alt="Writing a review with a star rating">
</p>

## Features

- Reading progress tracking
- Book detail page with cover, info and reviews
- Quotes and notes from the text selection menu

## Requirements

- A Supernote with plugin support. Only the **Nomad** is tested ([#38](https://github.com/richtigerkiko/supernote-hardcover/issues/38)).
- A [Hardcover](https://hardcover.app) account and Wi-Fi.
- Books as EPUB files ([#16](https://github.com/richtigerkiko/supernote-hardcover/issues/16)).

## Install

1. Download `supernote-hardcover.snplg` from the [latest release](https://github.com/richtigerkiko/supernote-hardcover/releases/latest).
2. Copy it into the `MyStyle` folder on your Supernote.
3. On the Supernote: **Settings > Apps > Plugins > Select Plugin Package**, select the file, tap **Install**.
4. Open an EPUB, tap the **Plugins** icon (puzzle piece) in the toolbar and choose **Hardcover**. Allow file and internet access if asked.
5. Tap **Sign in** and scan the QR code with your phone, or open the link shown and type the code.
6. Switch **Tracking** on.

## Usage

- **Tracking** is per book and off by default. Once on, progress follows your page turns. The book must be **Currently reading** on Hardcover; switching Tracking on for a book with another status offers to set it. Reaching the last page does not mark it finished: set the status yourself.
- **Edition:** tap **Change** to pick the edition you are reading. Page numbers follow it.
- **Quotes and notes:** select text, then tap the Hardcover icon in the selection toolbar. Entries are private unless you choose otherwise, and can be edited or removed in the Journal tab.
- **Status and review:** the two buttons at the bottom of the book page.
- **Book not in your library:** the plugin asks once whether to add it.

## Troubleshooting

- **Progress is one touch behind.** A page turn is noticed at your next touch, and sent at most once every 10 seconds.
- **Nothing arrives on Hardcover.** Check Wi-Fi, that Tracking is on and the status is Currently reading. Errors show under the progress bar on the book page.
- **Book not found or title unreadable.** Fix the EPUB's metadata (title, author, ISBN), for example with Calibre, or add the book on hardcover.app.
- **"No read in progress".** Set another status, then Currently reading again.
- **Signed out or asked for a new sign-in.** Open Plugins > Hardcover and sign in again.
- **"This plugin version is too low."** The same or a newer version is already installed.

## Privacy

The plugin talks only to Hardcover: no other server, no analytics. You sign in on Hardcover's site; the tokens stay on the device. Book files never leave the device. No progress is sent until you switch Tracking on.

## Contributing

See [docs/developer.md](docs/developer.md). Bug reports and reports from other Supernote models are welcome in the [issues](https://github.com/richtigerkiko/supernote-hardcover/issues).

## License

[MIT](LICENSE). Independent community plugin, not affiliated with Hardcover or Ratta (Supernote).
