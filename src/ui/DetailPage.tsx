import React, {useEffect, useState} from 'react';
import {STATUSES, type BookDetail, type JournalItem, type Privacy, type PublicReview} from '../core/types';
import {splitEntry} from '../core/journal';
import {Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View} from 'react-native';
import EditionPicker, {Item} from './EditionPicker';
import {BLACK, Button, Chevron, Link, Options, Pill, SERIF, Tabs, TopBar, WHITE, shared} from './theme';
import {PRIVACY, privacyName} from './JournalPage';

// Book detail page, ported from the "Quiet page" boards of the design artifact. Presentational only: no SDK imports,
// everything arrives as props, so it can be designed on the emulator with mock data and unit tested. E-ink rules
// (theme.tsx): black on white, no animation, hairlines instead of boxes, tap targets of at least 48 dp, text of at least
// 18 sp. The status list, the edition list, one review and the journal entry editor are full-screen views inside this
// component (the Nomad, the only measured device, ignores a smaller window for a plugin view).

type Props = {
  book: BookDetail;
  tracking: boolean;
  syncNote?: string; // why tracking or a change is not working, shown under the progress line
  onToggleTracking: () => void;
  onClose: () => void;
  onWriteReview: () => void;
  onSetStatus: (status: string) => void;
  onSetEdition: (editionId: string) => void;
  onAddToLibrary?: () => void; // only used when book.inLibrary is false
  onLoadReviews?: (offset: number) => Promise<{reviews: PublicReview[]; hasMore: boolean}>; // 10 at a time, first call on first open of the Reviews tab
  onLoadJournal?: (offset: number) => Promise<{entries: JournalItem[]; hasMore: boolean}>; // 100 at a time, first call on first open of the Journal tab
  onEditJournal?: (item: JournalItem, text: string, privacy: Privacy) => Promise<string>; // resolves with the whole new entry text
  onRemoveJournal?: (id: number) => Promise<void>;
};

const stars = (rating: number) => {
  const full = Math.round(rating);
  return '★'.repeat(full) + '☆'.repeat(5 - full);
};

// Half stars: 4.5 -> ★★★★½☆
const halfStars = (rating: number) => '★'.repeat(Math.floor(rating)) + (rating % 1 >= 0.5 ? '½' : '') + '☆'.repeat(5 - Math.ceil(rating - 0.25));

const join = (parts: (string | number | null | undefined)[]) => parts.filter(Boolean).join(' · ');

