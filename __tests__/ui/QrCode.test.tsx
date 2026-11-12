import React from 'react';
import ReactTestRenderer, {act} from 'react-test-renderer';
import QrCode from '../../src/ui/QrCode';

test('draws a square QR code with a quiet zone, from runs of black modules', async () => {
  let r: ReactTestRenderer.ReactTestRenderer;
  await act(async () => {
    r = ReactTestRenderer.create(<QrCode text="https://hardcover.app/link?user_code=ABCD-EFGH" size={340} />);
  });
  const root = r!.toJSON() as any;
  expect(root.props.style.width).toBe(root.props.style.height);
  expect(root.props.style.width).toBeLessThanOrEqual(340);
  expect(root.props.style.padding).toBeGreaterThan(0);
  const black = JSON.stringify(root).split('"backgroundColor":"#000"').length - 1;
  expect(black).toBeGreaterThan(50);
});
