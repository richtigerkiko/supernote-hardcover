// The reader returns a selection with a hard \n at every line wrap of the page. Join wrapped lines into
// sentences and keep blank-line gaps as paragraph breaks.
// shortcut: a word hyphenated across a line break keeps its hyphen and a space ("recog- nise"); upgrade if it shows up.
export function cleanQuote(raw) {
  return String(raw ?? '')
    .replace(/\r/g, '')
    .split(/\n{2,}/)
    .map(p => p.replace(/\s*\n\s*/g, ' ').replace(/[ \t]+/g, ' ').trim())
    .filter(Boolean)
    .join('\n\n');
}