const CHIP_GAP = 8;
const PILL_WIDTH = 60; // "+99" at 18 sp with the pill's padding

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
      <Text style={[shared.label, styles.chipLabel]}>{label}</Text>
      <View style={styles.chips} onLayout={e => setWidth(e.nativeEvent.layout.width)}>
        {items.slice(0, shown).map(item => (
          <Pill key={item} text={item} />
        ))}
        {hidden ? <Pill text={`+${hidden}`} /> : null}
        <View pointerEvents="none" style={styles.measure}>
          {items.map((item, i) => (
            <View
              key={item}
              onLayout={e => {
                const w = Math.ceil(e.nativeEvent.layout.width);
                setSizes(prev => {
                  if (prev[i] === w) return prev;
                  const next = prev.slice();
                  next[i] = w;
                  return next;
                });
              }}>
              <Pill text={item} />
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

function Progress({page, total}: {page: number; total: number}) {
  const percent = total ? Math.min(100, Math.round((page / total) * 100)) : 0;
  return (
    <View accessibilityRole="progressbar" accessibilityLabel="Reading progress" accessibilityValue={{min: 0, max: 100, now: percent}}>
      <View style={styles.progressLine}>
        <Text style={shared.text}>
          {'Page '}
          <Text style={shared.bold}>{String(page)}</Text>
          {` of ${total}`}
        </Text>
        <Text style={[shared.text, shared.bold]}>{`${percent}%`}</Text>
      </View>
      <View style={styles.bar}>
        <View style={[styles.fill, {width: `${percent}%`}]} />
      </View>
    </View>
  );
}

// Name, stars and date on one line, then the badges: an italic line in the list, grey pills on the full view.
function ReviewHead({r, full}: {r: PublicReview; full?: boolean}) {
  const badges = [r.supporter ? 'Supporter' : '', r.spoiler ? 'Contains spoilers' : ''].filter(Boolean);
  return (
    <>
      <View style={styles.rvLine}>
        <Text style={[styles.rvName, full && {fontSize: 24}]} numberOfLines={1}>
          {r.user}
        </Text>
        {r.rating ? <Text style={[styles.rvStars, full && {fontSize: 21}]}>{halfStars(r.rating)}</Text> : null}
        <Text style={styles.rvDate}>{r.date}</Text>
      </View>
      {!badges.length ? null : full ? (
        <View style={styles.badges}>
          {badges.map(b => (
            <Pill key={b} text={b} />
          ))}
        </View>
      ) : (
        <Text style={styles.rvBadges}>{badges.join(' · ')}</Text>
      )}
    </>
  );
}

function ReviewEntry({r, onMore}: {r: PublicReview; onMore: () => void}) {
  const [long, setLong] = useState(false);
  return (
    <View style={styles.rv}>
      <ReviewHead r={r} />
      {r.spoiler ? null : (
        <Text style={[shared.serif, styles.rvText]} numberOfLines={2} onTextLayout={e => setLong(e.nativeEvent.lines.length > 2)}>
          {r.text}
        </Text>
      )}
      {r.spoiler || long ? <Link label="More" accessibilityLabel={`More of ${r.user}'s review`} onPress={onMore} /> : null}
    </View>
  );
}

type Reviews = {items: PublicReview[]; hasMore: boolean; loaded: boolean; state: 'idle' | 'loading' | 'error'};
const NO_REVIEWS: Reviews = {items: [], hasMore: false, loaded: false, state: 'idle'};

// One note or quote, each part clamped to 3 lines (Edit shows all of it), with Edit (opens the full-screen editor) and Remove (the "cannot be undone" confirmation is inline, so the list stays where it is).
function JournalRow({item, onEdit, onRemove}: {item: JournalItem; onEdit: () => void; onRemove: () => Promise<void>}) {
  const {passage, thoughts} = splitEntry(item.event, item.entry);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const remove = async () => {
    setBusy(true);
    setError('');
    try {
      await onRemove();
    } catch (e: any) {
      setError(e?.message || 'Could not remove.');
      setBusy(false);
    }
  };
  return (
    <View style={[styles.rv, {paddingTop: 16}]}>
      <View style={styles.jMeta}>
        <Pill text={item.event === 'quote' ? 'Quote' : 'Note'} />
        {item.page ? <Text style={styles.small}>{`p. ${item.page}`}</Text> : null}
        <Text style={styles.small}>{item.date}</Text>
        <Text style={[styles.small, styles.right]}>{privacyName(item.privacy)}</Text>
      </View>
      {passage ? <Text style={[shared.quote, {marginTop: 12}]} numberOfLines={3}>{passage}</Text> : null}
      {thoughts ? <Text style={[shared.text, {marginTop: 10}]} numberOfLines={3}>{thoughts}</Text> : null}
      {confirm ? (
        <View style={styles.confirm}>
          <Text style={[shared.text, shared.bold]}>Remove this entry from Hardcover? This cannot be undone.</Text>
          {error ? <Text style={[shared.text, shared.bold]}>{error}</Text> : null}
          <View style={styles.confirmButtons}>
            <Button small solid disabled={busy} label={busy ? 'Removing…' : error ? 'Retry' : 'Yes, remove'} onPress={remove} />
            <Button small disabled={busy} label="Keep" onPress={() => (setError(''), setConfirm(false))} />
          </View>
        </View>
      ) : (
        <View style={styles.links}>
          <Link label="Edit" onPress={onEdit} />
          <Link label="Remove" onPress={() => setConfirm(true)} />
        </View>
      )}
    </View>
  );
}

// Full-screen editor of one entry: the thoughts of a quote (its passage is never edited) or the text of a note, plus privacy.
function JournalEdit({item, book, onSave, onClose}: {item: JournalItem; book: BookDetail; onSave: (text: string, privacy: Privacy) => Promise<void>; onClose: () => void}) {
  const {passage, thoughts} = splitEntry(item.event, item.entry);
  const quote = item.event === 'quote';
  const [text, setText] = useState(thoughts);
  const [privacy, setPrivacy] = useState<Privacy>(item.privacy);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const save = async () => {
    setBusy(true);
    setError('');
    try {
      await onSave(text.trim(), privacy);
    } catch (e: any) {
      setError(e?.message || 'Could not save.');
      setBusy(false);
    }
  };
  return (
    <View style={shared.overlay}>
      <TopBar title={quote ? 'Edit quote' : 'Edit note'} onPress={onClose} />
      <ScrollView style={styles.flex} keyboardShouldPersistTaps="handled" contentContainerStyle={[shared.body, styles.editBody]}>
        {passage ? (
          <View>
            <Text style={[shared.quote, styles.bigQuote]}>{passage}</Text>
            <Text style={styles.source}>{`— ${join([book.title, book.authors.join(', '), item.page ? `p. ${item.page}` : ''])}`}</Text>
          </View>
        ) : null}
        <View>
          <Text style={shared.label}>{quote ? 'Your thoughts' : 'Note'}</Text>
          <TextInput
            style={[shared.input, styles.editInput]}
            multiline
            textAlignVertical="top"
            editable={!busy}
            accessibilityLabel={quote ? 'Your thoughts' : 'Note text'}
            placeholder={quote ? 'Add your thoughts (optional)…' : 'Write a note…'}
            placeholderTextColor={BLACK}
            value={text}
            onChangeText={setText}
          />
        </View>
        <View>
          <Text style={shared.label}>Privacy</Text>
          <Options options={PRIVACY} value={privacy} onPick={setPrivacy} disabled={busy} />
        </View>
        {error ? <Text style={[shared.text, shared.bold]}>{error}</Text> : null}
      </ScrollView>
      <View style={shared.actions}>
        <Button label="Cancel" disabled={busy} onPress={onClose} />
        <Button solid label={busy ? 'Saving…' : error ? 'Retry' : 'Save'} disabled={busy || (!quote && !text.trim())} onPress={save} />
      </View>
    </View>
  );
}

type Journal = {items: JournalItem[]; hasMore: boolean; loaded: boolean; state: 'idle' | 'loading' | 'error'};
const NO_JOURNAL: Journal = {items: [], hasMore: false, loaded: false, state: 'idle'};

export default function DetailPage({book, tracking, syncNote, onToggleTracking, onClose, onWriteReview, onSetStatus, onSetEdition, onAddToLibrary, onLoadReviews, onLoadJournal, onEditJournal, onRemoveJournal}: Props) {
  const inLibrary = book.inLibrary !== false;
  const [view, setView] = useState<'detail' | 'status' | 'editions' | 'cover'>('detail');
  const [aboutOpen, setAboutOpen] = useState(false);
  const [aboutLong, setAboutLong] = useState(false);
  const [tab, setTab] = useState<'about' | 'reviews' | 'journal'>('about');
  const [rv, setRv] = useState<Reviews>(NO_REVIEWS);
  const [openReview, setOpenReview] = useState<PublicReview | null>(null);
  const [jn, setJn] = useState<Journal>(NO_JOURNAL);
  const [editing, setEditing] = useState<JournalItem | null>(null);

  useEffect(() => {
    setTab('about'); // another book was loaded
    setRv(NO_REVIEWS);
    setJn(NO_JOURNAL);
    setOpenReview(null);
    setEditing(null);
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

  const loadJournal = () => {
    if (!onLoadJournal || jn.state === 'loading') return;
    setJn(j => ({...j, state: 'loading'}));
    onLoadJournal(jn.items.length).then( // removals delete on the server too, so the next page starts at what is left
      p => setJn(j => ({items: [...j.items, ...p.entries], hasMore: p.hasMore, loaded: true, state: 'idle'})),
      () => setJn(j => ({...j, state: 'error'})),
    );
  };
  const showJournal = () => {
    setTab('journal');
    if (!jn.loaded && jn.state === 'idle') loadJournal();
  };
  const ed = book.editions.find(e => e.id === book.editionId) ?? book.editions[0];

  if (view === 'status') {
    return (
      <View style={shared.page}>
        <TopBar title="Reading status" onPress={() => setView('detail')} />
        <ScrollView contentContainerStyle={styles.statusList}>
          {STATUSES.map(s => (
            <Item
              key={s}
              on={s === book.status}
              onPress={() => {
                onSetStatus(s);
                setView('detail');
              }}>
              <Text style={[styles.statusText, s === book.status && shared.bold]}>{s}</Text>
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
  const edMeta = join([ed.isbn, ed.lang, ed.year]);
  return (
    <View style={shared.page}>
      <TopBar icon="close" onPress={onClose}>
        <Image accessibilityLabel="Hardcover" source={require('../../assets/logo.png')} style={styles.logo} />
        {inLibrary ? (
          <Pressable accessibilityRole="switch" accessibilityState={{checked: tracking}} accessibilityLabel="Hardcover tracking" style={styles.tracking} onPress={onToggleTracking}>
            <Text style={shared.text}>{tracking ? 'Tracking on' : 'Tracking off'}</Text>
            <View style={[styles.track, tracking && styles.trackOn]}>
              <View style={[styles.knob, tracking && styles.knobOn]} />
            </View>
          </Pressable>
        ) : null}
      </TopBar>

      <ScrollView style={styles.flex} contentContainerStyle={styles.content}>
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
                {stars(book.rating)}
                {'  '}
                {join([book.rating.toFixed(1), book.ratingsCount ? `${book.ratingsCount} ratings` : ''])}
              </Text>
            ) : null}
            <Pressable accessibilityRole="button" accessibilityLabel="Change edition" style={styles.edRow} onPress={() => setView('editions')}>
              <View style={styles.flex}>
                <Text style={styles.edName} numberOfLines={1} ellipsizeMode="tail">
                  {join([ed.format, ed.publisher])}
                </Text>
                {edMeta ? (
                  <Text style={styles.edMeta} numberOfLines={1} ellipsizeMode="tail">
                    {edMeta}
                  </Text>
                ) : null}
              </View>
              <Text style={styles.change}>Change</Text>
              <Chevron dir="right" />
            </Pressable>
            <View style={styles.progress}>
              <Progress page={page} total={ed.pages} />
              {syncNote ? <Text style={styles.problem}>{syncNote}</Text> : null}
            </View>
          </View>
        </View>

        <View style={styles.tabs}>
          <Tabs
            options={[
              ['about', 'Book info'],
              ['reviews', 'Reviews'],
              ['journal', 'Journal'],
            ]}
            value={tab}
            onPick={t => (t === 'reviews' ? showReviews() : t === 'journal' ? showJournal() : setTab('about'))}
          />
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
                <Link label="Retry" onPress={loadReviews} />
              </>
            ) : null}
            {rv.loaded && !rv.items.length && rv.state === 'idle' ? <Text style={styles.status}>No reviews yet.</Text> : null}
            {rv.hasMore && rv.state === 'idle' ? <Link label="Load more" onPress={loadReviews} /> : null}
          </View>
        ) : tab === 'journal' ? (
          <View>
            {jn.items.map(j => (
              <JournalRow
                key={j.id}
                item={j}
                onEdit={() => setEditing(j)}
                onRemove={async () => {
                  await onRemoveJournal!(j.id);
                  setJn(x => ({...x, items: x.items.filter(i => i.id !== j.id)}));
                }}
              />
            ))}
            {jn.state === 'loading' ? <Text style={styles.status}>{jn.items.length ? 'Loading more…' : 'Loading journal…'}</Text> : null}
            {jn.state === 'error' ? (
              <>
                <Text style={styles.status}>Could not load the journal.</Text>
                <Link label="Retry" onPress={loadJournal} />
              </>
            ) : null}
            {jn.loaded && !jn.items.length && jn.state === 'idle' ? <Text style={styles.status}>No journal entries yet. Select text in the book to save a quote or note.</Text> : null}
            {jn.hasMore && jn.state === 'idle' ? <Link label="Load more" onPress={loadJournal} /> : null}
          </View>
        ) : (
          <View>
            <View style={styles.tagBox}>
              <Row label="Genre" items={book.genres} />
              <Row label="Mood" items={book.moods} />
              <Row label="Tags" items={book.tags} />
            </View>
            {book.description ? (
              <>
                <Text style={[shared.label, styles.aboutLabel]}>About</Text>
                <Text style={[shared.serif, styles.description]} numberOfLines={aboutOpen ? undefined : 5} onTextLayout={e => setAboutLong(e.nativeEvent.lines.length > 5)}>
                  {book.description.trim()}
                </Text>
                {aboutLong || aboutOpen ? <Link label={aboutOpen ? 'Show less' : 'Show more'} onPress={() => setAboutOpen(o => !o)} /> : null}
              </>
            ) : null}
          </View>
        )}
      </ScrollView>

      <View style={shared.actions}>
        {inLibrary ? (
          <Button label={book.status} accessibilityLabel="Change reading status" onPress={() => setView('status')}>
            <Chevron dir="down" />
          </Button>
        ) : (
          <Button label="Add to library" onPress={onAddToLibrary} />
        )}
        <Button label="Write review" solid onPress={onWriteReview} />
      </View>

      {openReview ? (
        // overlay like the cover: the list underneath stays mounted, so Back to reviews lands on the same position
        <View style={shared.overlay}>
          <TopBar title="Review" onPress={() => setOpenReview(null)} />
          <ScrollView style={styles.flex} contentContainerStyle={shared.body}>
            <Text style={[styles.small, {marginBottom: 18}]}>{join([book.title, book.authors.join(', ')])}</Text>
            <ReviewHead r={openReview} full />
            <View style={styles.rvFull}>
              <Text style={shared.serif}>{openReview.text}</Text>
            </View>
          </ScrollView>
          <View style={shared.actions}>
            <Button label="Back to reviews" onPress={() => setOpenReview(null)} />
          </View>
        </View>
      ) : null}

      {editing ? (
        // overlay too: the journal list keeps its scroll position while one entry is edited
        <JournalEdit
          key={editing.id}
          item={editing}
          book={book}
          onClose={() => setEditing(null)}
          onSave={async (text, privacy) => {
            const entry = await onEditJournal!(editing, text, privacy);
            setJn(x => ({...x, items: x.items.map(i => (i.id === editing.id ? {...i, entry, privacy} : i))}));
            setEditing(null);
          }}
        />
      ) : null}

      {view === 'cover' && book.cover ? (
        // overlay, not a sub-view: the page underneath stays mounted, so its scroll position survives
        <Pressable accessibilityLabel="Cover full size" style={shared.overlay} onPress={() => setView('detail')}>
          <TopBar icon="close" label="Close cover" onPress={() => setView('detail')} />
          <Image source={{uri: book.cover}} style={styles.coverFullImg} resizeMode="contain" />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: {flex: 1},
  logo: {width: 120, height: 26, resizeMode: 'contain', marginRight: 'auto', marginTop: 6},
  tracking: {height: 56, flexDirection: 'row', alignItems: 'center', gap: 12},
  track: {width: 68, height: 36, paddingHorizontal: 4, borderWidth: 2, borderColor: BLACK, borderRadius: 18, flexDirection: 'row', alignItems: 'center', backgroundColor: WHITE},
  trackOn: {backgroundColor: BLACK, justifyContent: 'flex-end'},
  knob: {width: 24, height: 24, borderRadius: 12, backgroundColor: BLACK},
  knobOn: {backgroundColor: WHITE},
  content: {paddingVertical: 12, paddingHorizontal: 32},
  header: {flexDirection: 'row', gap: 28},
  cover: {width: 200, height: 300, borderWidth: 1, borderColor: BLACK, borderRadius: 6},
  coverFullImg: {flex: 1, margin: 16},
  noCover: {alignItems: 'center', justifyContent: 'center', padding: 12},
  noCoverText: {fontFamily: SERIF, fontSize: 22, textAlign: 'center', color: BLACK},
  info: {flex: 1, minHeight: 300},
  title: {fontFamily: SERIF, fontSize: 36, lineHeight: 42, fontWeight: '700', color: BLACK},
  subtitle: {fontFamily: SERIF, fontSize: 21, fontStyle: 'italic', color: BLACK, marginTop: 4},
  author: {fontSize: 23, color: BLACK, marginTop: 14},
  meta: {fontSize: 19, color: BLACK, marginTop: 6},
  edRow: {flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 60, marginTop: 16, paddingRight: 4, borderTopWidth: 1, ...shared.hair},
  edName: {fontSize: 19, lineHeight: 24, fontWeight: '500', color: BLACK},
  edMeta: {fontSize: 18, lineHeight: 24, color: BLACK},
  change: {fontSize: 19, color: BLACK, marginLeft: 4},
  progress: {marginTop: 'auto', paddingTop: 16},
  progressLine: {flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between'},
  bar: {height: 10, marginTop: 8, borderWidth: 1.5, borderColor: BLACK, borderRadius: 5, overflow: 'hidden'},
  fill: {height: '100%', backgroundColor: BLACK},
  problem: {fontSize: 18, color: BLACK, marginTop: 8},
  tabs: {marginTop: 20},
  tagBox: {marginTop: 18, gap: 8},
  chipRow: {flexDirection: 'row', alignItems: 'center'},
  chipLabel: {width: 104},
  chips: {flex: 1, flexDirection: 'row', gap: CHIP_GAP, overflow: 'hidden'},
  measure: {position: 'absolute', left: 0, top: 0, opacity: 0, flexDirection: 'row'},
  aboutLabel: {marginTop: 20},
  description: {marginTop: 6},
  status: {fontSize: 20, lineHeight: 30, color: BLACK, marginTop: 20},
  statusList: {paddingTop: 8, paddingHorizontal: 32},
  statusText: {fontSize: 22, color: BLACK},
  small: {fontSize: 18, color: BLACK},
  right: {marginLeft: 'auto'},
  rv: {paddingTop: 14, paddingBottom: 6, ...shared.hair},
  rvLine: {flexDirection: 'row', alignItems: 'baseline', gap: 12},
  rvName: {fontSize: 21, fontWeight: '700', color: BLACK, flexShrink: 1},
  rvStars: {fontSize: 19, letterSpacing: 1, color: BLACK},
  rvDate: {fontSize: 18, color: BLACK, marginLeft: 'auto'},
  rvBadges: {fontSize: 18, fontStyle: 'italic', color: BLACK},
  badges: {flexDirection: 'row', gap: 8, marginTop: 8},
  rvText: {marginTop: 6},
  rvFull: {marginTop: 18, paddingTop: 18, borderTopWidth: 1, borderColor: BLACK},
  jMeta: {flexDirection: 'row', alignItems: 'center', gap: 12},
  links: {flexDirection: 'row', gap: 32, marginTop: 2},
  confirm: {paddingTop: 12, paddingBottom: 10},
  confirmButtons: {flexDirection: 'row', gap: 12, marginTop: 12},
  editBody: {gap: 20},
  bigQuote: {fontSize: 28, lineHeight: 41},
  source: {fontSize: 18, color: BLACK, textAlign: 'right', marginTop: 14},
  editInput: {height: 186, marginTop: 10},
});
