import React, {useRef, useState} from 'react';
import {PanResponder, Pressable, ScrollView, StyleSheet, Text, TextInput, View} from 'react-native';
import type {BookDetail} from './DetailPage';

// Review card, presentational like JournalPage: no SDK, everything arrives as props.
// Same e-ink rules: black on white, borders instead of greys, tap targets of at least 48 dp, text of at least 18 sp.

export type Review = {markdown: string; hasSpoilers: boolean; sponsored: boolean; notes: string; rating?: number};
export const BLANK_REVIEW: Review = {markdown: '', hasSpoilers: false, sponsored: false, notes: ''};

type Props = {
  book: BookDetail;
  initial?: Review; // what the entry already holds; saving replaces it
  onSave: (r: Review) => Promise<void>; // rejects with Error on failure
  onClose: () => void;
};

// Half-step rating (0.5 to 5) for a horizontal position on a row of `width` split into five stars.
export const ratingAt = (x: number, width: number): number => (width > 0 ? Math.min(5, Math.max(0.5, Math.ceil((x / width) * 10) / 2)) : 0);
// How much of star n is filled for a rating: 0, 0.5 or 1.
export const fillOf = (rating: number, n: number): number => Math.min(1, Math.max(0, rating - (n - 1)));

// Five stars you tap or drag across (measured on the Nomad: drags follow the finger and the page scroll does not take them).
// Tapping the rating you already have clears it. A half star is the solid star clipped over the outline star, because the
// device font has no half-star glyph (U+2BEA and friends draw as boxes). Also an adjustable element for screen readers.
function Stars({value, onChange, disabled}: {value: number; onChange: (v: number) => void; disabled: boolean}) {
  const [width, setWidth] = useState(0);
  const live = useRef({value, onChange, disabled, width});
  live.current = {value, onChange, disabled, width};
  const touch = useRef({start: 0, moved: false});
  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false, // the page scrolls vertically; a swipe on the stars is for the rating
      onPanResponderGrant: e => {
        const l = live.current;
        touch.current = {start: l.value, moved: false};
        if (!l.disabled) l.onChange(ratingAt(e.nativeEvent.locationX, l.width));
      },
      onPanResponderMove: e => {
        const l = live.current;
        const r = ratingAt(e.nativeEvent.locationX, l.width);
        if (r !== l.value) touch.current.moved = true;
        if (!l.disabled) l.onChange(r);
      },
      onPanResponderRelease: () => {
        const l = live.current;
        if (!l.disabled && !touch.current.moved && l.value === touch.current.start) l.onChange(0);
      },
    }),
  ).current;
  return (
    <View
      accessibilityRole="adjustable"
      accessibilityLabel="Rating"
      accessibilityValue={{text: value ? `${value} of 5` : 'none'}}
      accessibilityActions={[{name: 'increment'}, {name: 'decrement'}]}
      onAccessibilityAction={e => !disabled && onChange(Math.min(5, Math.max(0, value + (e.nativeEvent.actionName === 'increment' ? 0.5 : -0.5))))}
      onLayout={e => setWidth(e.nativeEvent.layout.width)}
      style={styles.stars}
      {...pan.panHandlers}>
      {[1, 2, 3, 4, 5].map(n => (
        <View key={n} pointerEvents="none" style={styles.star}>
          <Text style={styles.starGlyph}>☆</Text>
          <View style={[styles.starClip, {width: `${fillOf(value, n) * 100}%`}]}>
            <View style={[styles.starCell, {width: width / 5}]}>
              <Text style={styles.starGlyph}>★</Text>
            </View>
          </View>
        </View>
      ))}
    </View>
  );
}

function Check({label, on, busy, onPress}: {label: string; on: boolean; busy: boolean; onPress: () => void}) {
  return (
    <Pressable accessibilityRole="checkbox" accessibilityLabel={label} accessibilityState={{checked: on, disabled: busy}} disabled={busy} style={styles.check} onPress={onPress}>
      <View style={[styles.box, on && styles.fill]}>{on ? <Text style={[styles.checkMark, styles.white]}>✓</Text> : null}</View>
      <Text style={styles.line}>{label}</Text>
    </Pressable>
  );
}

