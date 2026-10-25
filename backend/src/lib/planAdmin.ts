import type { Prisma } from '@prisma/client'
import { DAY_MS, type PlanName } from './plan'

export type Expiry = { days: number } | 'forever'

/**
 * Aktivasi paket manual oleh pemilik platform (tanpa payment gateway).
 * `identifier` boleh storeId atau username salah satu pengguna toko tersebut.
 * Paket TOKO wajib punya masa berlaku eksplisit (hari atau 'forever'); FREE menghapus masa berlaku.
 */
export async function setStorePlan(
    db: Prisma.TransactionClient,
    identifier: string,
    plan: PlanName,
    expiry?: Expiry,
    now = new Date()
) {
    const byId = await db.store.findUnique({ where: { storeId: identifier }, select: { storeId: true } })
    let storeId = byId?.storeId
    if (!storeId) {
        const user = await db.user.findUnique({
            where: { username: identifier.trim().toLowerCase() },
            select: { storeId: true },
        })
        storeId = user?.storeId
    }
    if (!storeId) throw new Error(`Toko tidak ditemukan untuk "${identifier}"`)

    if (plan === 'TOKO') {
        if (!expiry) throw new Error('Paket TOKO butuh masa berlaku: jumlah hari atau "forever"')
        if (expiry !== 'forever' && (!Number.isFinite(expiry.days) || expiry.days <= 0)) {
            throw new Error('Jumlah hari harus lebih dari 0')
        }
    }

    const planExpiresAt = plan === 'TOKO' && expiry && expiry !== 'forever'
        ? new Date(now.getTime() + expiry.days * DAY_MS)
        : null

    return db.store.update({
        where: { storeId },
        data: { plan, planIsTrial: false, planExpiresAt },
        select: { storeId: true, name: true, plan: true, planExpiresAt: true },
    })
}
