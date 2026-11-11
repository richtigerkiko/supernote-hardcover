const { bumpOf, nextVersion, latestTag } = require('../scripts/next-version');

test('bumpOf', () => {
  expect(bumpOf('fix(sync): x')).toBe('patch');
  expect(bumpOf('feat: x')).toBe('minor');
  expect(bumpOf('feat(ui)!: x')).toBe('major');
  expect(bumpOf('fix!: x')).toBe('major');
  expect(bumpOf('fix: x\n\nBREAKING CHANGE: gone')).toBe('major');
  for (const t of ['docs', 'chore', 'ci', 'perf', 'refactor', 'test']) expect(bumpOf(`${t}: x`)).toBeNull();
  expect(bumpOf('not conventional')).toBeNull();
});

test('nextVersion takes the highest bump and resets lower parts', () => {
  expect(nextVersion('0.2.1', 29, ['fix: a'])).toEqual({ version: '0.2.2', code: 30 });
  expect(nextVersion('0.2.1', 29, ['fix: a', 'feat: b', 'docs: c'])).toEqual({ version: '0.3.0', code: 30 });
  expect(nextVersion('0.2.1', 29, ['feat: b', 'fix!: c'])).toEqual({ version: '1.0.0', code: 30 });
  expect(nextVersion('0.2.1', 29, ['docs: a', 'chore: b'])).toBeNull();
});

test('latestTag picks the highest versionCode', () => {
  expect(latestTag(['v0.2.0-9', 'v0.2.1-29', 'junk', 'v0.1.0-3'])).toMatchObject({ version: '0.2.1', code: 29 });
  expect(latestTag(['junk'])).toBeUndefined();
});
