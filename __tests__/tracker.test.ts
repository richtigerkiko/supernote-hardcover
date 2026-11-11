import type {ReadingItem, ReadRecord} from '../src/hardcover';
import {createTracker, type TrackerDeps} from '../src/tracker';

const BUTCHER: ReadingItem = {
  userBookId: 7,
  bookId: 2312000,
  statusId: 2,
  title: 'The Butcher of Nazareth',
  authors: ['David Scott Hay'],
  editionId: 32560293,
  editionPages: 330,
  read: null,
};
const readOf = (id: number): ReadRecord => ({id, started_at: null, finished_at: null, progress_pages: null, edition_id: null});
const PATH = '/Document/ebooks/butcher.epub';
const TOTAL = 332;
// 332 reader pages on a 330-page edition: index 81 is edition page 82, index 86 page 87; pushes are throttled to one per 10 s
const WINDOW = 10_001;

const setup = ({item = BUTCHER, pushFails}: {item?: ReadingItem | null; pushFails?: string} = {}) => {
  let t = 1_000_000;
  const pushes: number[] = [];
  const resolves: string[] = [];
  const tracker = createTracker({
    now: () => t,
    resolve: async path => (resolves.push(path), item),
    push: async (it, pages) => {
      if (pushFails) throw new Error(pushFails);
      pushes.push(pages);
    },
  });
  return {tracker, pushes, resolves, advance: (ms: number) => (t += ms)};
};
const at = (page: number, total = TOTAL, path = PATH) => ({path, page, total});
const edition = (page: number, total = TOTAL) => Math.round(((page + 1) / total) * 330);

test('first sight of a book pushes nothing, however long you stay', async () => {
  const {tracker, pushes, advance} = setup();
  await tracker.tick(at(81));
  advance(3_600_000);
  await tracker.tick(at(81));
  expect(pushes).toEqual([]);
});

test('every page turn pushes the current edition page, both directions', async () => {
  const {tracker, pushes, advance} = setup();
  await tracker.tick(at(81)); // baseline
  await tracker.tick(at(86));
  advance(WINDOW);
  await tracker.tick(at(93));
  advance(WINDOW);
  await tracker.tick(at(81)); // back
  expect(pushes).toEqual([edition(86), edition(93), edition(81)]);
});

test('a turn inside the 10 s window waits and goes out at the first touch after it, latest page only', async () => {
  const {tracker, pushes, advance} = setup();
  await tracker.tick(at(81));
  await tracker.tick(at(86)); // pushed
  advance(3000);
  await tracker.tick(at(93));
  await tracker.tick(at(130));
  expect(pushes).toEqual([edition(86)]);
  advance(WINDOW);
  await tracker.tick(at(130));
  expect(pushes).toEqual([edition(86), edition(130)]);
  await tracker.tick(at(130)); // nothing new
  expect(pushes.length).toBe(2);
});

test('going back to the pushed page inside the window pushes nothing', async () => {
  const {tracker, pushes, advance} = setup();
  await tracker.tick(at(81));
  await tracker.tick(at(86)); // pushed
  advance(3000);
  await tracker.tick(at(111));
  await tracker.tick(at(86));
  advance(WINDOW);
  await tracker.tick(at(86));
  expect(pushes).toEqual([edition(86)]);
});

test('a book that is not on the reading list is never pushed', async () => {
  const {tracker, pushes} = setup({item: null});
  await tracker.tick(at(5));
  await tracker.tick(at(60));
  await tracker.tick(at(200));
  expect(pushes).toEqual([]);
});

test('an unidentified book is looked up again after the negative TTL, not before', async () => {
  const {tracker, resolves, advance} = setup({item: null});
  await tracker.tick(at(5));
  advance(60_000);
  await tracker.tick(at(5));
  expect(resolves.length).toBe(1);
  advance(600_000);
  await tracker.tick(at(5));
  expect(resolves.length).toBe(2);
});

