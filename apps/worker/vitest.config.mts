import { vitestBase } from '@souqstudio/config/vitest.base'

// The worker's pure modules — the matte analysis today. Handlers talk to Rembg,
// R2 and Postgres and are checked by running them, not here.
export default vitestBase
