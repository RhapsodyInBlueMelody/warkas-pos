import { Elysia, t } from 'elysia'
import { Prisma, type PaymentMethod } from '@prisma/client'
import { prisma } from '../lib/prisma'
import { authMiddleware } from '../middleware/auth'
import { requireFeature } from '../lib/plan'

const DEFAULT_TZ_OFFSET_MIN = 7 * 60 // WIB
const DAY_MS = 24 * 60 * 60 * 1000
const ZERO = () => new Prisma.Decimal(0)

// ---------- tanggal ----------

/** "2026-10-24" -> ms UTC tengah malam untuk tanggal kalender itu, atau null bila tanggalnya tidak ada. */
export function parseLocalDate(date: string): number | null {
    const [y, m, d] = date.split('-').map(Number)
    const ms = Date.UTC(y, m - 1, d)
    const probe = new Date(ms)
    // Tolak 2026-02-31 dan sejenisnya (Date.UTC menggesernya ke bulan berikutnya).
    if (probe.getUTCFullYear() !== y || probe.getUTCMonth() !== m - 1 || probe.getUTCDate() !== d) return null
    return ms
}

const isoDate = (ms: number) => new Date(ms).toISOString().slice(0, 10)

/** Rentang [from, to) dalam UTC untuk hari-hari kalender lokal [startMs, endMs) (ms UTC tengah malam). */
export function utcRange(startMs: number, endMs: number, tzOffsetMin: number) {
    return {
        from: new Date(startMs - tzOffsetMin * 60_000),
        to: new Date(endMs - tzOffsetMin * 60_000),
    }
}

/** Tanggal kalender lokal (YYYY-MM-DD) dari sebuah waktu UTC. */
const localDay = (at: Date, tzOffsetMin: number) => isoDate(at.getTime() + tzOffsetMin * 60_000)

export const todayIn = (tzOffsetMin: number) => isoDate(Date.now() + tzOffsetMin * 60_000)

// ---------- data dan ringkasan ----------

type TrxRow = { totalPrice: Prisma.Decimal; paymentMethod: PaymentMethod; createdAt: Date }
type ItemRow = {
    quantity: number
    priceAtTime: Prisma.Decimal
    costAtTime: Prisma.Decimal | null
    product: { productId: string; name: string }
    transaction: { createdAt: Date }
}
type PayRow = { amount: Prisma.Decimal; createdAt: Date }

export async function loadRange(storeId: string, range: { from: Date; to: Date }) {
    const where = { storeId, createdAt: { gte: range.from, lt: range.to } }
    const [transactions, items, payments] = await Promise.all([
        prisma.transaction.findMany({
            where,
            select: { totalPrice: true, paymentMethod: true, createdAt: true },
        }),
        prisma.transactionItem.findMany({
            where: { transaction: where },
            select: {
                quantity: true,
                priceAtTime: true,
                costAtTime: true,
                product: { select: { productId: true, name: true } },
                transaction: { select: { createdAt: true } },
            },
        }),
        // Uang masuk dari pelunasan/cicilan bon pada rentang ini.
        prisma.debtEntry.findMany({
            where: { ...where, type: 'PAYMENT' },
            select: { amount: true, createdAt: true },
        }),
    ])
    return { transactions: transactions as TrxRow[], items: items as ItemRow[], payments: payments as PayRow[] }
}

/** Sisa seluruh utang pelanggan saat ini (bukan hanya pada rentang laporan). */
export async function debtOutstanding(storeId: string) {
    const ledger = await prisma.debtEntry.groupBy({
        by: ['type'],
        where: { storeId },
        _sum: { amount: true },
    })
    let total = ZERO()
    for (const row of ledger) {
        const sum = row._sum.amount ?? ZERO()
        total = row.type === 'CHARGE' ? total.plus(sum) : total.minus(sum)
    }
    return Number(total)
}

export function summarize(transactions: TrxRow[], items: ItemRow[], payments: PayRow[]) {
    let revenue = ZERO()
    const byPayment: Record<PaymentMethod, { count: number; revenue: Prisma.Decimal }> = {
        CASH: { count: 0, revenue: ZERO() },
        QRIS: { count: 0, revenue: ZERO() },
        TRANSFER: { count: 0, revenue: ZERO() },
        BON: { count: 0, revenue: ZERO() },
    }
    for (const trx of transactions) {
        revenue = revenue.plus(trx.totalPrice)
        byPayment[trx.paymentMethod].count += 1
        byPayment[trx.paymentMethod].revenue = byPayment[trx.paymentMethod].revenue.plus(trx.totalPrice)
    }

    // Untung hanya dihitung dari item yang punya modal. Item tanpa modal dipisahkan
    // supaya angka untung tidak terlihat lengkap padahal tidak.
    let costedRevenue = ZERO()
    let cost = ZERO()
    let uncostedItemCount = 0
    const perProduct = new Map<string, { name: string; quantity: number; revenue: Prisma.Decimal }>()

    for (const item of items) {
        const lineRevenue = item.priceAtTime.mul(item.quantity)
        if (item.costAtTime === null) {
            uncostedItemCount += 1
        } else {
            costedRevenue = costedRevenue.plus(lineRevenue)
            cost = cost.plus(item.costAtTime.mul(item.quantity))
        }

        const current = perProduct.get(item.product.productId)
            ?? { name: item.product.name, quantity: 0, revenue: ZERO() }
        current.quantity += item.quantity
        current.revenue = current.revenue.plus(lineRevenue)
        perProduct.set(item.product.productId, current)
    }

    let debtPaymentsReceived = ZERO()
    for (const p of payments) debtPaymentsReceived = debtPaymentsReceived.plus(p.amount)

    // Uang yang benar-benar masuk: penjualan non-bon + pelunasan bon.
    const cashIn = revenue.minus(byPayment.BON.revenue).plus(debtPaymentsReceived)

    const topProducts = [...perProduct.entries()]
        .map(([productId, v]) => ({ productId, name: v.name, quantity: v.quantity, revenue: Number(v.revenue) }))
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 5)

    return {
        transactionCount: transactions.length,
        revenue: Number(revenue),
        cost: Number(cost),
        profit: Number(costedRevenue.minus(cost)),
        // false bila ada item yang terjual tanpa harga modal; untung di atas hanya mencakup item bermodal.
        profitComplete: uncostedItemCount === 0,
        uncostedItemCount,
        uncostedRevenue: Number(revenue.minus(costedRevenue)),
        byPayment: {
            CASH: { count: byPayment.CASH.count, revenue: Number(byPayment.CASH.revenue) },
            QRIS: { count: byPayment.QRIS.count, revenue: Number(byPayment.QRIS.revenue) },
            TRANSFER: { count: byPayment.TRANSFER.count, revenue: Number(byPayment.TRANSFER.revenue) },
            BON: { count: byPayment.BON.count, revenue: Number(byPayment.BON.revenue) },
        },
        // revenue memuat penjualan bon (belum tentu sudah dibayar); cashIn hanya uang yang sudah masuk.
        debtPaymentsReceived: Number(debtPaymentsReceived),
        cashIn: Number(cashIn),
        topProducts,
    }
}

