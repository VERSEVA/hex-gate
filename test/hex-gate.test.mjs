import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const here = path.dirname(fileURLToPath(import.meta.url));
const bin = path.join(here, '..', 'bin', 'hex-gate.mjs');
const fx = (...p) => path.join(here, 'fixtures', ...p);

function run(args, opts = {}) {
  try {
    const stdout = execFileSync(process.execPath, [bin, ...args], { encoding: 'utf8', ...opts });
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

test('hex-ok inside a longer token does not suppress the line', () => {
  const r = run([...TOKENS, fx('proj', 'marked-substring.css')]);
  assert.equal(r.code, 1);
  assert.match(r.out, /marked-substring\.css:1 /);
  assert.match(r.out, /marked-substring\.css:2 /);
  assert.match(r.out, /marked-substring\.css:3 /);
});

test('hex-ok as its own token suppresses the line', () => {
  const r = run([...TOKENS, fx('proj', 'marked-token.css')]);
  assert.equal(r.code, 0, r.out);
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

test('--allow does not match directories above cwd', () => {
  const r = run([...TOKENS, '--allow', 'legacy', '.'], { cwd: fx('legacy-root') });
  assert.equal(r.code, 1);
  assert.match(r.out, /off\.css:1/);
});

test('directory scan walks and skips node_modules', () => {
  const r = run([...TOKENS, fx('proj')]);
  assert.equal(r.code, 1);
  assert.match(r.out, /bad\.css/);
  assert.doesNotMatch(r.out, /node_modules/);
});

const noStack = (out) => assert.doesNotMatch(out, /^\s+at /m);

test('trailing --tokens with no value exits 2 with usage', () => {
  const r = run(['--tokens']);
  assert.equal(r.code, 2);
  assert.match(r.out, /usage:/);
  noStack(r.out);
});

test('trailing --tokens after valid args exits 2 with usage', () => {
  const r = run([...TOKENS, fx('proj'), '--tokens']);
  assert.equal(r.code, 2);
  assert.match(r.out, /usage:/);
  noStack(r.out);
});

test('unknown option exits 2 naming the option, then usage', () => {
  const r = run([...TOKENS, '--bogus', fx('proj')]);
  assert.equal(r.code, 2);
  assert.match(r.out, /^verseva-hex-gate: unknown option: --bogus\nusage: verseva-hex-gate --tokens/);
  assert.doesNotMatch(r.out, /not found/);
  noStack(r.out);
});

test('missing tokens file exits 2 and names the path', () => {
  const r = run(['--tokens', 'nope.css', fx('proj')]);
  assert.equal(r.code, 2);
  assert.match(r.out, /not found: nope\.css/);
  noStack(r.out);
});

test('missing scan path exits 2 and names the path', () => {
  const r = run([...TOKENS, 'nope/']);
  assert.equal(r.code, 2);
  assert.match(r.out, /not found: nope\//);
  noStack(r.out);
});

test('directory scan skips generated output dirs', () => {
  const r = run([...TOKENS, fx('proj-skip')]);
  assert.equal(r.code, 0, r.out);
});

test('exit codes: 0 clean, 1 findings, 2 usage error', () => {
  const table = [
    { name: 'clean tree', args: [...TOKENS, fx('proj', 'good.css')], code: 0 },
    { name: 'finding', args: [...TOKENS, fx('proj', 'bad.css')], code: 1 },
    { name: 'unknown flag', args: [...TOKENS, '--bogus', fx('proj')], code: 2 },
    { name: 'missing operand', args: ['--tokens'], code: 2 },
  ];
  for (const { name, args, code } of table) {
    const r = run(args);
    assert.equal(r.code, code, `${name}: ${r.out}`);
  }
});

test('--help and -h print usage to stdout and exit 0', () => {
  for (const flag of ['--help', '-h']) {
    const r = run([flag]);
    assert.equal(r.code, 0);
    assert.match(r.out, /^usage: verseva-hex-gate --tokens/);
    assert.doesNotMatch(r.out, /Error|\n\s+at /);
  }
});

test('--version and -v print the package version and exit 0', () => {
  const { version } = JSON.parse(fs.readFileSync(path.join(here, '..', 'package.json'), 'utf8'));
  for (const flag of ['--version', '-v']) {
    const r = run([flag]);
    assert.equal(r.code, 0);
    assert.equal(r.out.trim(), version);
  }
});

function runSplit(args) {
  const r = spawnSync(process.execPath, [bin, ...args], { encoding: 'utf8' });
  return { code: r.status, stdout: r.stdout, stderr: r.stderr };
}

const NO_HEX_WARNING =
  /^verseva-hex-gate: warning: no hex values found in --tokens files \(.*rgb-tokens\.css\)$/m;

test('rgb-only tokens file warns on stderr; clean run still exits 0', () => {
  const rgb = fx('rgb-tokens.css');
  const r = runSplit(['--tokens', rgb, rgb]);
  assert.equal(r.code, 0, r.stderr);
  assert.match(r.stderr, NO_HEX_WARNING);
  assert.doesNotMatch(r.stdout, /warning/);
});

test('rgb-only tokens file warns on stderr; violations still exit 1', () => {
  const r = runSplit(['--tokens', fx('rgb-tokens.css'), fx('proj', 'bad.css')]);
  assert.equal(r.code, 1);
  assert.match(r.stderr, NO_HEX_WARNING);
});

test('tokens file with hexes prints no warning', () => {
  const r = runSplit([...TOKENS, fx('proj', 'good.css')]);
  assert.equal(r.code, 0);
  assert.doesNotMatch(r.stderr, /warning/);
});
