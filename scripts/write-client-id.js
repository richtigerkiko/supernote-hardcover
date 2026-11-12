// Writes src/clientId.generated.js (gitignored) before a build from HARDCOVER_OAUTH_CLIENT_ID: the environment first, else a .env in the repo root.
// It is a public client id (no secret), so the package holds no credentials; the account is signed in on the device.
const fs = require('fs');
const path = require('path');

const envFile = path.join(__dirname, '..', '.env');
const match =
  (process.env.HARDCOVER_OAUTH_CLIENT_ID ? [null, process.env.HARDCOVER_OAUTH_CLIENT_ID] : null) ||
  /^HARDCOVER_OAUTH_CLIENT_ID=(.*)$/m.exec(fs.existsSync(envFile) ? fs.readFileSync(envFile, 'utf8') : '');
const clientId = match && match[1].trim().replace(/^["']|["']$/g, '');
if (!clientId) {
  console.error(`HARDCOVER_OAUTH_CLIENT_ID is not set in the environment and missing or empty in ${envFile}`);
  process.exit(1);
}
fs.writeFileSync(path.join(__dirname, '..', 'src', 'clientId.generated.js'), `export default ${JSON.stringify(clientId)};\n`);
console.log('wrote src/clientId.generated.js');
