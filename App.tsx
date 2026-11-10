/**
 * Root component, shown when the Hardcover button opens the plugin view (full screen on the Nomad). src/plugin.ts hands over
 * the data and actions through src/session.ts. Under the emulator's fake SDK (Metro with SN_FAKE_SDK=1, see the
 * workspace CLAUDE.md) it shows mock data instead, to design the page at the Nomad's real size.
 *
 * @format
 */

import React, {useEffect, useState} from 'react';
import {Pressable, Text, View} from 'react-native';
import {PluginManager} from 'sn-plugin-lib';
import DetailPage, {BookDetail} from './src/ui/DetailPage';
import JournalPage from './src/ui/JournalPage';
import {MOCK_BOOK, MOCK_LONG} from './src/ui/mockBook';
import {session} from './src/session';

// The fake SDK reports this plugin name; the real host reports the real one.
const isFakeSdk = async () => (await PluginManager.getPluginName()) === 'sn-fake';
const close = () => PluginManager.closePluginView();

function Message({text, onClose}: {text: string; onClose: () => void}) {
  return (
    <View style={{flex: 1, backgroundColor: '#fff', padding: 40, justifyContent: 'center'}}>
      <Text style={{fontSize: 26, color: '#000', textAlign: 'center'}}>{text}</Text>
      <Pressable accessibilityRole="button" onPress={onClose} style={{height: 68, marginTop: 40, borderWidth: 3, borderColor: '#000', alignItems: 'center', justifyContent: 'center'}}>
        <Text style={{fontSize: 24, fontWeight: '700', color: '#000'}}>Close</Text>
      </Pressable>
    </View>
  );
}

export default function App(): React.JSX.Element {
  const [preview, setPreview] = useState<boolean | null>(null);
  const [tracking, setTracking] = useState(false); // per document, off until switched on for the open book
  const [syncNote, setSyncNote] = useState('');
  const [long, setLong] = useState(false);
  const [book, setBook] = useState<BookDetail | null>(null);
  const [message, setMessage] = useState('Loading…');
  const [journal, setJournal] = useState<{passage: string} | null>(null); // set: the hardcover-select page is shown

  useEffect(() => {
    isFakeSdk().then(setPreview, () => setPreview(false));
  }, []);

  // On the device: load the open book now, and again on every press of the toolbar button (the view stays mounted).
  useEffect(() => {
    if (preview !== false) return;
    let latest = 0;
    const load = () => {
      const mine = ++latest;
      setBook(null);
      setMessage('Loading…');
      setTracking(false);
      setSyncNote('');
      setJournal(null);
      const isJournal = session.mode === 'journal';
      Promise.all([session.api?.load(), isJournal ? session.api?.passage() : ''])
        .then(([r, passage]: any) => {
          if (mine !== latest) return;
          if (r.book) {
            if (isJournal) setJournal({passage});
            setBook(r.book);
            setTracking(r.tracking);
            setSyncNote(r.sync);
          } else setMessage(r.message);
        })
        .catch((e: any) => mine === latest && setMessage(`Could not load the book: ${String(e?.message ?? e)}`));
    };
    load();
    return session.onOpen(load);
  }, [preview]);

  if (preview === null) return <View />;
  const toggle = () => {
    const on = !tracking;
    setTracking(on);
    session.api?.setTracking(on);
  };

  if (preview) {
    // preview only: mock data. The review button flips between the normal and the worst-case mock; Close on the detail
    // page opens the journal card (its Close and saves come back here; every second save fails, to see Retry).
    if (journal) {
      return (
        <JournalPage
          book={book ?? MOCK_BOOK}
          passage={journal.passage}
          onSetEdition={editionId => setBook({...(book ?? MOCK_BOOK), editionId, editionSaved: true})}
          onSave={() => new Promise((ok, fail) => (Date.now() % 2 ? ok() : fail(new Error('Network request failed'))))}
          onClose={() => setJournal(null)}
        />
      );
    }
    return (
      <DetailPage
        book={long ? MOCK_LONG : (book ?? MOCK_BOOK)}
        tracking={tracking}
        onToggleTracking={() => setTracking(!tracking)}
        onClose={() => setJournal({passage: 'Call me Ishmael. Some years ago, never mind how long precisely, having little or no money in my purse, I thought I would sail about a little and see the watery part of the world.'})}
        onWriteReview={() => setLong(l => !l)}
        onSetStatus={status => setBook({...(book ?? MOCK_BOOK), status})}
        onSetEdition={editionId => setBook({...(book ?? MOCK_BOOK), editionId, editionSaved: true})}
      />
    );
  }

  if (!book) return <Message text={message} onClose={close} />;
  if (journal) {
    return (
      <JournalPage
        book={book}
        passage={journal.passage}
        onSetEdition={editionId => {
          setBook({...book, editionId, editionSaved: true});
          session.api?.setEdition(editionId);
        }}
        onSave={e => session.api!.saveJournal(e)}
        onClose={close}
      />
    );
  }
  return (
    <DetailPage
      book={book}
      tracking={tracking}
      syncNote={syncNote}
      onToggleTracking={toggle}
      onClose={close}
      onWriteReview={() => session.api?.writeReview()}
      onSetStatus={status => {
        const before = book.status;
        setBook({...book, status});
        session.api?.setStatus(status).catch(() => setBook(b => (b ? {...b, status: before} : b)));
      }}
      onSetEdition={editionId => {
        setBook({...book, editionId, editionSaved: true});
        session.api?.setEdition(editionId);
      }}
      onAddToLibrary={() =>
        Promise.resolve(session.api?.addToLibrary()).then(
          () => session.opened(), // reload: the book is now on the shelves
          (e: any) => setSyncNote(`Could not add the book: ${String(e?.message ?? e)}`),
        )
      }
    />
  );
}
