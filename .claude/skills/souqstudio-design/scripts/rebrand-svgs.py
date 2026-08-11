#!/usr/bin/env python3
"""
SouqStudio SVG rebranding
=========================
Recolours unDraw-style SVGs to the SouqStudio illustration palette and audits
the result against the rules in the souqstudio-design skill.

    python3 rebrand-svgs.py
    python3 rebrand-svgs.py --input ./raw --output ./branded --accent sky
    python3 rebrand-svgs.py --skin warm --strict

The palette
-----------
Illustrations are a charcoal line drawing over a sand ground with ONE accent.

    line / structure   #323232   sq-charcoal
    ground light       #F5F2E6   sand tint
    ground base        #EBE6CE   sq-sand
    ground deep        #DCD5B4   sand shade
    accent             #CFEB6B   sq-lime      (or #3F9DD1 sq-sky via --accent)

The skill's "two fills maximum" rule means two HUES, not two values. The three
sand steps are one hue and exist to keep form readable; the accent is the second.

Never emitted: sq-gold (#BDA25A) and the brand blue (#143CD2). Gold does not
appear in the application, and a blue fill reads as an interactive element.

Why this script audits
----------------------
unDraw's source palette is not stable. A map written against one batch of
downloads will silently miss colours in the next, leaving a stray purple or
blue-grey behind. Replacement alone cannot tell you that happened. After
remapping, every file is scanned and any colour outside the allowed set is
reported. --strict turns that into a non-zero exit for CI.

Dark mode
---------
Deliberately not implemented. SouqStudio has no dark theme; the editor canvas
surround is the only dark surface in the product and illustrations do not
appear on it. Add a second map here if that changes — do not invent one now.
"""

import re
import sys
import json
import argparse
import collections
from pathlib import Path


# ── Palette ───────────────────────────────────────────────────────────────────

# Light mode — charcoal line over a sand ground.
LIGHT = {
    'line':    '#323232',   # sq-charcoal
    'g_light': '#F5F2E6',   # barely separated from the page
    'g_base':  '#EBE6CE',   # sq-sand
    'g_deep':  '#DCD5B4',   # strongest ground shape
    'paper':   '#FFFFFF',   # cards, paper, highlights
    'blue':    '#143CD2',   # sq-blue
    'lime':    '#CFEB6B',   # sq-lime
    'sky':     '#3F9DD1',   # sq-sky
}

# Dark mode — the ladder inverts in lightness but preserves each shape's
# contrast RELATIONSHIP to the page. g_light is still the one that barely
# separates from the background; it is simply now barely lighter, not barely
# darker. The line inverts to light or the figure disappears.
#
# Assumes a dark page of #1E1E1C. That surface does not exist in the token
# file yet — see Known gaps in SKILL.md.
DARK = {
    'line':    '#EFEEE8',
    'g_light': '#262622',
    'g_base':  '#333330',
    'g_deep':  '#45453F',
    'paper':   '#55554E',
    'blue':    '#8AA1F1',   # sq-blue is too dark to read on a dark ground
    'lime':    '#CFEB6B',   # already works on dark
    'sky':     '#7EC0E4',
}

SKIN_PRESETS = {
    'preserve': None,
    'warm':  {'light': '#D9A183', 'dark': '#A9724F'},
    'deep':  {'light': '#B07A55', 'dark': '#7D4E30'},
    'olive': {'light': '#C9A17A', 'dark': '#94664A'},
}

FORBIDDEN = {
    '#bda25a': 'sq-gold — does not appear in the application',
}


# ── Source colours ────────────────────────────────────────────────────────────
# Observed across real unDraw exports. Includes near-miss variants (#9f616a vs
# #9e616a, #ff6584 vs #ff6582) because unDraw ships both.

STRUCTURE = [
    '#090814', '#2f2e41', '#3f3d56', '#3a3768', '#35383e',
    '#1a1a1a', '#000000', '#242424', '#2b2b2b',
]

GROUND_LIGHT = [
    '#f2f2f2', '#f0f0f0', '#fafafa', '#f1f1f1', '#f9f9f9', '#fcfcfc',
]

GROUND_BASE = [
    '#e6e6e6', '#e4e4e4', '#e5e5e5', '#ededed', '#eeeeee', '#e8e8e8',
]

