import { Elysia, t } from 'elysia'
import { Prisma } from '@prisma/client'
import { prisma } from '../lib/prisma'
import { authMiddleware } from '../middleware/auth'
import { genCode } from '../lib/ids'
import { FREE_MAX_PRODUCTS, effectivePlan } from '../lib/plan'

class PlanLimitError extends Error {}

function isOwner(user: { role: string }): boolean {
    return user.role === 'ADMIN'
}

const fields = {
    code: t.String({ minLength: 1, maxLength: 32 }),
    name: t.String({ minLength: 1, maxLength: 120, pattern: '\\S' }),
    price: t.Number({ minimum: 0 }),
    costPrice: t.Number({ minimum: 0 }),
    stock: t.Integer({ minimum: 0 }),
    minStock: t.Integer({ minimum: 0 }),
    unit: t.String({ minLength: 1, maxLength: 20 }),
    categoryId: t.String({ minLength: 1 }),
    supplierId: t.String({ minLength: 1 }),
}

const createBody = t.Object({
    code: t.Optional(fields.code),
    name: fields.name,
    price: fields.price,
    costPrice: t.Optional(fields.costPrice),
    stock: fields.stock,
    minStock: t.Optional(fields.minStock),
    unit: fields.unit,
    categoryId: t.Optional(fields.categoryId),
    supplierId: t.Optional(fields.supplierId),
})

const updateBody = t.Partial(t.Object(fields))

// Harga modal hanya untuk pemilik. Kasir tidak boleh melihat margin toko.
function present<T extends { stock: number; minStock: number; costPrice: Prisma.Decimal | null }>(
    product: T,
    role: string
) {
    const { costPrice, ...rest } = product
    return {
        ...rest,
        ...(role === 'ADMIN' ? { costPrice } : {}),
        lowStock: product.stock <= product.minStock,
    }
}

// Kategori dan pemasok yang dirujuk harus milik toko yang sama.
// Tanpa ini, toko A bisa menautkan produknya ke kategori toko B.
async function checkRefs(storeId: string, categoryId?: string, supplierId?: string): Promise<string | null> {
    if (categoryId) {
        const found = await prisma.category.findFirst({ where: { categoryId, storeId }, select: { categoryId: true } })
        if (!found) return 'Kategori tidak ditemukan'
    }
    if (supplierId) {
        const found = await prisma.supplier.findFirst({ where: { supplierId, storeId }, select: { supplierId: true } })
        if (!found) return 'Pemasok tidak ditemukan'
    }
    return null
}

export const getProductRoutes = new Elysia()
    .use(authMiddleware)
    .get('/products', async ({ user, query }) => {
        const { code } = query as { code?: string }

        const products = await prisma.product.findMany({
            where: {
                storeId: user.storeId,
                ...(code ? { category: { code } } : {}),
            },
            orderBy: { name: 'asc' },
        })

        return { products: products.map(p => present(p, user.role)) }
    })
    .get('/products/low-stock', async ({ user }) => {
        const products = await prisma.product.findMany({
            where: { storeId: user.storeId },
            orderBy: [{ stock: 'asc' }, { name: 'asc' }],
        })

        // Membandingkan dua kolom (stock <= minStock) dilakukan di aplikasi; jumlah
        // produk satu warung kecil, jadi biayanya kecil.
        return {
            products: products
                .filter(p => p.stock <= p.minStock)
                .map(p => present(p, user.role)),
        }
    })
    .patch('/product/:id', async ({ user, set, params, body }) => {
        if (!isOwner(user)) {
            set.status = 403
            return { message: 'Forbidden' }
        }

        const refError = await checkRefs(user.storeId, body.categoryId, body.supplierId)
        if (refError) {
            set.status = 400
            return { message: refError }
        }

        try {
            const product = await prisma.product.update({
                // storeId ikut di where: produk toko lain dianggap tidak ada (404).
                where: { productId: params.id, storeId: user.storeId },
                data: {
                    ...body,
                    // Audit field berasal dari user terautentikasi, bukan dari body.
                    updatedBy: user.userId,
                }
            })

            return { product: present(product, user.role) }
        } catch (e: unknown) {
            if (e instanceof Prisma.PrismaClientKnownRequestError) {
                if (e.code === 'P2025') {
                    set.status = 404
                    return { message: 'Product not found' }
                }
                if (e.code === 'P2002') {
                    set.status = 409
                    return { message: 'Product code already exists' }
                }
            }
            set.status = 500
            return { message: 'Something went wrong' }
        }
    }, {
        body: updateBody
    })
    .delete('/product/:id', async ({ user, set, params }) => {
        if (!isOwner(user)) {
            set.status = 403
            return { message: 'Forbidden' }
        }

        try {
            await prisma.product.delete({
                where: { productId: params.id, storeId: user.storeId }
            })

            return { message: 'Deleted Successfully' }
        } catch (e: unknown) {
            if (e instanceof Prisma.PrismaClientKnownRequestError) {
                if (e.code === 'P2025') {
                    set.status = 404
                    return { message: 'Product not found' }
                }
                if (e.code === 'P2003') {
                    set.status = 409
                    return { message: 'Produk sudah dipakai di transaksi dan tidak bisa dihapus' }
                }
            }
            set.status = 500
            return { message: 'Something went wrong' }
        }
    })
    .post('/products', async ({ user, set, body }) => {
        if (!isOwner(user)) {
            set.status = 403
            return { message: 'Forbidden' }
        }

        const refError = await checkRefs(user.storeId, body.categoryId, body.supplierId)
        if (refError) {
            set.status = 400
            return { message: refError }
        }

        try {
            const product = await prisma.$transaction(async (tx) => {
                // Kunci baris toko supaya hitung-lalu-buat tidak bisa dilompati oleh
                // permintaan yang masuk bersamaan (kalau tidak, batas produk bisa terlewati).
                await tx.$queryRaw`SELECT "storeId" FROM "Store" WHERE "storeId" = ${user.storeId} FOR UPDATE`

                const store = await tx.store.findUniqueOrThrow({
                    where: { storeId: user.storeId },
                    select: { plan: true, planExpiresAt: true },
                })
                if (effectivePlan(store) === 'FREE') {
                    const count = await tx.product.count({ where: { storeId: user.storeId } })
                    if (count >= FREE_MAX_PRODUCTS) throw new PlanLimitError()
                }

                return tx.product.create({
                    data: {
                        ...body,
                        code: body.code?.trim() || genCode('PRD'),
                        storeId: user.storeId,
                        createdBy: user.userId,
                        updatedBy: user.userId,
                    }
                })
            })

            set.status = 201
            return { product: present(product, user.role) }
        } catch (e: unknown) {
            if (e instanceof PlanLimitError) {
                set.status = 402
                return {
                    message: `Paket gratis dibatasi ${FREE_MAX_PRODUCTS} produk. Upgrade ke paket Toko untuk menambah lebih banyak.`,
                    code: 'PLAN_LIMIT',
                    feature: 'products',
                    limit: FREE_MAX_PRODUCTS,
                    upgradeTo: 'TOKO',
                }
            }
            if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
                set.status = 409
                return { message: 'Product code already exists' }
            }
            set.status = 500
            return { message: 'Something went wrong' }
        }
    }, {
        body: createBody
    })
