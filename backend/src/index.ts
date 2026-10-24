import { Elysia } from 'elysia'
import { authRoutes } from './routes/auth';
import { getProductRoutes } from './routes/product';
import { profileRoutes } from './routes/profile';
import { transactionRoutes } from './routes/transaction';

const app = new Elysia();

app.get('/', () => ({
    message: 'Koperasi POS API is running! '
}))

app.use(authRoutes)
app.use(profileRoutes)
app.use(getProductRoutes)
app.use(transactionRoutes)

app.listen(3000, () => {
    console.log('Elysia running on port 3000')
})
