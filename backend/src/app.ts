import { Elysia } from 'elysia'
import { authRoutes } from './routes/auth'
import { profileRoutes } from './routes/profile'
import { getProductRoutes } from './routes/product'
import { categoryRoutes } from './routes/category'
import { staffRoutes } from './routes/staff'
import { transactionRoutes } from './routes/transaction'
import { reportRoutes } from './routes/report'
import { customerRoutes } from './routes/customer'
import { planRoutes } from './routes/plan'

// Urutan penting: route publik (/, /register, /login) harus didaftarkan SEBELUM
// route yang memakai authMiddleware, karena hook auth berlaku global setelah dipasang.
export const app = new Elysia()
    .get('/', () => ({ message: 'Warkas API is running' }))
    .use(authRoutes)
    .use(profileRoutes)
    .use(planRoutes)
    .use(getProductRoutes)
    .use(categoryRoutes)
    .use(staffRoutes)
    .use(transactionRoutes)
    .use(customerRoutes)
    .use(reportRoutes)
