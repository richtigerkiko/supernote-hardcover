import React, {useState} from 'react';
import {Pressable, StyleSheet, Text, TextInput, View} from 'react-native';
import type {BookDetail, Entry, Privacy} from '../core/types';
import {BLACK, Button, Chevron, Options, Tabs, Scroll, TopBar, shared} from './theme';
import EditionPicker, {edLine1} from './EditionPicker';

// "Add journal entry" page (quote or note), presentational like DetailPage: no SDK, everything arrives as props.
// Quiet page rules (theme.tsx): tap targets of at least 48 dp, text of at least 18 sp.

type Props = {
  book: BookDetail;
  passage: string;
  onSetEdition: (editionId: string) => void;
  onSave: (e: Entry) => Promise<void>; // rejects with Error on failure
  onClose: () => void;
};

export const PRIVACY: [Privacy, string][] = [
  [1, 'Public'],
  [2, 'Follows'],
  [3, 'Private'],
];
export const privacyName = (p: Privacy) => PRIVACY.find(([v]) => v === p)![1];

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

  if (state === 'saved') {
    return (
      <View style={shared.page}>
        <TopBar icon="close" title="Add journal entry" onPress={onClose} />
        <View style={[shared.body, styles.body]}>
          <Text style={styles.done}>{`✓ ${tab === 'quote' ? 'Quote' : 'Note'} saved`}</Text>
          <Text style={shared.text}>{`${book.title}${ed ? ` · page ${page}` : ''} · ${privacyName(privacy)}`}</Text>
        </View>
        <View style={styles.fill} />
        <View style={shared.actions}>
          <Button
            label="Add a note"
            onPress={() => {
              setNote('');
              setTab('note');
              setState('editing');
            }}
          />
          <Button label="Close" solid onPress={onClose} />
        </View>
      </View>
    );
  }

  return (
    <View style={shared.page}>
      <TopBar icon="close" title="Add journal entry" onPress={onClose} />
      <Scroll style={styles.fill} keyboardShouldPersistTaps="handled" contentContainerStyle={[shared.body, styles.body, {paddingTop: 0}]}>
        <Tabs
          options={[
            ['quote', 'Quote'],
            ['note', 'Note'],
          ]}
          value={tab}
          onPick={setTab}
          disabled={busy}
        />
        {tab === 'quote' ? (
          <>
            <Text style={shared.quote} numberOfLines={6}>
              {passage || 'No text selected. Select a passage in the book first, or write a note.'}
            </Text>
            <TextInput
              style={[shared.input, {height: 126}]}
              multiline
              numberOfLines={3}
              textAlignVertical="top"
              editable={!busy}
              accessibilityLabel="Your thoughts"
              placeholder="Add your thoughts (optional)…"
              placeholderTextColor={BLACK}
              value={thoughts}
              onChangeText={setThoughts}
            />
          </>
        ) : (
          <TextInput
            style={[shared.input, {height: 216}]}
            multiline
            numberOfLines={6}
            textAlignVertical="top"
            editable={!busy}
            accessibilityLabel="Note"
            placeholder="Write a new note…"
            placeholderTextColor={BLACK}
            value={note}
            onChangeText={setNote}
          />
        )}
        {ed ? (
          <View>
            <Pressable accessibilityRole="button" accessibilityLabel="Change edition" disabled={busy} style={styles.edRow} onPress={() => setView('editions')}>
              <Text style={[shared.label, styles.edLabel]}>Edition</Text>
              <Text style={styles.edText} numberOfLines={1}>
                {edLine1(ed)}
              </Text>
              <Text style={styles.change}>Change</Text>
              <Chevron dir="right" />
            </Pressable>
            <Text style={styles.from}>
              {'From page '}
              <Text style={shared.bold}>{String(page)}</Text>
              {` of ${ed.pages}.`}
            </Text>
          </View>
        ) : null}
        <View>
          <Text style={shared.label}>Privacy</Text>
          <Options options={PRIVACY} value={privacy} onPick={setPrivacy} disabled={busy} />
        </View>
        {state === 'error' ? <Text style={[shared.text, shared.bold]}>{error}</Text> : null}
      </Scroll>
      <View style={shared.actions}>
        <Button label={busy ? 'Saving…' : state === 'error' ? 'Retry' : 'Save'} accessibilityLabel="Save" solid disabled={busy || empty} onPress={save} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: {flex: 1},
  body: {gap: 20},
  edRow: {flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 60, paddingRight: 4, borderTopWidth: 1, ...shared.hair},
  edLabel: {width: 96},
  edText: {flex: 1, fontSize: 19, fontWeight: '500', color: BLACK},
  change: {fontSize: 19, color: BLACK},
  from: {fontSize: 19, color: BLACK, marginTop: 12},
  done: {fontSize: 28, fontWeight: '700', color: BLACK},
});