GROUND_DEEP = [
    '#ccc', '#cccccc', '#cbcbcb', '#d6d6e3', '#e6e8ec', '#d0cde1',
    '#b3b3b3', '#bbbbbb', '#dfe4ea', '#dddddd', '#d9d9d9',
]

ACCENT = [
    '#6c63ff', '#ff6584', '#ff6582', '#575a89', '#4d4b7c', '#6c63ff',
]

SKIN_LIGHT = [
    '#ed9da0', '#ffb8b8', '#ffb6b6', '#feb8b8', '#fbbebe',
    '#ffcdd2', '#ffb9b9', '#ffc9c9',
]
SKIN_DARK = [
    '#9f616a', '#9e616a', '#a0616a', '#8d5560',
]
SKIN = SKIN_LIGHT + SKIN_DARK

WHITE = {'#ffffff'}

SKIN_PRESETS = {
    'preserve': None,
    'warm':  {'light': '#D9A183', 'dark': '#A9724F'},
    'deep':  {'light': '#B07A55', 'dark': '#7D4E30'},
    'olive': {'light': '#C9A17A', 'dark': '#94664A'},
}


def build_map(pal, accent_key, skin_preset, mode):
    m = {}
    for c in STRUCTURE:    m[c] = pal['line']
    for c in GROUND_LIGHT: m[c] = pal['g_light']
    for c in GROUND_BASE:  m[c] = pal['g_base']
    for c in GROUND_DEEP:  m[c] = pal['g_deep']
    for c in ACCENT:       m[c] = pal[accent_key]

    if mode == 'dark':
        m['#ffffff'] = pal['paper']

    tones = SKIN_PRESETS[skin_preset]
    if tones:
        for c in SKIN_LIGHT: m[c] = tones['light']
        for c in SKIN_DARK:  m[c] = tones['dark']
    return m


def allowed_set(pal, accent_key, skin_preset, mode):
    s = {pal['line'], pal['g_light'], pal['g_base'], pal['g_deep'],
         pal[accent_key], pal['paper'], '#ffffff'}
    tones = SKIN_PRESETS[skin_preset]
    s |= {tones['light'], tones['dark']} if tones else set(SKIN)
    return {c.lower() for c in s}


# ── Patterns ──────────────────────────────────────────────────────────────────

HEX_RE         = re.compile(r'#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})\b')
FILL_ATTR_RE   = re.compile(r'(fill=")([^"]+)(")', re.I)
STROKE_ATTR_RE = re.compile(r'(stroke=")([^"]+)(")', re.I)
FILL_STYLE_RE  = re.compile(r'(fill\s*:\s*)([^;}"\']+)', re.I)
STROKE_STYLE_RE= re.compile(r'(stroke\s*:\s*)([^;}"\']+)', re.I)
STOP_COLOR_RE  = re.compile(r'(stop-color\s*[:=]\s*"?)(#[0-9a-fA-F]{3,6})', re.I)
GRADIENT_RE    = re.compile(r'<(linear|radial)Gradient', re.I)
FILTER_RE      = re.compile(r'<filter[\s>]', re.I)
IMAGE_RE       = re.compile(r'<image[\s>]', re.I)
SIZE_RE        = re.compile(r'\s(width|height)="[^"]*"', re.I)


def norm(color):
    """Lowercase and expand 3-char hex so #fff and #ffffff compare equal."""
    c = color.strip().lower()
    if re.fullmatch(r'#[0-9a-f]{3}', c):
        c = '#' + ''.join(ch * 2 for ch in c[1:])
    return c


def remap(color, cmap):
    return cmap.get(norm(color), color)


def process(content, cmap):
    changes = collections.Counter()

    def attr(m):
        orig = m.group(2)
        new = remap(orig, cmap)
        if norm(new) != norm(orig):
            changes[(norm(orig), new)] += 1
        return m.group(1) + new + m.group(3)

    def style(m):
        orig = m.group(2).strip()
        new = remap(orig, cmap)
        if norm(new) != norm(orig):
            changes[(norm(orig), new)] += 1
        return m.group(1) + new

    for pat, fn in (
        (FILL_ATTR_RE, attr), (STROKE_ATTR_RE, attr),
        (FILL_STYLE_RE, style), (STROKE_STYLE_RE, style),
        (STOP_COLOR_RE, style),
    ):
        content = pat.sub(fn, content)
    return content, changes