export default function ReviewPage({book, initial = BLANK_REVIEW, onSave, onClose}: Props) {
  const [text, setText] = useState(initial.markdown);
  const [rating, setRating] = useState(initial.rating ?? 0); // 0 = no rating, else 0.5 to 5 in half steps
  const [spoilers, setSpoilers] = useState(initial.hasSpoilers);
  const [sponsored, setSponsored] = useState(initial.sponsored);
  const [notes, setNotes] = useState(initial.notes);
  const [state, setState] = useState<'editing' | 'saving' | 'saved' | 'error'>('editing');
  const [error, setError] = useState('');
  const busy = state === 'saving';
  const empty = !text.trim();

  const save = async () => {
    setState('saving');
    try {
      await onSave({markdown: text.trim(), hasSpoilers: spoilers, sponsored, notes: notes.trim(), ...(rating ? {rating} : {})});
      setState('saved');
    } catch (e: any) {
      setError(e?.message || 'Could not save.');
      setState('error');
    }
  };

  return (
    <View style={styles.root}>
      <View style={styles.card}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.body}>
          <View style={styles.header}>
            <Text style={styles.heading}>Write review</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Close" style={styles.close} onPress={onClose}>
              <Text style={styles.closeText}>✕</Text>
            </Pressable>
          </View>
          <Text style={[styles.line, styles.bold]} numberOfLines={1}>
            {book.title}
          </Text>
          {state === 'saved' ? (
            <>
              <Text style={styles.done}>✓ Review saved</Text>
              {rating ? <Text style={styles.line}>{`Rating: ${rating} / 5`}</Text> : null}
              <Pressable accessibilityRole="button" style={[styles.button, styles.fill]} onPress={onClose}>
                <Text style={[styles.buttonText, styles.white]}>Close</Text>
              </Pressable>
            </>
          ) : (
            <>
              <Stars value={rating} onChange={setRating} disabled={busy} />
              <TextInput
                accessibilityLabel="Review"
                style={[styles.input, {height: 6 * 28 + 24}]}
                multiline
                numberOfLines={6}
                textAlignVertical="top"
                editable={!busy}
                placeholder="What did you think?"
                placeholderTextColor={BLACK}
                value={text}
                onChangeText={setText}
              />
              <View style={styles.checks}>
              <Check label="This review contains spoilers" on={spoilers} busy={busy} onPress={() => setSpoilers(v => !v)} />
              <Check label="Sponsored or ARC review" on={sponsored} busy={busy} onPress={() => setSponsored(v => !v)} />
              </View>
              <View>
                <Text style={styles.label}>Private notes</Text>
                <TextInput
                  accessibilityLabel="Private notes"
                  style={[styles.input, {height: 3 * 28 + 24}]}
                  multiline
                  numberOfLines={3}
                  textAlignVertical="top"
                  editable={!busy}
                  placeholder="For your eyes only."
                  placeholderTextColor={BLACK}
                  value={notes}
                  onChangeText={setNotes}
                />
              </View>
              {state === 'error' ? <Text style={[styles.line, styles.bold]}>{error}</Text> : null}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Save"
                accessibilityState={{disabled: busy || empty}}
                disabled={busy || empty}
                style={[styles.button, !(busy || empty) && styles.fill]}
                onPress={save}>
                <Text style={[styles.buttonText, !(busy || empty) && styles.white]}>{busy ? 'Saving…' : state === 'error' ? 'Retry' : 'Save'}</Text>
              </Pressable>
            </>
          )}
        </ScrollView>
      </View>
    </View>
  );
}

const BLACK = '#000000';
const WHITE = '#ffffff';

const styles = StyleSheet.create({
  root: {flex: 1, alignItems: 'center', paddingTop: 24, paddingHorizontal: 24, paddingBottom: 24, backgroundColor: 'transparent'},
  card: {width: '100%', maxWidth: 701, flexShrink: 1, borderWidth: 3, borderColor: BLACK, backgroundColor: WHITE},
  body: {padding: 24, gap: 16},
  header: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'},
  heading: {fontSize: 22, fontWeight: '700', color: BLACK},
  close: {width: 56, height: 56, borderWidth: 3, borderColor: BLACK, alignItems: 'center', justifyContent: 'center'},
  closeText: {fontSize: 28, color: BLACK},
  stars: {flexDirection: 'row', height: 64},
  star: {flex: 1, height: 64, alignItems: 'center', justifyContent: 'center'},
  starGlyph: {fontSize: 52, lineHeight: 64, color: BLACK},
  // the solid star, clipped to the rated share of its cell, over the outline star
  starClip: {position: 'absolute', left: 0, top: 0, bottom: 0, overflow: 'hidden'},
  starCell: {height: 64, alignItems: 'center', justifyContent: 'center'},
  input: {fontSize: 20, lineHeight: 28, borderWidth: 2, borderColor: BLACK, padding: 12, color: BLACK},
  label: {fontSize: 18, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', color: BLACK, marginBottom: 6},
  checks: {flexDirection: 'row', gap: 16},
  check: {flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56},
  box: {width: 40, height: 40, borderWidth: 3, borderColor: BLACK, alignItems: 'center', justifyContent: 'center'},
  checkMark: {fontSize: 26, fontWeight: '700'},
  line: {fontSize: 20, color: BLACK},
  bold: {fontWeight: '700'},
  fill: {backgroundColor: BLACK},
  white: {color: WHITE},
  button: {height: 68, borderWidth: 3, borderColor: BLACK, alignItems: 'center', justifyContent: 'center', backgroundColor: WHITE},
  buttonText: {fontSize: 24, fontWeight: '700', color: BLACK},
  done: {fontSize: 28, fontWeight: '700', color: BLACK},
});
