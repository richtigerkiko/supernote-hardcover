import React, {useState} from 'react';
import {Pressable, ScrollView, StyleSheet, Text, TextInput, View} from 'react-native';
import type {Edition} from '../core/types';
import {BLACK, WHITE, Button, TopBar, shared} from './theme';

// Full-screen "Choose edition" list, shared by the detail page and the journal page. Same e-ink rules as DetailPage.

export const edLine1 = (e: Edition) => `${e.format} · ${e.publisher}`;
export const edLine2 = (e: Edition) => `${e.year ? `${e.year} · ` : ''}${e.pages} pages · ${e.lang}`;

// Every typed word must appear somewhere in the edition's text, any order, any case.
export const editionMatches = (e: Edition, query: string): boolean => {
  const text = `${edLine1(e)} ${edLine2(e)} ${e.isbn ?? ''}`.toLowerCase();
  return query.toLowerCase().split(/\s+/).filter(Boolean).every(w => text.includes(w));
};

// A radio row between hairlines; the caller makes the selected row's text bold.
export function Item({on, onPress, tall, children}: {on: boolean; onPress: () => void; tall?: boolean; children: React.ReactNode}) {
  return (
    <Pressable accessibilityRole="radio" accessibilityState={{checked: on}} style={[styles.item, tall && {minHeight: 84}]} onPress={onPress}>
      <View style={styles.radio}>{on ? <View style={styles.radioDot} /> : null}</View>
      <View style={styles.itemText}>{children}</View>
    </Pressable>
  );
}

type Props = {
  editions: Edition[];
  editionId: string;
  onPick: (editionId: string) => void;
  onClose: () => void;
};

export default function EditionPicker({editions, editionId, onPick, onClose}: Props) {
  const shown = editions.filter(e => !e.audio && e.pages > 0);
  const [choice, setChoice] = useState(shown.some(e => e.id === editionId) ? editionId : (shown[0]?.id ?? '')); // the current one may be hidden
  const hidden = editions.length - shown.length;
  const [query, setQuery] = useState('');
  const found = shown.filter(e => editionMatches(e, query));
  return (
    <View style={shared.page}>
      <TopBar title="Choose edition" onPress={onClose} />
      <View style={styles.head}>
        <TextInput
          style={styles.search}
          value={query}
          onChangeText={setQuery}
          accessibilityLabel="Search editions"
          placeholder={`Search ${shown.length} editions`}
          placeholderTextColor={BLACK}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
        />
        <Text style={styles.pickNote}>
          {`Pick the edition this file is. Page counts and progress follow it.${hidden ? ` ${hidden} edition${hidden > 1 ? 's' : ''} without a page count hidden.` : ''}`}
        </Text>
      </View>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.list}>
        {found.length === 0 ? <Text style={styles.none}>{`No edition matches “${query}”.`}</Text> : null}
        {found.map(e => (
          <Item key={e.id} tall on={e.id === choice} onPress={() => setChoice(e.id)}>
            <Text style={[styles.l1, e.id === choice && shared.bold]} numberOfLines={1}>
              {edLine1(e)}
            </Text>
            <Text style={styles.l2}>{`${edLine2(e)}${e.isbn ? ` · ISBN ${e.isbn}` : ''}`}</Text>
          </Item>
        ))}
      </ScrollView>
      <View style={shared.actions}>
        <Button label="Cancel" onPress={onClose} />
        <Button
          label="Use this edition"
          solid
          onPress={() => {
            onPick(choice);
            onClose();
          }}
        />
      </View>
    </View>
  );
}

export const styles = StyleSheet.create({
  head: {paddingTop: 12, paddingHorizontal: 32}, // clears the host's home button, like shared.body
  search: {fontSize: 21, color: BLACK, height: 56, paddingHorizontal: 24, borderWidth: 1.5, borderColor: BLACK, borderRadius: 28},
  pickNote: {fontSize: 18, lineHeight: 25, marginTop: 14, paddingBottom: 14, color: BLACK, ...shared.hair},
  list: {paddingHorizontal: 32},
  none: {fontSize: 21, color: BLACK, paddingVertical: 28},
  l1: {fontSize: 21, fontWeight: '500', color: BLACK},
  l2: {fontSize: 18, lineHeight: 26, color: BLACK},
  item: {flexDirection: 'row', alignItems: 'center', gap: 18, minHeight: 76, paddingVertical: 10, backgroundColor: WHITE, ...shared.hair},
  itemText: {flex: 1},
  radio: {width: 28, height: 28, borderWidth: 2, borderColor: BLACK, borderRadius: 14, alignItems: 'center', justifyContent: 'center'},
  radioDot: {width: 14, height: 14, borderRadius: 7, backgroundColor: BLACK},
});
