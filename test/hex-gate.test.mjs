import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const bin = path.join(here, '..', 'bin', 'hex-gate.mjs');
const fx = (...p) => path.join(here, 'fixtures', ...p);

function run(args) {
  try {
    const stdout = execFileSync(process.execPath, [bin, ...args], { encoding: 'utf8' });
    return { code: 0, out: stdout };
  } catch (e) {
    return { code: e.status, out: `${e.stdout ?? ''}${e.stderr ?? ''}` };
  }
}

const TOKENS = ['--tokens', fx('tokens.css')];

test('off-token hex in css fails and names file, line, hex', () => {
  const r = run([...TOKENS, fx('proj', 'bad.css')]);
  assert.equal(r.code, 1);
  assert.match(r.out, /bad\.css:2/);
  assert.match(r.out, /#FF00AA/i);
});

test('hex drawn from tokens passes', () => {
  const r = run([...TOKENS, fx('proj', 'good.css')]);
  assert.equal(r.code, 0);
});

test('tailwind arbitrary value in tsx is caught', () => {
  const r = run([...TOKENS, fx('proj', 'page.tsx')]);
  assert.equal(r.code, 1);
  assert.match(r.out, /page\.tsx/);
  assert.match(r.out, /#12E4B0/i);
});

test('hex-ok marker suppresses the line', () => {
  const r = run([...TOKENS, fx('proj', 'marked.css')]);
  assert.equal(r.code, 0);
});

test('3-digit token authorizes its 6-digit form and vice versa', () => {
  const r = run([...TOKENS, fx('proj', 'short.css')]);
  assert.equal(r.code, 0);
});

test('all-digit short sequences (issue refs) are ignored', () => {
  const r = run([...TOKENS, fx('proj', 'issue-ref.ts')]);
  assert.equal(r.code, 0);
});

test('--allow skips the file', () => {
  const r = run([...TOKENS, '--allow', 'legacy', fx('proj-allow')]);
  assert.equal(r.code, 0);
});

test('directory scan walks and skips node_modules', () => {
  const r = run([...TOKENS, fx('proj')]);
  assert.equal(r.code, 1);
  assert.match(r.out, /bad\.css/);
  assert.doesNotMatch(r.out, /node_modules/);
});
