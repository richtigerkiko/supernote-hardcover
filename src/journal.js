import {toPages} from './match';
import {cleanQuote} from './quote';

// Hardcover renders this line as a divider between the passage and the reader's thoughts.
export const SEPARATOR = '\n\n━━━\n\n';

// Reader page (0-based, of total) -> the journal position Hardcover shows as "p. N", or null.
export function journalPosition(pageIndex, total, editionPages) {
  const value = toPages(pageIndex, total, editionPages); // already clamped to 1..editionPages
  return value == null ? null : {type: 'pages', value, percent: (value / editionPages) * 100, possible: editionPages};
}

// The entry text, or '' when there is nothing to save.
export function journalEntry(event, passage, text) {
  const thoughts = String(text ?? '').trim();
  if (event === 'note') return thoughts;
  const quote = cleanQuote(passage);
  return quote && thoughts ? quote + SEPARATOR + thoughts : quote;
}
