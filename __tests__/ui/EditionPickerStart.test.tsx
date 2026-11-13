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

test('typing does not change the list; the Search key filters it (#102)', () => {
  const shown = MOCK_BOOK.editions.filter(x => !x.audio && x.pages > 0);
  const target = shown[shown.length - 1];
  let tree: any;
  act(() => {
    tree = ReactTestRenderer.create(<EditionPicker editions={MOCK_BOOK.editions} editionId="" onPick={() => {}} onClose={() => {}} />);
  });
  const rows = () => tree.root.findAllByProps({accessibilityRole: 'radio'}).filter((n: any) => typeof n.type !== 'string').length;
  const input = tree.root.findByProps({accessibilityLabel: 'Search editions'});
  const all = rows();
  expect(input.props.value).toBeUndefined(); // not controlled: a keystroke does not render
  expect(input.props.onChangeText).toBeUndefined();
  act(() => input.props.onSubmitEditing({nativeEvent: {text: target.isbn ?? target.publisher}}));
  expect(rows()).toBeLessThan(all);
  expect(rows()).toBeGreaterThan(0);
  act(() => input.props.onSubmitEditing({nativeEvent: {text: ''}}));
  expect(rows()).toBe(all);
});
