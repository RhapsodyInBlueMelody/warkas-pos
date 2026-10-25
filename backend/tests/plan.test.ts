import { describe, expect, test } from 'bun:test'
import { app } from '../src/app'
import { prisma } from '../src/lib/prisma'
import { effectivePlan } from '../src/lib/plan'
import { setStorePlan } from '../src/lib/planAdmin'

// Butuh Postgres dengan semua migrasi diterapkan. Jalankan: DATABASE_URL=... JWT_SECRET=... bun test

type Res = { status: number; body: any }

async function call(method: string, path: string, token?: string, body?: unknown): Promise<Res> {
    const res = await app.handle(new Request(`http://localhost${path}`, {
        method,
        headers: {
            ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
            ...(token ? { authorization: `Bearer ${token}` } : {}),
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
    }))
    const text = await res.text()
    let parsed: any = text
    try { parsed = JSON.parse(text) } catch { /* bukan JSON */ }
    return { status: res.status, body: parsed }
}

const run = Math.random().toString(36).slice(2, 8)
let counter = 0

async function registerStore(label: string) {
    const username = `p_${label}_${run}_${counter++}`
    const res = await call('POST', '/register', undefined, {
        storeName: `Toko ${label}`, name: `Pemilik ${label}`, username, password: 'password-123',
    })
    expect(res.status).toBe(201)
    return { token: res.body.token as string, storeId: res.body.store.storeId as string, username, body: res.body }
}

const setPlan = (storeId: string, data: Record<string, unknown>) =>
    prisma.store.update({ where: { storeId }, data })

const goFree = (storeId: string) => setPlan(storeId, { plan: 'FREE', planExpiresAt: null, planIsTrial: false })
const goToko = (storeId: string) => setPlan(storeId, { plan: 'TOKO', planExpiresAt: null, planIsTrial: false })

let productSeq = 0
async function addProduct(token: string, extra: Record<string, unknown> = {}) {
    return call('POST', '/products', token, {
        name: `Barang ${productSeq++}`, unit: 'PCS', price: 1000, stock: 10, ...extra,
    })
}

async function addMany(token: string, n: number) {
    for (let i = 0; i < n; i++) expect((await addProduct(token)).status).toBe(201)
}

describe('masa percobaan dan kedaluwarsa', () => {
    test('toko baru mendapat trial paket Toko 14 hari', async () => {
        const s = await registerStore('trial')
        expect(s.body.store.plan).toBe('TOKO')
        expect(s.body.store.isTrial).toBe(true)
        expect(s.body.store.daysLeft).toBe(14)

        const plan = await call('GET', '/plan', s.token)
        expect(plan.status).toBe(200)
        expect(plan.body.plan).toBe('TOKO')
        expect(plan.body.isTrial).toBe(true)
        expect(plan.body.daysLeft).toBe(14)
        expect(plan.body.limits.maxProducts).toBeNull()
        expect(plan.body.features).toEqual({ bon: true, extendedReports: true, export: true })
        expect(plan.body.usage.products).toBe(0)

        const login = await call('POST', '/login', undefined, { username: s.username, password: 'password-123' })
        expect(login.body.store.isTrial).toBe(true)
        const profile = await call('GET', '/profile', s.token)
        expect(profile.body.profile.store.plan).toBe('TOKO')
    })

    test('trial yang lewat otomatis menjadi paket gratis', async () => {
        const s = await registerStore('expired')
        await setPlan(s.storeId, { planExpiresAt: new Date(Date.now() - 60_000) })

        const plan = await call('GET', '/plan', s.token)
        expect(plan.body.plan).toBe('FREE')
        expect(plan.body.storedPlan).toBe('TOKO')
        expect(plan.body.isTrial).toBe(false)
        expect(plan.body.daysLeft).toBeNull()
        expect(plan.body.limits.maxProducts).toBe(50)
        expect(plan.body.features).toEqual({ bon: false, extendedReports: false, export: false })
    })

    test('effectivePlan menghormati batas waktu', () => {
        const now = new Date('2026-10-25T00:00:00Z')
        expect(effectivePlan({ plan: 'FREE', planExpiresAt: null }, now)).toBe('FREE')
        expect(effectivePlan({ plan: 'TOKO', planExpiresAt: null }, now)).toBe('TOKO')
        expect(effectivePlan({ plan: 'TOKO', planExpiresAt: new Date('2026-10-25T00:00:01Z') }, now)).toBe('TOKO')
        expect(effectivePlan({ plan: 'TOKO', planExpiresAt: new Date('2026-10-25T00:00:00Z') }, now)).toBe('FREE')
        expect(effectivePlan({ plan: 'TOKO', planExpiresAt: new Date('2026-10-24T00:00:00Z') }, now)).toBe('FREE')
    })

    test('/plan butuh login dan bisa dibaca kasir', async () => {
        expect((await call('GET', '/plan')).status).toBe(401)

        const owner = await registerStore('planrole')
        const kasirName = `kasir_${run}_${counter++}`
        await call('POST', '/staff', owner.token, { name: 'Kasir', username: kasirName, password: 'password-123' })
        const kasir = (await call('POST', '/login', undefined, { username: kasirName, password: 'password-123' })).body.token
        expect((await call('GET', '/plan', kasir)).status).toBe(200)
    })
})

describe('batas produk paket gratis', () => {
    test('produk ke-51 ditolak dengan 402; mengubah dan menghapus tetap bisa', async () => {
        const s = await registerStore('limit')
        await goFree(s.storeId)
        await addMany(s.token, 50)

        const over = await addProduct(s.token)
        expect(over.status).toBe(402)
        expect(over.body.code).toBe('PLAN_LIMIT')
        expect(over.body.limit).toBe(50)
        expect(over.body.upgradeTo).toBe('TOKO')

        const list = await call('GET', '/products', s.token)
        expect(list.body.products).toHaveLength(50)
        const first = list.body.products[0].productId

        expect((await call('PATCH', `/product/${first}`, s.token, { price: 1234 })).status).toBe(200)
        expect((await call('DELETE', `/product/${first}`, s.token)).status).toBe(200)
        expect((await addProduct(s.token)).status).toBe(201)
        expect((await call('GET', '/plan', s.token)).body.usage.products).toBe(50)
    })

    test('turun paket tidak menghapus data: produk berlebih tetap ada dan bisa dijual', async () => {
        const s = await registerStore('downgrade')
        await addMany(s.token, 55) // masih trial Toko
        await goFree(s.storeId)

        const list = await call('GET', '/products', s.token)
        expect(list.body.products).toHaveLength(55)

        const sale = await call('POST', '/transaction', s.token, {
            items: [{ productId: list.body.products[0].productId, quantity: 1 }], paymentMethod: 'CASH',
        })
        expect(sale.status).toBe(201)

        expect((await addProduct(s.token)).status).toBe(402)

        await goToko(s.storeId) // upgrade lagi: batas hilang
        expect((await addProduct(s.token)).status).toBe(201)
    })

    test('batas tidak bisa dilompati oleh permintaan serentak', async () => {
        const s = await registerStore('race')
        await goFree(s.storeId)
        await addMany(s.token, 45)

        // 20 permintaan serentak, sisa kuota 5: tepat 5 yang boleh lolos.
        const results = await Promise.all(Array.from({ length: 20 }, () => addProduct(s.token)))
        expect(results.filter(r => r.status === 201).length).toBe(5)
        expect(results.filter(r => r.status === 402).length).toBe(15)

        const list = await call('GET', '/products', s.token)
        expect(list.body.products).toHaveLength(50)
    })

    test('batas dihitung per toko', async () => {
        const a = await registerStore('perA')
        const b = await registerStore('perB')
        await goFree(a.storeId)
        await goFree(b.storeId)
        await addMany(a.token, 50)

        expect((await addProduct(a.token)).status).toBe(402)
        expect((await addProduct(b.token)).status).toBe(201)
    })
})

describe('kunci fitur bon', () => {
    test('paket gratis tidak bisa membuat bon baru, tetapi bon lama tetap bisa dilihat dan dibayar', async () => {
        const s = await registerStore('bongate')
        const prod = (await addProduct(s.token, { price: 10000, stock: 20 })).body.product

        const cust = await call('POST', '/customers', s.token, { name: 'Bu Ani' })
        expect(cust.status).toBe(201)
        const customerId = cust.body.customer.customerId
        const sale = await call('POST', '/transaction', s.token, {
            items: [{ productId: prod.productId, quantity: 3 }], paymentMethod: 'BON', customerId,
        })
        expect(sale.status).toBe(201) // utang 30000

        await goFree(s.storeId)

        const newCustomer = await call('POST', '/customers', s.token, { name: 'Pelanggan Baru' })
        expect(newCustomer.status).toBe(402)
        expect(newCustomer.body.code).toBe('PLAN_REQUIRED')
        expect(newCustomer.body.feature).toBe('bon')

        const newBon = await call('POST', '/transaction', s.token, {
            items: [{ productId: prod.productId, quantity: 1 }], paymentMethod: 'BON', customerId,
        })
        expect(newBon.status).toBe(402)
        const stock = (await call('GET', '/products', s.token)).body.products.find((p: any) => p.productId === prod.productId).stock
        expect(stock).toBe(17) // 20 - 3; bon yang ditolak tidak memotong stok

        expect((await call('POST', `/customers/${customerId}/charges`, s.token, { amount: 5000 })).status).toBe(402)

        // Bon lama tetap terlihat dan bisa dilunasi.
        const list = await call('GET', '/customers', s.token)
        expect(list.status).toBe(200)
        expect(list.body.totalOutstanding).toBe(30000)
        expect((await call('GET', `/customers/${customerId}`, s.token)).status).toBe(200)
        const pay = await call('POST', `/customers/${customerId}/payments`, s.token, { amount: 30000 })
        expect(pay.status).toBe(201)
        expect(pay.body.settled).toBe(true)

        // Metode bayar lain tetap normal di paket gratis.
        const cash = await call('POST', '/transaction', s.token, {
            items: [{ productId: prod.productId, quantity: 1 }], paymentMethod: 'CASH',
        })
        expect(cash.status).toBe(201)

        await goToko(s.storeId)
        expect((await call('POST', '/customers', s.token, { name: 'Pelanggan Baru' })).status).toBe(201)
    })
})

describe('aktivasi paket manual', () => {
    test('setStorePlan lewat username: hari, forever, dan kembali ke gratis', async () => {
        const s = await registerStore('activate')
        await goFree(s.storeId)

        const thirty = await setStorePlan(prisma, s.username.toUpperCase(), 'TOKO', { days: 30 })
        expect(thirty.plan).toBe('TOKO')
        let plan = await call('GET', '/plan', s.token)
        expect(plan.body.plan).toBe('TOKO')
        expect(plan.body.isTrial).toBe(false)
        expect(plan.body.daysLeft).toBe(30)

        await setStorePlan(prisma, s.storeId, 'TOKO', 'forever')
        plan = await call('GET', '/plan', s.token)
        expect(plan.body.expiresAt).toBeNull()
        expect(plan.body.plan).toBe('TOKO')

        await setStorePlan(prisma, s.storeId, 'FREE')
        plan = await call('GET', '/plan', s.token)
        expect(plan.body.plan).toBe('FREE')
    })

    test('setStorePlan menolak masukan yang salah', async () => {
        const s = await registerStore('activatebad')
        await expect(setStorePlan(prisma, 'tidak-ada-toko-ini', 'TOKO', 'forever')).rejects.toThrow('tidak ditemukan')
        await expect(setStorePlan(prisma, s.storeId, 'TOKO')).rejects.toThrow('masa berlaku')
        await expect(setStorePlan(prisma, s.storeId, 'TOKO', { days: 0 })).rejects.toThrow('hari')
        await expect(setStorePlan(prisma, s.storeId, 'TOKO', { days: -3 })).rejects.toThrow('hari')
    })
})
