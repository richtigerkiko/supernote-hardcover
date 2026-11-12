// "Quiet page": the colours, styles and small parts every page shares. E-ink: black on white, 1 px hairlines between rows,
// rounded outlines only where something is pressed or typed into, one grey for pills, serif for the book's own words.
import React from 'react';
import {PixelRatio, Pressable, StyleSheet, Text, useWindowDimensions, View} from 'react-native';

export const BLACK = '#000000';
export const WHITE = '#ffffff';
// The only grey: 13% (#dddddd), the lightest shade that shows on the Nomad's panel (owner's pick from a probe of 14 shades,
// 2026-11-12). The boards' #ebebeb (8%) and everything lighter was invisible there.
export const GREY = '#dddddd';
// Android's "serif" family is Noto Serif on the Nomad (/system/etc/fonts.xml, checked 2026-11-12), so no font is bundled.
export const SERIF = 'serif';

export const shared = StyleSheet.create({
  page: {flex: 1, backgroundColor: WHITE},
  overlay: {...StyleSheet.absoluteFillObject, backgroundColor: WHITE}, // a full-screen view over a page that stays mounted
  topBar: {flexDirection: 'row', alignItems: 'center', gap: 4, paddingLeft: 20, paddingRight: 64, height: 68}, // right gap: the host's floating home button sits there
  close: {width: 56, height: 56, alignItems: 'center', justifyContent: 'center'},
  barTitle: {flex: 1, fontSize: 22, fontWeight: '500', color: BLACK},
  body: {paddingTop: 12, paddingHorizontal: 32, paddingBottom: 12}, // 12: the host's home button reaches about 80 dp down on the right (seen on the Nomad)
  actions: {flexDirection: 'row', gap: 16, paddingTop: 14, paddingHorizontal: 32, paddingBottom: 18},
  button: {flex: 1, height: 64, flexDirection: 'row', gap: 12, borderWidth: 2, borderColor: BLACK, borderRadius: 32, alignItems: 'center', justifyContent: 'center', backgroundColor: WHITE},
  buttonSmall: {flex: 0, height: 52, borderRadius: 26, paddingHorizontal: 28},
  buttonText: {fontSize: 22, fontWeight: '500', color: BLACK},
  fill: {backgroundColor: BLACK},
  white: {color: WHITE},
  bold: {fontWeight: '700'},
  hair: {borderBottomWidth: 1, borderColor: BLACK},
  label: {fontSize: 16, fontWeight: '700', letterSpacing: 1.5, textTransform: 'uppercase', color: BLACK},
  link: {height: 48, alignSelf: 'flex-start', justifyContent: 'center'},
  linkText: {fontSize: 20, fontWeight: '500', color: BLACK, textDecorationLine: 'underline'},
  text: {fontSize: 20, lineHeight: 30, color: BLACK},
  serif: {fontFamily: SERIF, fontSize: 20, lineHeight: 31, color: BLACK},
  quote: {fontFamily: SERIF, fontSize: 20, lineHeight: 31, fontStyle: 'italic', color: BLACK, paddingLeft: 20, borderLeftWidth: 2, borderColor: BLACK},
  input: {fontSize: 20, lineHeight: 30, color: BLACK, paddingVertical: 12, paddingHorizontal: 16, borderWidth: 1.5, borderColor: BLACK, borderRadius: 12},
  pill: {height: 30, paddingHorizontal: 12, borderRadius: 15, backgroundColor: GREY, justifyContent: 'center'},
  pillText: {fontSize: 18, color: BLACK, includeFontPadding: false},
  tabs: {flexDirection: 'row', gap: 36},
  tab: {height: 56, paddingHorizontal: 2, justifyContent: 'center', borderBottomWidth: 3, borderColor: 'transparent'},
  tabOn: {borderColor: BLACK},
  tabText: {fontSize: 22, color: BLACK},
  options: {flexDirection: 'row', gap: 12, marginTop: 10},
  option: {flex: 1, height: 52, borderWidth: 1.5, borderColor: BLACK, borderRadius: 26, alignItems: 'center', justifyContent: 'center', backgroundColor: WHITE},
  // icons drawn with Views: a text glyph may be missing from the device font
  chevron: {width: 13, height: 13, borderLeftWidth: 2.5, borderBottomWidth: 2.5, borderColor: BLACK},
  crossBar: {position: 'absolute', width: 26, height: 2.5, backgroundColor: BLACK},
});

