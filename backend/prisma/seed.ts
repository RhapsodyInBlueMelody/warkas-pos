import 'dotenv/config'
import bcrypt from 'bcryptjs'
import { Pool } from 'pg'
import { Prisma, PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

const connectionString = process.env.DATABASE_URL!
const pool = new Pool({ connectionString })
const adapter = new PrismaPg(pool)
const prisma = new PrismaClient({ adapter })

async function main() {
    console.log('Memulai seeding data... 🚀')

    const hashedPassword = await bcrypt.hash('admin123', 10)

    const admin = await prisma.user.upsert({
        where: { username: 'admin' },
        update: {},
        create: {
            code: 'USR001',
            name: 'Administrator',
            username: 'admin',
            password: hashedPassword,
            role: 'ADMIN'
        }
    })

    const kasir = await prisma.user.upsert({
        where: { username: 'kasir' },
        update: {},
        create: {
            code: 'USR002',
            name: 'Kasir Utama',
            username: 'kasir',
            password: hashedPassword,
            role: 'KASIR'
        }
    })

    const makanan = await prisma.category.upsert({
        where: { code: 'CAT001' },
        update: {},
        create: {
            code: 'CAT001',
            name: 'Makanan',
            createdBy: admin.userId,
            updatedBy: admin.userId
        }
    })

    const minuman = await prisma.category.upsert({
        where: { code: 'CAT002' },
        update: {},
        create: {
            code: 'CAT002',
            name: 'Minuman',
            createdBy: admin.userId,
            updatedBy: admin.userId
        }
    })

    const supplier = await prisma.supplier.upsert({
        where: { code: 'SUP001' },
        update: {},
        create: {
            code: 'SUP001',
            name: 'PT Supplier Utama',
            createdBy: admin.userId,
            updatedBy: admin.userId
        }
    })

    const productsData = [
        { code: 'PRD001', name: 'Indomie Goreng', price: 3500, stock: 100, unit: 'PCS', catId: makanan.categoryId },
        { code: 'PRD002', name: 'Roti Coklat', price: 5000, stock: 50, unit: 'PCS', catId: makanan.categoryId },
        { code: 'PRD003', name: 'Teh Botol', price: 4500, stock: 75, unit: 'BOTOL', catId: minuman.categoryId },
        { code: 'PRD004', name: 'Kopi Susu Kaleng', price: 7000, stock: 60, unit: 'CAN', catId: minuman.categoryId },
        { code: 'PRD005', name: 'Keripik Singkong', price: 6000, stock: 40, unit: 'PACK', catId: makanan.categoryId },
        { code: 'PRD006', name: 'Air Mineral 600ml', price: 3000, stock: 120, unit: 'BOTOL', catId: minuman.categoryId },
    ]

    const products: Array<Awaited<ReturnType<typeof prisma.product.upsert>>> = []
    for (const p of productsData) {
        const prod = await prisma.product.upsert({
            where: { code: p.code },
            update: {},
            create: {
                code: p.code,
                name: p.name,
                price: p.price,
                stock: p.stock,
                unit: p.unit,
                categoryId: p.catId,
                supplierId: supplier.supplierId,
                createdBy: admin.userId,
                updatedBy: admin.userId
            }
        })
        products.push(prod)
    }

    console.log('Sedang membuat histori transaksi dummy yang banyak...')

    const targetDates = [
        '20260520',
        '20260521',
        '20260522',
        '20260523',
        '20260524'
    ]

    const paymentMethods = ['CASH', 'QRIS'] as const
    let totalTrxCreated = 0

    for (const dateStr of targetDates) {
        const transactionCount = Math.floor(Math.random() * 3) + 3

        for (let t = 0; t < transactionCount; t++) {
            const randomTrxPad = Math.floor(Math.random() * 1000).toString().padStart(3, '0')
            const transactionCode = `TRX${dateStr}${randomTrxPad}`

            const itemCount = Math.floor(Math.random() * 3) + 1
            const shuffledProducts = [...products].sort(() => 0.5 - Math.random())
            const selectedProductsForTrx = shuffledProducts.slice(0, itemCount)

            const trxItemsPayload = selectedProductsForTrx.map((prod, index) => {
                const quantity = Math.floor(Math.random() * 3) + 1
                const randomItemPad = Math.floor(1000 + Math.random() * 9000).toString()

                return {
                    code: `TRXITEM${dateStr}${index.toString().padStart(3, '0')}${randomItemPad}`,
                    quantity,
                    priceAtTime: prod.price,
                    productId: prod.productId
                }
            })

            const totalPrice = trxItemsPayload.reduce(
                (sum, item) => sum.add(item.priceAtTime.mul(item.quantity)),
                new Prisma.Decimal(0)
            )
            const chosenMethod = paymentMethods[Math.floor(Math.random() * paymentMethods.length)]

            const existingTrx = await prisma.transaction.findUnique({ where: { code: transactionCode } })
            if (!existingTrx) {
                const transaction = await prisma.transaction.create({
                    data: {
                        code: transactionCode,
                        totalPrice,
                        kasirId: kasir.userId,
                        paymentMethod: chosenMethod,
                        createdAt: new Date(`${dateStr.slice(0, 4)}-${dateStr.slice(4, 6)}-${dateStr.slice(6, 8)}T10:00:00.000Z`)
                    }
                })

                for (const item of trxItemsPayload) {
                    await prisma.transactionItem.create({
                        data: {
                            code: item.code,
                            quantity: item.quantity,
                            priceAtTime: item.priceAtTime,
                            transactionId: transaction.transactionId,
                            productId: item.productId
                        }
                    })
                }
                totalTrxCreated++
            }
        }
    }

    console.log(`Berhasil menambahkan ${totalTrxCreated} transaksi dummy baru!`)
    console.log('Seed sukses 🌱')
}

main()
    .then(async () => {
        await prisma.$disconnect()
        await pool.end()
    })
    .catch(async (e) => {
        console.error(e)
        await prisma.$disconnect()
        await pool.end()
        process.exit(1)
    })
