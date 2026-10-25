import 'dotenv/config'
import { prisma } from '../src/lib/prisma'
import { setStorePlan } from '../src/lib/planAdmin'

// Aktivasi paket manual. Contoh:
//   bun scripts/set-plan.ts budi TOKO 30        # 30 hari paket Toko untuk toko milik user "budi"
//   bun scripts/set-plan.ts <storeId> TOKO forever
//   bun scripts/set-plan.ts budi FREE
const [identifier, planArg, expiryArg] = process.argv.slice(2)
const plan = planArg?.toUpperCase()

async function main() {
    if (!identifier || (plan !== 'FREE' && plan !== 'TOKO')) {
        console.error('Pemakaian: bun scripts/set-plan.ts <storeId|username> <FREE|TOKO> [hari|forever]')
        process.exitCode = 2
        return
    }

    const expiry = expiryArg === 'forever'
        ? 'forever' as const
        : expiryArg ? { days: Number(expiryArg) } : undefined

    const store = await setStorePlan(prisma, identifier, plan, expiry)
    console.log(`Toko "${store.name}" (${store.storeId}) kini ${store.plan}` +
        (store.planExpiresAt ? `, berlaku sampai ${store.planExpiresAt.toISOString()}` : store.plan === 'TOKO' ? ', tanpa batas waktu' : ''))
}

main()
    .catch((e) => {
        console.error(e instanceof Error ? e.message : e)
        process.exitCode = 1
    })
    .finally(() => process.exit())
