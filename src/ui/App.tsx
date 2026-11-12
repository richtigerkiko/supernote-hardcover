/**
 * Root component, shown when the Hardcover button opens the plugin view (full screen; sizes are Nomad dp, scaled to other windows by Scaled in theme.tsx). src/plugin.ts hands over
 * the data and actions through src/page/session.ts. Under the emulator's fake SDK (Metro with SN_FAKE_SDK=1, see the
 * workspace CLAUDE.md) it shows mock data instead, to design the page at the Nomad's real size.
 *
 * @format
 */

import React, {useEffect, useState} from 'react';
import {useWindowDimensions, View} from 'react-native';
import BookSearch from './BookSearch';
import DetailPage from './DetailPage';
import EditionPicker from './EditionPicker';
import JournalPage from './JournalPage';
import Message from './Message';
import ReviewPage from './ReviewPage';
import {MOCK_BOOK, MOCK_JOURNAL, MOCK_LONG, MOCK_REVIEWS} from './preview/mockBook';
import {BLANK_REVIEW, type BookDetail, type Review} from '../core/types';
import {session, type Ask} from '../page/session';
import {joinEntry, splitEntry} from '../core/journal';
import {log} from '../core/util';
import {Scaled, windowFacts} from './theme';

export default function App(): React.JSX.Element {
  return (
    <Scaled>
      <AppInner />
    </Scaled>
  );
}

