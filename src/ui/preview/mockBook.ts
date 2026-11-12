// Mock detail data for designing the page on the emulator. It is the real Hardcover record of The Butcher of Nazareth
// (book 2312000, fetched 2026-11-09 with books_by_pk { title subtitle release_year rating ratings_count reviews_count
// image { url } cached_tags description } and its editions; cached_tags groups the tags by category: Genre, Mood, Tag).
import type {BookDetail, JournalItem} from '../../core/types';

export const MOCK_BOOK: BookDetail = {
  title: 'The Butcher of Nazareth',
  subtitle: 'A Novel',
  authors: ['David Scott Hay'],
  cover: 'https://assets.hardcover.app/edition/32560293/5e7f9599-5fe8-4f07-961c-a54527653698.jpg',
  rating: 3.8,
  ratingsCount: 5,
  status: 'Currently reading',
  progress: 106 / 330,
  genres: ['Literature & Fiction', 'Horror', 'Fantasy'],
  moods: ['dark'],
  tags: ['religious horror', 'Fathers and sons'],
  description: "Haunting visions drive a grieving butcher to hunt down an obese, pre-ministry Jesus to prevent an age of fire and ash.\n\nBut when the Butcher ‘adopts’ a dead newborn, his hunt for the son of Nazareth takes a personal and horrific turn.\n\nHow does one choose between personal redemption and world-wide salvation?\n\nFrom Bethlehem to Jerusalem to Nazareth, familiar events and figures are reimagined with a modern sensibility, building to a gut-wrenching conclusion.\n\nA heart of darkness story that explores: fathers and sons, grief, zealotry, and choice.",
  editions: [
    {id: '32560293', format: 'Paperback', publisher: 'Whiskey Tit Books', year: 2026, pages: 330, lang: 'English', isbn: '9781952600562'},
    {id: '33433135', format: 'Kindle Edition', publisher: 'S&S/Saga Press', year: 2026, pages: 288, lang: 'English', isbn: '9781668287323'},
    {id: '33454669', format: 'Paperback', publisher: 'S&S/Saga Press', year: 2026, pages: 336, lang: 'English', isbn: '9781668287309'},
    {id: '33415296', format: 'Audible', publisher: 'Simon Maverick', year: 2026, pages: 0, lang: 'English', audio: true},
  ],
  editionId: '32560293',
  editionSaved: false,
};

// A worst case for the layout: long title, several authors, many chips, no cover, no rating, long description.
export const MOCK_LONG: BookDetail = {
  title: 'The Extraordinarily Long Title of a Remarkably Wordy Book About Almost Nothing in Particular',
  subtitle: 'A Complete and Unabridged Account in Three Volumes',
  authors: ['Alexandra Montgomery-Featherstonehaugh', 'Christopher Wolfeschlegelsteinhausenbergerdorff'],
  cover: null,
  rating: null,
  status: 'Currently reading',
  progress: 311 / 1248,
  genres: ['Literature & Fiction', 'Historical Fiction', 'Science Fiction & Fantasy', 'Mystery, Thriller & Suspense', 'Biography'],
  moods: ['adventurous', 'challenging', 'emotional', 'reflective', 'mysterious'],
  tags: ['coming of age', 'found family', 'unreliable narrator', 'slow burn', 'political intrigue', 'family saga'],
  description: 'A very long description. '.repeat(40),
  editions: [
    {id: 'w1', format: 'Hardcover', publisher: 'Example Press', year: 1999, pages: 1248, lang: 'English'},
    {id: 'w3', format: 'Paperback', publisher: 'Example Press', year: 2001, pages: 1304, lang: 'English'},
    {id: 'x1', format: 'Special Collector Illustrated Hardcover Edition', publisher: 'The Very Long Named Publishing House International', year: 1999, pages: 1248, lang: 'Portuguese (Brazilian)', isbn: '9781234567890'},
    {id: 'x2', format: 'Paperback', publisher: 'Example Press', year: 2001, pages: 1304, lang: '', isbn: '9780306406157'},
    {id: 'x3', format: 'Ebook', publisher: '', year: null, pages: 1248, lang: ''},
    {id: 'w7', format: 'Audiobook', publisher: 'Example Audio', year: 2016, pages: 0, lang: 'English', audio: true},
  ],
  editionId: 'w1',
  editionSaved: true,
};

// Mock reviews for the emulator preview (shape of hardcover.fetchReviews).
const LONG_REVIEW = 'A bold, strange and often brutal retelling. '.repeat(30).trim();
export const MOCK_REVIEWS = [
  {id: 1, user: 'Marlene', supporter: true, rating: 4.5, text: LONG_REVIEW, spoiler: false, date: '2026-10-02'},
  {id: 2, user: 'Tobias', supporter: false, rating: 3, text: 'Short and sharp.', spoiler: false, date: '2026-09-18'},
  {id: 3, user: 'A reader with a very long display name indeed', supporter: false, rating: null, text: 'The ending ruined it for me.', spoiler: true, date: '2026-09-01'},
];

// Mock journal for the emulator preview (shape of hardcover.fetchJournal).
export const MOCK_JOURNAL: JournalItem[] = [
  {id: 1, event: 'quote', entry: 'Call me Ishmael. Some years ago, never mind how long precisely.\n\n━━━\n\nThe best opening line.', page: 1, date: '2026-11-10', privacy: 3},
  {id: 2, event: 'note', entry: 'Slow start, but the second act pays it off.', page: 106, date: '2026-11-08', privacy: 1},
  {id: 3, event: 'quote', entry: 'A quote with no thoughts of its own.', page: null, date: '2026-11-01', privacy: 2},
];
