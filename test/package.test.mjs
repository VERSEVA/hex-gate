import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const bins = Object.entries(pkg.bin ?? {});

test('package.json declares at least one bin', () => {
  assert.ok(bins.length > 0);
});

for (const [name, target] of bins) {
  test(`bin ${name} target exists`, () => {
    assert.ok(fs.statSync(path.join(root, target)).isFile(), `${target} is not a file`);
  });

  test(`bin ${name} starts with a node shebang`, () => {
    const first = fs.readFileSync(path.join(root, target), 'utf8').split('\n')[0];
    assert.equal(first, '#!/usr/bin/env node');
  });

  test(`bin ${name} is inside a directory listed in files`, () => {
    const dir = path.posix.normalize(target).split('/')[0];
    assert.ok(
      (pkg.files ?? []).some((f) => f.replace(/\/+$/, '') === dir),
      `${target} is not under any of files: ${JSON.stringify(pkg.files)}`,
    );
  });
}

test('version is a semver string', () => {
  assert.match(pkg.version, /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/);
});
