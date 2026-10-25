import { Elysia } from 'elysia'
import { prisma } from '../lib/prisma'
import { authMiddleware } from '../middleware/auth'
import { FREE_MAX_PRODUCTS, PLAN_FEATURES, planView } from '../lib/plan'

export const planRoutes = new Elysia()
    .use(authMiddleware)
    // Paket berlaku, batas, dan pemakaian. Dipakai UI untuk menampilkan sisa trial dan ajakan upgrade.
    .get('/plan', async ({ user, set }) => {
        const [store, products] = await Promise.all([
            prisma.store.findUnique({
                where: { storeId: user.storeId },
                select: { plan: true, planExpiresAt: true, planIsTrial: true },
            }),
            prisma.product.count({ where: { storeId: user.storeId } }),
        ])
        if (!store) {
            set.status = 404
            return { message: 'Store not found' }
        }

        const view = planView(store)
        return {
            ...view,
            limits: { maxProducts: view.plan === 'FREE' ? FREE_MAX_PRODUCTS : null },
            usage: { products },
            features: PLAN_FEATURES[view.plan],
        }
    })
