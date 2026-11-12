const { bumpOf, nextVersion, latestTag } = require('../scripts/next-version');

test('bumpOf', () => {
  expect(bumpOf('fix(sync): x')).toBe('patch');
  expect(bumpOf('perf(sync): x')).toBe('patch');
  expect(bumpOf('feat: x')).toBe('minor');
  expect(bumpOf('feat(ui)!: x')).toBe('major');
  expect(bumpOf('fix!: x')).toBe('major');
  expect(bumpOf('fix: x\n\nBREAKING CHANGE: gone')).toBe('major');
  for (const t of ['docs', 'chore', 'ci', 'refactor', 'test']) expect(bumpOf(`${t}: x`)).toBeNull();
  expect(bumpOf('not conventional')).toBeNull();
});

test('nextVersion takes the highest bump and resets lower parts', () => {
  expect(nextVersion('0.2.1', [], ['fix: a'])).toEqual({ version: '0.2.2', code: 20201 });
  expect(nextVersion('0.2.1', [], ['fix: a', 'feat: b', 'docs: c'])).toEqual({ version: '0.3.0', code: 30001 });
  expect(nextVersion('0.2.1', [], ['feat: b', 'fix!: c'])).toEqual({ version: '1.0.0', code: 1000001 });
  expect(nextVersion('0.2.1', [], ['docs: a', 'chore: b'])).toBeNull();
});

test('nextVersion counts the builds of the same version, dev included', () => {
  const tags = ['v0.5.0-35', 'v0.5.1-36-dev', 'v0.5.10-5', 'v0.5.1-50102-dev'];
  expect(nextVersion('0.5.0', tags, ['fix: a'])).toEqual({ version: '0.5.1', code: 50103 });
  expect(nextVersion('0.5.0', tags, ['feat: a'])).toEqual({ version: '0.6.0', code: 60001 });
});

test('codes rise with the version, above the old counter codes', () => {
  expect(nextVersion('0.5.0', ['v0.5.0-35'], ['fix: a']).code).toBeGreaterThan(36);
  expect(nextVersion('0.5.9', [], ['fix: a']).code).toBeLessThan(nextVersion('0.6.0', [], ['feat: a']).code);
});

test('latestTag picks the highest stable versionCode and ignores dev tags', () => {
  expect(latestTag(['v0.2.0-9', 'v0.2.1-29', 'junk', 'v0.1.0-3'])).toMatchObject({ version: '0.2.1', code: 29 });
  expect(latestTag(['v0.2.1-29', 'v0.3.0-31-dev', 'v0.2.0-9'])).toEqual({ tag: 'v0.2.1-29', version: '0.2.1', code: 29 });
  expect(latestTag(['junk'])).toBeUndefined();
});