const TURN = {left: '45deg', down: '-45deg', right: '-135deg'};
export const Chevron = ({dir}: {dir: keyof typeof TURN}) => <View style={[shared.chevron, {transform: [{rotate: TURN[dir]}]}]} />;

// Top bar of every page: a back chevron or a close X, a title, and whatever the page puts on the right.
export function TopBar({title, icon = 'back', label = icon === 'back' ? 'Back' : 'Close', onPress, children}: {title?: string; icon?: 'back' | 'close'; label?: string; onPress: () => void; children?: React.ReactNode}) {
  return (
    <View style={shared.topBar}>
      <Pressable accessibilityRole="button" accessibilityLabel={label} style={shared.close} onPress={onPress}>
        {icon === 'back' ? (
          <Chevron dir="left" />
        ) : (
          <>
            <View style={[shared.crossBar, {transform: [{rotate: '45deg'}]}]} />
            <View style={[shared.crossBar, {transform: [{rotate: '-45deg'}]}]} />
          </>
        )}
      </Pressable>
      {title ? <Text style={shared.barTitle} numberOfLines={1}>{title}</Text> : null}
      {children}
    </View>
  );
}

// Rounded button: solid black for the main action, outlined otherwise (a disabled one is always outlined).
export function Button({label, onPress, solid, disabled, small, accessibilityLabel, children}: {label: string; onPress?: () => unknown; solid?: boolean; disabled?: boolean; small?: boolean; accessibilityLabel?: string; children?: React.ReactNode}) {
  const on = !!solid && !disabled;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? label} accessibilityState={{disabled: !!disabled}} disabled={disabled} style={[shared.button, small && shared.buttonSmall, on && shared.fill]} onPress={() => void onPress?.()}>
      <Text style={[shared.buttonText, small && {fontSize: 20}, on && shared.white]}>{label}</Text>
      {children}
    </Pressable>
  );
}

export function Link({label, onPress, accessibilityLabel}: {label: string; onPress: () => unknown; accessibilityLabel?: string}) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? label} hitSlop={{left: 8, right: 8}} style={shared.link} onPress={() => void onPress()}>
      <Text style={shared.linkText}>{label}</Text>
    </Pressable>
  );
}

export function Pill({text}: {text: string}) {
  return (
    <View style={shared.pill}>
      <Text style={shared.pillText}>{text}</Text>
    </View>
  );
}

// Underline tabs: plain text, the selected one bold with a 3 px line under it.
export function Tabs<T extends string>({options, value, onPick, disabled}: {options: [T, string][]; value: T; onPick: (v: T) => void; disabled?: boolean}) {
  return (
    <View accessibilityRole="tablist" style={shared.tabs}>
      {options.map(([v, label]) => (
        <Pressable key={v} accessibilityRole="tab" accessibilityLabel={`${label} tab`} accessibilityState={{selected: v === value, disabled: !!disabled}} disabled={disabled} style={[shared.tab, v === value && shared.tabOn]} onPress={() => onPick(v)}>
          <Text style={[shared.tabText, v === value && shared.bold]}>{label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

// One of a few rounded options side by side (privacy); the selected one is solid.
export function Options<T>({options, value, onPick, disabled}: {options: [T, string][]; value: T; onPick: (v: T) => void; disabled?: boolean}) {
  return (
    <View accessibilityRole="radiogroup" style={shared.options}>
      {options.map(([v, label]) => (
        <Pressable key={label} accessibilityRole="radio" accessibilityState={{checked: v === value, disabled: !!disabled}} disabled={disabled} style={[shared.option, v === value && shared.fill]} onPress={() => onPick(v)}>
          <Text style={[shared.text, v === value && shared.white, v === value && shared.bold]}>{label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

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
