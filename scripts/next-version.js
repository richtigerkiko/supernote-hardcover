// Prints "A.B.C CODE" for the next release, derived from conventional commits since the latest vA.B.C-CODE tag.
// Prints nothing when no commit is releasing (only feat, fix or breaking changes release).
const { execFileSync } = require('child_process');

const RANK = { patch: 1, minor: 2, major: 3 };

function bumpOf(message) {
  const [subject] = message.split('\n');
  const m = /^(\w+)(\([^)]*\))?(!)?:/.exec(subject);
  if (m && m[3]) return 'major';
  if (/^BREAKING[ -]CHANGE:/m.test(message)) return 'major';
  if (m && m[1] === 'feat') return 'minor';
  if (m && m[1] === 'fix') return 'patch';
  return null;
}

function nextVersion(base, code, messages) {
  const bump = messages.map(bumpOf).filter(Boolean).sort((a, b) => RANK[b] - RANK[a])[0];
  if (!bump) return null;
  const [a, b, c] = base.split('.').map(Number);
  const v = bump === 'major' ? [a + 1, 0, 0] : bump === 'minor' ? [a, b + 1, 0] : [a, b, c + 1];
  return { version: v.join('.'), code: code + 1 };
}

function latestTag(tags) {
  const parsed = tags
    .map((t) => /^v(\d+\.\d+\.\d+)-(\d+)$/.exec(t))
    .filter(Boolean)
    .map((m) => ({ tag: m[0], version: m[1], code: Number(m[2]) }));
  return parsed.sort((x, y) => y.code - x.code)[0]; // versionCode only ever rises
}

if (require.main === module) {
  const git = (...args) => execFileSync('git', args, { encoding: 'utf8' });
  const tag = latestTag(git('tag', '--list', 'v*').split('\n'));
  if (!tag) throw new Error('no vA.B.C-CODE tag found');
  const log = git('log', `${tag.tag}..HEAD`, '--format=%B%x00');
  const next = nextVersion(tag.version, tag.code, log.split('\0').map((s) => s.trim()).filter(Boolean));
  if (next) console.log(`${next.version} ${next.code}`);
}

module.exports = { bumpOf, nextVersion, latestTag };
