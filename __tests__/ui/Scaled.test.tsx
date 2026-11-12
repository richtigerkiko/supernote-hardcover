import React from 'react';
import {Text, useWindowDimensions} from 'react-native';
import ReactTestRenderer, {act} from 'react-test-renderer';
import {Scaled, scaleFor} from '../../src/ui/theme';

jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({__esModule: true, default: jest.fn()}));
const dims = useWindowDimensions as unknown as jest.Mock;

test.each([
  [748.8, 1], // Nomad
  [1024, 1024 / 749], // Manta, assumed
  [400, 0.8],
  [3000, 1.6],
])('scaleFor %d -> %d', (w, s) => expect(scaleFor(w)).toBeCloseTo(s));

const render = async (w: number, h: number) => {
  dims.mockReturnValue({width: w, height: h});
  let r: ReactTestRenderer.ReactTestRenderer;
  await act(async () => {
    r = ReactTestRenderer.create(<Scaled><Text>x</Text></Scaled>);
  });
  return r!.toJSON() as any;
};

test('Nomad window: no wrapper at all', async () => expect((await render(748.8, 998)).type).toBe('Text'));

test('Manta window: laid out at the Nomad size class, scaled to fill the window', async () => {
  const inner = (await render(1024, 1365)).children[0];
  const s = 1024 / 749;
  expect(inner.props.style.transform).toEqual([{scale: s}]);
  expect(inner.props.style.width * s).toBeCloseTo(1024);
  expect(inner.props.style.height * s).toBeCloseTo(1365);
});
