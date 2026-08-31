import { prisma } from '../src/prisma.ts'

const examples = [
  { title: 'First note', content: 'Seeded from prisma/seed.ts' },
  { title: 'Second note', content: 'Delete these once you have real data.' },
]

async function main() {
  for (const example of examples) {
    // No unique field on Note to upsert against, so skip rows that already
    // exist by title — this keeps re-running the seed idempotent.
    const existing = await prisma.note.findFirst({ where: { title: example.title } })
    if (existing) {
      console.log(`[seed] skipping "${example.title}" (already present)`)
      continue
    }
    const created = await prisma.note.create({ data: example })
    console.log(`[seed] created note ${created.id}: ${created.title}`)
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err)
    await prisma.$disconnect()
    process.exit(1)
  })
