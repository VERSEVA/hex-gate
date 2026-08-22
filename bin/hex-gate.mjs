#!/usr/bin/env node
/**
 * verseva-hex-gate: fails the build on any hex not drawn from your design
 * tokens. "No hand-picked colors" as pipeline, not code review.
 *
 * Usage:
 *   verseva-hex-gate --tokens <tokens.css> [--tokens <theme.css>]...
 *                    [--allow <path-substring>]... <file-or-dir>...
 *
 * Rules:
 * - The allowed set is every hex literal found in the --tokens files,
 *   normalized (lowercase, #rgb/#rgba expanded to #rrggbb/#rrggbbaa).
 * - Scans .css .scss .ts .tsx .js .jsx .mjs .cjs .html under the given
 *   paths; node_modules, .git, .next, dist, build, out are skipped.
 * - A line containing "hex-ok" is exempt (use for ratified third-party
 *   values, with a reason in the adjacent comment).
 * - All-digit 3/4-char matches (#123) are ignored: issue-ref guard.
 * - --allow skips any file whose path contains the given substring.
 * - Exit 1 with file:line listings on violations; exit 0 clean.
 */
import fs from 'node:fs';
import path from 'node:path';

const SCAN_EXT = new Set(['.css', '.scss', '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.html']);
const SKIP_DIRS = new Set(['node_modules', '.git', '.next', 'dist', 'build', 'out', '.turbo', '.vercel']);
const HEX_RE = /#([0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})\b/g;

function normalize(hex) {
  const h = hex.toLowerCase();
  if (h.length === 3 || h.length === 4) return [...h].map((c) => c + c).join('');
  return h;
}

function parseArgs(argv) {
  const tokens = [];
  const allow = [];
  const paths = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--tokens') tokens.push(argv[++i]);
    else if (argv[i] === '--allow') allow.push(argv[++i]);
    else paths.push(argv[i]);
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

const { tokens, allow, paths } = parseArgs(process.argv.slice(2));
if (tokens.length === 0 || paths.length === 0) {
  console.error('usage: verseva-hex-gate --tokens <tokens.css> [--tokens ...] [--allow <substr>] <paths...>');
  process.exit(2);
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
      if (line.includes('hex-ok')) return;
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
