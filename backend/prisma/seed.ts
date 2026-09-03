import { DEFAULT_CATEGORIES } from '../src/categories.ts'
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
  // Categories are left alone and upserted below instead: deleting them would
  // orphan nothing here, but it would churn their ids on every re-seed.
  await prisma.transaction.deleteMany({ where: { userId: user.id } })
  await prisma.receipt.deleteMany({ where: { userId: user.id } })

  // The same starter set a real account gets at sign-up. Upserted rather than
  // created so re-running the seed is idempotent.
  const categories = new Map<string, number>()
  for (const name of DEFAULT_CATEGORIES) {
    const category = await prisma.category.upsert({
      where: { userId_name: { userId: user.id, name } },
      update: {},
      create: { userId: user.id, name },
    })
    categories.set(name, category.id)
  }
  console.log(`[seed] categories: ${DEFAULT_CATEGORIES.join(', ')}`)

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
        // Inherits the receipt's day, not the day the row was seeded.
        date: receipt.date,
        merchantName: 'Whole Foods Market',
        amount: '48.75',
        categoryId: categories.get('Groceries')!,
      },
    }),
    prisma.transaction.create({
      data: {
        userId: user.id,
        receiptId: null,
        // A different month from the receipt-backed one, so date ordering and
        // any month filter actually have something to separate.
        date: new Date('2026-09-01T00:00:00.000Z'),
        merchantName: 'Transport for London',
        amount: '2.80',
        categoryId: categories.get('Transport')!,
      },
    }),
  ])
  for (const t of transactions) {
    console.log(
      `[seed] transaction ${t.id}: ${t.merchantName} ${t.amount} on ${t.date.toISOString().slice(0, 10)} (receiptId=${t.receiptId})`,
    )
  }

  // Two months apart on purpose: August's groceries limit is what September
  // *inherits*, and September's own row is what overrides it. A seed with a
  // single month would let a broken inheritance lookup still look right.
  const budgets: [string, string, string][] = [
    ['Groceries', '2026-08', '400.00'],
    ['Groceries', '2026-09', '450.00'],
    ['Transport', '2026-08', '75.00'],
  ]
  for (const [name, month, amount] of budgets) {
    const categoryId = categories.get(name)!
    await prisma.budget.upsert({
      where: { userId_categoryId_month: { userId: user.id, categoryId, month } },
      update: { amount },
      create: { userId: user.id, categoryId, month, amount },
    })
    console.log(`[seed] budget: ${name} ${month} ${amount}`)
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err)
    await prisma.$disconnect()
    process.exit(1)
  })
