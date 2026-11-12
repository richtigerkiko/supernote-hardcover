import React from 'react';
import ReactTestRenderer, {act} from 'react-test-renderer';
import App from '../../src/ui/App';
import {session} from '../../src/page/session';
import {MOCK_BOOK} from '../../src/ui/preview/mockBook';

// The add flow's pages in App: what load() asks for is shown, and their buttons call the right session functions.
const edition = MOCK_BOOK.editions.find(e => !e.audio && e.pages > 0)!;
const button = (tree: any, label: string) => tree.root.findAll((n: any) => n.props.accessibilityRole === 'button' && n.props.accessibilityLabel === label)[0];

async function open(result: unknown) {
  const api: any = {
    load: jest.fn(async () => result),
    addToLibrary: jest.fn(async () => {}),
    linkBook: jest.fn(async () => {}),
    searchBooks: jest.fn(async () => [{bookId: 7, title: 'Other', authors: ['X']}]),
    pickBook: jest.fn(async () => ({pick: {bookId: 7, editions: [edition]}})),
  };
  session.api = api;
  session.close = jest.fn();
  let tree: any;
  await act(async () => {
    tree = ReactTestRenderer.create(<App />);
  });
  return {tree, api};
}

test('{pick}: Use this edition adds the book with the picked edition and does not close the view', async () => {
  const {tree, api} = await open({pick: {bookId: 5, editions: [edition]}});
  await act(async () => button(tree, 'Use this edition').props.onPress());
  expect(api.addToLibrary).toHaveBeenCalledWith({bookId: 5, editionId: edition.id});
  expect(session.close).not.toHaveBeenCalled();
  expect(api.load).toHaveBeenCalledTimes(2); // reloaded after the add
});

test('{pick} with link (a PDF book that is not added): Use this edition only links, then reloads', async () => {
  const {tree, api} = await open({pick: {bookId: 5, editions: [edition], link: true}});
  await act(async () => button(tree, 'Use this edition').props.onPress());
  expect(api.linkBook).toHaveBeenCalledWith({bookId: 5, editionId: edition.id});
  expect(api.addToLibrary).not.toHaveBeenCalled();
  expect(api.load.mock.calls.length).toBeGreaterThan(1); // reloaded (the earlier test's page is still mounted and reloads too)
});

test('{pick}: Cancel closes the view and writes nothing', async () => {
  const {tree, api} = await open({pick: {bookId: 5, editions: [edition]}});
  act(() => button(tree, 'Cancel').props.onPress());
  expect(session.close).toHaveBeenCalled();
  expect(api.addToLibrary).not.toHaveBeenCalled();
});

test('{search}: the book search shows, and a picked hit leads to the edition picker', async () => {
  const {tree, api} = await open({search: 'Dune Frank Herbert'});
  expect(api.searchBooks).toHaveBeenCalledWith('Dune Frank Herbert');
  act(() => tree.root.findByProps({accessibilityRole: 'radio'}).props.onPress());
  await act(async () => button(tree, 'Use this book').props.onPress());
  expect(api.pickBook).toHaveBeenCalledWith(7);
  expect(button(tree, 'Use this edition')).toBeTruthy();
});
