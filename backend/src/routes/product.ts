import { Elysia, t } from 'elysia'
import { prisma } from '../lib/prisma'
import { authMiddleware } from '../middleware/auth'

function adminRoleChecker(user: { role: string }): boolean {
    return user.role === 'ADMIN'
}

const productBodySchema = t.Object({
    code: t.String({ minLength: 1 }),
    name: t.String({ minLength: 1 }),
    price: t.Number({ minimum: 0 }),
    stock: t.Integer({ minimum: 0 }),
    unit: t.String({ minLength: 1 }),
    categoryId: t.String({ minLength: 1 }),
    supplierId: t.String({ minLength: 1 }),
})

export const getProductRoutes = new Elysia()
    .use(authMiddleware)
    .get('/products', async ({ query }) => {
        const { code } = query as { code?: string }

        const products = await prisma.product.findMany({
            where: code ? { category: { code } } : undefined,
        })

        return { products }
    })
    .patch('/product/:id', async ({ user, set, params, body }) => {
        if (!adminRoleChecker(user)) {
            set.status = 403
            return { message: 'Forbidden' }
        }

        try {
            const product = await prisma.product.update({
                where: { productId: params.id },
                data: {
                    price: body.price,
                    name: body.name,
                    code: body.code,
                    stock: body.stock,
                    unit: body.unit,
                    categoryId: body.categoryId,
                    supplierId: body.supplierId,
                    // Audit fields must come from the authenticated user,
                    // never from the request body.
                    updatedBy: user.userId,
                }
            })

            return { product }
        } catch (e: any) {
            if (e.code === 'P2025') {
                set.status = 404
                return { message: 'Product not found' }
            }
            if (e.code === 'P2002') {
                set.status = 409
                return { message: 'Product code already exists' }
            }
            set.status = 500
            return { message: 'Something went wrong' }
        }
    }, {
        body: productBodySchema
    })
    .delete('/product/:id', async ({ user, set, params }) => {
        if (!adminRoleChecker(user)) {
            set.status = 403
            return { message: 'Forbidden' }
        }

        try {
            await prisma.product.delete({
                where: { productId: params.id }
            })

            return { message: 'Deleted Successfully' }
        } catch (e: any) {
            if (e.code === 'P2025') {
                set.status = 404
                return { message: 'Product not found' }
            }
            set.status = 500
            return { message: 'Something went wrong' }
        }
    })
    .post('/products', async ({ user, set, body }) => {
        if (!adminRoleChecker(user)) {
            set.status = 403
            return { message: 'Forbidden' }
        }

        try {
            const product = await prisma.product.create({
                data: {
                    ...body,
                    createdBy: user.userId,
                    updatedBy: user.userId,
                }
            })

            return { product }
        } catch (e: any) {
            if (e.code === 'P2002') {
                set.status = 409
                return { message: 'Product code already exists' }
            }
            set.status = 500
            return { message: 'Something went wrong' }
        }
    }, {
        body: productBodySchema
    })
