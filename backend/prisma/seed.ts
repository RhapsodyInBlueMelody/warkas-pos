import 'dotenv/config'
import bcrypt from 'bcrypt'
import { Pool } from 'pg'
import { Prisma, PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

const connectionString = process.env.DATABASE_URL!
const pool = new Pool({ connectionString })
const adapter = new PrismaPg(pool)
const prisma = new PrismaClient({ adapter })

// Data demo untuk pengembangan lokal. JANGAN dijalankan di produksi.
const DEMO_PASSWORD = process.env.SEED_DEMO_PASSWORD ?? 'demo12345'

async function main() {
    console.log('Memulai seeding data demo...')

    const existing = await prisma.user.findUnique({ where: { username: 'demo' } })
    if (existing) {
        console.log('Toko demo sudah ada, seed dilewati.')
        return
    }

    const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10)

    // Demo memakai paket Toko tanpa batas waktu supaya semua fitur terlihat.
    const store = await prisma.store.create({ data: { name: 'Warung Demo', plan: 'TOKO' } })

    const owner = await prisma.user.create({
        data: {
            code: 'USR001', name: 'Pemilik Demo', username: 'demo',
            password: passwordHash, role: 'ADMIN', storeId: store.storeId,
        }
    })
    const kasir = await prisma.user.create({
        data: {
            code: 'USR002', name: 'Kasir Demo', username: 'demo.kasir',
            password: passwordHash, role: 'KASIR', storeId: store.storeId,
            createdBy: owner.userId, updatedBy: owner.userId,
        }
    })

    const audit = { storeId: store.storeId, createdBy: owner.userId, updatedBy: owner.userId }
    const makanan = await prisma.category.create({ data: { code: 'CAT001', name: 'Makanan', ...audit } })
    const minuman = await prisma.category.create({ data: { code: 'CAT002', name: 'Minuman', ...audit } })

    const productsData = [
        { code: 'PRD001', name: 'Indomie Goreng', price: 3500, cost: 2800, stock: 100, unit: 'PCS', cat: makanan.categoryId },
        { code: 'PRD002', name: 'Roti Coklat', price: 5000, cost: 3600, stock: 50, unit: 'PCS', cat: makanan.categoryId },
        { code: 'PRD003', name: 'Teh Botol', price: 4500, cost: 3300, stock: 75, unit: 'BOTOL', cat: minuman.categoryId },
        { code: 'PRD004', name: 'Kopi Susu Kaleng', price: 7000, cost: 5200, stock: 60, unit: 'CAN', cat: minuman.categoryId },
        { code: 'PRD005', name: 'Keripik Singkong', price: 6000, cost: 4200, stock: 4, unit: 'PACK', cat: makanan.categoryId }, // sengaja menipis
        { code: 'PRD006', name: 'Air Mineral 600ml', price: 3000, cost: 2000, stock: 120, unit: 'BOTOL', cat: minuman.categoryId },
    ]

    const products = []
    for (const p of productsData) {
        products.push(await prisma.product.create({
            data: {
                code: p.code, name: p.name, price: p.price, costPrice: p.cost, stock: p.stock, unit: p.unit,
                categoryId: p.cat, ...audit,
            }
        }))
    }

    // Beberapa transaksi contoh agar layar riwayat tidak kosong. Stok sengaja tidak dipotong.
    const methods = ['CASH', 'QRIS'] as const
    for (let day = 1; day <= 5; day++) {
        for (let n = 0; n < 3; n++) {
            const items = products.slice(n, n + 2).map((prod, i) => ({
                code: `TRXITEMSEED${day}${n}${i}`,
                quantity: i + 1,
                priceAtTime: prod.price,
                costAtTime: prod.costPrice,
                productId: prod.productId,
            }))
            const totalPrice = items.reduce(
                (sum, it) => sum.add(it.priceAtTime.mul(it.quantity)),
                new Prisma.Decimal(0)
            )
            const createdAt = new Date(Date.now() - day * 24 * 60 * 60 * 1000 + n * 60 * 60 * 1000)

            await prisma.transaction.create({
                data: {
                    code: `TRXSEED${day}${n}`,
                    totalPrice,
                    storeId: store.storeId,
                    kasirId: kasir.userId,
                    paymentMethod: methods[n % methods.length],
                    createdAt,
                    items: { create: items },
                }
            })
        }
    }

    // Contoh bon: Bu Ani berutang 35000 dari penjualan BON, lalu mencicil 15000 (sisa 20000).
    const ani = await prisma.customer.create({
        data: { name: 'Bu Ani', phone: '081200000001', storeId: store.storeId, createdBy: owner.userId }
    })
    const bonProduct = products[0]
    const bonTotal = bonProduct.price.mul(10)
    await prisma.transaction.create({
        data: {
            code: 'TRXSEEDBON1',
            totalPrice: bonTotal,
            storeId: store.storeId,
            kasirId: kasir.userId,
            paymentMethod: 'BON',
            customerId: ani.customerId,
            items: {
                create: [{
                    code: 'TRXITEMSEEDBON1',
                    quantity: 10,
                    priceAtTime: bonProduct.price,
                    costAtTime: bonProduct.costPrice,
                    productId: bonProduct.productId,
                }]
            },
            debtEntry: {
                create: {
                    type: 'CHARGE',
                    amount: bonTotal,
                    storeId: store.storeId,
                    customerId: ani.customerId,
                    createdBy: kasir.userId,
                }
            },
        }
    })
    await prisma.debtEntry.create({
        data: {
            type: 'PAYMENT', amount: 15000, note: 'cicilan pertama',
            storeId: store.storeId, customerId: ani.customerId, createdBy: kasir.userId,
        }
    })

    console.log('Seed sukses. Login demo: username "demo" (pemilik) atau "demo.kasir".')
}

main()
    .catch((e) => {
        console.error(e)
        process.exitCode = 1
    })
    .finally(async () => {
        await prisma.$disconnect()
        await pool.end()
    })
