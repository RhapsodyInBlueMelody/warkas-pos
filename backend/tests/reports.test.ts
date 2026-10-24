import { describe, expect, test } from 'bun:test'
import { app } from '../src/app'

// Butuh Postgres dengan semua migrasi diterapkan. Jalankan: DATABASE_URL=... JWT_SECRET=... bun test
// Catatan: tes "hari ini" bisa gagal bila dijalankan tepat saat pergantian hari (00:00 WIB).

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
    const username = `r_${label}_${run}_${counter++}`
    const res = await call('POST', '/register', undefined, {
        storeName: `Toko ${label}`, name: `Pemilik ${label}`, username, password: 'password-123',
    })
    expect(res.status).toBe(201)
    return { token: res.body.token as string }
}

async function addProduct(token: string, extra: Record<string, unknown>) {
    const res = await call('POST', '/products', token, { name: 'Barang', unit: 'PCS', price: 1000, stock: 50, ...extra })
    expect(res.status).toBe(201)
    return res.body.product as { productId: string; stock: number; lowStock: boolean; minStock: number }
}

async function sell(token: string, items: Array<[string, number]>, paymentMethod = 'CASH') {
    const res = await call('POST', '/transaction', token, {
        items: items.map(([productId, quantity]) => ({ productId, quantity })),
        paymentMethod,
    })
    expect(res.status).toBe(201)
}

const todayWib = () => new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10)

describe('laporan harian', () => {
    test('menghitung omzet, modal, untung, metode bayar, dan produk teratas', async () => {
        const { token } = await registerStore('lap')
        const p1 = await addProduct(token, { name: 'Kopi', price: 10000, costPrice: 6000 })
        const p2 = await addProduct(token, { name: 'Roti', price: 5000, costPrice: 3000 })
        await sell(token, [[p1.productId, 2]], 'CASH')   // omzet 20000, modal 12000
        await sell(token, [[p2.productId, 3]], 'QRIS')   // omzet 15000, modal 9000

        const rep = await call('GET', `/reports/daily?date=${todayWib()}`, token)
        expect(rep.status).toBe(200)
        expect(rep.body.transactionCount).toBe(2)
        expect(rep.body.revenue).toBe(35000)
        expect(rep.body.cost).toBe(21000)
        expect(rep.body.profit).toBe(14000)
        expect(rep.body.profitComplete).toBe(true)
        expect(rep.body.byPayment.CASH).toEqual({ count: 1, revenue: 20000 })
        expect(rep.body.byPayment.QRIS).toEqual({ count: 1, revenue: 15000 })
        expect(rep.body.byPayment.TRANSFER).toEqual({ count: 0, revenue: 0 })
        expect(rep.body.topProducts[0].name).toBe('Kopi')
        expect(rep.body.topProducts[0].quantity).toBe(2)
    })

    test('mengubah harga modal tidak mengubah laporan transaksi lama', async () => {
        const { token } = await registerStore('snap')
        const p = await addProduct(token, { price: 10000, costPrice: 6000 })
        await sell(token, [[p.productId, 1]])

        const patch = await call('PATCH', `/product/${p.productId}`, token, { costPrice: 9500, price: 12000 })
        expect(patch.status).toBe(200)

        const rep = await call('GET', `/reports/daily?date=${todayWib()}`, token)
        expect(rep.body.revenue).toBe(10000)
        expect(rep.body.cost).toBe(6000)
        expect(rep.body.profit).toBe(4000)
    })

    test('item tanpa harga modal ditandai dan tidak dihitung sebagai untung', async () => {
        const { token } = await registerStore('nocost')
        const withCost = await addProduct(token, { price: 10000, costPrice: 6000 })
        const noCost = await addProduct(token, { price: 4000 })
        await sell(token, [[withCost.productId, 1], [noCost.productId, 1]])

        const rep = await call('GET', `/reports/daily?date=${todayWib()}`, token)
        expect(rep.body.revenue).toBe(14000)
        expect(rep.body.profit).toBe(4000)
        expect(rep.body.profitComplete).toBe(false)
        expect(rep.body.uncostedItemCount).toBe(1)
        expect(rep.body.uncostedRevenue).toBe(4000)
    })

    test('hanya data tokonya dan hari yang diminta; tanggal salah ditolak', async () => {
        const a = await registerStore('dayA')
        const b = await registerStore('dayB')
        const p = await addProduct(a.token, { price: 7000, costPrice: 5000 })
        await sell(a.token, [[p.productId, 1]])

        const repB = await call('GET', `/reports/daily?date=${todayWib()}`, b.token)
        expect(repB.body.transactionCount).toBe(0)
        expect(repB.body.revenue).toBe(0)

        const yesterday = new Date(Date.now() + 7 * 3600_000 - 86_400_000).toISOString().slice(0, 10)
        const repY = await call('GET', `/reports/daily?date=${yesterday}`, a.token)
        expect(repY.body.transactionCount).toBe(0)

        // Dengan offset UTC, tanggal UTC hari ini harus memuat transaksi yang baru dibuat.
        const utcToday = new Date().toISOString().slice(0, 10)
        const repUtc = await call('GET', `/reports/daily?date=${utcToday}&tzOffset=0`, a.token)
        expect(repUtc.body.transactionCount).toBe(1)

        expect((await call('GET', '/reports/daily?date=2026-02-31', a.token)).status).toBe(400)
        expect((await call('GET', '/reports/daily?date=bukan-tanggal', a.token)).status).toBe(422)
    })
})

