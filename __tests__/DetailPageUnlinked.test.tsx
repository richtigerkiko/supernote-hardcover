import React from 'react';
import ReactTestRenderer, {act} from 'react-test-renderer';
import DetailPage from '../src/ui/DetailPage';
import {MOCK_BOOK} from '../src/ui/mockBook';

const noop = () => {};
const render = (props: any = {}) => {
  let tree: any;
  act(() => {
    tree = ReactTestRenderer.create(
      <DetailPage book={{...MOCK_BOOK, inLibrary: false}} tracking={false} onToggleTracking={noop} onClose={noop} onWriteReview={noop} onSetStatus={noop} onSetEdition={noop} {...props} />,
    );
  });
  return tree;
};

test('a book that is not in the library has no tracking toggle or status, and an Add to library button', () => {
  const onAdd = jest.fn();
  const tree = render({onAddToLibrary: onAdd});
  expect(tree.root.findAllByProps({accessibilityLabel: 'Hardcover tracking'})).toHaveLength(0);
  expect(tree.root.findAllByProps({accessibilityLabel: 'Change reading status'})).toHaveLength(0);
  act(() => tree.root.findByProps({accessibilityLabel: 'Add to library'}).props.onPress());
  expect(onAdd).toHaveBeenCalledTimes(1);
});
