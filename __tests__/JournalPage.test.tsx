import React from 'react';
import ReactTestRenderer, {act} from 'react-test-renderer';
import {TextInput} from 'react-native';
import JournalPage from '../src/ui/JournalPage';
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

const PASSAGE = 'The knife was older than the town.';
const render = (props: any) => {
  let tree: any;
  const noop = () => {};
  act(() => {
    tree = ReactTestRenderer.create(
      <JournalPage book={MOCK_BOOK} passage={PASSAGE} onSetEdition={noop} onSave={() => Promise.resolve()} onClose={noop} {...props} />,
    );
  });
  return tree;
};
const all = (tree: any) => texts(tree.toJSON()).join('|');
const tap = (tree: any, text: string) => {
  const n = tree.root.findAll((x: any) => typeof x.props.onPress === 'function' && texts(x).includes(text))[0];
  act(() => n.props.onPress());
};
const input = (tree: any) => tree.root.findByType(TextInput);
const type = (tree: any, value: string) => act(() => input(tree).props.onChangeText(value));
const saveButton = (tree: any) => tree.root.findByProps({accessibilityLabel: 'Save'});
const save = async (tree: any) => {
  await act(async () => {
    await saveButton(tree).props.onPress();
  });
};

test('opens on Quote showing the passage, the edition and the page', () => {
  const t = all(render({}));
  expect(t).toContain(PASSAGE);
  expect(t).toContain('Edition: Paperback · Whiskey Tit Books');
  expect(t).toContain('106|');
  expect(t).toContain('330');
  expect(input(render({})).props.placeholder).toBe('Add your thoughts (optional)…');
});

test('the Note tab has no passage and switching tabs keeps what was typed in each', () => {
  const tree = render({});
  type(tree, 'thoughts');
  tap(tree, 'Note');
  expect(all(tree)).not.toContain(PASSAGE);
  expect(input(tree).props.placeholder).toBe('Write a new note…');
  type(tree, 'my note');
  tap(tree, 'Quote');
  expect(input(tree).props.value).toBe('thoughts');
  tap(tree, 'Note');
  expect(input(tree).props.value).toBe('my note');
});

test('Save is disabled for a blank note and for a quote with no passage', () => {
  const tree = render({});
  tap(tree, 'Note');
  type(tree, '   ');
  expect(saveButton(tree).props.disabled).toBe(true);
  type(tree, 'x');
  expect(saveButton(tree).props.disabled).toBe(false);
  expect(saveButton(render({passage: ''})).props.disabled).toBe(true);
});

test('Save sends the quote with default privacy 3, and a picked privacy for a note', async () => {
  const onSave = jest.fn(() => Promise.resolve());
  const tree = render({onSave});
  type(tree, ' nice ');
  await save(tree);
  expect(onSave).toHaveBeenLastCalledWith({event: 'quote', passage: PASSAGE, text: 'nice', privacy: 3});

  const t2 = render({onSave});
  tap(t2, 'Note');
  type(t2, 'a note');
  tap(t2, 'Follows');
  await save(t2);
  expect(onSave).toHaveBeenLastCalledWith({event: 'note', passage: '', text: 'a note', privacy: 2});
});

test('a second tap while saving does not save twice', async () => {
  let finish: () => void = () => {};
  const onSave = jest.fn(() => new Promise<void>(r => (finish = r)));
  const tree = render({onSave});
  act(() => {
    saveButton(tree).props.onPress();
  });
  expect(all(tree)).toContain('Saving…');
  expect(saveButton(tree).props.disabled).toBe(true);
  await act(async () => finish());
  expect(onSave).toHaveBeenCalledTimes(1);
});

test('after saving, Add a note gives an empty Note tab', async () => {
  const tree = render({});
  await save(tree);
  const t = all(tree);
  expect(t).toContain('✓ Quote saved');
  expect(t).toContain('The Butcher of Nazareth · page 106 · Private');
  tap(tree, 'Add a note');
  expect(input(tree).props.placeholder).toBe('Write a new note…');
  expect(input(tree).props.value).toBe('');
  expect(saveButton(tree).props.disabled).toBe(true);
});

test('a failed save keeps the text and offers Retry', async () => {
  const tree = render({onSave: () => Promise.reject(new Error('Network down'))});
  type(tree, 'keep me');
  await save(tree);
  const t = all(tree);
  expect(t).toContain('Network down');
  expect(t).toContain('Retry');
  expect(input(tree).props.value).toBe('keep me');
});

test('the edition row opens the shared edition list and the pick is passed on', () => {
  const onSetEdition = jest.fn();
  const tree = render({onSetEdition});
  act(() => tree.root.findByProps({accessibilityLabel: 'Change edition'}).props.onPress());
  const kindle = tree.root.findAll((n: any) => n.props.accessibilityRole === 'radio' && texts(n).join('').includes('Kindle'))[0];
  act(() => kindle.props.onPress());
  tap(tree, 'Use this edition');
  expect(onSetEdition).toHaveBeenCalledWith('33433135');
  expect(all(tree)).toContain('Add journal entry');
});
