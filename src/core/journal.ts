import {toPages} from './match';
import {cleanQuote} from './quote';

// Hardcover renders this line as a divider between the passage and the reader's thoughts.
export const SEPARATOR = '\n\n━━━\n\n';

// Reader page (0-based, of total) -> the journal position Hardcover shows as "p. N", or null.
export function journalPosition(pageIndex: number, total: number, editionPages: number | null) {
  const value = toPages(pageIndex, total, editionPages); // already clamped to 1..editionPages
  return value == null || !editionPages ? null : {type: 'pages', value, percent: (value / editionPages) * 100, possible: editionPages};
}

// The entry text, or '' when there is nothing to save.
export function journalEntry(event: 'quote' | 'note', passage: string | null | undefined, text: string | null | undefined): string {
  const thoughts = String(text ?? '').trim();
  if (event === 'note') return thoughts;
  const quote = cleanQuote(passage);
  return quote && thoughts ? quote + SEPARATOR + thoughts : quote;
}

// The inverse of journalEntry: a quote is passage + SEPARATOR + thoughts (thoughts optional), a note is all thoughts.
export function splitEntry(event: 'quote' | 'note', entry: string): {passage: string; thoughts: string} {
  if (event === 'note') return {passage: '', thoughts: entry};
  const i = entry.indexOf(SEPARATOR);
  return i < 0 ? {passage: entry, thoughts: ''} : {passage: entry.slice(0, i), thoughts: entry.slice(i + SEPARATOR.length)};
}

// An edited entry: the passage is kept exactly as stored (cleanQuote would reflow another client's line breaks).
export const joinEntry = (passage: string, thoughts: string): string => {
  const t = thoughts.trim();
  return passage && t ? passage + SEPARATOR + t : passage || t;
};