function AppInner(): React.JSX.Element {
  const win = useWindowDimensions();
  const [preview, setPreview] = useState<boolean | null>(null);
  const [tracking, setTracking] = useState(false); // per document, off until switched on for the open book
  const [syncNote, setSyncNote] = useState('');
  const [long, setLong] = useState(false);
  const [book, setBook] = useState<BookDetail | null>(null);
  const [message, setMessage] = useState('Loading…');
  const [canSignIn, setCanSignIn] = useState(false); // the message offers the Sign in button
  const [signingIn, setSigningIn] = useState(false);
  const [qr, setQr] = useState(''); // the sign-in link as a QR code, while waiting for the approval
  const [code, setCode] = useState<{uri: string; code: string} | undefined>(); // the sign-in URL and code, shown with the QR code
  const [failed, setFailed] = useState(false); // loading the book failed: the message offers Retry
  const [ask, setAsk] = useState<Ask | null>(null); // set: the book search or the edition picker is shown before the book can load
  const [journal, setJournal] = useState<{passage: string} | null>(null); // set: the hardcover-select page is shown
  const [review, setReview] = useState<Review | null>(null); // set: the review card is shown, starting from this

  useEffect(() => {
    session.isFakeSdk().then(setPreview, () => setPreview(false));
    // For tester reports from other models (see CLAUDE.md "Other models").
    session.deviceType().then(t => log('window', windowFacts(win), 'device type', t), () => log('window', windowFacts(win), 'device type unknown'));
  // eslint-disable-next-line react-hooks/exhaustive-deps -- the window facts are logged once, at mount
  }, []);

  // On the device: load the open book now, and again on every press of the toolbar button (the view stays mounted).
  useEffect(() => {
    if (preview !== false) return;
    let latest = 0;
    const load = () => {
      const mine = ++latest;
      setBook(null);
      setMessage('Loading…');
      setCanSignIn(false);
      setQr('');
      setCode(undefined);
      setFailed(false);
      setAsk(null);
      setTracking(false);
      setSyncNote('');
      setJournal(null);
      setReview(null);
      const isJournal = session.mode === 'journal';
      // The selection is taken only once a book is shown, so a sign-in in between does not lose it.
      Promise.resolve(session.api?.load())
        .then((r: any) => (r.book && isJournal ? session.api!.passage().then(p => [r, p]) : [r, '']))
        .then(([r, passage]: any) => {
          if (mine !== latest) return;
          if (r.book) {
            if (isJournal) setJournal({passage});
            setBook(r.book);
            setTracking(r.tracking);
            setSyncNote(r.sync);
          } else if (r.message) {
            setMessage(r.message);
            setCanSignIn(!!r.signIn);
          } else setAsk(r);
        })
        .catch((e: any) => {
          if (mine !== latest) return;
          setMessage(`Could not load the book: ${String(e?.message ?? e)}`);
          setFailed(true);
        });
    };
    load();
    return session.onOpen(load);
  }, [preview]);

  if (preview === null) return <View />;
  const msg = (e: any) => String(e?.message ?? e);
  // The page is not reloaded after a toggle or a status change: both return the new sync line.
  const toggle = () => {
    const on = !tracking;
    setTracking(on);
    session.api?.setTracking(on).then(
      r => {
        setSyncNote(r.sync);
        if (r.status) setBook(b => (b ? {...b, status: r.status!} : b));
      },
      (e: any) => {
        setTracking(!on);
        setSyncNote(`Could not turn tracking ${on ? 'on' : 'off'}: ${msg(e)}`);
      },
    );
  };
  // editionSaved is set only after the plugin accepted the edition.
  const pickEdition = (editionId: string, b: BookDetail) =>
    session.api?.setEdition(editionId).then(
      () => setBook({...b, editionId, editionSaved: true}),
      (e: any) => setSyncNote(`Could not change the edition: ${msg(e)}`),
    );

  if (preview) {
    // preview only: mock data. The Tracking toggle also flips between the normal and the worst-case mock; Write review
    // opens the review page and Close on the detail page the journal page (their Close and saves come back here; every
    // second save fails, to see Retry).
    const flaky = () => new Promise<void>((ok, fail) => (Date.now() % 2 ? ok() : fail(new Error('Network request failed'))));
    if (review) return <ReviewPage book={book ?? MOCK_BOOK} initial={review} onSave={flaky} onClose={() => setReview(null)} />;
    if (journal) {
      return (
        <JournalPage
          book={book ?? MOCK_BOOK}
          passage={journal.passage}
          onSetEdition={editionId => setBook({...(book ?? MOCK_BOOK), editionId, editionSaved: true})}
          onSave={flaky}
          onClose={() => setJournal(null)}
        />
      );
    }
    return (
      <DetailPage
        book={long ? MOCK_LONG : (book ?? MOCK_BOOK)}
        tracking={tracking}
        onToggleTracking={() => {
          setTracking(!tracking);
          setLong(l => !l);
        }}
        onClose={() => setJournal({passage: 'Call me Ishmael. Some years ago, never mind how long precisely, having little or no money in my purse, I thought I would sail about a little and see the watery part of the world.'})}
        onWriteReview={() => setReview(BLANK_REVIEW)}
        onLoadReviews={() => Promise.resolve({reviews: MOCK_REVIEWS, hasMore: false})}
        onLikeReview={(id, on) => Promise.resolve((MOCK_REVIEWS.find(r => r.id === id)?.likes ?? 0) + (on ? 1 : 0))}
        onLoadJournal={() => Promise.resolve({entries: MOCK_JOURNAL, hasMore: false})}
        onEditJournal={(item, text) => Promise.resolve(item.event === 'note' ? text : joinEntry(splitEntry('quote', item.entry).passage, text))}
        onRemoveJournal={() => flaky()}
        onSetStatus={status => setBook({...(book ?? MOCK_BOOK), status})}
        onSetEdition={editionId => setBook({...(book ?? MOCK_BOOK), editionId, editionSaved: true})}
      />
    );
  }

  const signIn = () => {
    if (signingIn) return;
    setSigningIn(true);
    session.api!
      .signIn((uri, userCode, link) => {
        setQr(link);
        setCode({uri, code: userCode});
      })
      .then(
        ok => ok && session.opened(), // reload: the account is connected now (false: cancelled by a reload)
        (e: any) => {
          setQr('');
          setCode(undefined);
          setMessage(`Sign-in failed: ${String(e?.message ?? e)}`);
          setCanSignIn(true);
        },
      )
      .finally(() => setSigningIn(false));
  };
  // A step of the add flow runs: the message page, with Retry (a reload) when it fails.
  const wait = (text: string, step: Promise<unknown>) => {
    setAsk(null);
    setMessage(text);
    step.catch((e: any) => {
      setMessage(`Could not add the book: ${msg(e)}`);
      setFailed(true);
    });
  };
  if (ask && 'pick' in ask) {
    const {bookId, editions} = ask.pick;
    let picked = false; // "Use this edition" calls onPick and then onClose; only a Cancel closes the view (nothing is written)
    return (
      <EditionPicker
        editions={editions}
        editionId=""
        onPick={editionId => {
          picked = true;
          wait('Adding…', session.api!.addToLibrary({bookId, editionId}).then(session.opened)); // reload: the book is now on the shelves
        }}
        onClose={() => {
          if (!picked) session.close();
        }}
      />
    );
  }
  if (ask) {
    return (
      <BookSearch
        query={ask.search}
        onSearch={q => session.api!.searchBooks(q)}
        onPick={bookId => wait('Loading…', session.api!.pickBook(bookId).then(r => (r ? setAsk(r) : session.opened())))}
        onClose={session.close}
      />
    );
  }
  if (!book) return <Message text={message} qr={qr} code={code} onClose={session.close} onSignIn={canSignIn && !signingIn ? signIn : undefined} onRetry={failed ? session.opened : undefined} />;
  if (review) return <ReviewPage book={book} initial={review} onSave={r => session.api!.saveReview(r)} onClose={() => setReview(null)} />;
  if (journal) {
    return (
      <JournalPage
        book={book}
        passage={journal.passage}
        onSetEdition={editionId => pickEdition(editionId, book)}
        onSave={e => session.api!.saveJournal(e)}
        onClose={session.close}
      />
    );
  }
  return (
    <DetailPage
      book={book}
      tracking={tracking}
      syncNote={syncNote}
      onToggleTracking={toggle}
      onClose={session.close}
      onWriteReview={() =>
        Promise.resolve(session.api?.writeReview()).then(
          start => (start ? setReview(start) : session.opened()), // false: signed out to ask for write:reviews, reload shows Sign in
          (e: any) => setSyncNote(String(e?.message ?? e)),
        )
      }
      onLoadReviews={offset => session.api!.loadReviews(offset)}
      onLikeReview={(id, on) => session.api!.likeReview(id, on)}
      onLoadJournal={offset => session.api!.loadJournal(offset)}
      onEditJournal={(item, text, privacy) => session.api!.editJournal(item, text, privacy)}
      onRemoveJournal={id => session.api!.removeJournal(id)}
      onSetStatus={status => {
        const before = book.status;
        setBook({...book, status});
        session.api?.setStatus(status).then(
          s => setSyncNote(s),
          (e: any) => {
            setBook(b => (b ? {...b, status: before} : b));
            setSyncNote(`Could not change the status: ${msg(e)}`);
          },
        );
      }}
      onSetEdition={editionId => pickEdition(editionId, book)}
      onAddToLibrary={() =>
        Promise.resolve(session.api?.addToLibrary()).then(
          () => session.opened(), // reload: the book is now on the shelves
          (e: any) => setSyncNote(`Could not add the book: ${String(e?.message ?? e)}`),
        )
      }
    />
  );
}