describe('kerahasiaan modal', () => {
    test('kasir tidak bisa membuka laporan dan tidak melihat modal', async () => {
        const owner = await registerStore('rahasia')
        const kasirName = `kasir_${run}_${counter++}`
        await call('POST', '/staff', owner.token, { name: 'Kasir', username: kasirName, password: 'password-123' })
        const kasirToken = (await call('POST', '/login', undefined, { username: kasirName, password: 'password-123' })).body.token as string

        const p = await addProduct(owner.token, { price: 10000, costPrice: 6000 })
        expect((await call('GET', '/reports/daily', kasirToken)).status).toBe(403)

        const prods = await call('GET', '/products', kasirToken)
        expect(prods.body.products[0]).not.toHaveProperty('costPrice')
        const low = await call('GET', '/products/low-stock', kasirToken)
        for (const item of low.body.products) expect(item).not.toHaveProperty('costPrice')

        await sell(kasirToken, [[p.productId, 1]])
        const kasirHist = await call('GET', '/transactions', kasirToken)
        expect(kasirHist.body.data[0].items[0]).not.toHaveProperty('costAtTime')

        const ownerProds = await call('GET', '/products', owner.token)
        expect(Number(ownerProds.body.products[0].costPrice)).toBe(6000)
        const ownerHist = await call('GET', '/transactions', owner.token)
        expect(ownerHist.body.data[0].items[0].costAtTime).toBe(6000)
    })
})

describe('stok menipis', () => {
    test('batas default 5, menipis saat stok <= minStock, dan terpisah antar toko', async () => {
        const a = await registerStore('lowA')
        const b = await registerStore('lowB')
        const p = await addProduct(a.token, { name: 'Gula', stock: 6 })
        expect(p.minStock).toBe(5)
        expect(p.lowStock).toBe(false)

        const before = await call('GET', '/products/low-stock', a.token)
        expect(before.body.products.map((x: any) => x.productId)).not.toContain(p.productId)

        await sell(a.token, [[p.productId, 1]]) // stok jadi 5 = batas
        const after = await call('GET', '/products/low-stock', a.token)
        expect(after.body.products.map((x: any) => x.productId)).toContain(p.productId)
        const list = await call('GET', '/products', a.token)
        expect(list.body.products.find((x: any) => x.productId === p.productId).lowStock).toBe(true)

        const other = await call('GET', '/products/low-stock', b.token)
        expect(other.body.products).toEqual([])

        const custom = await addProduct(a.token, { name: 'Telur', stock: 20, minStock: 20 })
        expect(custom.lowStock).toBe(true)
    })
})