test('a failed push keeps the page and is retried after a pause, also from a touch with no usable sample', async () => {
  let t = 1_000_000;
  let fail = true;
  const pushes: number[] = [];
  const tracker = createTracker({
    now: () => t,
    resolve: async () => BUTCHER,
    push: async (it, pages) => {
      if (fail) throw new Error('Hardcover HTTP 500');
      pushes.push(pages);
    },
  });
  await tracker.tick(at(81));
  await tracker.tick(at(86)); // crossing: push fails
  expect(tracker.state.lastError?.message).toMatch(/500/);
  expect(pushes).toEqual([]);
  fail = false;
  t += 1000;
  await tracker.tick(null); // too soon after the failure
  expect(pushes).toEqual([]);
  t += 61_000;
  await tracker.tick(null); // a touch in a note, after the pause
  expect(pushes).toEqual([edition(86)]);
});

test('a rate limit (429, by status) waits longer than another error', async () => {
  let t = 1_000_000;
  let fail = true;
  const pushes: number[] = [];
  const tracker = createTracker({
    now: () => t,
    resolve: async () => BUTCHER,
    push: async (it, pages) => {
      if (fail) throw Object.assign(new Error('rate limited'), {status: 429});
      pushes.push(pages);
    },
  });
  await tracker.tick(at(81));
  await tracker.tick(at(86)); // crossing: push fails
  fail = false;
  t += 61_000;
  await tracker.tick(at(86));
  expect(pushes).toEqual([]); // still waiting (5 min)
  t += 240_000;
  await tracker.tick(at(86));
  expect(pushes).toEqual([edition(86)]);
});

test('without a page count in the edition nothing is pushed and the problem is reported', async () => {
  const {tracker, pushes} = setup({item: {...BUTCHER, title: 'X', editionPages: null}});
  await tracker.tick(at(81));
  await tracker.tick(at(86));
  expect(pushes).toEqual([]);
  expect(tracker.state.lastError?.message).toMatch(/no page count/);
});

test('a lookup that throws (offline) leaves no state, so the next tick tries again', async () => {
  let calls = 0;
  const t = createTracker({resolve: async () => { if (++calls === 1) throw new Error('offline'); return BUTCHER; }, push: async () => {}});
  await t.tick(at(81));
  expect(t.state.lastError?.message).toBe('offline');
  await t.tick(at(81));
  expect(calls).toBe(2);
});

test('nonsense samples (no total, negative page) are ignored', async () => {
  const {tracker, pushes} = setup();
  await tracker.tick(at(81));
  await tracker.tick({path: PATH, page: 90, total: 0});
  await tracker.tick({path: PATH, page: -1, total: TOTAL});
  expect(pushes).toEqual([]);
});

// A font or orientation change reflows the book: the reader's page count (total) changes but the edition page you
// are at does not, so it never looks like a page turn by itself.
describe('reflow', () => {
  test('a smaller or larger font at the same place pushes nothing; reading on pushes', async () => {
    const {tracker, pushes} = setup();
    await tracker.tick(at(81, 332)); // edition page 82
    await tracker.tick(at(40, 166)); // same place, smaller font: still 82
    await tracker.tick(at(163, 664)); // same place, larger font: still 82
    expect(pushes).toEqual([]);
    await tracker.tick(at(66, 240)); // 67/240: edition page 92
    expect(pushes).toEqual([edition(66, 240)]);
  });
});

test('a hung tick does not block later ones forever', async () => {
  let t = 1_000_000;
  let hang = true;
  const pushes: number[] = [];
  const tracker = createTracker({
    now: () => t,
    resolve: async () => (hang ? new Promise<ReadingItem>(() => {}) : BUTCHER), // the first lookup never returns
    push: async (_it, pages) => void pushes.push(pages),
  });
  tracker.tick(at(81)); // hangs, never awaited
  hang = false;
  t += 1000;
  await tracker.tick(at(81)); // still within the expiry: skipped
  expect(pushes).toEqual([]);
  t += 61_000;
  await tracker.tick(at(81)); // expired: goes ahead and baselines
  await tracker.tick(at(86));
  expect(pushes).toEqual([edition(86)]);
});

