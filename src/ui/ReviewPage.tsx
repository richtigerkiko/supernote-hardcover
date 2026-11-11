import React, {useState} from 'react';
import {Pressable, ScrollView, StyleSheet, Text, TextInput, View} from 'react-native';
import type {BookDetail} from './DetailPage';

// Review card, presentational like JournalPage: no SDK, everything arrives as props.
// Same e-ink rules: black on white, borders instead of greys, tap targets of at least 48 dp, text of at least 18 sp.

export type Review = {markdown: string; hasSpoilers: boolean; rating?: number};

type Props = {
  book: BookDetail;
  onSave: (r: Review) => Promise<void>; // rejects with Error on failure
  onClose: () => void;
};

export default function ReviewPage({book, onSave, onClose}: Props) {
  const [text, setText] = useState('');
  const [rating, setRating] = useState(0); // 0 = no rating, else 0.5 to 5 in half steps
  const [spoilers, setSpoilers] = useState(false);
  const [state, setState] = useState<'editing' | 'saving' | 'saved' | 'error'>('editing');
  const [error, setError] = useState('');
  const busy = state === 'saving';
  const empty = !text.trim();

  const save = async () => {
    setState('saving');
    try {
      await onSave({markdown: text.trim(), hasSpoilers: spoilers, ...(rating ? {rating} : {})});
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
          <Text style={[styles.line, styles.bold]} numberOfLines={2}>
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
              <View style={styles.rating}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Lower rating"
                  disabled={busy || rating === 0}
                  style={styles.step}
                  onPress={() => setRating(r => (r <= 0.5 ? 0 : r - 0.5))}>
                  <Text style={styles.stepText}>−</Text>
                </Pressable>
                <Text style={styles.ratingText}>{rating ? `★ ${rating} / 5` : 'No rating'}</Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Raise rating"
                  disabled={busy || rating === 5}
                  style={styles.step}
                  onPress={() => setRating(r => Math.min(5, r + 0.5))}>
                  <Text style={styles.stepText}>+</Text>
                </Pressable>
              </View>
              <TextInput
                style={[styles.input, {height: 8 * 28 + 24}]}
                multiline
                numberOfLines={8}
                textAlignVertical="top"
                editable={!busy}
                placeholder="What did you think?"
                placeholderTextColor={BLACK}
                value={text}
                onChangeText={setText}
              />
              <Pressable
                accessibilityRole="checkbox"
                accessibilityState={{checked: spoilers, disabled: busy}}
                disabled={busy}
                style={styles.check}
                onPress={() => setSpoilers(s => !s)}>
                <View style={[styles.box, spoilers && styles.fill]}>{spoilers ? <Text style={[styles.checkMark, styles.white]}>✓</Text> : null}</View>
                <Text style={styles.line}>This review contains spoilers</Text>
              </Pressable>
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
  rating: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'},
  step: {width: 68, height: 56, borderWidth: 3, borderColor: BLACK, alignItems: 'center', justifyContent: 'center'},
  stepText: {fontSize: 28, fontWeight: '700', color: BLACK},
  ratingText: {fontSize: 24, fontWeight: '700', color: BLACK},
  input: {fontSize: 20, lineHeight: 28, borderWidth: 2, borderColor: BLACK, padding: 12, color: BLACK},
  check: {flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 56},
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
