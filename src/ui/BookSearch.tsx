import React, {useEffect, useRef, useState} from 'react';
import {ScrollView, Text, TextInput, View} from 'react-native';
import type {CatalogueBook} from '../core/types';
import {Item, styles} from './EditionPicker';
import {BLACK, Button, TopBar, shared} from './theme';

// Full-screen "Find book" list in the edition picker's style, for a file with no automatic match (or one matched to a book with no page counts): a search field that
// starts with the EPUB's title and author (empty for a PDF), and Hardcover's hits as radio rows. The pick is confirmed with the button
// (and then by the add dialog), because a wrong book stays linked to the file.

type Props = {
  query: string;
  onSearch: (query: string) => Promise<CatalogueBook[]>;
  onPick: (bookId: number) => void;
  onClose: () => void;
};

export default function BookSearch({query, onSearch, onPick, onClose}: Props) {
  const [text, setText] = useState(query);
  const [hits, setHits] = useState<CatalogueBook[] | null>(null); // null: searching
  const [error, setError] = useState('');
  const [choice, setChoice] = useState(0);
  const seq = useRef(0); // an answer to an older search is dropped
  const search = () => {
    const mine = ++seq.current;
    const q = text.trim();
    setChoice(0);
    setError('');
    setHits(q ? null : []);
    if (!q) return;
    onSearch(q).then(
      found => {
        if (mine === seq.current) setHits(found);
      },
      (e: any) => {
        if (mine !== seq.current) return;
        setHits([]);
        setError(`Search failed: ${String(e?.message ?? e)}`);
      },
    );
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- once, with the text the page opened with
  useEffect(search, []);
  return (
    <View style={shared.page}>
      <TopBar title="Find book" onPress={onClose} />
      <View style={styles.head}>
        <View style={{flexDirection: 'row', alignItems: 'center', gap: 12}}>
          <TextInput
            style={[styles.search, {flex: 1}]}
            value={text}
            onChangeText={setText}
            onSubmitEditing={search}
            accessibilityLabel="Search books"
            placeholder="Title and author"
            placeholderTextColor={BLACK}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
          />
          <Button label="Search" small onPress={search} />
        </View>
        <Text style={styles.pickNote}>Hardcover has no sure match for this file. Pick the book it is.</Text>
      </View>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.list}>
        {hits === null ? <Text style={styles.none}>Searching…</Text> : hits.length === 0 ? <Text style={styles.none}>{error || 'No book found'}</Text> : null}
        {(hits ?? []).map(h => (
          <Item key={h.bookId} tall on={h.bookId === choice} onPress={() => setChoice(h.bookId)}>
            <Text style={[styles.l1, h.bookId === choice && shared.bold]} numberOfLines={2}>
              {h.title}
            </Text>
            <Text style={styles.l2} numberOfLines={1}>
              {h.authors.join(', ')}
            </Text>
          </Item>
        ))}
      </ScrollView>
      <View style={shared.actions}>
        <Button label="Cancel" onPress={onClose} />
        <Button label="Use this book" solid disabled={!choice} onPress={() => onPick(choice)} />
      </View>
    </View>
  );
}
