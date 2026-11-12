import React from 'react';
import ReactTestRenderer, {act} from 'react-test-renderer';
import DetailPage from '../../src/ui/DetailPage';
import {MOCK_BOOK, MOCK_LONG} from '../../src/ui/preview/mockBook';

const texts = (node: any): string[] => {
  const out: string[] = [];
  const walk = (n: any) => {
    if (n == null) return;
    if (typeof n === 'string') return void out.push(n);
    (n.children ?? []).forEach(walk);
  };
  walk(node);
  return out;
};

const render = (props: any) => {
  let tree: any;
  const noop = () => {};
  act(() => {
    tree = ReactTestRenderer.create(
      <DetailPage book={MOCK_BOOK} tracking={true} onToggleTracking={noop} onClose={noop} onWriteReview={noop} onSetStatus={noop} onSetEdition={noop} {...props} />,
    );
  });
  return tree;
};
const all = (tree: any) => texts(tree.toJSON()).join('|');
const press = (tree: any, label: string) => act(() => tree.root.findByProps({accessibilityLabel: label}).props.onPress());

test('shows the book, its progress on the chosen edition, chips and the tracking state', () => {
  const t = all(render({}));
  expect(t).toContain('The Butcher of Nazareth');
  expect(t).toContain('David Scott Hay');
  expect(t).toContain('3.8');
  expect(t).toContain('Page 106 of 330 · 32%');
  expect(t).toContain('Horror');
  expect(t).toContain('Currently reading ▾');
  expect(t).toContain('ON');
});

test('the edition block joins only the parts that exist', () => {
  const ed = (e: any) => all(render({book: {...MOCK_BOOK, editions: [{id: 'a', format: 'Ebook', publisher: '', pages: 10, lang: '', ...e}], editionId: 'a'}}));
  expect(ed({})).not.toContain('Ebook ·');
  expect(ed({isbn: '9781234567890', year: 2020})).toContain('9781234567890 · 2020');
  expect(ed({publisher: 'Pub', lang: 'English'})).toContain('Ebook · Pub|English');
});

test('the toggle shows OFF when tracking is paused and calls back when pressed', () => {
  const onToggle = jest.fn();
  const tree = render({tracking: false, onToggleTracking: onToggle});
  expect(all(tree)).toContain('OFF');
  act(() => tree.root.findByProps({accessibilityRole: 'switch'}).props.onPress());
  expect(onToggle).toHaveBeenCalledTimes(1);
});

test('close and Write review call back', () => {
  const onClose = jest.fn();
  const onReview = jest.fn();
  const tree = render({onClose, onWriteReview: onReview});
  press(tree, 'Close');
  const review = tree.root.findAll((n: any) => n.props.accessibilityRole === 'button' && typeof n.props.onPress === 'function' && texts(n).includes('Write review'))[0];
  act(() => review.props.onPress());
  expect([onClose.mock.calls.length, onReview.mock.calls.length]).toEqual([1, 1]);
});

test('the status list sets the status and returns to the page', () => {
  const onSetStatus = jest.fn();
  const tree = render({onSetStatus});
  press(tree, 'Change reading status');
  expect(all(tree)).toContain('Did not finish');
  const item = tree.root.findAll((n: any) => n.props.accessibilityRole === 'radio' && texts(n).includes('Paused'))[0];
  act(() => item.props.onPress());
  expect(onSetStatus).toHaveBeenCalledWith('Paused');
  expect(all(tree)).toContain('Tracking is');
});

test('the page follows the chosen edition for the same reading position', () => {
  const kindle = {...MOCK_BOOK, progress: 106 / 400, editionId: '33433135'};
  expect(all(render({book: kindle}))).toContain('Page 76 of 288 · 26%');
});

test('Finished shows the last page of the chosen edition', () => {
  expect(all(render({book: {...MOCK_BOOK, status: 'Finished'}}))).toContain('Page 330 of 330 · 100%');
});

test('the edition list hides audiobooks, and Use this edition saves the pick', () => {
  const onSetEdition = jest.fn();
  const tree = render({onSetEdition});
  press(tree, 'Change edition');
  const t = all(tree);
  expect(t).toContain('1 edition without a page count hidden.');
  expect(t).not.toContain('Audible');
  const kindle = tree.root.findAll((n: any) => n.props.accessibilityRole === 'radio' && texts(n).join('').includes('Kindle'))[0];
  act(() => kindle.props.onPress());
  const use = tree.root.findAll((n: any) => n.props.accessibilityRole === 'button' && texts(n).includes('Use this edition'))[0];
  act(() => use.props.onPress());
  expect(onSetEdition).toHaveBeenCalledWith('33433135');
});

