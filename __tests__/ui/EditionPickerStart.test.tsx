import React from 'react';
import ReactTestRenderer, {act} from 'react-test-renderer';
import EditionPicker from '../../src/ui/EditionPicker';
import {MOCK_BOOK} from '../../src/ui/preview/mockBook';

test('when the current edition is hidden the picker starts on the first shown one', () => {
  const audio = MOCK_BOOK.editions.find(e => e.audio)!;
  const onPick = jest.fn();
  let tree: any;
  act(() => {
    tree = ReactTestRenderer.create(<EditionPicker editions={MOCK_BOOK.editions} editionId={audio.id} onPick={onPick} onClose={() => {}} />);
  });
  const use = tree.root.findAll((n: any) => n.props.accessibilityRole === 'button' && n.findAll((c: any) => c.children?.includes?.('Use this edition')).length)[0];
  act(() => use.props.onPress());
  const first = MOCK_BOOK.editions.find(e => !e.audio && e.pages > 0)!;
  expect(onPick).toHaveBeenCalledWith(first.id);
});
