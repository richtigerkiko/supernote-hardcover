import React from 'react';
import ReactTestRenderer, {act} from 'react-test-renderer';
import App from '../../src/ui/App';
import {session} from '../../src/page/session';
import {MOCK_BOOK} from '../../src/ui/preview/mockBook';
import {SLOW_MS} from '../../src/ui/theme';

// #102: a press shows no "Loading…" unless the load takes longer than SLOW_MS, the old page stays until the result is
// there.
const edition = MOCK_BOOK.editions.find(e => !e.audio && e.pages > 0)!;
const texts = (tree: any): string[] => tree.root.findAll((n: any) => n.type === 'Text').map((n: any) => n.children.join(''));
const button = (tree: any, label: string) => tree.root.findAll((n: any) => n.props.accessibilityRole === 'button' && n.props.accessibilityLabel === label)[0];
const bookResult = (title = MOCK_BOOK.title) => ({book: {...MOCK_BOOK, title}, tracking: false, sync: ''});
const later = (ms: number) => act(async () => void jest.advanceTimersByTime(ms));

// load() answers when the test says so
function deferred() {
  const calls: {resolve: (v: unknown) => void; reject: (e: unknown) => void}[] = [];
  const load = jest.fn(() => new Promise((resolve, reject) => calls.push({resolve, reject})));
  return {load, calls, answer: (i: number, v: unknown) => act(async () => calls[i].resolve(v))};
}

// the Release job runs jest next to the build: the first full render took more than the default 5 s there
jest.setTimeout(30000);
let tree: any;
async function open(api: any) {
  session.api = api;
  session.mode = 'detail';
  session.close = jest.fn();
  await act(async () => {
    tree = ReactTestRenderer.create(<App />);
  });
}

beforeEach(() => jest.useFakeTimers());
afterEach(() => {
  act(() => tree.unmount());
  jest.useRealTimers();
});

test('a fast load shows nothing until the book is there, and a second press keeps the page until its result', async () => {
  const {load, answer} = deferred();
  await open({load});
  await later(SLOW_MS - 1);
  expect(texts(tree)).toEqual([]); // blank, no "Loading…"
  await answer(0, bookResult());
  expect(texts(tree)).toContain(MOCK_BOOK.title);

  act(() => session.opened()); // the toolbar button again
  await later(SLOW_MS - 1);
  expect(texts(tree)).toContain(MOCK_BOOK.title);
  expect(texts(tree)).not.toContain('Loading…');
  await answer(1, bookResult('Another Book'));
  expect(texts(tree)).toContain('Another Book');
  expect(texts(tree)).not.toContain(MOCK_BOOK.title);
});

test('a press from another file blanks the old book until the new one is there', async () => {
  const {load, answer} = deferred();
  session.pending = Promise.resolve({path: '/a.epub', page: 1, total: 2});
  await open({load});
  await answer(0, bookResult());

  session.pending = Promise.resolve({path: '/a.epub', page: 1, total: 2});
  await act(async () => session.opened()); // same file: the page stays
  expect(texts(tree)).toContain(MOCK_BOOK.title);
  await answer(1, bookResult());

  session.pending = Promise.resolve({path: '/b.epub', page: 1, total: 2});
  await act(async () => session.opened());
  expect(texts(tree)).toEqual([]);
  await answer(2, bookResult('Another Book'));
  expect(texts(tree)).toContain('Another Book');
  session.pending = null;
});

test('a slow load shows "Loading…" after SLOW_MS, then the book', async () => {
  const {load, answer} = deferred();
  await open({load});
  await later(SLOW_MS);
  expect(texts(tree)).toContain('Loading…');
  expect(button(tree, 'Close')).toBeTruthy();
  await answer(0, bookResult());
  expect(texts(tree)).toContain(MOCK_BOOK.title);
  expect(texts(tree)).not.toContain('Loading…');
});

test('while a load runs the page takes no touches', async () => {
  const {load, answer} = deferred();
  await open({load});
  await answer(0, bookResult());
  const blocked = () => tree.root.findAll((n: any) => n.props.pointerEvents === 'none' && n.findAll((c: any) => c.props.accessibilityLabel === 'Change reading status').length).length > 0;
  expect(blocked()).toBe(false);
  act(() => session.opened());
  expect(blocked()).toBe(true);
  await answer(1, bookResult());
  expect(blocked()).toBe(false);
});

test('a message or a failed load replaces the page that was shown', async () => {
  const {load, calls, answer} = deferred();
  await open({load});
  await answer(0, bookResult());
  act(() => session.opened());
  await answer(1, {message: 'Open a book first.'});
  expect(texts(tree)).toContain('Open a book first.');
  expect(texts(tree)).not.toContain(MOCK_BOOK.title);
  act(() => session.opened());
  await act(async () => calls[2].reject(new Error('offline')));
  expect(texts(tree)).toContain('Could not load the book: offline');
  expect(button(tree, 'Retry')).toBeTruthy();
});

test('the add flow: the picker stays, one "Adding…" screen when it is slow, and no second screen for the reload', async () => {
  const {load, answer} = deferred();
  let added!: () => void;
  const addToLibrary = jest.fn(() => new Promise<void>(ok => (added = ok)));
  await open({load, addToLibrary});
  await answer(0, {pick: {bookId: 5, editions: [edition]}});
  await act(async () => button(tree, 'Use this edition').props.onPress());
  await later(SLOW_MS - 1);
  expect(button(tree, 'Use this edition')).toBeTruthy(); // still the picker
  expect(texts(tree)).not.toContain('Adding…');
  await later(1);
  expect(texts(tree)).toEqual(expect.arrayContaining(['Adding…']));
  await act(async () => added()); // reloads
  expect(load).toHaveBeenCalledTimes(2);
  await later(SLOW_MS * 2);
  expect(texts(tree)).toContain('Adding…'); // the same screen, not "Loading…"
  expect(texts(tree)).not.toContain('Loading…');
  await answer(1, bookResult());
  expect(texts(tree)).toContain(MOCK_BOOK.title);
});

test('a fast add goes from the picker straight to the book', async () => {
  const {load, answer} = deferred();
  await open({load, addToLibrary: jest.fn(async () => {})});
  await answer(0, {pick: {bookId: 5, editions: [edition]}});
  await act(async () => button(tree, 'Use this edition').props.onPress());
  await later(SLOW_MS - 1);
  expect(button(tree, 'Use this edition')).toBeTruthy();
  await answer(1, bookResult());
  await later(SLOW_MS * 2);
  expect(texts(tree)).toContain(MOCK_BOOK.title);
  expect(texts(tree)).not.toContain('Loading…');
});

test('the time a Yes/No dialog is open does not count toward the loading screen', async () => {
  const {load, answer} = deferred();
  await open({load});
  await later(SLOW_MS - 1);
  act(() => session.asking(true)); // load() asks "Add it to your library?"
  await later(SLOW_MS * 3);
  expect(texts(tree)).not.toContain('Loading…');
  act(() => session.asking(false));
  await later(SLOW_MS - 1);
  expect(texts(tree)).not.toContain('Loading…');
  await later(1);
  expect(texts(tree)).toContain('Loading…');
  await answer(0, bookResult());
  expect(texts(tree)).toContain(MOCK_BOOK.title);
});
