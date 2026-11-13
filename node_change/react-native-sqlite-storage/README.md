# react-native-sqlite-storage (vendored, Android only)

npm 6.0.1 (MIT, andpor) trimmed to `platforms/android`, taken from j-raghavan/sn-dictionary (394af0d).
The one functional change against npm is in `SQLitePlugin.java`: `openDatabase`'s `location` is honoured
(`getFilesDir()/<location>/<name>`, or `<location><name>` when it starts with `/`) instead of always using
`Context.getDatabasePath(name)`, so the database can live in the plugin's private directory.

It is autolinked (`react-native.config.js`); do not also add `SQLitePluginPackage` by hand in `MainApplication.kt`.
