// The real file is written from the workspace .env by scripts/write-client-id.js (gitignored); this describes it for tsc,
// so type checking also works in CI where the file does not exist.
declare const clientId: string;
export default clientId;
