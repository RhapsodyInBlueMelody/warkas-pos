import bcrypt from 'bcrypt';
import { Elysia, t } from 'elysia';
import { jwt } from '@elysiajs/jwt';
import { prisma } from '../lib/prisma';

export const authRoutes = new Elysia()
    .use(jwt({
        name: 'jwt',
        secret: process.env.JWT_SECRET!,
    }))
    .post('/login', async ({ jwt, body, set }) => {
        const { username, password } = body;

        const user = await prisma.user.findUnique({
            where: { username }
        });

        if (!user) {
            set.status = 401;
            return { message: "Invalid credentials" };
        }

        const isPasswordValid = await bcrypt.compare(password, user.password);

        if (!isPasswordValid) {
            set.status = 401;
            return { message: "Invalid credentials" };
        }

        const token = await jwt.sign({
            userId: user.userId,
            role: user.role,
            exp: Math.floor(Date.now() / 1000) + (60 * 60 * 24)
        });

        return {
            message: "Login success",
            token,
            user: {
                name: user.name,
                role: user.role,
                username: user.username
            }
        };
    }, {
        body: t.Object({
            username: t.String({ minLength: 1 }),
            password: t.String({ minLength: 1 })
        })
    });
