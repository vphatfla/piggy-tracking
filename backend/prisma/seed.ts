import { prisma } from '../src/prisma.ts'

// Stable fake Google `sub` — makes the seed idempotent via upsert.
const GOOGLE_ID = 'seed-google-sub-000000000001'

async function main() {
  // Upsert on googleId so re-running the seed updates rather than duplicating.
  const user = await prisma.user.upsert({
    where: { googleId: GOOGLE_ID },
    update: {},
    create: {
      firstName: 'Ada',
      lastName: 'Lovelace',
      email: 'ada@example.com',
      googleId: GOOGLE_ID,
      phoneNumber: '+1-555-0100',
      location: 'London, UK',
      yearOfBirth: 1990,
    },
  })
  console.log(`[seed] user ${user.id}: ${user.firstName} ${user.lastName}`)

  // Wipe this user's existing rows so the seed always lands in a known state.
  await prisma.transaction.deleteMany({ where: { userId: user.id } })
  await prisma.receipt.deleteMany({ where: { userId: user.id } })

  const receipt = await prisma.receipt.create({
    data: {
      userId: user.id,
      date: new Date('2026-08-24T00:00:00.000Z'),
      totalAmount: '48.75',
      receiptFileName: 'wholefoods-2026-08-24.pdf',
    },
  })
  console.log(`[seed] receipt ${receipt.id}: ${receipt.totalAmount} on ${receipt.date.toISOString().slice(0, 10)}`)

  // One transaction attached to the receipt, one standalone (receiptId null).
  const transactions = await Promise.all([
    prisma.transaction.create({
      data: {
        userId: user.id,
        receiptId: receipt.id,
        merchantName: 'Whole Foods Market',
        amount: '48.75',
        category: 'Groceries',
      },
    }),
    prisma.transaction.create({
      data: {
        userId: user.id,
        receiptId: null,
        merchantName: 'Transport for London',
        amount: '2.80',
        category: 'Transport',
      },
    }),
  ])
  for (const t of transactions) {
    console.log(`[seed] transaction ${t.id}: ${t.merchantName} ${t.amount} (receiptId=${t.receiptId})`)
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err)
    await prisma.$disconnect()
    process.exit(1)
  })
