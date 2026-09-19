import { prisma } from './src/index.js'
const rows = await prisma.$queryRawUnsafe(
  "SELECT column_name FROM information_schema.columns WHERE table_name='image_assets' ORDER BY column_name"
)
console.log(rows.map((r) => r.column_name).join(', '))
await prisma.$disconnect()
