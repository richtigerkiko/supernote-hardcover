import React from 'react';
import ReactTestRenderer, {act} from 'react-test-renderer';
import ReviewPage, {fillOf, ratingAt} from '../src/ui/ReviewPage';
import {MOCK_BOOK} from '../src/ui/mockBook';

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
const render = (props: any = {}) => {
  let tree: any;
  act(() => {
    tree = ReactTestRenderer.create(<ReviewPage book={MOCK_BOOK} onSave={() => Promise.resolve()} onClose={() => {}} {...props} />);
  });
  return tree;
};
const all = (tree: any) => texts(tree.toJSON()).join('|');
const press = (tree: any, label: string) => act(() => tree.root.findByProps({accessibilityLabel: label}).props.onPress());
const field = (tree: any, label: string) => tree.root.findByProps({accessibilityLabel: label});
const type = (tree: any, v: string, label = 'Review') => act(() => field(tree, label).props.onChangeText(v));
const save = async (tree: any) => {
  await act(async () => {
    await tree.root.findByProps({accessibilityLabel: 'Save'}).props.onPress();
  });
};

test('empty review cannot be saved', () => {
  const t = render();
  expect(t.root.findByProps({accessibilityLabel: 'Save'}).props.disabled).toBe(true);
});

test('saves text, half-step rating and spoilers flag, then shows the saved state', async () => {
  const onSave = jest.fn().mockResolvedValue(undefined);
  const t = render({onSave});
  type(t, ' Loved it ');
  act(() => field(t, 'Rating').props.onAccessibilityAction({nativeEvent: {actionName: 'increment'}}));
  act(() => field(t, 'Rating').props.onAccessibilityAction({nativeEvent: {actionName: 'increment'}}));
  act(() => field(t, 'Rating').props.onAccessibilityAction({nativeEvent: {actionName: 'increment'}}));
  expect(field(t, 'Rating').props.accessibilityValue.text).toBe('1.5 of 5');
  act(() => field(t, 'This review contains spoilers').props.onPress());
  act(() => field(t, 'Sponsored or ARC review').props.onPress());
  type(t, ' for me ', 'Private notes');
  await save(t);
  expect(onSave).toHaveBeenCalledWith({markdown: 'Loved it', hasSpoilers: true, sponsored: true, notes: 'for me', rating: 1.5});
  expect(all(t)).toContain('✓ Review saved');
});

test('no rating is left out; lowering below 0.5 clears it', async () => {
  const onSave = jest.fn().mockResolvedValue(undefined);
  const t = render({onSave});
  act(() => field(t, 'Rating').props.onAccessibilityAction({nativeEvent: {actionName: 'increment'}}));
  act(() => field(t, 'Rating').props.onAccessibilityAction({nativeEvent: {actionName: 'decrement'}}));
  expect(field(t, 'Rating').props.accessibilityValue.text).toBe('none');
  type(t, 'fine');
  await save(t);
  expect(onSave).toHaveBeenCalledWith({markdown: 'fine', hasSpoilers: false, sponsored: false, notes: ''});
});

test('starts from what the entry already holds', async () => {
  const onSave = jest.fn().mockResolvedValue(undefined);
  const t = render({onSave, initial: {markdown: 'old', hasSpoilers: true, sponsored: false, notes: 'n', rating: 3}});
  expect(field(t, 'Rating').props.accessibilityValue.text).toBe('3 of 5');
  await save(t);
  expect(onSave).toHaveBeenCalledWith({markdown: 'old', hasSpoilers: true, sponsored: false, notes: 'n', rating: 3});
});

test('a failed save shows the error and Retry, and retrying works', async () => {
  const onSave = jest.fn().mockRejectedValueOnce(new Error('Network request failed')).mockResolvedValue(undefined);
  const t = render({onSave});
  type(t, 'text');
  await save(t);
  expect(all(t)).toContain('Network request failed');
  expect(all(t)).toContain('Retry');
  await save(t);
  expect(all(t)).toContain('✓ Review saved');
});

test('ratingAt maps a position on the star row to half steps, 0.5 to 5', () => {
  expect(ratingAt(0, 500)).toBe(0.5);
  expect(ratingAt(49, 500)).toBe(0.5);
  expect(ratingAt(51, 500)).toBe(1);
  expect(ratingAt(250, 500)).toBe(2.5);
  expect(ratingAt(900, 500)).toBe(5);
  expect(ratingAt(10, 0)).toBe(0);
});

test('fillOf gives the filled share of each star (a half star is 0.5)', () => {
  expect([1, 2, 3, 4, 5].map(n => fillOf(3.5, n))).toEqual([1, 1, 1, 0.5, 0]);
  expect([1, 2].map(n => fillOf(0, n))).toEqual([0, 0]);
});
