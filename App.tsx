/**
 * Root component, shown when the Hardcover button opens the plugin view (full screen on the Nomad). index.js hands over
 * the data and actions through src/session.js. Under the emulator's fake SDK (Metro with SN_FAKE_SDK=1, see the
 * workspace CLAUDE.md) it shows mock data instead, to design the page at the Nomad's real size.
 *
 * @format
 */

import React, {useEffect, useState} from 'react';
import {Pressable, Text, View} from 'react-native';
import {PluginManager} from 'sn-plugin-lib';
import DetailPage, {BookDetail} from './src/ui/DetailPage';
import {MOCK_BOOK} from './src/ui/mockBook';
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
  const [book, setBook] = useState<BookDetail | null>(null);
  const [message, setMessage] = useState('Loading…');

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
      session.api
        ?.load()
        .then((r: any) => {
          if (mine !== latest) return;
          if (r.book) {
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
    // preview only: mock data, the review button flips between the normal and the worst-case mock
    return (
      <DetailPage
        book={book ?? MOCK_BOOK}
        tracking={tracking}
        onToggleTracking={() => setTracking(!tracking)}
        onClose={close}
        onSaveReview={async r => (setBook({...(book ?? MOCK_BOOK), myReview: r.text, myRating: r.rating || null, mySpoilers: r.spoilers}), true)}
        onSetStatus={status => setBook({...(book ?? MOCK_BOOK), status})}
        onSetEdition={editionId => setBook({...(book ?? MOCK_BOOK), editionId, editionSaved: true})}
      />
    );
  }

  if (!book) return <Message text={message} onClose={close} />;
  return (
    <DetailPage
      book={book}
      tracking={tracking}
      syncNote={syncNote}
      onToggleTracking={toggle}
      onClose={close}
      onSaveReview={async r => {
        if (!(await session.api?.writeReview(r))) return false;
        setBook({...book, myReview: r.text, myRating: r.rating || null, mySpoilers: r.spoilers});
        return true;
      }}
      onSetStatus={status => {
        const before = book.status;
        setBook({...book, status});
        session.api?.setStatus(status).catch(() => setBook(b => (b ? {...b, status: before} : b)));
      }}
      onSetEdition={editionId => {
        setBook({...book, editionId, editionSaved: true});
        session.api?.setEdition(editionId);
      }}
    />
  );
}
