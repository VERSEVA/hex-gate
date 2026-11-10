import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';

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

test('clean fixture tree with only good.css exits 0 with zero-finding summary', () => {
  const r = run([...TOKENS, fx('proj-clean')]);
  assert.equal(r.code, 0, r.out);
  assert.equal(r.out, 'verseva-hex-gate: clean (4 token hexes authorized)\n');
  assert.doesNotMatch(r.out, /off-token/);
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

test('--allow is repeatable: each substring skips its file, others still fail', () => {
  const r = run([
    ...TOKENS,
    '--allow', 'legacy',
    '--allow', 'third-party',
    fx('proj-allow'),
    fx('proj-allow-extra'),
  ]);
  assert.equal(r.code, 1, r.out);
  const findings = r.out.split('\n').filter((l) => /\.css:\d+/.test(l));
  assert.equal(findings.length, 1, r.out);
  assert.match(findings[0], /off-token\.css:1\s+#FF00AA/i);
  assert.doesNotMatch(r.out, /legacy-vendor\.css|third-party\.css/);
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

test('--tokens/--allow with a missing value or a following flag exit 2 with usage on stderr', () => {
  const cases = [
    ['--tokens'],
    ['--tokens', '--allow', 'x', fx('proj')],
    ['--allow'],
    ['--allow', '--tokens', fx('tokens.css'), fx('proj')],
  ];
  for (const args of cases) {
    const r = runSplit(args);
    assert.equal(r.code, 2, args.join(' '));
    assert.equal(r.stdout, '', args.join(' '));
    assert.match(r.stderr, /^usage: verseva-hex-gate --tokens/m, args.join(' '));
    noStack(r.stderr);
  }
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

// Temp dir holding a dangling x.css symlink, an on-token good.css and,
// optionally, an off-token bad.css. Returns the dir and the spawn result.
function scanWithDanglingLink({ withBad }) {
  const dir = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'hex-gate-dangling-'));
  try {
    fs.symlinkSync(path.join(dir, 'missing-target.css'), path.join(dir, 'x.css'));
    fs.writeFileSync(path.join(dir, 'good.css'), '.a { color: #0B0D10; }\n');
    if (withBad) fs.writeFileSync(path.join(dir, 'bad.css'), '.b { color: #FF00AA; }\n');
    const r = spawnSync(process.execPath, [bin, ...TOKENS, dir], { encoding: 'utf8' });
    return { dir, r };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test('dangling .css symlink is skipped with a warning and the run stays clean', () => {
  const { dir, r } = scanWithDanglingLink({ withBad: false });
  assert.equal(r.status, 0, r.stderr);
  assert.ok(r.stderr.includes(`verseva-hex-gate: skipped unreadable ${path.join(dir, 'x.css')}`), r.stderr);
  assert.doesNotMatch(r.stderr, /ENOENT|\n\s+at /);
});

test('dangling .css symlink does not hide an off-token file next to it', () => {
  const { r } = scanWithDanglingLink({ withBad: true });
  assert.equal(r.status, 1, r.stderr);
  assert.match(r.stderr, /bad\.css:1/);
  assert.match(r.stderr, /skipped unreadable/);
});

test('two off-token hexes on one line are listed separately with the same line', () => {
  const r = runSplit([...TOKENS, fx('cases', 'multi.css')]);
  assert.equal(r.code, 1);
  assert.match(r.stderr, /2 off-token hexes\n/);
  assert.match(r.stderr, /multi\.css:2 {2}#FF00AA$/m);
  assert.match(r.stderr, /multi\.css:2 {2}#00FF11$/m);
});

const ALPHA_TOKENS = ['--tokens', fx('cases', 'alpha-tokens.css')];

test('8-digit and 4-digit alpha hexes are authorized by a matching token', () => {
  const r = runSplit([...ALPHA_TOKENS, fx('cases', 'alpha-ok.css')]);
  assert.equal(r.code, 0, r.stderr);
});

test('8-digit and 4-digit alpha hexes off the token set are flagged', () => {
  const r = runSplit([...ALPHA_TOKENS, fx('cases', 'alpha-bad.css')]);
  assert.equal(r.code, 1);
  assert.match(r.stderr, /alpha-bad\.css:1 {2}#11223355$/m);
  assert.match(r.stderr, /alpha-bad\.css:2 {2}#ABCE$/m);
});

test('3-char hex with letters is not swallowed by the issue-ref guard', () => {
  const r = runSplit([...TOKENS, fx('cases', 'short-letters.css')]);
  assert.equal(r.code, 1);
  assert.match(r.stderr, /short-letters\.css:1 {2}#abc$/m);
});

test('CRLF line endings keep correct line numbers', () => {
  // Built at runtime so git's autocrlf setting cannot rewrite the endings.
  const dir = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'hex-gate-crlf-'));
  try {
    const file = path.join(dir, 'crlf.css');
    fs.writeFileSync(file, '/* crlf */\r\n.x {\r\n  color: #FF00AA;\r\n}\r\n');
    const r = runSplit([...TOKENS, file]);
    assert.equal(r.code, 1);
    assert.match(r.stderr, /crlf\.css:3 {2}#FF00AA$/m);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('a single violation uses the singular "1 off-token hex"', () => {
  const r = runSplit([...TOKENS, fx('proj', 'bad.css')]);
  assert.equal(r.code, 1);
  assert.match(r.stderr, /^verseva-hex-gate: 1 off-token hex\n/m);
  assert.doesNotMatch(r.stderr, /off-token hexes/);
});

test('a single file path does not scan sibling files', () => {
  const r = run([...TOKENS, fx('siblings', 'good.css')]);
  assert.equal(r.code, 0, r.out);
  assert.doesNotMatch(r.out, /bad\.css/);
  assert.doesNotMatch(r.out, /#FF00AA/i);
});

test('a single bad file path reports that file and not its sibling', () => {
  const r = run([...TOKENS, fx('siblings', 'bad.css')]);
  assert.equal(r.code, 1);
  assert.match(r.out, /siblings[\\/]bad\.css:1 {2}#FF00AA/);
  assert.doesNotMatch(r.out, /good\.css/);
});

test('hex matching is case-insensitive between tokens and source, both directions', () => {
  const upper = runSplit(['--tokens', fx('cases', 'case-tokens-upper.css'), fx('cases', 'case-src-lower.css')]);
  assert.equal(upper.code, 0, upper.stderr);
  const lower = runSplit(['--tokens', fx('cases', 'case-tokens-lower.css'), fx('cases', 'case-src-upper.css')]);
  assert.equal(lower.code, 0, lower.stderr);
});
