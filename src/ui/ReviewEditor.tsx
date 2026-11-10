import React, {useState} from 'react';
import {Pressable, ScrollView, StyleSheet, Text, TextInput, View} from 'react-native';

// Full-screen review editor. Presentational: onSave does the confirmation and the network call (index.js).
// E-ink rules as DetailPage: black on white, borders, tap targets >= 48 dp, no animation.
export type ReviewDraft = {text: string; rating: number; spoilers: boolean}; // rating 0 = none, 0.5 steps

// Tapping star n: n, then n - 0.5, then clears when it is already the half star.
export const nextRating = (cur: number, n: number) => (cur === n ? n - 0.5 : cur === n - 0.5 ? 0 : n);
const starGlyph = (rating: number, n: number) => (rating >= n ? '★' : rating === n - 0.5 ? '½' : '☆');

type Props = {initial: ReviewDraft; onCancel: () => void; onSave: (r: ReviewDraft) => Promise<void>};

export default function ReviewEditor({initial, onCancel, onSave}: Props) {
  const [text, setText] = useState(initial.text);
  const [rating, setRating] = useState(initial.rating);
  const [spoilers, setSpoilers] = useState(initial.spoilers);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const empty = !text.trim() && !(rating > 0);

  const save = async () => {
    if (busy || empty) return;
    setBusy(true);
    setError('');
    try {
      await onSave({text, rating, spoilers});
    } catch (e: any) {
      setError(String(e?.message ?? e));
    }
    setBusy(false);
  };

  return (
    <View style={styles.page}>
      <View style={styles.topBar}>
        <Pressable accessibilityRole="button" accessibilityLabel="Back" style={styles.close} onPress={onCancel}>
          <Text style={styles.closeText}>←</Text>
        </Pressable>
        <Text style={styles.title}>Write review</Text>
      </View>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.stars}>
          {[1, 2, 3, 4, 5].map(n => (
            <Pressable key={n} accessibilityRole="button" accessibilityLabel={`Star ${n}`} style={styles.star} onPress={() => setRating(nextRating(rating, n))}>
              <Text style={styles.starText}>{starGlyph(rating, n)}</Text>
            </Pressable>
          ))}
          <Text style={styles.ratingText}>{rating > 0 ? String(rating) : 'No rating'}</Text>
        </View>
        <TextInput
          accessibilityLabel="Review text"
          style={styles.input}
          multiline
          value={text}
          onChangeText={setText}
          placeholder="Your review"
          placeholderTextColor="#000000"
          textAlignVertical="top"
        />
        <Pressable accessibilityRole="switch" accessibilityState={{checked: spoilers}} accessibilityLabel="Contains spoilers" style={styles.spoiler} onPress={() => setSpoilers(!spoilers)}>
          <View style={styles.box}>{spoilers ? <Text style={styles.tick}>✓</Text> : null}</View>
          <Text style={styles.l1}>Contains spoilers</Text>
        </Pressable>
        {error ? <Text style={styles.error}>{error}</Text> : null}
      </ScrollView>
      <View style={styles.actions}>
        <Pressable accessibilityRole="button" style={styles.action} onPress={onCancel}>
          <Text style={styles.actionText}>Cancel</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Save review" accessibilityState={{disabled: busy || empty}} style={[styles.action, (busy || empty) && styles.off]} onPress={save}>
          <Text style={styles.actionText}>{busy ? 'Saving…' : 'Save'}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const BLACK = '#000000';
const styles = StyleSheet.create({
  page: {flex: 1, backgroundColor: '#ffffff'},
  topBar: {flexDirection: 'row', alignItems: 'center', paddingLeft: 20, paddingRight: 64, height: 68, borderBottomWidth: 2, borderColor: BLACK},
  close: {width: 56, height: 56, alignItems: 'center', justifyContent: 'center'},
  closeText: {fontSize: 28, color: BLACK},
  title: {fontSize: 20, color: BLACK, marginLeft: 12},
  content: {padding: 24},
  stars: {flexDirection: 'row', alignItems: 'center', marginBottom: 16},
  star: {width: 64, height: 64, borderWidth: 2, borderColor: BLACK, alignItems: 'center', justifyContent: 'center', marginRight: 8},
  starText: {fontSize: 34, color: BLACK},
  ratingText: {fontSize: 20, color: BLACK, marginLeft: 8},
  input: {minHeight: 300, borderWidth: 3, borderColor: BLACK, padding: 12, fontSize: 22, lineHeight: 30, color: BLACK},
  spoiler: {flexDirection: 'row', alignItems: 'center', minHeight: 64, marginTop: 14},
  box: {width: 36, height: 36, borderWidth: 3, borderColor: BLACK, marginRight: 16, alignItems: 'center', justifyContent: 'center'},
  tick: {fontSize: 26, fontWeight: '700', color: BLACK},
  l1: {fontSize: 21, fontWeight: '700', color: BLACK},
  error: {fontSize: 19, color: BLACK, marginTop: 12, borderWidth: 2, borderColor: BLACK, padding: 10},
  actions: {flexDirection: 'row', paddingVertical: 16, paddingLeft: 16, paddingRight: 2, borderTopWidth: 2, borderColor: BLACK},
  action: {flex: 1, height: 68, borderWidth: 3, borderColor: BLACK, alignItems: 'center', justifyContent: 'center', marginRight: 14},
  off: {borderStyle: 'dashed'},
  actionText: {fontSize: 24, fontWeight: '700', color: BLACK},
});
