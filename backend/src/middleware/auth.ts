import { Elysia } from 'elysia'
import { jwt } from '@elysiajs/jwt'

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

            if (!payload || typeof payload.userId !== 'string' || typeof payload.role !== 'string') {
                set.status = 401
                throw new Error('Unauthorized')
            }

            return {
                user: {
                    userId: payload.userId,
                    role: payload.role,
                    exp: typeof payload.exp === 'number' ? payload.exp : 0
                }
            }
        } catch {
            set.status = 401
            throw new Error('Unauthorized')
        }
    })
