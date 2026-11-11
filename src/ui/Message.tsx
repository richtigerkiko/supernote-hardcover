import React from 'react';
import {Pressable, Text, View} from 'react-native';
import QrCode from './QrCode';
import {BLACK, WHITE, shared} from './theme';

// Full-screen message: loading, nothing to show, or the sign-in code (with its QR code and Sign in button).
export default function Message({text, onClose, onSignIn, qr}: {text: string; onClose: () => void; onSignIn?: () => void; qr?: string}) {
  return (
    <View style={{flex: 1, backgroundColor: WHITE, padding: 40, justifyContent: 'center'}}>
      {qr && <View style={{alignItems: 'center', marginBottom: 24}}><QrCode text={qr} size={340} /></View>}
      <Text style={{fontSize: 26, color: BLACK, textAlign: 'center'}}>{text}</Text>
      {onSignIn && (
        <Pressable accessibilityRole="button" onPress={onSignIn} style={[shared.button, {marginTop: 40, backgroundColor: BLACK}]}>
          <Text style={[shared.actionText, {color: WHITE}]}>Sign in</Text>
        </Pressable>
      )}
      <Pressable accessibilityRole="button" onPress={onClose} style={[shared.button, {marginTop: 40}]}>
        <Text style={shared.actionText}>Close</Text>
      </Pressable>
    </View>
  );
}
