import { Elysia } from 'elysia'
import { jwt } from '@elysiajs/jwt'

/**
 * Memverifikasi Bearer JWT dan menaruh `user` (userId, storeId, role) di context.
 * Setiap route bisnis WAJIB membatasi query dengan `user.storeId`.
 *
 * Catatan urutan: hook ini bersifat global, jadi hanya berlaku untuk route yang
 * didaftarkan SETELAH plugin ini dipakai. Route publik (/login, /register) harus
 * didaftarkan lebih dulu di app.ts.
 */
export const authMiddleware = new Elysia()
    .use(
        jwt({
            name: 'jwt',
            secret: process.env.JWT_SECRET!
        })
    )
    .derive({ as: 'global' }, async ({ jwt, headers, set }) => {
        const authHeader = headers.authorization

        if (!authHeader?.startsWith('Bearer ')) {
            set.status = 401
            throw new Error('Unauthorized')
        }

        const token = authHeader.slice('Bearer '.length).trim()

        if (!token) {
            set.status = 401
            throw new Error('Unauthorized')
        }

        try {
            const payload = await jwt.verify(token)

            if (
                !payload ||
                typeof payload.userId !== 'string' ||
                typeof payload.storeId !== 'string' ||
                typeof payload.role !== 'string'
            ) {
                set.status = 401
                throw new Error('Unauthorized')
            }

            return {
                user: {
                    userId: payload.userId,
                    storeId: payload.storeId,
                    role: payload.role,
                    exp: typeof payload.exp === 'number' ? payload.exp : 0
                }
            }
        } catch {
            set.status = 401
            throw new Error('Unauthorized')
        }
    })
