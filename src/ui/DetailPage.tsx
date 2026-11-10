import React, {useState} from 'react';
import {Image, Pressable, ScrollView, StyleSheet, Text, View} from 'react-native';
import EditionPicker, {Item, TopBar, edLine1, edLine2} from './EditionPicker';

// Book detail page, ported from the design artifact. Presentational only: no SDK imports, everything arrives as props,
// so it can be designed on the emulator with mock data and unit tested. E-ink rules: black on white, no animation,
// borders instead of greys, tap targets of at least 48 dp, text of at least 18 sp. The status list and the edition
// list are full-screen views inside this component (the Nomad ignores a smaller window for a plugin view).

export type Edition = {
  id: string;
  format: string;
  publisher: string;
  year?: number | null;
  pages: number;
  lang: string;
  isbn?: string;
  audio?: boolean;
};

export type BookDetail = {
  title: string;
  subtitle?: string | null;
  authors: string[];
  cover?: string | null;
  rating?: number | null; // 0-5
  ratingsCount?: number;
  reviewsCount?: number;
  inLibrary?: boolean; // false: not on the reader's shelves, so no status and no tracking, only an Add to library button
  status: string; // one of STATUSES
  progress: number; // reading position, 0-1 of the book; the page shown follows the chosen edition
  genres: string[];
  moods: string[];
  tags: string[];
  description?: string | null;
  editions: Edition[];
  editionId: string; // the chosen edition
  editionSaved: boolean; // false: our best guess, not confirmed by the reader
  editionIsbn?: boolean; // the file's own ISBN names this edition
};

export const STATUSES = ['Want to read', 'Currently reading', 'Paused', 'Did not finish', 'Finished'];

type Props = {
  book: BookDetail;
  tracking: boolean;
  syncNote?: string; // last sync or why tracking is not working, shown above the progress bar
  onToggleTracking: () => void;
  onClose: () => void;
  onWriteReview: () => void;
  onSetStatus: (status: string) => void;
  onSetEdition: (editionId: string) => void;
  onAddToLibrary?: () => void; // only used when book.inLibrary is false
};

const stars = (rating: number) => {
  const full = Math.round(rating);
  return '★'.repeat(full) + '☆'.repeat(5 - full);
};

const CHIP_GAP = 6;
const PILL_WIDTH = 52; // "+99" at 18 sp, border and padding included

