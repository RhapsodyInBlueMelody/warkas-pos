import { Elysia, t } from 'elysia'
import { Prisma } from '@prisma/client'
import { prisma } from '../lib/prisma'
import { authMiddleware } from '../middleware/auth'

const DEFAULT_TZ_OFFSET_MIN = 7 * 60 // WIB
const DAY_MS = 24 * 60 * 60 * 1000

/** Rentang [from, to) dalam UTC untuk satu hari kalender pada zona waktu dengan offset menit tertentu. */
function dayRange(date: string, tzOffsetMin: number): { from: Date; to: Date } | null {
    const [y, m, d] = date.split('-').map(Number)
    const probe = new Date(Date.UTC(y, m - 1, d))
    // Tolak tanggal yang tidak ada, mis. 2026-02-31 (Date.UTC akan menggeser ke bulan berikutnya).
    if (probe.getUTCFullYear() !== y || probe.getUTCMonth() !== m - 1 || probe.getUTCDate() !== d) {
        return null
    }
    const from = new Date(probe.getTime() - tzOffsetMin * 60_000)
    return { from, to: new Date(from.getTime() + DAY_MS) }
}

function todayIn(tzOffsetMin: number): string {
    return new Date(Date.now() + tzOffsetMin * 60_000).toISOString().slice(0, 10)
}

const ZERO = () => new Prisma.Decimal(0)

export const reportRoutes = new Elysia()
    .use(authMiddleware)
    // Laporan harian untuk pemilik. Kasir tidak boleh melihat modal dan untung.
    .get('/reports/daily', async ({ user, set, query }) => {
        if (user.role !== 'ADMIN') {
            set.status = 403
            return { message: 'Forbidden' }
        }

        const tzOffset = query.tzOffset ?? DEFAULT_TZ_OFFSET_MIN
        const date = query.date ?? todayIn(tzOffset)
        const range = dayRange(date, tzOffset)
        if (!range) {
            set.status = 400
            return { message: 'Tanggal tidak valid' }
        }

        const where = { storeId: user.storeId, createdAt: { gte: range.from, lt: range.to } }

        const [transactions, items, paymentsAgg, ledger] = await Promise.all([
            prisma.transaction.findMany({
                where,
                select: { totalPrice: true, paymentMethod: true },
            }),
            prisma.transactionItem.findMany({
                where: { transaction: where },
                select: {
                    quantity: true,
                    priceAtTime: true,
                    costAtTime: true,
                    product: { select: { productId: true, name: true } },
                },
            }),
            // Uang masuk dari pelunasan/cicilan bon pada hari ini.
            prisma.debtEntry.aggregate({
                where: { storeId: user.storeId, type: 'PAYMENT', createdAt: { gte: range.from, lt: range.to } },
                _sum: { amount: true },
            }),
            // Sisa seluruh utang pelanggan saat ini (bukan hanya hari ini).
            prisma.debtEntry.groupBy({
                by: ['type'],
                where: { storeId: user.storeId },
                _sum: { amount: true },
            }),
        ])

        let revenue = ZERO()
        const byPayment = {
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

        const debtPaymentsReceived = paymentsAgg._sum.amount ?? ZERO()
        let debtOutstanding = ZERO()
        for (const row of ledger) {
            const sum = row._sum.amount ?? ZERO()
            debtOutstanding = row.type === 'CHARGE' ? debtOutstanding.plus(sum) : debtOutstanding.minus(sum)
        }
        // Uang yang benar-benar masuk hari ini: penjualan non-bon + pelunasan bon.
        const cashIn = revenue.minus(byPayment.BON.revenue).plus(debtPaymentsReceived)

        const topProducts = [...perProduct.entries()]
            .map(([productId, v]) => ({ productId, name: v.name, quantity: v.quantity, revenue: Number(v.revenue) }))
            .sort((a, b) => b.revenue - a.revenue)
            .slice(0, 5)

        return {
            date,
            tzOffset,
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
            debtOutstanding: Number(debtOutstanding),
            topProducts,
        }
    }, {
        query: t.Object({
            date: t.Optional(t.String({ pattern: '^\\d{4}-\\d{2}-\\d{2}$' })),
            tzOffset: t.Optional(t.Numeric({ minimum: -720, maximum: 840 })),
        })
    })
