import React from 'react';
import {StyleSheet, Text, View} from 'react-native';
import QrCode from './QrCode';
import {BLACK, Button, SERIF, WHITE} from './theme';

// Full-screen message: loading, nothing to show, a load error (Retry), or the sign-in start and its code with the QR code.
type Props = {text: string; onClose: () => void; onSignIn?: () => void; onRetry?: () => void; qr?: string; code?: {uri: string; code: string}};

export default function Message({text, onClose, onSignIn, onRetry, qr, code}: Props) {
  return (
    <View style={styles.page}>
      {qr ? (
        <View style={styles.qr}>
          <QrCode text={qr} size={338} />
        </View>
      ) : null}
      {code ? (
        <View style={styles.code}>
          <Text style={styles.small}>On any device open</Text>
          <Text style={styles.uri}>{code.uri}</Text>
          <Text style={[styles.small, {marginTop: 14}]}>and enter the code</Text>
          <Text style={styles.userCode}>{code.code}</Text>
        </View>
      ) : (
        <Text style={onSignIn ? styles.heading : styles.text}>{text}</Text>
      )}
      <View style={styles.buttons}>
        {onRetry ? <View style={styles.row}><Button label="Retry" solid onPress={onRetry} /></View> : null}
        {onSignIn ? <View style={styles.row}><Button label="Sign in" solid onPress={onSignIn} /></View> : null}
        <View style={styles.row}><Button label="Close" onPress={onClose} /></View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: {flex: 1, backgroundColor: WHITE, alignItems: 'center', justifyContent: 'center', gap: 36, paddingVertical: 40, paddingHorizontal: 64},
  qr: {borderWidth: 1, borderColor: BLACK, borderRadius: 12, overflow: 'hidden'},
  code: {alignItems: 'center', gap: 6},
  small: {fontSize: 20, color: BLACK},
  uri: {fontSize: 26, fontWeight: '700', color: BLACK, textAlign: 'center'},
  userCode: {fontSize: 44, fontWeight: '700', letterSpacing: 4, color: BLACK},
  text: {fontSize: 24, lineHeight: 36, color: BLACK, textAlign: 'center'},
  heading: {fontFamily: SERIF, fontSize: 30, fontWeight: '700', color: BLACK, textAlign: 'center'},
  buttons: {width: 360, gap: 16},
  row: {flexDirection: 'row'}, // Button fills a row (flex 1)
});
