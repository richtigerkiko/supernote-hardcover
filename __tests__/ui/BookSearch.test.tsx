import React from 'react';
import ReactTestRenderer, {act} from 'react-test-renderer';
import BookSearch from '../../src/ui/BookSearch';

const texts = (tree: any): string[] => tree.root.findAll((n: any) => typeof n.type === 'string' && n.type === 'Text').map((n: any) => n.children.join(''));
const button = (tree: any, label: string) => tree.root.findAll((n: any) => n.props.accessibilityRole === 'button' && n.props.accessibilityLabel === label)[0];

test('an empty box (a PDF) searches nothing and asks for a title instead of saying "No book found"', async () => {
  const onSearch = jest.fn(async () => []);
  let tree: any;
  await act(async () => {
    tree = ReactTestRenderer.create(<BookSearch query="" onSearch={onSearch} onPick={() => {}} onClose={() => {}} />);
  });
  expect(onSearch).not.toHaveBeenCalled();
  expect(texts(tree)).toContain('Type the title and author, then tap Search.');
  expect(texts(tree)).not.toContain('No book found');
});

test('opens with the given text searched, shows new hits for a new search, "No book found" for none, and picks with the button', async () => {
  const onSearch = jest.fn(async (q: string) => (q === 'nothing' ? [] : [{bookId: 7, title: `Hit for ${q}`, authors: ['A', 'B']}]));
  const onPick = jest.fn();
  let tree: any;
  await act(async () => {
    tree = ReactTestRenderer.create(<BookSearch query="Dune Frank Herbert" onSearch={onSearch} onPick={onPick} onClose={() => {}} />);
  });
  const input = () => tree.root.findByProps({accessibilityLabel: 'Search books'});
  expect(input().props.value).toBe('Dune Frank Herbert');
  expect(texts(tree)).toEqual(expect.arrayContaining(['Hit for Dune Frank Herbert', 'A, B']));
  expect(button(tree, 'Use this book').props.disabled).toBe(true); // nothing is preselected

  act(() => input().props.onChangeText('nothing'));
  await act(async () => button(tree, 'Search').props.onPress());
  expect(texts(tree)).toContain('No book found');

  act(() => input().props.onChangeText('other'));
  await act(async () => input().props.onSubmitEditing());
  expect(texts(tree)).toContain('Hit for other');
  act(() => tree.root.findByProps({accessibilityRole: 'radio'}).props.onPress());
  act(() => button(tree, 'Use this book').props.onPress());
  expect(onPick).toHaveBeenCalledWith(7);
});
