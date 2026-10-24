import bcrypt from 'bcrypt'
import { Elysia, t } from 'elysia'
import { Prisma } from '@prisma/client'
import { prisma } from '../lib/prisma'
import { authMiddleware } from '../middleware/auth'
import { genCode } from '../lib/ids'

// Pemilik toko (ADMIN) menambah dan melihat kasir di tokonya sendiri.
export const staffRoutes = new Elysia()
    .use(authMiddleware)
    .get('/staff', async ({ user, set }) => {
        if (user.role !== 'ADMIN') {
            set.status = 403
            return { message: 'Forbidden' }
        }

        const staff = await prisma.user.findMany({
            where: { storeId: user.storeId },
            select: { userId: true, code: true, name: true, username: true, role: true, createdAt: true },
            orderBy: { createdAt: 'asc' },
        })
        return { staff }
    })
    .post('/staff', async ({ user, set, body }) => {
        if (user.role !== 'ADMIN') {
            set.status = 403
            return { message: 'Forbidden' }
        }

        try {
            const created = await prisma.user.create({
                data: {
                    code: genCode('USR'),
                    name: body.name.trim(),
                    username: body.username.trim().toLowerCase(),
                    password: await bcrypt.hash(body.password, 10),
                    role: 'KASIR',
                    storeId: user.storeId,
                    createdBy: user.userId,
                    updatedBy: user.userId,
                },
                select: { userId: true, code: true, name: true, username: true, role: true },
            })
            set.status = 201
            return { staff: created }
        } catch (e: unknown) {
            if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
                set.status = 409
                return { message: 'Username sudah dipakai' }
            }
            set.status = 500
            return { message: 'Something went wrong' }
        }
    }, {
        body: t.Object({
            name: t.String({ minLength: 1, maxLength: 80, pattern: '\\S' }),
            username: t.String({ minLength: 3, maxLength: 32, pattern: '^[A-Za-z0-9_.]+$' }),
            password: t.String({ minLength: 8, maxLength: 72 }),
        })
    })
