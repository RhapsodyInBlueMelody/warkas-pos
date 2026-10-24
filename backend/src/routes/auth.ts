import bcrypt from 'bcrypt'
import { Elysia, t } from 'elysia'
import { jwt } from '@elysiajs/jwt'
import { Prisma } from '@prisma/client'
import { prisma } from '../lib/prisma'

const TOKEN_TTL_SECONDS = 60 * 60 * 24

// Dipakai saat username tidak ada, supaya waktu respons login tidak membocorkan
// apakah username terdaftar.
const DUMMY_HASH = bcrypt.hashSync('warkas-dummy-password', 10)

type Signer = { sign: (payload: { [key: string]: string | number }) => Promise<string> }

function signSession(
    signer: Signer,
    user: { userId: string; storeId: string; role: string }
) {
    return signer.sign({
        userId: user.userId,
        storeId: user.storeId,
        role: user.role,
        exp: Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS
    })
}

const nonBlank = '\\S'

export const authRoutes = new Elysia()
    .use(jwt({
        name: 'jwt',
        secret: process.env.JWT_SECRET!,
    }))
    .post('/register', async ({ jwt, body, set }) => {
        const username = body.username.trim().toLowerCase()
        const passwordHash = await bcrypt.hash(body.password, 10)

        try {
            const { store, user } = await prisma.$transaction(async (tx) => {
                const store = await tx.store.create({
                    data: { name: body.storeName.trim() }
                })
                const user = await tx.user.create({
                    data: {
                        code: 'USR001',
                        name: body.name.trim(),
                        username,
                        password: passwordHash,
                        role: 'ADMIN',
                        storeId: store.storeId,
                    }
                })
                return { store, user }
            })

            const token = await signSession(jwt, user)
            set.status = 201
            return {
                message: 'Toko berhasil dibuat',
                token,
                user: { name: user.name, role: user.role, username: user.username },
                store: { storeId: store.storeId, name: store.name, plan: store.plan }
            }
        } catch (e: unknown) {
            if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
                set.status = 409
                return { message: 'Username sudah dipakai' }
            }
            set.status = 500
            return { message: 'Pendaftaran gagal' }
        }
    }, {
        body: t.Object({
            storeName: t.String({ minLength: 1, maxLength: 80, pattern: nonBlank }),
            name: t.String({ minLength: 1, maxLength: 80, pattern: nonBlank }),
            username: t.String({ minLength: 3, maxLength: 32, pattern: '^[A-Za-z0-9_.]+$' }),
            password: t.String({ minLength: 8, maxLength: 72 }),
        })
    })
    .post('/login', async ({ jwt, body, set }) => {
        const username = body.username.trim().toLowerCase()

        const user = await prisma.user.findUnique({
            where: { username },
            include: { store: { select: { storeId: true, name: true, plan: true } } }
        })

        const isPasswordValid = await bcrypt.compare(
            body.password,
            user ? user.password : DUMMY_HASH
        )

        if (!user || !isPasswordValid) {
            set.status = 401
            return { message: 'Invalid credentials' }
        }

        const token = await signSession(jwt, user)

        return {
            message: 'Login success',
            token,
            user: {
                name: user.name,
                role: user.role,
                username: user.username
            },
            store: user.store
        }
    }, {
        body: t.Object({
            username: t.String({ minLength: 1 }),
            password: t.String({ minLength: 1 })
        })
    })
