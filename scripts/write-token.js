// Copies HARDCOVER_KEY from the workspace root .env into src/token.generated.js (gitignored) before a build.
// The token ends up inside the .snplg, so those builds must never be shared. The value is never printed.
const fs = require('fs');
const path = require('path');

const envFile = path.join(__dirname, '..', '..', '..', '.env');
// CI has no workspace .env: it passes HARDCOVER_KEY as an environment variable instead.
const match =
  /^HARDCOVER_KEY=(.*)$/m.exec(fs.existsSync(envFile) ? fs.readFileSync(envFile, 'utf8') : '') ||
  (process.env.HARDCOVER_KEY ? [null, process.env.HARDCOVER_KEY] : null);
const token = match && match[1].trim().replace(/^["']|["']$/g, '').replace(/^Bearer\s+/i, '');
if (!token) {
  console.error(`HARDCOVER_KEY missing or empty in ${envFile}`);
  process.exit(1);
}
fs.writeFileSync(path.join(__dirname, '..', 'src', 'token.generated.js'), `export default ${JSON.stringify(token)};\n`);
console.log('wrote src/token.generated.js');
