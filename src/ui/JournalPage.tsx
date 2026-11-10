import React, {useState} from 'react';
import {Pressable, ScrollView, StyleSheet, Text, TextInput, View} from 'react-native';
import type {BookDetail} from './DetailPage';
import EditionPicker, {edLine1} from './EditionPicker';

// Journal entry card (quote or note), presentational like DetailPage: no SDK, everything arrives as props.
// Same e-ink rules: black on white, borders instead of greys, tap targets of at least 48 dp, text of at least 18 sp.

type Privacy = 1 | 2 | 3;
type Entry = {event: 'quote' | 'note'; passage: string; text: string; privacy: Privacy};

type Props = {
  book: BookDetail;
  passage: string;
  onSetEdition: (editionId: string) => void;
  onSave: (e: Entry) => Promise<void>; // rejects with Error on failure
  onClose: () => void;
};

const PRIVACY: [Privacy, string][] = [
  [1, 'Public'],
  [2, 'Follows'],
  [3, 'Private'],
];
const privacyName = (p: Privacy) => PRIVACY.find(([v]) => v === p)![1];

function Segments<T>({options, value, onPick, role, disabled}: {options: [T, string][]; value: T; onPick: (v: T) => void; role: 'tab' | 'radio'; disabled: boolean}) {
  return (
    <View style={styles.segments}>
      {options.map(([v, label], i) => {
        const on = v === value;
        return (
          <Pressable
            key={label}
            accessibilityRole={role}
            accessibilityState={role === 'tab' ? {selected: on, disabled} : {checked: on, disabled}}
            disabled={disabled}
            style={[styles.segment, i > 0 && styles.segmentGap, on && styles.fill]}
            onPress={() => onPick(v)}>
            <Text style={[styles.segmentText, on && styles.white]}>{label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export default function JournalPage({book, passage, onSetEdition, onSave, onClose}: Props) {
  const [view, setView] = useState<'form' | 'editions'>('form');
  const [tab, setTab] = useState<'quote' | 'note'>('quote');
  const [thoughts, setThoughts] = useState('');
  const [note, setNote] = useState('');
  const [privacy, setPrivacy] = useState<Privacy>(3);
  const [state, setState] = useState<'editing' | 'saving' | 'saved' | 'error'>('editing');
  const [error, setError] = useState('');

  const ed = book.editions.find(e => e.id === book.editionId) ?? book.editions.find(e => !e.audio && e.pages > 0);
  const page = ed ? Math.min(ed.pages, Math.max(1, Math.round(book.progress * ed.pages))) : 0;
  const busy = state === 'saving';
  const empty = tab === 'quote' ? !passage.trim() : !note.trim();

  if (view === 'editions') {
    return <EditionPicker editions={book.editions} editionId={book.editionId} onPick={onSetEdition} onClose={() => setView('form')} />;
  }

  const save = async () => {
    setState('saving');
    try {
      await onSave(tab === 'quote' ? {event: 'quote', passage, text: thoughts.trim(), privacy} : {event: 'note', passage: '', text: note.trim(), privacy});
      setState('saved');
    } catch (e: any) {
      setError(e?.message || 'Could not save.');
      setState('error');
    }
  };

  const header = (
    <View style={styles.header}>
      <Text style={styles.heading}>Add journal entry</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="Close" style={styles.close} onPress={onClose}>
        <Text style={styles.closeText}>✕</Text>
      </Pressable>
    </View>
  );

  return (
    <View style={styles.root}>
      <View style={styles.card}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.body}>
          {header}
          {state === 'saved' ? (
            <>
              <Text style={styles.done}>{`✓ ${tab === 'quote' ? 'Quote' : 'Note'} saved`}</Text>
              <Text style={styles.line}>{`${book.title}${ed ? ` · page ${page}` : ''} · ${privacyName(privacy)}`}</Text>
              <View style={styles.pair}>
                <Pressable
                  accessibilityRole="button"
                  style={[styles.button, styles.half]}
                  onPress={() => {
                    setNote('');
                    setTab('note');
                    setState('editing');
                  }}>
                  <Text style={styles.buttonText}>Add a note</Text>
                </Pressable>
                <Pressable accessibilityRole="button" style={[styles.button, styles.half, styles.fill]} onPress={onClose}>
                  <Text style={[styles.buttonText, styles.white]}>Close</Text>
                </Pressable>
              </View>
            </>
          ) : (
            <>
              <Segments
                options={[
                  ['note', 'Note'],
                  ['quote', 'Quote'],
                ]}
                value={tab}
                onPick={setTab}
                role="tab"
                disabled={busy}
              />
              {tab === 'quote' ? (
                <>
                  <Text style={styles.quote} numberOfLines={6}>
                    {passage || 'No text selected. Select a passage in the book first, or write a note.'}
                  </Text>
                  <TextInput
                    style={[styles.input, {height: 3 * 28 + 24}]}
                    multiline
                    numberOfLines={3}
                    textAlignVertical="top"
                    editable={!busy}
                    placeholder="Add your thoughts (optional)…"
                    placeholderTextColor={BLACK}
                    value={thoughts}
                    onChangeText={setThoughts}
                  />
                </>
              ) : (
                <TextInput
                  style={[styles.input, {height: 6 * 28 + 24}]}
                  multiline
                  numberOfLines={6}
                  textAlignVertical="top"
                  editable={!busy}
                  placeholder="Write a new note…"
                  placeholderTextColor={BLACK}
                  value={note}
                  onChangeText={setNote}
                />
              )}
              {ed ? (
                <>
                  <Pressable accessibilityRole="button" accessibilityLabel="Change edition" disabled={busy} style={styles.edRow} onPress={() => setView('editions')}>
                    <Text style={styles.edText} numberOfLines={1}>{`Edition: ${edLine1(ed)}`}</Text>
                    <Text style={styles.edText}>›</Text>
                  </Pressable>
                  <Text style={styles.line}>
                    {'From page '}
                    <Text style={styles.bold}>{String(page)}</Text>
                    {' of '}
                    <Text style={styles.bold}>{String(ed.pages)}</Text>.
                  </Text>
                </>
              ) : null}
              <View>
                <Text style={styles.label}>Privacy</Text>
                <Segments options={PRIVACY} value={privacy} onPick={setPrivacy} role="radio" disabled={busy} />
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
  // transparent: if the host shows the page behind the view the card floats over it, else it sits on white
  root: {flex: 1, alignItems: 'center', paddingTop: 24, paddingHorizontal: 24, paddingBottom: 24, backgroundColor: 'transparent'},
  card: {width: '100%', maxWidth: 701, flexShrink: 1, borderWidth: 3, borderColor: BLACK, backgroundColor: WHITE},
  body: {padding: 24, gap: 16},
  header: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'},
  heading: {fontSize: 22, fontWeight: '700', color: BLACK},
  close: {width: 56, height: 56, borderWidth: 3, borderColor: BLACK, alignItems: 'center', justifyContent: 'center'},
  closeText: {fontSize: 28, color: BLACK},
  segments: {flexDirection: 'row', borderWidth: 3, borderColor: BLACK},
  segment: {flex: 1, height: 56, alignItems: 'center', justifyContent: 'center', backgroundColor: WHITE},
  segmentGap: {borderLeftWidth: 3, borderColor: BLACK},
  segmentText: {fontSize: 20, fontWeight: '700', color: BLACK},
  fill: {backgroundColor: BLACK},
  white: {color: WHITE},
  quote: {fontSize: 20, lineHeight: 28, fontStyle: 'italic', borderLeftWidth: 3, borderColor: BLACK, paddingLeft: 14, color: BLACK},
  input: {fontSize: 20, lineHeight: 28, borderWidth: 2, borderColor: BLACK, padding: 12, color: BLACK},
  edRow: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 56, paddingHorizontal: 16, borderWidth: 2, borderColor: BLACK},
  edText: {flexShrink: 1, fontSize: 20, fontWeight: '700', color: BLACK},
  line: {fontSize: 20, color: BLACK},
  bold: {fontWeight: '700'},
  label: {fontSize: 18, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', color: BLACK, marginBottom: 6},
  button: {height: 68, borderWidth: 3, borderColor: BLACK, alignItems: 'center', justifyContent: 'center', backgroundColor: WHITE},
  buttonText: {fontSize: 24, fontWeight: '700', color: BLACK},
  done: {fontSize: 28, fontWeight: '700', color: BLACK},
  pair: {flexDirection: 'row', gap: 14},
  half: {flex: 1},
});
