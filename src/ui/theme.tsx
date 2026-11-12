// Colours and the styles every page shares. E-ink: black on white, borders instead of greys.
import React from 'react';
import {PixelRatio, StyleSheet, useWindowDimensions, View} from 'react-native';

export const BLACK = '#000000';
export const WHITE = '#ffffff';

export const shared = StyleSheet.create({
  topBar: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingLeft: 20, paddingRight: 64, height: 68, borderBottomWidth: 2, borderColor: BLACK}, // right gap: the host's floating home button sits there
  close: {width: 56, height: 56, alignItems: 'center', justifyContent: 'center'},
  closeBox: {width: 56, height: 56, borderWidth: 3, borderColor: BLACK, alignItems: 'center', justifyContent: 'center'}, // the close of a card
  closeText: {fontSize: 28, color: BLACK},
  actions: {flexDirection: 'row', paddingVertical: 16, paddingLeft: 16, paddingRight: 2, borderTopWidth: 2, borderColor: BLACK},
  button: {height: 68, borderWidth: 3, borderColor: BLACK, alignItems: 'center', justifyContent: 'center'},
  action: {flex: 1, height: 68, borderWidth: 3, borderColor: BLACK, alignItems: 'center', justifyContent: 'center', marginRight: 14},
  actionText: {fontSize: 24, fontWeight: '700', color: BLACK},
});

// Every size in src/ui is in Nomad dp (window 749x998, the only measured device). On a bigger window the whole page is laid
// out at the Nomad's size class and scaled up uniformly: text, touch targets, cover and cards grow together. The layout box
// is window/scale, so a taller or wider window still gets more room. shortcut: the clamp (0.8-1.6) is a guess, adjust once a
// Manta/A5X owner reports real numbers (the "window" log line from App.tsx).
export const REF_WIDTH = 749;
export const scaleFor = (width: number) => {
  const s = Math.min(1.6, Math.max(0.8, width / REF_WIDTH));
  return Math.abs(s - 1) < 0.02 ? 1 : s; // the Nomad reports ~748.8: exactly 1, no transform
};

export function Scaled({children}: {children: React.ReactNode}) {
  const {width, height} = useWindowDimensions();
  const s = scaleFor(width);
  if (s === 1) return <>{children}</>;
  // Scales about the centre, so a box of window/scale centred in the window fills it exactly.
  return (
    <View style={{flex: 1, alignItems: 'center', justifyContent: 'center', overflow: 'hidden'}}>
      <View style={{width: width / s, height: height / s, transform: [{scale: s}]}}>{children}</View>
    </View>
  );
}

export const windowFacts = (w: {width: number; height: number}) =>
  `${Math.round(w.width)}x${Math.round(w.height)} dp, density ${PixelRatio.get()}, scale ${scaleFor(w.width)}`;
