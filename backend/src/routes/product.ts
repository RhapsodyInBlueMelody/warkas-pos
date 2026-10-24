import { Elysia, t } from 'elysia'
import { Prisma } from '@prisma/client'
import { prisma } from '../lib/prisma'
import { authMiddleware } from '../middleware/auth'
import { genCode } from '../lib/ids'

function isOwner(user: { role: string }): boolean {
    return user.role === 'ADMIN'
}

const fields = {
    code: t.String({ minLength: 1, maxLength: 32 }),
    name: t.String({ minLength: 1, maxLength: 120, pattern: '\\S' }),
    price: t.Number({ minimum: 0 }),
    stock: t.Integer({ minimum: 0 }),
    unit: t.String({ minLength: 1, maxLength: 20 }),
    categoryId: t.String({ minLength: 1 }),
    supplierId: t.String({ minLength: 1 }),
}

const createBody = t.Object({
    code: t.Optional(fields.code),
    name: fields.name,
    price: fields.price,
    stock: fields.stock,
    unit: fields.unit,
    categoryId: t.Optional(fields.categoryId),
    supplierId: t.Optional(fields.supplierId),
})

const updateBody = t.Partial(t.Object(fields))

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

        return { products }
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

            return { product }
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
            const product = await prisma.product.create({
                data: {
                    ...body,
                    code: body.code?.trim() || genCode('PRD'),
                    storeId: user.storeId,
                    createdBy: user.userId,
                    updatedBy: user.userId,
                }
            })

            set.status = 201
            return { product }
        } catch (e: unknown) {
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
