// Colours and the styles every page shares. E-ink: black on white, borders instead of greys.
import {StyleSheet} from 'react-native';

export const BLACK = '#000000';
export const WHITE = '#ffffff';

export const shared = StyleSheet.create({
  topBar: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingLeft: 20, paddingRight: 64, height: 68, borderBottomWidth: 2, borderColor: BLACK}, // right gap: the host's floating home button sits there
  close: {width: 56, height: 56, alignItems: 'center', justifyContent: 'center'},
  closeBox: {width: 56, height: 56, borderWidth: 3, borderColor: BLACK, alignItems: 'center', justifyContent: 'center'}, // the close of a card
  closeText: {fontSize: 28, color: BLACK},
  actions: {flexDirection: 'row', paddingVertical: 16, paddingLeft: 16, paddingRight: 2, borderTopWidth: 2, borderColor: BLACK},
  button: {height: 68, borderWidth: 3, borderColor: BLACK, alignItems: 'center', justifyContent: 'center'},
  action: {flex: 1, height: 68, borderWidth: 3, borderColor: BLACK, alignItems: 'center', justifyContent: 'center', marginRight: 14},
  actionText: {fontSize: 24, fontWeight: '700', color: BLACK},
});
