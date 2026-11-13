// The part of react-native-sqlite-storage (vendored in node_change/, no types of its own) that files.ts uses.
declare module 'react-native-sqlite-storage' {
  interface Database {
    executeSql(sql: string, params?: (string | number)[]): Promise<[{rows: {raw(): Record<string, unknown>[]}}]>;
  }
  const SQLite: {
    enablePromise(on: boolean): void;
    openDatabase(args: {name: string; location: string}): Promise<Database>;
  };
  export default SQLite;
}