def audit(content, allowed):
    """Return (unmapped_colours, structural_warnings)."""
    found = collections.Counter(norm(c) for c in HEX_RE.findall(content))
    stray = {c: n for c, n in found.items() if c not in allowed}

    warn = []
    if GRADIENT_RE.search(content):
        warn.append('contains a gradient — flatten before shipping')
    if FILTER_RE.search(content):
        warn.append('contains a filter (shadow/blur) — remove before shipping')
    if IMAGE_RE.search(content):
        warn.append('contains embedded raster — illustrations must be pure vector')
    for bad, why in FORBIDDEN.items():
        if bad in found:
            warn.append(f'uses {bad}: {why}')
    return stray, warn


# ── Classification ────────────────────────────────────────────────────────────

def to_hsl(hexcolor):
    h = norm(hexcolor).lstrip('#')
    r, g, b = (int(h[i:i + 2], 16) / 255 for i in (0, 2, 4))
    mx, mn = max(r, g, b), min(r, g, b)
    lig = (mx + mn) / 2
    if mx == mn:
        return 0.0, 0.0, lig
    d = mx - mn
    sat = d / (2 - mx - mn) if lig > 0.5 else d / (mx + mn)
    if mx == r:
        hue = ((g - b) / d) % 6
    elif mx == g:
        hue = (b - r) / d + 2
    else:
        hue = (r - g) / d + 4
    return hue * 60, sat, lig


def suggest_bucket(hexcolor):
    """Heuristic only. Every suggestion needs a human look before it is accepted."""
    hue, sat, lig = to_hsl(hexcolor)
    if lig < 0.28:
        return 'STRUCTURE'
    if sat < 0.15:
        if lig > 0.92: return 'GROUND_LIGHT'
        if lig > 0.80: return 'GROUND_BASE'
        if lig > 0.55: return 'GROUND_DEEP'
        return 'STRUCTURE'
    if (hue < 35 or hue > 340) and 0.25 < lig < 0.90:
        return 'SKIN'
    return 'ACCENT'


def report(args):
    """Scan sources and aggregate every colour the maps do not cover."""
    src = Path(args.input)
    cmap = build_map(LIGHT, args.accent, args.skin, 'light')
    known = set(cmap) | allowed_set(LIGHT, args.accent, args.skin, 'light')
    known |= {'none', 'transparent', '#ffffff'}

    files = sorted(f for f in src.rglob('*.svg')
                   if f.name not in {'logo.svg', 'icon.svg', 'color.svg'})

    counts, filecount, structural, examples = (
        collections.Counter(), collections.Counter(), collections.Counter(), {})

    for f in files:
        c = f.read_text(encoding='utf-8', errors='ignore')
        if GRADIENT_RE.search(c):  structural['gradient'] += 1
        if FILTER_RE.search(c):    structural['filter'] += 1
        if IMAGE_RE.search(c):     structural['raster'] += 1
        seen = set()
        for m in HEX_RE.findall(c):
            k = norm(m)
            if k in known:
                continue
            counts[k] += 1
            seen.add(k)
            examples.setdefault(k, f.name)
        for k in seen:
            filecount[k] += 1

    print(f'\n  Unmapped colour report — {len(files)} files\n')
    print('  ' + '-' * 72)
    if not counts:
        print('\n  Nothing unmapped. The palette covers this set.\n')
    else:
        print(f'  {"hex":<10}{"uses":>7}{"files":>7}  {"suggested":<14}first seen')
        print('  ' + '-' * 72)
        buckets = collections.defaultdict(list)
        for hexv, n in counts.most_common():
            b = suggest_bucket(hexv)
            buckets[b].append(hexv)
            print(f'  {hexv:<10}{n:>7}{filecount[hexv]:>7}  {b:<14}{examples[hexv]}')

        print('\n  ' + '-' * 72)
        print('\n  Paste into the source lists after reviewing each one:\n')
        for b in ['STRUCTURE', 'GROUND_LIGHT', 'GROUND_BASE',
                  'GROUND_DEEP', 'ACCENT', 'SKIN_LIGHT', 'SKIN_DARK']:
            if buckets.get(b):
                items = ', '.join(f"'{c}'" for c in sorted(buckets[b]))
                print(f'  {b} += [{items}]')

    if structural:
        print('\n  ' + '-' * 72)
        print('\n  Structural issues — these are not colour problems:\n')
        for k, n in structural.most_common():
            print(f'    {k:<10} {n} files')
        print('\n  Gradients and filters must be flattened in the source artwork.')
        print('  No colour map can fix them.')
    print()
    return 0


