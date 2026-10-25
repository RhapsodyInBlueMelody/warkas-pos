import { Elysia } from 'elysia'
import { prisma } from '../lib/prisma'
import { authMiddleware } from '../middleware/auth'
import { planView } from '../lib/plan'

export const profileRoutes = new Elysia()
    .use(authMiddleware)
    .get('/profile', async ({ user, set }) => {
        const profile = await prisma.user.findFirst({
            where: {
                userId: user.userId,
                storeId: user.storeId,
            },
            select: {
                userId: true,
                code: true,
                name: true,
                username: true,
                role: true,
                createdAt: true,
                store: {
                    select: { storeId: true, name: true, plan: true, planExpiresAt: true, planIsTrial: true }
                },
            }
        })

        if (!profile) {
            set.status = 404
            return { message: 'Profile not found' }
        }

        return {
            profile: {
                ...profile,
                store: { storeId: profile.store.storeId, name: profile.store.name, ...planView(profile.store) },
            }
        }
    })
