#!/usr/bin/env python3
"""
Catalog retargeting
===================
The illustration catalog was written for a different product — one built around
calls and sessions. 128 of 385 descriptions mention sessions, 75 mention calls,
and none mention shops, offers, prices or catalogs. Every description has the
same two-part shape:

    "A person reviewing and accepting an assigned task or checklist.
     Use for call assignment confirmation or session acceptance screens."
     ^ depiction: product-neutral, accurate, keep
                                    ^ guidance: written for another product, wrong

This script keeps the depiction and drops the guidance, because the depiction is
the only part worth matching on. It then attaches hand-written `souqUse` notes to
the curated shortlist below.

It deliberately does NOT generate guidance for all 385. Inventing a plausible
retail use-case for a picture nobody has looked at is exactly how the wrong
guidance got in there the first time. Entries without `souqUse` are matched on
depiction alone, which is what references/illustration-selection.md instructs.

    python3 retarget-catalog.py
    python3 retarget-catalog.py --in raw.json --out catalog.json
"""

import re
import json
import argparse
import collections
from pathlib import Path

USE_RE = re.compile(r'\s*(?:Use|Ideal|Good|Best|Suitable|Works|Perfect|Useful)\b.*$',
                    re.S)

# Tags carried over from the previous product's domain. Removed outright —
# they will only ever produce false matches on a retail screen.
FOREIGN_TAGS = {
    'session', 'sessions', 'call', 'calls', 'agent', 'agents', 'caller',
    'patient', 'patients', 'ticket', 'tickets', 'claim', 'claims',
    'policy', 'policies', 'insurance', 'telehealth', 'appointment',
    'appointments', 'consultation', 'triage',
}

# Hand-written, tied to what the depiction sentence says — not to the file name.
# Extend as pieces are reviewed. Confirm the depiction is accurate before trusting
# any of these; none of the artwork has been viewed.
SOUQ_USE = {
    'fill-the-blanks':           'Offer books list, first run — before the owner has created anything.',
    'empty':                     'Alternative first-run empty state. Reads flatter than fill-the-blanks; prefer it only if the drawing is warmer than the name suggests.',
    'new-ideas':                 'Prompt to start the first offer book, after brand setup completes.',

    'statistic-chart':           'Analytics, before a book has been published and there is nothing to chart.',
    'visual-data':               'Analytics alternative. Pick one and keep it — do not alternate between the two.',
    'analytics':                 'Analytics alternative.',

    'meet-the-team':             'Team screen when the org has one user and no invites sent.',
    'good-team':                 'Team screen alternative.',
    'founding-team':             'Team screen alternative.',

    'add-color':                 'Brand kit setup — the step where the owner picks their colours.',
    'creative-designer':         'Brand kit setup, opening step.',
    'making-art':                'Brand kit setup alternative.',

    'adjust-settings':           'Shop details step during onboarding.',
    'preferences-popup':         'Shop settings, or the shop details onboarding step.',
    'my-workspace':              'Shop setup alternative. Object-led rather than figure-led, so do not mix it into a flow that uses figures.',

    'ideation':                  'First offer book prompt.',
    'writing-down-ideas':        'First offer book prompt alternative.',
    'work-in-progress':          'Draft offer book with no products added yet.',

    'select-character':          'AI character creation, intro screen before the staff photo is uploaded.',
    'professional-woman-avatar': 'AI character result preview. Must carry the machine-output marker.',
    'virtual-assistant':         'AI features explainer.',

    'shared-workspace':          'Sharing step, before a book has been sent anywhere.',
    'work-chat':                 'WhatsApp sharing explainer.',
    'unread-messages':           'Sharing alternative.',

    'upload-warning':            'PDF or image export failed.',
    'warnings':                  'Export failure alternative.',
    'connection-lost':           'Offline or network failure, full page.',
    'lost':                      '404, full page.',
    'problem-solving':           'Generic error boundary.',

    'upgrade':                   'Plan comparison and upgrade screen.',
    'wallet':                    'Billing screen with no payment method on file.',
    'enter-payment-info':        'Adding a card during checkout or plan change.',

    'celebration':               'First successful publish — a milestone the owner reaches once.',
    'successful':                'Publish confirmation alternative.',
    'project-completed':         'Offer book completed and exported.',
}


def depiction(text):
    """Keep the first, product-neutral part. Drop the guidance clause."""
    return USE_RE.sub('', text).strip()


def retarget(entries):
    stats = collections.Counter()
    out = []
    for e in entries:
        original = e['description']
        d = depiction(original)
        if d != original:
            stats['guidance stripped'] += 1
        if not d.endswith('.'):
            d += '.'

        tags = [t for t in e['tags'] if t.lower() not in FOREIGN_TAGS]
        stats['foreign tags removed'] += len(e['tags']) - len(tags)

        new = {'id': e['id'], 'filename': e['filename'], 'name': e['name'],
               'description': d, 'tags': tags}

        if e['id'] in SOUQ_USE:
            new['souqUse'] = SOUQ_USE[e['id']]
            stats['souqUse attached'] += 1

        out.append(new)
    return out, stats


def main():
    p = argparse.ArgumentParser(description='Retarget the illustration catalog to SouqStudio.')
    p.add_argument('--in', dest='src', default='assets/illustration-catalog.json')
    p.add_argument('--out', dest='dst', default='assets/illustration-catalog.json')
    a = p.parse_args()

    entries = json.loads(Path(a.src).read_text())
    out, stats = retarget(entries)
    Path(a.dst).write_text(json.dumps(out, indent=1, ensure_ascii=False))

    print(f'\n  {len(out)} entries -> {a.dst}\n')
    for k, v in stats.most_common():
        print(f'    {k:<24} {v}')
    missing = len(out) - stats['souqUse attached']
    print(f'\n    {missing} entries carry depiction only. That is correct — they are')
    print( '    matched on what they show, per references/illustration-selection.md.')
    print( '    Add to SOUQ_USE here as you review pieces and adopt them.\n')


if __name__ == '__main__':
    main()
