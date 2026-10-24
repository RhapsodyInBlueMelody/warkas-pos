import { Elysia, t } from 'elysia'
import { Prisma } from '@prisma/client'
import { prisma } from '../lib/prisma'
import { authMiddleware } from '../middleware/auth'
import { genCode } from '../lib/ids'

export const categoryRoutes = new Elysia()
    .use(authMiddleware)
    .get('/categories', async ({ user }) => {
        const categories = await prisma.category.findMany({
            where: { storeId: user.storeId },
            orderBy: { name: 'asc' },
        })
        return { categories }
    })
    .post('/categories', async ({ user, set, body }) => {
        if (user.role !== 'ADMIN') {
            set.status = 403
            return { message: 'Forbidden' }
        }

        try {
            const category = await prisma.category.create({
                data: {
                    code: body.code?.trim() || genCode('CAT'),
                    name: body.name.trim(),
                    storeId: user.storeId,
                    createdBy: user.userId,
                    updatedBy: user.userId,
                }
            })
            set.status = 201
            return { category }
        } catch (e: unknown) {
            if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
                set.status = 409
                return { message: 'Category code already exists' }
            }
            set.status = 500
            return { message: 'Something went wrong' }
        }
    }, {
        body: t.Object({
            code: t.Optional(t.String({ minLength: 1, maxLength: 32 })),
            name: t.String({ minLength: 1, maxLength: 60, pattern: '\\S' }),
        })
    })
