import { vitestBase } from '@souqstudio/config/vitest.base'

// This package is pure data and pure functions — no Prisma, no database, no
// setup file. The currency register is the reason it has tests at all: one of
// its columns is arithmetic rather than description, and a wrong row there
// prints a flyer at ten times or a tenth of the intended price.
export default vitestBase
