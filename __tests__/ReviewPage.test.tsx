import React from 'react';
import ReactTestRenderer, {act} from 'react-test-renderer';
import ReviewPage from '../src/ui/ReviewPage';
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
  press(t, 'Raise rating');
  press(t, 'Raise rating');
  press(t, 'Raise rating');
  expect(all(t)).toContain('★ 1.5 / 5');
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
  press(t, 'Raise rating');
  press(t, 'Lower rating');
  expect(all(t)).toContain('No rating');
  type(t, 'fine');
  await save(t);
  expect(onSave).toHaveBeenCalledWith({markdown: 'fine', hasSpoilers: false, sponsored: false, notes: ''});
});

test('starts from what the entry already holds', async () => {
  const onSave = jest.fn().mockResolvedValue(undefined);
  const t = render({onSave, initial: {markdown: 'old', hasSpoilers: true, sponsored: false, notes: 'n', rating: 3}});
  expect(all(t)).toContain('★ 3 / 5');
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
