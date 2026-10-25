import { prisma } from './prisma'

export type PlanName = 'FREE' | 'TOKO'
export type Feature = 'bon' | 'extendedReports' | 'export'

export const DAY_MS = 24 * 60 * 60 * 1000
export const TRIAL_DAYS = 14
export const FREE_MAX_PRODUCTS = 50

export const PLAN_FEATURES: Record<PlanName, Record<Feature, boolean>> = {
    FREE: { bon: false, extendedReports: false, export: false },
    TOKO: { bon: true, extendedReports: true, export: true },
}

const FEATURE_MESSAGES: Record<Feature, string> = {
    bon: 'Buku bon tersedia di paket Toko.',
    extendedReports: 'Laporan mingguan dan bulanan tersedia di paket Toko.',
    export: 'Ekspor Excel tersedia di paket Toko.',
}

type PlanFields = { plan: PlanName; planExpiresAt: Date | null; planIsTrial?: boolean }

/**
 * Paket yang berlaku saat ini. Paket TOKO yang sudah lewat planExpiresAt dianggap FREE
 * tanpa perlu tugas terjadwal; kolom `plan` tetap menyimpan paket terakhir yang diaktifkan.
 */
export function effectivePlan(store: Pick<PlanFields, 'plan' | 'planExpiresAt'>, now = new Date()): PlanName {
    if (store.plan === 'TOKO' && (store.planExpiresAt === null || store.planExpiresAt.getTime() > now.getTime())) {
        return 'TOKO'
    }
    return 'FREE'
}

export function planView(store: PlanFields, now = new Date()) {
    const plan = effectivePlan(store, now)
    const expiresAt = store.plan === 'TOKO' ? store.planExpiresAt : null
    return {
        plan,
        storedPlan: store.plan,
        isTrial: plan === 'TOKO' && Boolean(store.planIsTrial),
        expiresAt,
        daysLeft: plan === 'TOKO' && expiresAt
            ? Math.max(0, Math.ceil((expiresAt.getTime() - now.getTime()) / DAY_MS))
            : null,
    }
}

/** Mengembalikan null bila fitur boleh dipakai, atau respons 402 siap kirim bila tidak. */
export async function requireFeature(storeId: string, feature: Feature) {
    const store = await prisma.store.findUnique({
        where: { storeId },
        select: { plan: true, planExpiresAt: true },
    })
    if (store && PLAN_FEATURES[effectivePlan(store)][feature]) return null

    return {
        status: 402 as const,
        body: {
            message: FEATURE_MESSAGES[feature],
            code: 'PLAN_REQUIRED' as const,
            feature,
            upgradeTo: 'TOKO' as const,
        },
    }
}
