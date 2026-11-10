import React from 'react';
import ReactTestRenderer, {act} from 'react-test-renderer';
import DetailPage from '../src/ui/DetailPage';
import {MOCK_BOOK, MOCK_LONG} from '../src/ui/mockBook';

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
      <DetailPage book={MOCK_BOOK} tracking={true} onToggleTracking={noop} onClose={noop} onSaveReview={async () => true} onSetStatus={noop} onSetEdition={noop} {...props} />,
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
  expect(t).toContain('Not confirmed yet');
  expect(t).toContain('ON');
});

test('the toggle shows OFF when tracking is paused and calls back when pressed', () => {
  const onToggle = jest.fn();
  const tree = render({tracking: false, onToggleTracking: onToggle});
  expect(all(tree)).toContain('OFF');
  act(() => tree.root.findByProps({accessibilityRole: 'switch'}).props.onPress());
  expect(onToggle).toHaveBeenCalledTimes(1);
});

test('Write review opens the editor; Save sends the draft and returns to the page when saved', async () => {
  const onSaveReview = jest.fn(async () => true);
  const tree = render({onSaveReview});
  const review = tree.root.findAll((n: any) => n.props.accessibilityRole === 'button' && typeof n.props.onPress === 'function' && texts(n).includes('Write review'))[0];
  act(() => review.props.onPress());
  expect(all(tree)).toContain('Contains spoilers');
  act(() => tree.root.findByProps({accessibilityLabel: 'Review text'}).props.onChangeText('Great'));
  press(tree, 'Star 4');
  press(tree, 'Star 4'); // half star
  press(tree, 'Contains spoilers');
  await act(async () => tree.root.findByProps({accessibilityLabel: 'Save review'}).props.onPress());
  expect(onSaveReview).toHaveBeenCalledWith({text: 'Great', rating: 3.5, spoilers: true});
  expect(all(tree)).toContain('Write review'); // back on the detail page
  expect(all(tree)).not.toContain('Contains spoilers');
});

test('the editor is prefilled, stays open when the save is declined or fails, and will not save nothing', async () => {
  const onSaveReview = jest.fn().mockResolvedValueOnce(false).mockRejectedValueOnce(new Error('boom'));
  const tree = render({onSaveReview, book: {...MOCK_BOOK, myReview: 'Old', myRating: 5}});
  const review = tree.root.findAll((n: any) => n.props.accessibilityRole === 'button' && texts(n).includes('Write review'))[0];
  act(() => review.props.onPress());
  expect(tree.root.findByProps({accessibilityLabel: 'Review text'}).props.value).toBe('Old');
  const save = () => act(async () => tree.root.findByProps({accessibilityLabel: 'Save review'}).props.onPress());
  await save();
  expect(all(tree)).toContain('Contains spoilers');
  await save();
  expect(all(tree)).toContain('boom');
  act(() => tree.root.findByProps({accessibilityLabel: 'Review text'}).props.onChangeText(''));
  press(tree, 'Star 5'); // 5 -> 4.5
  press(tree, 'Star 5'); // 4.5 -> none
  await save();
  expect(onSaveReview).toHaveBeenCalledTimes(2);
});

test('close calls back', () => {
  const onClose = jest.fn();
  press(render({onClose}), 'Close');
  expect(onClose).toHaveBeenCalled();
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
