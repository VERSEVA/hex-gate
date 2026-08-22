# hex-gate

Fail the build on any hex color not drawn from your design tokens.

Design systems die by a thousand hand-picked hexes: a `#f4f4f5` here because the token was two
files away, a `bg-[#12E4B0]` there because the deadline was close. Code review catches some.
A pipeline gate catches all of them, including the ones your AI coding agent invents.

Zero dependencies, one file, Node 18+.

## Install

```bash
npm i -D @verseva/hex-gate
```

## Use

```bash
verseva-hex-gate --tokens src/tokens.css src
```

Every hex literal found in your `--tokens` files becomes the allowed set; everything else in
the scanned tree fails the build:

```
verseva-hex-gate: 2 off-token hexes

  src/legacy/promo.css:2  #FF00AA
  src/app/page.tsx:14  #12E4B0

Draw the value from tokens.css / the brand theme, or mark a ratified exception with "hex-ok".
```

Wire it ahead of your build:

```json
"scripts": {
  "lint:hex": "verseva-hex-gate --tokens src/tokens.css --tokens src/theme.css src",
  "build": "npm run lint:hex && next build"
}
```

## What it scans

`.css` `.scss` `.ts` `.tsx` `.js` `.jsx` `.mjs` `.cjs` `.html`, recursively; `node_modules`,
`.git`, `.next`, `dist`, `build`, `out` are skipped. Tailwind arbitrary values
(`bg-[#12E4B0]`) are caught like any other literal.

## Rules

- **Tokens files define the allowed set.** Pass `--tokens` more than once (base tokens plus a
  brand theme). Hexes are normalized, so `#fff` authorizes `#ffffff` and vice versa.
- **`hex-ok`** on a line marks a deliberate exception (a third-party embed, a ratified
  one-off). Put the reason in the adjacent comment; the marker is greppable later.
- **`--allow <path-substring>`** (repeatable) skips whole files: vendored code, generated
  output.
- **All-digit 3/4-char matches (`#123`, `#4567`) are ignored** so issue references in comments
  don't trip the gate.
- Exit `0` clean, `1` with a `file:line hex` listing on violations, `2` on usage errors.

## Why not a stylelint/ESLint rule?

Those see one language each. Your colors leak through CSS, TSX class strings, inline styles,
and template literals at once; one zero-dependency scanner over the whole tree closes every
door with a single allowed set. If you want editor squiggles too, run a lint rule as well;
this is the gate that decides whether the build ships.

---

Built and used in production by [VERSEVA](https://github.com/verseva).