// One labelled line of pills. All pills are measured once in a hidden layer; the line then shows as many as fit
// and ends with a "+x" pill for the rest. Before the measurement (and in tests) every pill is shown.
function Row({label, items}: {label: string; items: string[]}) {
  const [width, setWidth] = useState(0);
  const [sizes, setSizes] = useState<number[]>([]);
  if (!items.length) return null;

  let shown = items.length;
  if (width > 0 && sizes.filter(Boolean).length === items.length) {
    shown = 0;
    let used = 0;
    for (let i = 0; i < items.length; i++) {
      const rest = items.length - (i + 1);
      const need = used + sizes[i] + CHIP_GAP + (rest ? PILL_WIDTH : 0);
      if (need > width) break;
      used += sizes[i] + CHIP_GAP;
      shown = i + 1;
    }
  }
  const hidden = items.length - shown;

  return (
    <View style={styles.chipRow}>
      <Text style={styles.chipLabel}>{label}</Text>
      <View style={styles.chips} onLayout={e => setWidth(e.nativeEvent.layout.width)}>
        {items.slice(0, shown).map(item => (
          <View key={item} style={styles.chip}>
            <Text style={styles.chipText}>{item}</Text>
          </View>
        ))}
        {hidden ? (
          <View style={styles.chip}>
            <Text style={styles.chipText}>{`+${hidden}`}</Text>
          </View>
        ) : null}
        <View pointerEvents="none" style={styles.measure}>
          {items.map((item, i) => (
            <View
              key={item}
              style={styles.chip}
              onLayout={e => {
                const w = Math.ceil(e.nativeEvent.layout.width);
                setSizes(prev => {
                  if (prev[i] === w) return prev;
                  const next = prev.slice();
                  next[i] = w;
                  return next;
                });
              }}>
              <Text style={styles.chipText}>{item}</Text>
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

function Progress({page, total}: {page: number; total: number}) {
  const [inner, setInner] = useState(0);
  const percent = total ? Math.min(100, Math.round((page / total) * 100)) : 0;
  const text = `Page ${page} of ${total} · ${percent}%`;
  return (
    <View style={styles.bar} onLayout={e => setInner(e.nativeEvent.layout.width - 6)}>
      <Text style={styles.barText}>{text}</Text>
      <View style={[styles.fill, {width: `${percent}%`}]}>
        <Text style={[styles.barText, styles.barTextOn, {width: inner}]} numberOfLines={1}>
          {text}
        </Text>
      </View>
    </View>
  );
}

export default function DetailPage({book, tracking, syncNote, onToggleTracking, onClose, onWriteReview, onSetStatus, onSetEdition, onAddToLibrary}: Props) {
  const inLibrary = book.inLibrary !== false;
  const [view, setView] = useState<'detail' | 'status' | 'editions'>('detail');
  const [aboutOpen, setAboutOpen] = useState(false);
  const [aboutLong, setAboutLong] = useState(false);

  const ed = book.editions.find(e => e.id === book.editionId) ?? book.editions[0];

  if (view === 'status') {
    return (
      <View style={styles.page}>
        <TopBar title="Reading status" onBack={() => setView('detail')} />
        <ScrollView>
          {STATUSES.map(s => (
            <Item
              key={s}
              on={s === book.status}
              onPress={() => {
                onSetStatus(s);
                setView('detail');
              }}>
              <Text style={styles.l1}>{s}</Text>
            </Item>
          ))}
        </ScrollView>
      </View>
    );
  }

  if (view === 'editions') {
    return <EditionPicker editions={book.editions} editionId={book.editionId} onPick={onSetEdition} onClose={() => setView('detail')} />;
  }

  const page = book.status === 'Finished' ? ed.pages : Math.min(ed.pages, Math.max(1, Math.round(book.progress * ed.pages)));
  return (
    <View style={styles.page}>
      <View style={styles.topBar}>
        <Pressable accessibilityRole="button" accessibilityLabel="Close" style={styles.close} onPress={onClose}>
          <Text style={styles.closeText}>✕</Text>
        </Pressable>
        {inLibrary ? (
          <View style={styles.trackingBox}>
            <Text style={styles.trackingLabel}>Tracking is</Text>
            <Pressable
              accessibilityRole="switch"
              accessibilityState={{checked: tracking}}
              accessibilityLabel="Hardcover tracking"
              style={[styles.toggle, tracking && styles.toggleOn]}
              onPress={onToggleTracking}>
              <Text style={[styles.toggleText, tracking && styles.toggleTextOn]}>{tracking ? 'ON' : 'OFF'}</Text>
            </Pressable>
          </View>
        ) : null}
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {syncNote ? <Text style={styles.syncNote}>{syncNote}</Text> : null}
        <View style={styles.progress}>
          <Progress page={page} total={ed.pages} />
        </View>

        <View style={styles.header}>
          {book.cover ? (
            <Image source={{uri: book.cover}} style={styles.cover} resizeMode="contain" />
          ) : (
            <View style={[styles.cover, styles.noCover]}>
              <Text style={styles.noCoverText}>{book.title}</Text>
            </View>
          )}
          <View style={styles.info}>
            <Text style={styles.title}>{book.title}</Text>
            {book.subtitle ? <Text style={styles.subtitle}>{book.subtitle}</Text> : null}
            <Text style={styles.author}>{book.authors.join(', ')}</Text>
            {book.rating ? (
              <Text style={styles.meta}>
                {stars(book.rating)} {book.rating.toFixed(1)}
                {book.ratingsCount ? `  (${book.ratingsCount} ratings${book.reviewsCount ? `, ${book.reviewsCount} reviews` : ''})` : ''}
              </Text>
            ) : null}
            <View style={styles.tagBox}>
              <Row label="Genre" items={book.genres} />
              <Row label="Mood" items={book.moods} />
              <Row label="Tags" items={book.tags} />
            </View>
          </View>
        </View>

        <Pressable accessibilityRole="button" accessibilityLabel="Change edition" style={styles.edRow} onPress={() => setView('editions')}>
          <View style={styles.edText}>
            <Text style={styles.l0}>Edition of this file</Text>
            <Text style={styles.l1}>{edLine1(ed)}</Text>
            <Text style={styles.l2}>{edLine2(ed)}</Text>
            <Text style={[styles.l2, styles.bold]}>{book.editionSaved ? '✓ Saved for this file' : book.editionIsbn ? "✓ Matches the file's ISBN" : 'Not confirmed yet'}</Text>
          </View>
          <Text style={styles.go}>Change ›</Text>
        </Pressable>

        {book.description ? (
          <View>
            <Text style={styles.label}>About</Text>
            <Text
              style={styles.description}
              numberOfLines={aboutOpen ? undefined : 5}
              onTextLayout={e => setAboutLong(e.nativeEvent.lines.length > 5)}>
              {book.description.trim()}
            </Text>
            {aboutLong || aboutOpen ? (
              <Pressable accessibilityRole="button" style={styles.more} onPress={() => setAboutOpen(o => !o)}>
                <Text style={styles.moreText}>{aboutOpen ? 'Show less' : 'Show more'}</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}
      </ScrollView>

      <View style={styles.actions}>
        {inLibrary ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Change reading status" style={styles.action} onPress={() => setView('status')}>
            <Text style={styles.actionText}>{`${book.status} ▾`}</Text>
          </Pressable>
        ) : (
          <Pressable accessibilityRole="button" accessibilityLabel="Add to library" style={styles.action} onPress={onAddToLibrary}>
            <Text style={styles.actionText}>Add to library</Text>
          </Pressable>
        )}
        <Pressable accessibilityRole="button" style={styles.action} onPress={onWriteReview}>
          <Text style={styles.actionText}>Write review</Text>
        </Pressable>
      </View>
    </View>
  );
}

const BLACK = '#000000';
const WHITE = '#ffffff';

const styles = StyleSheet.create({
  page: {flex: 1, backgroundColor: WHITE},
  topBar: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingLeft: 20, paddingRight: 64, height: 68, borderBottomWidth: 2, borderColor: BLACK}, // right gap: the host's floating home button sits there
  close: {width: 56, height: 56, alignItems: 'center', justifyContent: 'center'},
  closeText: {fontSize: 28, color: BLACK},
  trackingBox: {flexDirection: 'row', alignItems: 'center'},
  trackingLabel: {fontSize: 20, color: BLACK, marginRight: 12},
  toggle: {width: 92, height: 48, borderWidth: 3, borderColor: BLACK, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: WHITE},
  toggleOn: {backgroundColor: BLACK},
  toggleText: {fontSize: 20, fontWeight: '700', color: BLACK},
  toggleTextOn: {color: WHITE},
  content: {padding: 24, paddingBottom: 16},
  syncNote: {fontSize: 18, color: BLACK, marginBottom: 8},
  progress: {marginBottom: 20},
  bar: {height: 40, borderWidth: 3, borderColor: BLACK, justifyContent: 'center'},
  barText: {fontSize: 20, fontWeight: '500', color: BLACK, paddingLeft: 12},
  barTextOn: {position: 'absolute', left: 0, color: WHITE},
  fill: {position: 'absolute', top: 0, bottom: 0, left: 0, overflow: 'hidden', backgroundColor: BLACK, justifyContent: 'center'},
  header: {flexDirection: 'row'},
  cover: {width: 190, height: 285, marginRight: 22, borderWidth: 2, borderColor: BLACK},
  noCover: {alignItems: 'center', justifyContent: 'center', padding: 12},
  noCoverText: {fontSize: 22, textAlign: 'center', color: BLACK},
  info: {flex: 1},
  title: {fontSize: 30, fontWeight: '700', lineHeight: 34, color: BLACK},
  subtitle: {fontSize: 20, color: BLACK},
  author: {fontSize: 22, color: BLACK, marginTop: 6},
  meta: {fontSize: 19, color: BLACK, marginTop: 4},
  tagBox: {marginTop: 4},
  chipRow: {flexDirection: 'row', alignItems: 'center', marginTop: 6},
  chipLabel: {width: 84, fontSize: 18, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', color: BLACK},
  chips: {flex: 1, flexDirection: 'row', overflow: 'hidden'},
  chip: {borderWidth: 1.5, borderColor: BLACK, borderRadius: 14, paddingHorizontal: 9, marginRight: CHIP_GAP, height: 26, justifyContent: 'center'},
  chipText: {fontSize: 18, color: BLACK, includeFontPadding: false},
  measure: {position: 'absolute', left: 0, top: 0, opacity: 0, flexDirection: 'row'},
  edRow: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 14, paddingVertical: 10, paddingHorizontal: 16, borderWidth: 2, borderColor: BLACK},
  edText: {flex: 1},
  l0: {fontSize: 17, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', color: BLACK},
  l1: {fontSize: 21, fontWeight: '700', color: BLACK},
  l2: {fontSize: 19, color: BLACK},
  bold: {fontWeight: '700'},
  go: {fontSize: 20, fontWeight: '700', color: BLACK, marginLeft: 14},
  label: {fontSize: 18, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', color: BLACK, marginTop: 14, marginBottom: 6},
  description: {fontSize: 21, lineHeight: 30, color: BLACK},
  more: {height: 56, alignSelf: 'flex-start', marginTop: 8, paddingHorizontal: 24, borderWidth: 2, borderColor: BLACK, justifyContent: 'center'},
  moreText: {fontSize: 20, fontWeight: '700', color: BLACK},
  actions: {flexDirection: 'row', paddingVertical: 16, paddingLeft: 16, paddingRight: 2, borderTopWidth: 2, borderColor: BLACK},
  action: {flex: 1, height: 68, borderWidth: 3, borderColor: BLACK, alignItems: 'center', justifyContent: 'center', marginRight: 14},
  actionText: {fontSize: 24, fontWeight: '700', color: BLACK},
});
