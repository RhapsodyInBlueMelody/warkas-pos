import { Elysia, t } from 'elysia'
import { Prisma } from '@prisma/client'
import { prisma } from '../lib/prisma'
import { authMiddleware } from '../middleware/auth'
import { requireFeature } from '../lib/plan'

const ZERO = () => new Prisma.Decimal(0)

class NotFoundError extends Error {}
class OverpayError extends Error {
    constructor(public balance: Prisma.Decimal) {
        super('overpay')
    }
}

const amountSchema = t.Number({ exclusiveMinimum: 0, maximum: 1_000_000_000 })

/** Sisa utang satu pelanggan = total CHARGE - total PAYMENT. */
export async function balanceOf(db: Prisma.TransactionClient, storeId: string, customerId: string) {
    const rows = await db.debtEntry.groupBy({
        by: ['type'],
        where: { storeId, customerId },
        _sum: { amount: true },
    })
    let balance = ZERO()
    for (const row of rows) {
        const sum = row._sum.amount ?? ZERO()
        balance = row.type === 'CHARGE' ? balance.plus(sum) : balance.minus(sum)
    }
    return balance
}

export const customerRoutes = new Elysia()
    .use(authMiddleware)
    .get('/customers', async ({ user, query }) => {
        const search = query.search?.trim()

        const [customers, sums] = await Promise.all([
            prisma.customer.findMany({
                where: {
                    storeId: user.storeId,
                    ...(search ? { name: { contains: search, mode: 'insensitive' as const } } : {}),
                },
                orderBy: { name: 'asc' },
            }),
            prisma.debtEntry.groupBy({
                by: ['customerId', 'type'],
                where: { storeId: user.storeId },
                _sum: { amount: true },
            }),
        ])

        const balances = new Map<string, Prisma.Decimal>()
        for (const row of sums) {
            const current = balances.get(row.customerId) ?? ZERO()
            const sum = row._sum.amount ?? ZERO()
            balances.set(row.customerId, row.type === 'CHARGE' ? current.plus(sum) : current.minus(sum))
        }

        let totalOutstanding = ZERO()
        for (const balance of balances.values()) totalOutstanding = totalOutstanding.plus(balance)

        let rows = customers.map(c => ({
            customerId: c.customerId,
            name: c.name,
            phone: c.phone,
            balance: Number(balances.get(c.customerId) ?? ZERO()),
        }))

        if (query.withDebt === 'true') {
            rows = rows.filter(r => r.balance > 0).sort((a, b) => b.balance - a.balance)
        }

        return { customers: rows, totalOutstanding: Number(totalOutstanding) }
    }, {
        query: t.Object({
            search: t.Optional(t.String({ maxLength: 80 })),
            withDebt: t.Optional(t.Union([t.Literal('true'), t.Literal('false')])),
        })
    })
    .post('/customers', async ({ user, set, body }) => {
        // Pelanggan baru berarti bon baru: hanya paket Toko. Melihat dan membayar bon lama tetap bebas
        // agar toko yang turun paket tidak terjebak dengan utang pelanggan yang tidak bisa ditagih.
        const denied = await requireFeature(user.storeId, 'bon')
        if (denied) {
            set.status = denied.status
            return denied.body
        }

        const customer = await prisma.customer.create({
            data: {
                name: body.name.trim(),
                phone: body.phone?.trim() || null,
                storeId: user.storeId,
                createdBy: user.userId,
            },
            select: { customerId: true, name: true, phone: true },
        })
        set.status = 201
        return { customer: { ...customer, balance: 0 } }
    }, {
        body: t.Object({
            name: t.String({ minLength: 1, maxLength: 80, pattern: '\\S' }),
            phone: t.Optional(t.String({ maxLength: 20 })),
        })
    })
    .get('/customers/:id', async ({ user, set, params }) => {
        const customer = await prisma.customer.findFirst({
            where: { customerId: params.id, storeId: user.storeId },
            select: { customerId: true, name: true, phone: true, createdAt: true },
        })
        if (!customer) {
            set.status = 404
            return { message: 'Customer not found' }
        }

        const [balance, entries] = await Promise.all([
            balanceOf(prisma, user.storeId, customer.customerId),
            prisma.debtEntry.findMany({
                where: { customerId: customer.customerId, storeId: user.storeId },
                orderBy: { createdAt: 'desc' },
                take: 100,
                select: {
                    debtEntryId: true,
                    type: true,
                    amount: true,
                    note: true,
                    createdAt: true,
                    transaction: { select: { code: true } },
                },
            }),
        ])

        return {
            customer,
            balance: Number(balance),
            entries: entries.map(e => ({ ...e, amount: Number(e.amount) })),
        }
    })
    .patch('/customers/:id', async ({ user, set, params, body }) => {
        try {
            const customer = await prisma.customer.update({
                where: { customerId: params.id, storeId: user.storeId },
                data: {
                    ...(body.name !== undefined ? { name: body.name.trim() } : {}),
                    ...(body.phone !== undefined ? { phone: body.phone.trim() || null } : {}),
                },
                select: { customerId: true, name: true, phone: true },
            })
            return { customer }
        } catch (e: unknown) {
            if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025') {
                set.status = 404
                return { message: 'Customer not found' }
            }
            set.status = 500
            return { message: 'Something went wrong' }
        }
    }, {
        body: t.Object({
            name: t.Optional(t.String({ minLength: 1, maxLength: 80, pattern: '\\S' })),
            phone: t.Optional(t.String({ maxLength: 20 })),
        })
    })
    // Catat pembayaran bon (boleh cicilan). Kasir dan pemilik boleh; tercatat siapa yang mencatat.
    .post('/customers/:id/payments', async ({ user, set, params, body }) => {
        try {
            const result = await prisma.$transaction(async (tx) => {
                // Kunci baris pelanggan supaya dua pembayaran bersamaan tidak sama-sama lolos
                // memeriksa sisa utang (kalau tidak, total bayar bisa melebihi utang).
                const locked = await tx.$queryRaw<Array<{ customerId: string }>>`
                    SELECT "customerId" FROM "Customer"
                    WHERE "customerId" = ${params.id} AND "storeId" = ${user.storeId}
                    FOR UPDATE`
                if (locked.length === 0) throw new NotFoundError()

                const balance = await balanceOf(tx, user.storeId, params.id)
                const amount = new Prisma.Decimal(body.amount)
                if (amount.gt(balance)) throw new OverpayError(balance)

                const entry = await tx.debtEntry.create({
                    data: {
                        type: 'PAYMENT',
                        amount,
                        note: body.note?.trim() || null,
                        storeId: user.storeId,
                        customerId: params.id,
                        createdBy: user.userId,
                    },
                    select: { debtEntryId: true, createdAt: true },
                })
                return { entry, balance: balance.minus(amount) }
            })

            set.status = 201
            return {
                message: 'Pembayaran bon dicatat',
                debtEntryId: result.entry.debtEntryId,
                balance: Number(result.balance),
                settled: result.balance.isZero(),
            }
        } catch (e: unknown) {
            if (e instanceof NotFoundError) {
                set.status = 404
                return { message: 'Customer not found' }
            }
            if (e instanceof OverpayError) {
                set.status = 400
                return {
                    message: 'Pembayaran melebihi sisa utang',
                    balance: Number(e.balance),
                }
            }
            set.status = 500
            return { message: 'Something went wrong' }
        }
    }, {
        body: t.Object({
            amount: amountSchema,
            note: t.Optional(t.String({ maxLength: 200 })),
        })
    })
    // Tambah utang manual, mis. memindahkan catatan bon kertas. Hanya pemilik.
    .post('/customers/:id/charges', async ({ user, set, params, body }) => {
        if (user.role !== 'ADMIN') {
            set.status = 403
            return { message: 'Forbidden' }
        }

        const denied = await requireFeature(user.storeId, 'bon')
        if (denied) {
            set.status = denied.status
            return denied.body
        }

        const customer = await prisma.customer.findFirst({
            where: { customerId: params.id, storeId: user.storeId },
            select: { customerId: true },
        })
        if (!customer) {
            set.status = 404
            return { message: 'Customer not found' }
        }

        const entry = await prisma.debtEntry.create({
            data: {
                type: 'CHARGE',
                amount: new Prisma.Decimal(body.amount),
                note: body.note?.trim() || null,
                storeId: user.storeId,
                customerId: customer.customerId,
                createdBy: user.userId,
            },
            select: { debtEntryId: true },
        })

        set.status = 201
        return {
            message: 'Utang dicatat',
            debtEntryId: entry.debtEntryId,
            balance: Number(await balanceOf(prisma, user.storeId, customer.customerId)),
        }
    }, {
        body: t.Object({
            amount: amountSchema,
            note: t.Optional(t.String({ maxLength: 200 })),
        })
    })
