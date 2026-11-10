import {createTracker, stepOf, STEP_PERCENT} from '../src/tracker';

const BUTCHER = {title: 'The Butcher of Nazareth', editionPages: 330};
const PATH = '/Document/ebooks/butcher.epub';
const TOTAL = 332;
// with 2% steps and 332 reader pages one step is 6.64 pages: index 81 (page 82, 24.7%) is step 12, index 86 (page 87, 26.2%) step 13

const setup = ({item = BUTCHER, pushFails} = {}) => {
  let t = 1_000_000;
  const pushes = [];
  const resolves = [];
  const tracker = createTracker({
    now: () => t,
    resolve: async path => (resolves.push(path), item),
    push: async (it, pages) => {
      if (pushFails) throw typeof pushFails === 'string' ? new Error(pushFails) : pushFails;
      pushes.push(pages);
    },
  });
  return {tracker, pushes, resolves, advance: ms => (t += ms)};
};
const at = (page, total = TOTAL, path = PATH) => ({path, page, total});
const edition = (page, total = TOTAL) => Math.round(((page + 1) / total) * 330);

test('steps: 2% of the book, the last page is the last step', () => {
  expect(STEP_PERCENT).toBe(2);
  expect(stepOf(81, TOTAL)).toBe(12);
  expect(stepOf(86, TOTAL)).toBe(13);
  expect(stepOf(TOTAL - 1, TOTAL)).toBe(50);
  expect(stepOf(5000, TOTAL)).toBe(50); // a page past the end is the end
  expect(stepOf(28, 50)).toBe(29); // 29/50 is exactly 58%, which float division put just under
});

test('first sight of a book pushes nothing, however long you stay', async () => {
  const {tracker, pushes, advance} = setup();
  await tracker.tick(at(81));
  advance(3_600_000);
  await tracker.tick(at(81));
  expect(pushes).toEqual([]);
});

test('pages inside the same 2% step never push, so a few accidental turns are harmless', async () => {
  const {tracker, pushes} = setup();
  await tracker.tick(at(81)); // baseline: step 12
  for (const p of [82, 83, 84, 85, 84, 83, 82, 81]) await tracker.tick(at(p));
  expect(pushes).toEqual([]);
});

test('crossing a step pushes your current page on the edition, not the step boundary', async () => {
  const {tracker, pushes} = setup();
  await tracker.tick(at(81));
  await tracker.tick(at(85)); // 25.9%: still step 12
  expect(pushes).toEqual([]);
  await tracker.tick(at(86)); // 26.2%: step 13
  expect(pushes).toEqual([edition(86)]);
  await tracker.tick(at(88)); // still step 13
  expect(pushes).toEqual([edition(86)]);
});

test('reading on pushes once per step crossed, and one read that jumps several steps pushes once', async () => {
  const {tracker, pushes} = setup();
  await tracker.tick(at(81));
  await tracker.tick(at(86)); // step 13
  await tracker.tick(at(93)); // 28.3%: step 14
  await tracker.tick(at(130)); // skipped far ahead in one go: step 19, a single push
  expect(pushes).toEqual([edition(86), edition(93), edition(130)]);
});

test('progress follows you backwards across a step too', async () => {
  const {tracker, pushes} = setup();
  await tracker.tick(at(81)); // step 12
  await tracker.tick(at(111)); // a peek ahead: step 16
  await tracker.tick(at(81)); // and back
  expect(pushes).toEqual([edition(111), edition(81)]);
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
  const pushes = [];
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
  expect(tracker.state.lastError.message).toMatch(/500/);
  expect(pushes).toEqual([]);
  fail = false;
  t += 1000;
  await tracker.tick(null); // too soon after the failure
  expect(pushes).toEqual([]);
  t += 61_000;
  await tracker.tick(null); // a touch in a note, after the pause
  expect(pushes).toEqual([edition(86)]);
});

test('a rate limit (429) waits longer than another error', async () => {
  const {tracker, pushes, advance} = setup({pushFails: Object.assign(new Error('Hardcover rate limit (429)'), {status: 429})});
  await tracker.tick(at(81));
  await tracker.tick(at(86));
  expect(tracker.state.lastError.message).toMatch(/429/);
  advance(61_000);
  await tracker.tick(at(86));
  expect(pushes).toEqual([]); // still waiting (5 min), and it would fail again anyway
});

