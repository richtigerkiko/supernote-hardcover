// Prints "A.B.C CODE" for the next release, derived from conventional commits since the latest vA.B.C-CODE tag.
// Prints nothing when no commit is releasing (only feat, fix, perf or breaking changes release).
const { execFileSync } = require('child_process');

const RANK = { patch: 1, minor: 2, major: 3 };

function bumpOf(message) {
  const [subject] = message.split('\n');
  const m = /^(\w+)(\([^)]*\))?(!)?:/.exec(subject);
  if (m && m[3]) return 'major';
  if (/^BREAKING[ -]CHANGE:/m.test(message)) return 'major';
  if (m && m[1] === 'feat') return 'minor';
  if (m && (m[1] === 'fix' || m[1] === 'perf')) return 'patch';
  return null;
}

// versionCode = (major*10000 + minor*100 + patch)*100 + build, build = 1 + the tags this version already has
// (stable and -dev), so every build of a version gets a higher code than the one before. The installer compares
// the code alone (probed on the Nomad 2026-11-12) and accepts at least 2000000000.
// shortcut: minor, patch and the build count must stay below 100, widen the factors when one gets there.
function nextVersion(base, tags, messages) {
  const bump = messages.map(bumpOf).filter(Boolean).sort((a, b) => RANK[b] - RANK[a])[0];
  if (!bump) return null;
  const [a, b, c] = base.split('.').map(Number);
  const v = bump === 'major' ? [a + 1, 0, 0] : bump === 'minor' ? [a, b + 1, 0] : [a, b, c + 1];
  const version = v.join('.');
  const builds = tags.filter((t) => t.startsWith(`v${version}-`)).length;
  return { version, code: (v[0] * 10000 + v[1] * 100 + v[2]) * 100 + builds + 1 };
}

// Base version comes from the highest stable tag vA.B.C-CODE (-dev pre-releases are skipped).
function latestTag(tags) {
  return tags
    .map((t) => /^v(\d+\.\d+\.\d+)-(\d+)$/.exec(t))
    .filter(Boolean)
    .map((m) => ({ tag: m[0], version: m[1], code: Number(m[2]) }))
    .sort((x, y) => y.code - x.code)[0];
}

if (require.main === module) {
  const git = (...args) => execFileSync('git', args, { encoding: 'utf8' });
  const tags = git('tag', '--list', 'v*').split('\n');
  const tag = latestTag(tags);
  if (!tag) throw new Error('no vA.B.C-CODE tag found');
  const log = git('log', `${tag.tag}..HEAD`, '--format=%B%x00');
  const next = nextVersion(tag.version, tags, log.split('\0').map((s) => s.trim()).filter(Boolean));
  if (next) console.log(`${next.version} ${next.code}`);
}

module.exports = { bumpOf, nextVersion, latestTag };