def run(args):
    if args.report:
        return report(args)

    src = Path(args.input)
    dst = Path(args.output)
    out_dirs = {'light': dst / 'light', 'dark': dst / 'dark'}
    for d in out_dirs.values():
        d.mkdir(parents=True, exist_ok=True)

    extra = {}
    if args.map_extra:
        extra = {norm(k): v for k, v in
                 json.loads(Path(args.map_extra).read_text()).items()}

    files = sorted(f for f in src.rglob('*.svg')
                   if f.name not in {'logo.svg', 'icon.svg', 'color.svg'})
    if not files:
        print(f'No SVGs found in {src}')
        return 0

    quiet = args.quiet or len(files) > 40

    print(f'\n  SouqStudio illustration rebrand')
    print(f'  accent : {args.accent}   skin : {args.skin}   modes : light + dark')
    print(f'  {len(files)} files -> {dst}/light  +  {dst}/dark')
    if extra:
        print(f'  {len(extra)} extra mappings from {args.map_extra}')
    print('\n  ' + '-' * 64)

    clean, flagged = 0, []

    for f in files:
        content = f.read_text(encoding='utf-8', errors='ignore')
        file_ok = True
        per_mode = {}

        for mode, pal in (('light', LIGHT), ('dark', DARK)):
            cmap = build_map(pal, args.accent, args.skin, mode)
            cmap.update(extra)
            allowed = allowed_set(pal, args.accent, args.skin, mode) | \
                      {norm(v) for v in extra.values()}

            out, changes = process(content, cmap)
            if args.strip_size and 'viewBox' in out:
                out = SIZE_RE.sub('', out, count=2)

            stray, warn = audit(out, allowed)
            (out_dirs[mode] / f.name).write_text(out, encoding='utf-8')
            per_mode[mode] = (changes, stray, warn)
            if stray or warn:
                file_ok = False

        if file_ok:
            clean += 1
        else:
            flagged.append(f.name)

        if quiet:
            continue

        print(f'\n  [{"ok " if file_ok else "FLAG"}] {f.name}')
        for mode in ('light', 'dark'):
            changes, stray, warn = per_mode[mode]
            print(f'      {mode:<6} {sum(changes.values())} swaps')
            for c, n in sorted(stray.items(), key=lambda kv: -kv[1]):
                print(f'         !! unmapped {c} ({n}x)')
            for w in warn:
                print(f'         !! {w}')

    print('\n  ' + '-' * 64)
    print(f'\n  {clean}/{len(files)} compliant in both modes')
    if flagged:
        print(f'  {len(flagged)} need attention')
        print('\n  Run with --report for the aggregate colour list.')
    if args.skin == 'preserve':
        print('\n  NOTE: skin tones left at unDraw defaults, which are pale pink.')
        print('        SouqStudio serves UAE/GCC retail — shop staff and customers')
        print('        in these illustrations should reflect that. Consider')
        print('        --skin warm | deep | olive, or supply your own tones.')
    print()
    return 1 if (flagged and args.strict) else 0


def parse_args():
    p = argparse.ArgumentParser(
        description='Recolour unDraw SVGs to the SouqStudio palette, light and dark, '
                    'and audit compliance.')
    p.add_argument('--input', '-i', default='/mnt/user-data/uploads')
    p.add_argument('--output', '-o',
                   default='/mnt/user-data/outputs/souqstudio-illustrations',
                   help='light/ and dark/ are created inside')
    p.add_argument('--accent', choices=['blue', 'lime', 'sky'], default='blue',
                   help='single accent hue (default: blue, the brand colour)')
    p.add_argument('--skin', choices=list(SKIN_PRESETS), default='preserve')
    p.add_argument('--report', action='store_true',
                   help='scan only: aggregate every unmapped colour with a '
                        'suggested bucket, and write nothing')
    p.add_argument('--map-extra', metavar='FILE.json',
                   help='JSON of additional {"#source": "#target"} mappings')
    p.add_argument('--strip-size', action='store_true')
    p.add_argument('--quiet', '-q', action='store_true',
                   help='summary only (automatic above 40 files)')
    p.add_argument('--strict', action='store_true',
                   help='exit non-zero if any file fails the audit')
    return p.parse_args()


if __name__ == '__main__':
    sys.exit(run(parse_args()))
