import { Elysia } from 'elysia'
import { prisma } from '../lib/prisma'
import { authMiddleware } from '../middleware/auth'

export const profileRoutes = new Elysia()
    .use(authMiddleware)
    .get('/profile', async ({ user, set }) => {
        const profile = await prisma.user.findUnique({
            where: {
                userId: user.userId
            },
            select: {
                userId: true,
                code: true,
                name: true,
                username: true,
                role: true,
                createdAt: true,
            }
        })

        if (!profile) {
            set.status = 404
            return { message: 'Profile not found' }
        }

        return { profile }
    })
