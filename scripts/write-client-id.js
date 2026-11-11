// Copies HARDCOVER_OAUTH_CLIENT_ID from the workspace root .env into src/clientId.generated.js (gitignored) before a build.
// It is a public client id (no secret), so the package holds no credentials; the account is signed in on the device.
const fs = require('fs');
const path = require('path');

const envFile = path.join(__dirname, '..', '..', '..', '.env');
// CI has no workspace .env: it passes HARDCOVER_OAUTH_CLIENT_ID as an environment variable instead.
const match =
  /^HARDCOVER_OAUTH_CLIENT_ID=(.*)$/m.exec(fs.existsSync(envFile) ? fs.readFileSync(envFile, 'utf8') : '') ||
  (process.env.HARDCOVER_OAUTH_CLIENT_ID ? [null, process.env.HARDCOVER_OAUTH_CLIENT_ID] : null);
const clientId = match && match[1].trim().replace(/^["']|["']$/g, '');
if (!clientId) {
  console.error(`HARDCOVER_OAUTH_CLIENT_ID missing or empty in ${envFile}`);
  process.exit(1);
}
fs.writeFileSync(path.join(__dirname, '..', 'src', 'clientId.generated.js'), `export default ${JSON.stringify(clientId)};\n`);
console.log('wrote src/clientId.generated.js');