describe('re-check of matched books', () => {
  const run = (resolveFn: TrackerDeps['resolve'], pushFn: TrackerDeps['push']) => {
    let t = 1_000_000;
    const tracker = createTracker({now: () => t, resolve: resolveFn, push: pushFn});
    return {tracker, advance: (ms: number) => (t += ms)};
  };

  test('after the interval a matched book picks up a new read id', async () => {
    let item: ReadingItem = {...BUTCHER, read: readOf(1)};
    const used: number[] = [];
    const {tracker, advance} = run(async () => item, async it => void used.push(it.read!.id));
    await tracker.tick(at(81));
    item = {...BUTCHER, read: readOf(2)};
    advance(601_000);
    await tracker.tick(at(81)); // re-checked, same page
    await tracker.tick(at(86));
    expect(used).toEqual([2]);
  });

  test('a book that left the list while a push was failing stops pushing without an error', async () => {
    let item: ReadingItem | null = BUTCHER;
    let fail = true;
    const pushes: number[] = [];
    const {tracker, advance} = run(async () => item, async (it, pages) => {
      if (fail) throw new Error('Hardcover HTTP 500');
      pushes.push(pages);
    });
    await tracker.tick(at(81));
    await tracker.tick(at(86)); // push fails, stays pending
    item = null;
    fail = false;
    advance(601_000);
    await tracker.tick(at(86));
    expect(pushes).toEqual([]);
    expect(tracker.state.lastError?.message).toMatch(/500/); // the old one, no new "push(null)" error
    advance(61_000);
    await tracker.tick(null);
    expect(pushes).toEqual([]);
  });

  test('a failed re-check keeps pushing with the old item and is not retried on every touch', async () => {
    let calls = 0;
    const pushes: number[] = [];
    const {tracker, advance} = run(async () => { if (++calls > 1) throw new Error('offline'); return BUTCHER; }, async (_it, pages) => void pushes.push(pages));
    await tracker.tick(at(81));
    advance(601_000);
    await tracker.tick(at(81)); // re-check throws
    await tracker.tick(at(86));
    expect(calls).toBe(2);
    expect(pushes).toEqual([edition(86)]);
  });
});

test('errors and the last push name the file they belong to', async () => {
  const {tracker} = setup({pushFails: 'Hardcover HTTP 500'});
  await tracker.tick(at(81));
  await tracker.tick(at(86));
  expect(tracker.state.lastError?.path).toBe(PATH);
});

test('a lookup error names the file, and a push that settles after the book left the list does not throw', async () => {
  let t = 1_000_000;
  let item: ReadingItem | null | 'offline' = BUTCHER;
  let release: (() => void) | undefined;
  let slow = false;
  const tracker = createTracker({
    now: () => t,
    resolve: async () => { if (item === 'offline') throw new Error('offline'); return item; },
    push: async () => { if (slow) await new Promise<void>(r => (release = r)); },
  });
  await tracker.tick(at(81));
  t += 601_000;
  item = 'offline';
  await tracker.tick(at(81));
  expect(tracker.state.lastError).toMatchObject({message: 'offline', path: PATH});
  item = BUTCHER;
  await tracker.tick(at(86)); // pushes, fast
  expect(tracker.state.lastPush?.path).toBe(PATH);
  slow = true;
  t += 11_000; // past the push throttle
  const hung = tracker.tick(at(111)); // crossing: a push that hangs
  while (!release) await Promise.resolve(); // until the push is hanging
  t += 61_000; // the hung tick expires, a new one re-checks and the book is gone
  item = null;
  t += 601_000;
  await tracker.tick(at(111));
  release?.();
  await hung;
  expect(tracker.state.lastError).toBeNull(); // the late push counts as done; no TypeError from b.item being null by now
});

test("reset forgets every book and the last error: the next touch is a first sight again", async () => {
  const {tracker, pushes, resolves} = setup({pushFails: "401"});
  await tracker.tick(at(81));
  await tracker.tick(at(86)); // a push fails, so lastError is set
  expect(tracker.state.lastError).not.toBeNull();
  tracker.reset();
  expect(tracker.state.lastError).toBeNull();
  await tracker.tick(at(86)); // resolves again, baseline only
  expect(resolves.length).toBe(2);
  expect(pushes).toEqual([]);
});
