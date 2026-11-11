import React from 'react';
import {View} from 'react-native';
import qrcode from 'qrcode-generator';

// A QR code drawn with plain Views (no SVG or native module): one View per run of dark modules, black on white with
// the 4-module quiet zone scanners need. `size` is the whole square in dp.
export default function QrCode({text, size}: {text: string; size: number}) {
  const qr = qrcode(0, 'M'); // type 0 = smallest version that fits
  qr.addData(text);
  qr.make();
  const n = qr.getModuleCount();
  const cell = Math.floor(size / (n + 8));
  const quiet = cell * 4;
  const rows = [];
  for (let y = 0; y < n; y++) {
    const runs = [];
    for (let x = 0; x < n; x++) {
      if (!qr.isDark(y, x)) continue;
      let end = x;
      while (end + 1 < n && qr.isDark(y, end + 1)) end++;
      runs.push(<View key={x} style={{position: 'absolute', left: x * cell, width: (end - x + 1) * cell, height: cell, backgroundColor: '#000'}} />);
      x = end;
    }
    rows.push(<View key={y} style={{height: cell}}>{runs}</View>);
  }
  const side = cell * (n + 8);
  return (
    <View accessibilityLabel="QR code" style={{width: side, height: side, padding: quiet, backgroundColor: '#fff'}}>
      {rows}
    </View>
  );
}
