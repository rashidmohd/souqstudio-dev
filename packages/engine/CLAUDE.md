# @souqstudio/engine

The layout engine. Given a master page grid, a product list and a set of pins, it
produces the pages of an offer book: which block renders where, at what rectangle,
carrying which offer.

Read `docs/composition-model.md` before changing anything here.

## Why it is a package

It runs in two places — in the browser for the editor, and in the worker for
export. **One implementation, always.** Two would drift, and drift here means the
PDF does not match the screen. That is why this is not `apps/web/lib`.

## What belongs here

Pure functions over plain data. No Prisma, no Fabric, no React, no I/O.

The engine decides geometry and assignment. Fabric renders what it decides and
owns nothing else — E6 §1.

## What does not belong here

- Rendering. The engine returns rectangles; something else draws in them.
- Overrides. `SlotOverride` is a bounded delta applied *after* the engine runs.
- Anything that reads the database.
