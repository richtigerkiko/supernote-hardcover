import React, {useEffect, useState} from 'react';
import type {Review} from '../hardcover'; // type only: this file stays SDK-free at runtime
import {Image, Pressable, ScrollView, StyleSheet, Text, View} from 'react-native';
import EditionPicker, {Item, TopBar} from './EditionPicker';

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
  onLoadReviews?: (offset: number) => Promise<{reviews: Review[]; hasMore: boolean}>; // 10 at a time, first call on first open of the Reviews tab
};

const stars = (rating: number) => {
  const full = Math.round(rating);
  return '★'.repeat(full) + '☆'.repeat(5 - full);
};

// Half stars: 4.5 -> ★★★★½☆
const halfStars = (rating: number) => '★'.repeat(Math.floor(rating)) + (rating % 1 >= 0.5 ? '½' : '') + '☆'.repeat(5 - Math.ceil(rating - 0.25));

const join =(parts: (string | number | null | undefined)[]) => parts.filter(Boolean).join(' · ');

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

function Pill({text}: {text: string}) {
  return (
    <View style={styles.pill}>
      <Text style={styles.pillText}>{text}</Text>
    </View>
  );
}

// Name, Supporter pill and stars on line one; date and spoiler pill on line two (shared by the list and the full view).
function ReviewHead({r}: {r: Review}) {
  return (
    <>
      <View style={styles.rvLine}>
        <Text style={styles.rvName} numberOfLines={1}>
          {r.user}
        </Text>
        {r.supporter ? <Pill text="Supporter" /> : null}
        {r.rating ? <Text style={styles.rvStars}>{halfStars(r.rating)}</Text> : null}
      </View>
      <View style={styles.rvLine}>
        <Text style={styles.rvDate}>{r.date}</Text>
        {r.spoiler ? <Pill text="Contains spoilers" /> : null}
      </View>
    </>
  );
}