test('Cancel in the edition list saves nothing', () => {
  const onSetEdition = jest.fn();
  const tree = render({onSetEdition});
  press(tree, 'Change edition');
  const cancel = tree.root.findAll((n: any) => n.props.accessibilityRole === 'button' && texts(n).includes('Cancel'))[0];
  act(() => cancel.props.onPress());
  expect(onSetEdition).not.toHaveBeenCalled();
});

test('the worst case (no cover, no rating, long text) renders without breaking, with a title placeholder for the cover', () => {
  const t = texts(render({book: MOCK_LONG}).toJSON());
  expect(t.filter(s => s.includes('Extraordinarily Long Title')).length).toBe(2); // heading + cover placeholder
  expect(t.join('|')).not.toContain('★');
});

test('an edition with no page count is not listed', () => {
  const book = {...MOCK_BOOK, editions: [...MOCK_BOOK.editions, {id: 'np', format: 'Ebook', publisher: 'NoPages Press', year: 2020, pages: 0, lang: 'English'}]};
  const tree = render({book});
  press(tree, 'Change edition');
  const t = all(tree);
  expect(t).not.toContain('NoPages Press');
  expect(t).toContain('2 editions without a page count hidden.');
});

test('the sync note is shown above the progress when given, and absent otherwise', () => {
  expect(all(render({syncNote: 'Last sync: page 120'}))).toContain('Last sync: page 120');
  expect(all(render({}))).not.toContain('Last sync');
});

test('tapping the cover opens it full size over the page; closing (button or anywhere) removes it', () => {
  const tree = render({book: {...MOCK_BOOK, cover: 'https://x/c.jpg'}});
  const open = () => tree.root.findAllByProps({accessibilityLabel: 'Cover full size'}).length;
  expect(open()).toBe(0);
  press(tree, 'Show cover full size');
  expect(open()).toBeGreaterThan(0);
  press(tree, 'Close cover');
  expect(open()).toBe(0);
  press(tree, 'Show cover full size');
  act(() => tree.root.findAllByProps({accessibilityLabel: 'Cover full size'})[0].props.onPress());
  expect(open()).toBe(0);
});

test('without a cover there is no cover button', () => {
  const tree = render({book: {...MOCK_BOOK, cover: undefined}});
  expect(tree.root.findAllByProps({accessibilityLabel: 'Show cover full size'}).length).toBe(0);
});

describe('reviews tab', () => {
  const rev = (id: number, over: any = {}) => ({id, user: `User${id}`, supporter: false, rating: 4.5, text: 'Nice.', spoiler: false, date: '2026-10-02', ...over});
  const flush = () => act(async () => {});

  test('nothing is requested until the Reviews tab is opened; then once, with the entries shown', async () => {
    const onLoadReviews = jest.fn().mockResolvedValue({reviews: [rev(1, {supporter: true}), rev(2, {spoiler: true, text: 'SECRET'})], hasMore: false});
    const tree = render({onLoadReviews});
    expect(onLoadReviews).not.toHaveBeenCalled();
    expect(all(tree)).toContain('About'); // default tab
    press(tree, 'Reviews tab');
    expect(all(tree)).toContain('Loading reviews…');
    await flush();
    press(tree, 'About tab');
    press(tree, 'Reviews tab');
    expect(onLoadReviews).toHaveBeenCalledTimes(1);
    const t = all(tree);
    expect(t).toContain('User1');
    expect(t).toContain('Supporter');
    expect(t).toContain('★★★★½');
    expect(t).toContain('Contains spoilers');
    expect(t).not.toContain('SECRET'); // a spoiler's text is not in the list
  });

  test('error shows Retry, empty shows a message, Load more asks for the next offset', async () => {
    const onLoadReviews = jest
      .fn()
      .mockRejectedValueOnce(new Error('x'))
      .mockResolvedValueOnce({reviews: [rev(1)], hasMore: true})
      .mockResolvedValueOnce({reviews: [rev(2)], hasMore: false});
    const tree = render({onLoadReviews});
    press(tree, 'Reviews tab');
    await flush();
    expect(all(tree)).toContain('Could not load reviews.');
    const press2 = (label: string) => act(() => tree.root.findAll((n: any) => n.props.onPress && texts(n).includes(label))[0].props.onPress());
    press2('Retry');
    await flush();
    press2('Load more');
    await flush();
    expect(onLoadReviews.mock.calls.map(c => c[0])).toEqual([0, 0, 1]);
    expect(all(tree)).toContain('User2');
    expect(all(tree)).not.toContain('Load more');

    const empty = render({onLoadReviews: jest.fn().mockResolvedValue({reviews: [], hasMore: false})});
    press(empty, 'Reviews tab');
    await flush();
    expect(all(empty)).toContain('No reviews yet.');
  });

  test('More opens the full review and Back to reviews closes it', async () => {
    const tree = render({onLoadReviews: jest.fn().mockResolvedValue({reviews: [rev(1, {spoiler: true, text: 'SECRET full text'})], hasMore: false})});
    press(tree, 'Reviews tab');
    await flush();
    press(tree, "More of User1's review");
    expect(all(tree)).toContain('SECRET full text');
    press(tree, 'Back to reviews');
    expect(all(tree)).not.toContain('SECRET full text');
  });
});

