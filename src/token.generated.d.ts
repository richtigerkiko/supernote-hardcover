// The real file is written from the workspace .env by scripts/write-token.js (gitignored); this describes it for tsc,
// so type checking also works in CI where the token does not exist.
declare const token: string;
export default token;
