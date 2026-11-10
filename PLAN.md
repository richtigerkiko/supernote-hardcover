# Hardcover Sync: status

The first plan (manual sync button, filename matching, a picker) was replaced after probing the device. The design that is built and running is in `CLAUDE.md`. This file keeps only what is still open.

## Done and verified on the device

- Install, tracking from plugin load with no button press (touch-driven).
- Book identification from EPUB metadata and ISBN lookup (real files and real account).
- Progress push on each 2% step crossed, no timers (verified on the Nomad 2026-11-09 22:04: 3 pushes for 22 pages, correct edition pages, same journal entry updated in place).

- Native module (read/write/stat), persistent EPUB metadata cache across restarts, settings file in MyStyle after FILE:WRITE (verified 2026-11-09 22:20).

- Detail page layout designed on the Android emulator (1404x1872 at 300 dpi) from real Hardcover data: one screen, fixed action bar, worst-case mock checked.

## Open

1. **Quote saving**: switched off. Verify the journal event name and metadata (a private test entry, read back, deleted), then set `QUOTES_ENABLED`.
2. **Merge window of progress journal entries**: at least 71 minutes measured (an entry created 19:53 UTC was updated in place at 21:04 UTC); probably per day.
3. **Exercise on the device**: Pause/Resume, a book not on the reading list, the 401 path, returning to a book after a break, a rate-limit (429) retry.
4. **Detail page**: wired (button opens it, real book data, status and edition choices, tracking toggle), built as versionCode 20 but NOT yet tried on the Nomad. Still to do: Write review (needs typing: the Nomad keyboard is expected to work, untested in a plugin view), a settings screen for the quote privacy, check status id 4 (Paused) with a controlled write, whether `update_user_book(status_id)` and `edition_id` on the read behave as expected.
5. **PDFs and the Hardcover edition switch** (file edition vs the reading entry's edition): not started.
6. **Device checks for the review fixes** (PR "should fix"): a 2% step pushes and the page shows "Last sync"; picking Paused asks first and Cancel leaves the status alone; no "Save quote" button on a text selection.
