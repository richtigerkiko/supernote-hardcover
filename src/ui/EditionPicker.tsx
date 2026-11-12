import React, {useState} from 'react';
import {Pressable, ScrollView, StyleSheet, Text, TextInput, View} from 'react-native';
import type {Edition} from '../core/types';
import {BLACK, WHITE, shared} from './theme';

// Full-screen "Choose edition" list, shared by the detail page and the journal page. Same e-ink rules as DetailPage.

export const edLine1 = (e: Edition) => `${e.format} · ${e.publisher}`;
export const edLine2 = (e: Edition) => `${e.year ? `${e.year} · ` : ''}${e.pages} pages · ${e.lang}`;

// Every typed word must appear somewhere in the edition's text, any order, any case.
export const editionMatches = (e: Edition, query: string): boolean => {
  const text = `${edLine1(e)} ${edLine2(e)} ${e.isbn ?? ''}`.toLowerCase();
  return query.toLowerCase().split(/\s+/).filter(Boolean).every(w => text.includes(w));
};

export function TopBar({title, onBack}: {title: string; onBack: () => void}) {
  return (
    <View style={styles.topBar}>
      <Pressable accessibilityRole="button" accessibilityLabel="Back" style={styles.close} onPress={onBack}>
        <Text style={styles.closeText}>←</Text>
      </Pressable>
      <Text style={styles.title}>{title}</Text>
    </View>
  );
}

export function Item({on, onPress, children}: {on: boolean; onPress: () => void; children: React.ReactNode}) {
  return (
    <Pressable accessibilityRole="radio" accessibilityState={{checked: on}} style={[styles.item, on && styles.itemOn]} onPress={onPress}>
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
    <View style={styles.page}>
      <TopBar title="Choose edition" onBack={onClose} />
      <TextInput
        style={styles.search}
        value={query}
        onChangeText={setQuery}
        placeholder={`Search ${shown.length} editions`}
        placeholderTextColor={BLACK}
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="search"
      />
      <ScrollView keyboardShouldPersistTaps="handled">
        <Text style={styles.pickNote}>
          {`Pick the edition this file is. Page counts and progress follow it.${hidden ? ` ${hidden} edition${hidden > 1 ? 's' : ''} without a page count hidden.` : ''}`}
        </Text>
        {found.length === 0 ? <Text style={styles.pickNote}>No edition matches</Text> : null}
        {found.map(e => (
          <Item key={e.id} on={e.id === choice} onPress={() => setChoice(e.id)}>
            <Text style={styles.l1}>{edLine1(e)}</Text>
            <Text style={styles.l2}>{edLine2(e)}</Text>
            {e.isbn ? <Text style={styles.l2}>{`ISBN ${e.isbn}`}</Text> : null}
          </Item>
        ))}
      </ScrollView>
      <View style={styles.actions}>
        <Pressable accessibilityRole="button" style={styles.action} onPress={onClose}>
          <Text style={styles.actionText}>Cancel</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          style={styles.action}
          onPress={() => {
            onPick(choice);
            onClose();
          }}>
          <Text style={styles.actionText}>Use this edition</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: {flex: 1, backgroundColor: WHITE},
  topBar: shared.topBar,
  close: shared.close,
  closeText: shared.closeText,
  title: {fontSize: 20, color: BLACK, marginRight: 12},
  l1: {fontSize: 21, fontWeight: '700', color: BLACK},
  l2: {fontSize: 19, color: BLACK},
  actions: shared.actions,
  action: shared.action,
  actionText: shared.actionText,
  search: {fontSize: 21, color: BLACK, height: 60, marginHorizontal: 16, marginVertical: 10, paddingHorizontal: 14, borderWidth: 3, borderColor: BLACK},
  pickNote: {fontSize: 19, lineHeight: 25, paddingVertical: 14, paddingHorizontal: 24, borderBottomWidth: 2, borderColor: BLACK, color: BLACK},
  item: {flexDirection: 'row', alignItems: 'center', minHeight: 88, paddingVertical: 10, paddingHorizontal: 24, borderBottomWidth: 2, borderColor: BLACK, backgroundColor: WHITE},
  itemOn: {borderLeftWidth: 8, paddingLeft: 16},
  itemText: {flex: 1},
  radio: {width: 30, height: 30, marginRight: 18, borderWidth: 3, borderColor: BLACK, borderRadius: 15, alignItems: 'center', justifyContent: 'center'},
  radioDot: {width: 14, height: 14, borderRadius: 7, backgroundColor: BLACK},
});
