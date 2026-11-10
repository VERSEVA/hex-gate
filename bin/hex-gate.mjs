#!/usr/bin/env node
/**
 * verseva-hex-gate: fails the build on any hex not drawn from your design
 * tokens. "No hand-picked colors" as pipeline, not code review.
 *
 * Usage:
 *   verseva-hex-gate --tokens <tokens.css> [--tokens <theme.css>]...
 *                    [--allow <path-substring>]... <file-or-dir>...
 *   verseva-hex-gate --help | -h        print usage, exit 0
 *   verseva-hex-gate --version | -v     print package version, exit 0
 *
 * Rules:
 * - The allowed set is every hex literal found in the --tokens files,
 *   normalized (lowercase, #rgb/#rgba expanded to #rrggbb/#rrggbbaa).
 * - Scans .css .scss .ts .tsx .js .jsx .mjs .cjs .html under the given
 *   paths; node_modules, .git, .next, dist, build, out are skipped.
 * - A line containing "hex-ok" as a whole token is exempt (use for ratified
 *   third-party values, with a reason in the adjacent comment).
 * - All-digit 3/4-char matches (#123) are ignored: issue-ref guard.
 * - --allow skips any file whose path contains the given substring.
 * - Exit 0 clean; exit 1 with file:line listings on violations;
 *   exit 2 on usage errors.
 */
import fs from 'node:fs';
import path from 'node:path';

const SCAN_EXT = new Set(['.css', '.scss', '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.html']);
const SKIP_DIRS = new Set(['node_modules', '.git', '.next', 'dist', 'build', 'out', '.turbo', '.vercel',
  'coverage', '.output', '.nuxt', '.cache', 'storybook-static']);
const HEX_RE = /#([0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})\b/g;
// Whole-token marker: no word char or hyphen on either side, so "hex-okay",
// "prefixhex-ok" and "hex-ok-dark" do not exempt a line.
const HEX_OK_RE = /(?<![\w-])hex-ok(?![\w-])/;

function normalize(hex) {
  const h = hex.toLowerCase();
  if (h.length === 3 || h.length === 4) return [...h].map((c) => c + c).join('');
  return h;
}

const USAGE = 'usage: verseva-hex-gate --tokens <tokens.css> [--tokens ...] [--allow <substr>] <paths...>';

function usage() {
  console.error(USAGE);
  process.exit(2);
}

function parseArgs(argv) {
  const tokens = [];
  const allow = [];
  const paths = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--tokens' || arg === '--allow') {
      const value = argv[++i];
      if (value === undefined || value.startsWith('--')) usage();
      (arg === '--tokens' ? tokens : allow).push(value);
    } else paths.push(arg);
  }
  return { tokens, allow, paths };
}

function* walk(p) {
  const st = fs.statSync(p);
  if (st.isFile()) {
    yield p;
    return;
  }
  for (const entry of fs.readdirSync(p, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) yield* walk(path.join(p, entry.name));
    } else if (SCAN_EXT.has(path.extname(entry.name))) {
      yield path.join(p, entry.name);
    }
  }
}

function hexesIn(text) {
  const found = [];
  for (const m of text.matchAll(HEX_RE)) {
    const raw = m[1];
    if (raw.length <= 4 && /^[0-9]+$/.test(raw)) continue; // issue-ref guard
    found.push({ raw: m[0], norm: normalize(raw) });
  }
  return found;
}

const argv = process.argv.slice(2);
if (argv.includes('--help') || argv.includes('-h')) {
  console.log(USAGE);
  process.exit(0);
}
if (argv.includes('--version') || argv.includes('-v')) {
  const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  console.log(pkg.version);
  process.exit(0);
}

const { tokens, allow, paths } = parseArgs(argv);
if (tokens.length === 0 || paths.length === 0) usage();
for (const p of [...tokens, ...paths]) {
  if (!fs.existsSync(p)) {
    console.error(`verseva-hex-gate: not found: ${p}`);
    process.exit(2);
  }
}

const allowed = new Set();
for (const t of tokens) {
  for (const { norm } of hexesIn(fs.readFileSync(t, 'utf8'))) allowed.add(norm);
}
const tokenFiles = new Set(tokens.map((t) => path.resolve(t)));

const violations = [];
for (const root of paths) {
  for (const file of walk(root)) {
    const abs = path.resolve(file);
    if (tokenFiles.has(abs)) continue;
    if (allow.some((a) => abs.includes(a))) continue;
    const lines = fs.readFileSync(file, 'utf8').split('\n');
    lines.forEach((line, i) => {
      if (HEX_OK_RE.test(line)) return;
      for (const { raw, norm } of hexesIn(line)) {
        if (!allowed.has(norm)) violations.push(`${file}:${i + 1}  ${raw}`);
      }
    });
  }
}

if (violations.length) {
  console.error(`verseva-hex-gate: ${violations.length} off-token hex${violations.length === 1 ? '' : 'es'}\n`);
  for (const v of violations) console.error(`  ${v}`);
  console.error('\nDraw the value from tokens.css / the brand theme, or mark a ratified exception with "hex-ok".');
  process.exit(1);
}
console.log(`verseva-hex-gate: clean (${allowed.size} token hexes authorized)`);