test('without a page count in the edition nothing is pushed and the problem is reported', async () => {
  const {tracker, pushes} = setup({item: {title: 'X', editionPages: null}});
  await tracker.tick(at(81));
  await tracker.tick(at(86));
  expect(pushes).toEqual([]);
  expect(tracker.state.lastError.message).toMatch(/no page count/);
});

test('a lookup that throws (offline) leaves no state, so the next tick tries again', async () => {
  let calls = 0;
  const t = createTracker({resolve: async () => { if (++calls === 1) throw new Error('offline'); return BUTCHER; }, push: async () => {}});
  await t.tick(at(81));
  expect(t.state.lastError.message).toBe('offline');
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

// A font or orientation change reflows the book: the reader's page count (total) changes but the share of the book
// you are at does not, so it can never look like a step crossing by itself.
describe('reflow', () => {
  test('a smaller or larger font at the same place pushes nothing; reading on pushes at the next step', async () => {
    const {tracker, pushes} = setup();
    await tracker.tick(at(81, 332)); // 24.7%: step 12
    await tracker.tick(at(58, 240)); // same place, smaller font: 59/240 = 24.6%
    await tracker.tick(at(98, 400)); // same place, larger font: 99/400 = 24.75%
    expect(pushes).toEqual([]);
    await tracker.tick(at(66, 240)); // 67/240 = 27.9%: step 13
    expect(pushes).toEqual([edition(66, 240)]);
  });
});

test('a hung tick does not block later ones forever', async () => {
  let t = 1_000_000;
  let hang = true;
  const pushes = [];
  const tracker = createTracker({
    now: () => t,
    resolve: async () => (hang ? new Promise(() => {}) : BUTCHER), // the first lookup never returns
    push: async (it, pages) => pushes.push(pages),
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
  const run = (resolveFn, pushFn) => {
    let t = 1_000_000;
    const tracker = createTracker({now: () => t, resolve: resolveFn, push: pushFn});
    return {tracker, advance: ms => (t += ms)};
  };

  test('after the interval a matched book picks up a new read id', async () => {
    let item = {...BUTCHER, read: {id: 1}};
    const used = [];
    const {tracker, advance} = run(async () => item, async it => used.push(it.read.id));
    await tracker.tick(at(81));
    item = {...BUTCHER, read: {id: 2}};
    advance(601_000);
    await tracker.tick(at(81)); // re-checked, same step
    await tracker.tick(at(86));
    expect(used).toEqual([2]);
  });

  test('a book that left the list while a push was failing stops pushing without an error', async () => {
    let item = BUTCHER;
    let fail = true;
    const pushes = [];
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
    expect(tracker.state.lastError.message).toMatch(/500/); // the old one, no new "push(null)" error
    advance(61_000);
    await tracker.tick(null);
    expect(pushes).toEqual([]);
  });

  test('a failed re-check keeps pushing with the old item and is not retried on every touch', async () => {
    let calls = 0;
    const pushes = [];
    const {tracker, advance} = run(async () => { if (++calls > 1) throw new Error('offline'); return BUTCHER; }, async (it, pages) => pushes.push(pages));
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
  expect(tracker.state.lastError.path).toBe(PATH);
});

test('a lookup error names the file, and a push that settles after the book left the list does not throw', async () => {
  let t = 1_000_000;
  let item = BUTCHER;
  let release;
  let slow = false;
  const tracker = createTracker({
    now: () => t,
    resolve: async () => { if (item === 'offline') throw new Error('offline'); return item; },
    push: async () => { if (slow) await new Promise(r => (release = r)); },
  });
  await tracker.tick(at(81));
  t += 601_000;
  item = 'offline';
  await tracker.tick(at(81));
  expect(tracker.state.lastError).toMatchObject({message: 'offline', path: PATH});
  item = BUTCHER;
  await tracker.tick(at(86)); // pushes, fast
  expect(tracker.state.lastPush.path).toBe(PATH);
  slow = true;
  const hung = tracker.tick(at(111)); // crossing: a push that hangs
  while (!release) await Promise.resolve(); // until the push is hanging
  t += 61_000; // the hung tick expires, a new one re-checks and the book is gone
  item = null;
  t += 601_000;
  await tracker.tick(at(111));
  release();
  await hung;
  expect(tracker.state.lastError).toBeNull(); // the late push counts as done; no TypeError from b.item being null by now
});
