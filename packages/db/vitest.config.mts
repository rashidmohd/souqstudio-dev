import { vitestBase } from '@souqstudio/config/vitest.base'

// The pure half of this package — the Open Food Facts mapping and the promo-tier
// data. No Prisma, no database, no setup file; anything needing a connection is
// checked by running it, not here.
export default vitestBase