describe('journal tab', () => {
  const flush = () => act(async () => {});
  const q = {id: 1, event: 'quote' as const, entry: 'A passage\n\n━━━\n\nmy thoughts', page: 83, date: '2026-11-10', privacy: 3 as const};
  const n = {id: 2, event: 'note' as const, entry: 'a note', page: null, date: '2026-11-09', privacy: 1 as const};
  const opened = async (props: any = {}) => {
    const tree = render({onLoadJournal: jest.fn().mockResolvedValue({entries: [q, n], hasMore: false}), onEditJournal: jest.fn(async (_i: any, t: string) => t), onRemoveJournal: jest.fn(async () => {}), ...props});
    press(tree, 'Journal tab');
    await flush();
    return tree;
  };
  const pressAt = (tree: any, label: string) => act(() => tree.root.findAll((x: any) => x.props.accessibilityLabel === label && x.props.onPress)[0].props.onPress());

  test('lists notes and quotes with page, date, privacy and the split text', async () => {
    const t = all(await opened());
    expect(t).toContain('Quote');
    expect(t).toContain('p. 83 · 2026-11-10 · Private');
    expect(t).toContain('A passage');
    expect(t).toContain('my thoughts');
    expect(t).not.toContain('━');
    expect(t).toContain('a note');
  });

  test('empty, and error with Retry', async () => {
    expect(all(await opened({onLoadJournal: jest.fn().mockResolvedValue({entries: [], hasMore: false})}))).toContain('No journal entries yet.');
    const tree = await opened({onLoadJournal: jest.fn().mockRejectedValueOnce(new Error('x')).mockResolvedValue({entries: [n], hasMore: false})});
    expect(all(tree)).toContain('Could not load the journal.');
    act(() => tree.root.findAll((x: any) => x.props.onPress && texts(x).includes('Retry'))[0].props.onPress());
    await flush();
    expect(all(tree)).toContain('a note');
  });

  test('edit saves thoughts and privacy and the row updates; a failed save shows the error and keeps the row', async () => {
    const onEditJournal = jest.fn().mockRejectedValueOnce(new Error('Network request failed')).mockImplementation(async (_i: any, t: string) => 'A passage\n\n━━━\n\n' + t);
    const tree = await opened({onEditJournal});
    pressAt(tree, 'Edit');
    act(() => tree.root.findByProps({accessibilityLabel: 'Your thoughts'}).props.onChangeText('better'));
    pressAt(tree, 'Save');
    await flush();
    expect(all(tree)).toContain('Network request failed');
    pressAt(tree, 'Retry');
    await flush();
    expect(onEditJournal).toHaveBeenLastCalledWith(q, 'better', 3);
    expect(all(tree)).toContain('better');
    expect(all(tree)).not.toContain('my thoughts');
  });

  test('remove asks first, then deletes and drops the row; a failure leaves it', async () => {
    const onRemoveJournal = jest.fn().mockRejectedValueOnce(new Error('boom')).mockResolvedValue(undefined);
    const tree = await opened({onRemoveJournal});
    pressAt(tree, 'Remove');
    expect(all(tree)).toContain('This cannot be undone.');
    expect(onRemoveJournal).not.toHaveBeenCalled();
    pressAt(tree, 'Remove entry');
    await flush();
    expect(all(tree)).toContain('boom');
    expect(all(tree)).toContain('A passage');
    pressAt(tree, 'Retry');
    await flush();
    expect(onRemoveJournal).toHaveBeenCalledWith(1);
    expect(all(tree)).not.toContain('A passage');
    expect(all(tree)).toContain('a note');
  });
});
