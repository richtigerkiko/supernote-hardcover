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
  expect(t).toContain('1 audiobook edition hidden.');
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