function ReviewEntry({r, onMore}: {r: Review; onMore: () => void}) {
  const [long, setLong] = useState(false);
  return (
    <View style={styles.rv}>
      <ReviewHead r={r} />
      {r.spoiler ? null : (
        <Text style={styles.rvText} numberOfLines={2} onTextLayout={e => setLong(e.nativeEvent.lines.length > 2)}>
          {r.text}
        </Text>
      )}
      {r.spoiler || long ? (
        <Pressable accessibilityRole="button" accessibilityLabel={`More of ${r.user}'s review`} style={styles.more} onPress={onMore}>
          <Text style={styles.moreText}>More</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

type Reviews = {items: Review[]; hasMore: boolean; loaded: boolean; state: 'idle' | 'loading' | 'error'};
const NO_REVIEWS: Reviews = {items: [], hasMore: false, loaded: false, state: 'idle'};

export default function DetailPage({book, tracking, syncNote, onToggleTracking, onClose, onWriteReview, onSetStatus, onSetEdition, onAddToLibrary, onLoadReviews}: Props) {
  const inLibrary = book.inLibrary !== false;
  const [view, setView] = useState<'detail' | 'status' | 'editions' | 'cover'>('detail');
  const [aboutOpen, setAboutOpen] = useState(false);
  const [aboutLong, setAboutLong] = useState(false);
  const [tab, setTab] = useState<'about' | 'reviews'>('about');
  const [rv, setRv] = useState<Reviews>(NO_REVIEWS);
  const [openReview, setOpenReview] = useState<Review | null>(null);

  useEffect(() => {
    setTab('about'); // another book was loaded
    setRv(NO_REVIEWS);
    setOpenReview(null);
  }, [book.title]);

  const loadReviews = () => {
    if (!onLoadReviews || rv.state === 'loading') return;
    setRv(r => ({...r, state: 'loading'}));
    onLoadReviews(rv.items.length).then(
      p => setRv(r => ({items: [...r.items, ...p.reviews], hasMore: p.hasMore, loaded: true, state: 'idle'})),
      () => setRv(r => ({...r, state: 'error'})),
    );
  };
  const showReviews = () => {
    setTab('reviews');
    if (!rv.loaded && rv.state === 'idle') loadReviews();
  };

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
        <Image accessibilityLabel="Hardcover" source={require('../../assets/logo.png')} style={styles.logo} />
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
            <Pressable accessibilityRole="button" accessibilityLabel="Show cover full size" onPress={() => setView('cover')}>
              <Image source={{uri: book.cover}} style={styles.cover} resizeMode="contain" />
            </Pressable>
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
                {book.ratingsCount ? `  (${book.ratingsCount} ratings)` : ''}
              </Text>
            ) : null}
            <View style={styles.tagBox}>
              <Row label="Genre" items={book.genres} />
              <Row label="Mood" items={book.moods} />
              <Row label="Tags" items={book.tags} />
            </View>
            <View style={styles.chipRow}>
              <Text style={styles.chipLabel}>Edition</Text>
              <View style={styles.edBox}>
                <View style={styles.edText}>
                  <Text style={styles.edName} numberOfLines={1} ellipsizeMode="tail">
                    {join([ed.format, ed.publisher])}
                  </Text>
                  <Text style={styles.edMeta} numberOfLines={1} ellipsizeMode="tail">
                    {join([ed.isbn, ed.lang, ed.year])}
                  </Text>
                </View>
                <Pressable accessibilityRole="button" accessibilityLabel="Change edition" style={styles.edPencil} onPress={() => setView('editions')}>
                  <View style={styles.pencil}>
                    <View style={styles.pencilTip} />
                  </View>
                </Pressable>
              </View>
            </View>
          </View>
        </View>

        <View style={styles.tabs}>
          <Pressable accessibilityRole="tab" accessibilityLabel="About tab" accessibilityState={{selected: tab === 'about'}} style={[styles.tab, tab === 'about' && styles.tabOn]} onPress={() => setTab('about')}>
            <Text style={[styles.tabText, tab === 'about' && styles.tabTextOn]}>About</Text>
          </Pressable>
          <Pressable accessibilityRole="tab" accessibilityLabel="Reviews tab" accessibilityState={{selected: tab === 'reviews'}} style={[styles.tab, tab === 'reviews' && styles.tabOn]} onPress={showReviews}>
            <Text style={[styles.tabText, tab === 'reviews' && styles.tabTextOn]}>Reviews</Text>
          </Pressable>
        </View>

        {tab === 'reviews' ? (
          <View>
            {rv.items.map(r => (
              <ReviewEntry key={r.id} r={r} onMore={() => setOpenReview(r)} />
            ))}
            {rv.state === 'loading' ? <Text style={styles.status}>{rv.items.length ? 'Loading more…' : 'Loading reviews…'}</Text> : null}
            {rv.state === 'error' ? (
              <>
                <Text style={styles.status}>Could not load reviews.</Text>
                <Pressable accessibilityRole="button" style={styles.more} onPress={loadReviews}>
                  <Text style={styles.moreText}>Retry</Text>
                </Pressable>
              </>
            ) : null}
            {rv.loaded && !rv.items.length && rv.state === 'idle' ? <Text style={styles.status}>No reviews yet.</Text> : null}
            {rv.hasMore && rv.state === 'idle' ? (
              <Pressable accessibilityRole="button" style={styles.more} onPress={loadReviews}>
                <Text style={styles.moreText}>Load more</Text>
              </Pressable>
            ) : null}
          </View>
        ) : book.description ? (
          <View>
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

      {openReview ? (
        // overlay like the cover: the list underneath stays mounted, so Back to reviews lands on the same position
        <View style={styles.coverFull}>
          <TopBar title="Review" onBack={() => setOpenReview(null)} />
          <ScrollView contentContainerStyle={styles.content}>
            <Text style={styles.rvBook}>{join([book.title, book.authors.join(', ')])}</Text>
            <ReviewHead r={openReview} />
            <Text style={[styles.description, styles.rvFull]}>{openReview.text}</Text>
          </ScrollView>
          <View style={styles.actions}>
            <Pressable accessibilityRole="button" accessibilityLabel="Back to reviews" style={styles.action} onPress={() => setOpenReview(null)}>
              <Text style={styles.actionText}>Back to reviews</Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      {view === 'cover' && book.cover ? (
        // overlay, not a sub-view: the page underneath stays mounted, so its scroll position survives
        <Pressable accessibilityLabel="Cover full size" style={styles.coverFull} onPress={() => setView('detail')}>
          <View style={styles.topBar}>
            <Pressable accessibilityRole="button" accessibilityLabel="Close cover" style={styles.close} onPress={() => setView('detail')}>
              <Text style={styles.closeText}>✕</Text>
            </Pressable>
          </View>
          <Image source={{uri: book.cover}} style={styles.coverFullImg} resizeMode="contain" />
        </Pressable>
      ) : null}
    </View>
  );
}

const BLACK = '#000000';
const WHITE = '#ffffff';

const styles = StyleSheet.create({
  page: {flex: 1, backgroundColor: WHITE},
  topBar: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingLeft: 20, paddingRight: 64, height: 68, borderBottomWidth: 2, borderColor: BLACK}, // right gap: the host's floating home button sits there
  close: {width: 56, height: 56, alignItems: 'center', justifyContent: 'center'},
  logo: {width: 120, height: 26, resizeMode: 'contain', marginLeft: 4, marginRight: 'auto', marginTop: 6},
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
  coverFull: {...StyleSheet.absoluteFillObject, backgroundColor: WHITE},
  coverFullImg: {flex: 1, margin: 16},
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
  edBox: {flex: 1, flexDirection: 'row', minHeight: 48, borderWidth: 1.5, borderColor: BLACK, borderRadius: 14, paddingLeft: 10},
  edText: {flex: 1, justifyContent: 'center', paddingVertical: 4},
  edName: {fontSize: 18, fontWeight: '700', color: BLACK, includeFontPadding: false},
  edMeta: {fontSize: 18, color: BLACK, includeFontPadding: false},
  edPencil: {width: 48, alignSelf: 'stretch', alignItems: 'center', paddingTop: 8}, // full box height, no border
  pencil: {width: 8, height: 22, borderWidth: 2, borderColor: BLACK, transform: [{rotate: '45deg'}], marginTop: 2}, // drawn with Views: a text glyph may be missing from the Nomad's font
  pencilTip: {position: 'absolute', bottom: -8, left: -2, width: 0, height: 0, borderLeftWidth: 4, borderRightWidth: 4, borderTopWidth: 7, borderLeftColor: 'transparent', borderRightColor: 'transparent', borderTopColor: BLACK},
  l0: {fontSize: 17, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', color: BLACK},
  l1: {fontSize: 21, fontWeight: '700', color: BLACK},
  l2: {fontSize: 19, color: BLACK},
  bold: {fontWeight: '700'},
  go: {fontSize: 20, fontWeight: '700', color: BLACK, marginLeft: 14},
  label: {fontSize: 18, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', color: BLACK, marginTop: 14, marginBottom: 6},
  description: {fontSize: 21, lineHeight: 30, color: BLACK},
  more: {height: 56, alignSelf: 'flex-start', marginTop: 8, paddingHorizontal: 24, borderWidth: 2, borderColor: BLACK, justifyContent: 'center'},
  moreText: {fontSize: 20, fontWeight: '700', color: BLACK},
  tabs: {flexDirection: 'row', marginTop: 20, marginBottom: 8},
  tab: {flex: 1, height: 56, borderWidth: 2, borderColor: BLACK, alignItems: 'center', justifyContent: 'center'},
  tabOn: {backgroundColor: BLACK},
  tabText: {fontSize: 22, fontWeight: '700', color: BLACK},
  tabTextOn: {color: WHITE},
  status: {fontSize: 21, color: BLACK, marginTop: 14},
  rv: {paddingVertical: 12, borderBottomWidth: 1.5, borderColor: BLACK},
  rvLine: {flexDirection: 'row', alignItems: 'center', marginTop: 2},
  rvName: {fontSize: 21, fontWeight: '700', color: BLACK, flexShrink: 1, marginRight: 10},
  rvStars: {fontSize: 21, color: BLACK, marginLeft: 6},
  rvDate: {fontSize: 18, color: BLACK, marginRight: 10},
  rvText: {fontSize: 21, lineHeight: 30, color: BLACK, marginTop: 4},
  rvBook: {fontSize: 18, color: BLACK, marginBottom: 6},
  rvFull: {marginTop: 12},
  pill: {borderWidth: 1.5, borderColor: BLACK, borderRadius: 14, paddingHorizontal: 9, height: 26, justifyContent: 'center', marginRight: 6},
  pillText: {fontSize: 18, color: BLACK, includeFontPadding: false},
  actions: {flexDirection: 'row', paddingVertical: 16, paddingLeft: 16, paddingRight: 2, borderTopWidth: 2, borderColor: BLACK},
  action: {flex: 1, height: 68, borderWidth: 3, borderColor: BLACK, alignItems: 'center', justifyContent: 'center', marginRight: 14},
  actionText: {fontSize: 24, fontWeight: '700', color: BLACK},
});