const queryBase = {
    date: t.Optional(t.String({ pattern: '^\\d{4}-\\d{2}-\\d{2}$' })),
    tzOffset: t.Optional(t.Numeric({ minimum: -720, maximum: 840 })),
}

export const reportRoutes = new Elysia()
    .use(authMiddleware)
    // Laporan harian untuk pemilik. Kasir tidak boleh melihat modal dan untung. Tersedia di semua paket.
    .get('/reports/daily', async ({ user, set, query }) => {
        if (user.role !== 'ADMIN') {
            set.status = 403
            return { message: 'Forbidden' }
        }

        const tzOffset = query.tzOffset ?? DEFAULT_TZ_OFFSET_MIN
        const date = query.date ?? todayIn(tzOffset)
        const startMs = parseLocalDate(date)
        if (startMs === null) {
            set.status = 400
            return { message: 'Tanggal tidak valid' }
        }

        const data = await loadRange(user.storeId, utcRange(startMs, startMs + DAY_MS, tzOffset))

        return {
            date,
            tzOffset,
            ...summarize(data.transactions, data.items, data.payments),
            debtOutstanding: await debtOutstanding(user.storeId),
        }
    }, {
        query: t.Object(queryBase)
    })
    // Laporan mingguan (Senin-Minggu) atau bulanan (tanggal 1 sampai akhir bulan) yang memuat `date`.
    // Hanya paket Toko. Menyertakan rincian per hari.
    .get('/reports/summary', async ({ user, set, query }) => {
        if (user.role !== 'ADMIN') {
            set.status = 403
            return { message: 'Forbidden' }
        }

        const denied = await requireFeature(user.storeId, 'extendedReports')
        if (denied) {
            set.status = denied.status
            return denied.body
        }

        const tzOffset = query.tzOffset ?? DEFAULT_TZ_OFFSET_MIN
        const anchorMs = parseLocalDate(query.date ?? todayIn(tzOffset))
        if (anchorMs === null) {
            set.status = 400
            return { message: 'Tanggal tidak valid' }
        }

        let startMs: number
        let endMs: number // eksklusif
        if (query.period === 'week') {
            const sinceMonday = (new Date(anchorMs).getUTCDay() + 6) % 7
            startMs = anchorMs - sinceMonday * DAY_MS
            endMs = startMs + 7 * DAY_MS
        } else {
            const a = new Date(anchorMs)
            startMs = Date.UTC(a.getUTCFullYear(), a.getUTCMonth(), 1)
            endMs = Date.UTC(a.getUTCFullYear(), a.getUTCMonth() + 1, 1)
        }

        const data = await loadRange(user.storeId, utcRange(startMs, endMs, tzOffset))

        // Kelompokkan per hari kalender lokal supaya transaksi tepat tengah malam jatuh ke hari yang benar.
        const buckets = new Map<string, { transactions: TrxRow[]; items: ItemRow[]; payments: PayRow[] }>()
        for (let ms = startMs; ms < endMs; ms += DAY_MS) {
            buckets.set(isoDate(ms), { transactions: [], items: [], payments: [] })
        }
        for (const trx of data.transactions) buckets.get(localDay(trx.createdAt, tzOffset))?.transactions.push(trx)
        for (const item of data.items) buckets.get(localDay(item.transaction.createdAt, tzOffset))?.items.push(item)
        for (const pay of data.payments) buckets.get(localDay(pay.createdAt, tzOffset))?.payments.push(pay)

        const days = [...buckets.entries()].map(([date, b]) => {
            const s = summarize(b.transactions, b.items, b.payments)
            return {
                date,
                transactionCount: s.transactionCount,
                revenue: s.revenue,
                cost: s.cost,
                profit: s.profit,
                profitComplete: s.profitComplete,
                cashIn: s.cashIn,
            }
        })

        return {
            period: query.period,
            from: isoDate(startMs),
            to: isoDate(endMs - DAY_MS), // inklusif
            tzOffset,
            ...summarize(data.transactions, data.items, data.payments),
            debtOutstanding: await debtOutstanding(user.storeId),
            days,
        }
    }, {
        query: t.Object({
            period: t.Union([t.Literal('week'), t.Literal('month')]),
            ...queryBase,
        })
    })
