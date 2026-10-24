import { describe, expect, test } from 'bun:test'
import { app } from '../src/app'

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
    const username = `b_${label}_${run}_${counter++}`
    const res = await call('POST', '/register', undefined, {
        storeName: `Toko ${label}`, name: `Pemilik ${label}`, username, password: 'password-123',
    })
    expect(res.status).toBe(201)
    return { token: res.body.token as string }
}

async function addProduct(token: string, extra: Record<string, unknown> = {}) {
    const res = await call('POST', '/products', token, { name: 'Barang', unit: 'PCS', price: 10000, stock: 50, ...extra })
    expect(res.status).toBe(201)
    return res.body.product as { productId: string }
}

async function addCustomer(token: string, name = 'Bu Ani') {
    const res = await call('POST', '/customers', token, { name })
    expect(res.status).toBe(201)
    return res.body.customer.customerId as string
}

async function bonSale(token: string, customerId: string, productId: string, quantity: number) {
    return call('POST', '/transaction', token, {
        items: [{ productId, quantity }], paymentMethod: 'BON', customerId,
    })
}

const todayWib = () => new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10)

describe('transaksi BON', () => {
    test('menambah utang pelanggan dan memotong stok', async () => {
        const { token } = await registerStore('bonsale')
        const p = await addProduct(token, { price: 10000, stock: 10 })
        const c = await addCustomer(token)

        const sale = await bonSale(token, c, p.productId, 3)
        expect(sale.status).toBe(201)

        const detail = await call('GET', `/customers/${c}`, token)
        expect(detail.body.balance).toBe(30000)
        expect(detail.body.entries).toHaveLength(1)
        expect(detail.body.entries[0].type).toBe('CHARGE')
        expect(detail.body.entries[0].transaction.code).toBe(sale.body.transactionCode)

        const prods = await call('GET', '/products', token)
        expect(prods.body.products.find((x: any) => x.productId === p.productId).stock).toBe(7)

        const hist = await call('GET', '/transactions', token)
        expect(hist.body.data[0].customer.name).toBe('Bu Ani')
    })

    test('BON wajib pelanggan; pelanggan tidak boleh dipakai pada metode lain', async () => {
        const { token } = await registerStore('bonrule')
        const p = await addProduct(token)
        const c = await addCustomer(token)

        const noCustomer = await call('POST', '/transaction', token, {
            items: [{ productId: p.productId, quantity: 1 }], paymentMethod: 'BON',
        })
        expect(noCustomer.status).toBe(400)

        const cashWithCustomer = await call('POST', '/transaction', token, {
            items: [{ productId: p.productId, quantity: 1 }], paymentMethod: 'CASH', customerId: c,
        })
        expect(cashWithCustomer.status).toBe(400)

        const detail = await call('GET', `/customers/${c}`, token)
        expect(detail.body.balance).toBe(0)
    })

    test('stok tidak cukup membatalkan transaksi dan tidak mencatat utang', async () => {
        const { token } = await registerStore('bonrollback')
        const p = await addProduct(token, { stock: 2 })
        const c = await addCustomer(token)

        const sale = await bonSale(token, c, p.productId, 5)
        expect(sale.status).toBe(400)

        const detail = await call('GET', `/customers/${c}`, token)
        expect(detail.body.balance).toBe(0)
        expect(detail.body.entries).toEqual([])
    })
})

describe('pembayaran bon', () => {
    test('cicilan mengurangi utang; pelunasan menandai settled; bayar berlebih ditolak', async () => {
        const { token } = await registerStore('cicil')
        const p = await addProduct(token, { price: 10000 })
        const c = await addCustomer(token)
        await bonSale(token, c, p.productId, 10) // utang 100000

        const first = await call('POST', `/customers/${c}/payments`, token, { amount: 40000, note: 'cicilan 1' })
        expect(first.status).toBe(201)
        expect(first.body.balance).toBe(60000)
        expect(first.body.settled).toBe(false)

        const over = await call('POST', `/customers/${c}/payments`, token, { amount: 60001 })
        expect(over.status).toBe(400)
        expect(over.body.balance).toBe(60000)

        const last = await call('POST', `/customers/${c}/payments`, token, { amount: 60000 })
        expect(last.status).toBe(201)
        expect(last.body.balance).toBe(0)
        expect(last.body.settled).toBe(true)

        const detail = await call('GET', `/customers/${c}`, token)
        expect(detail.body.balance).toBe(0)
        expect(detail.body.entries.map((e: any) => e.type).sort()).toEqual(['CHARGE', 'PAYMENT', 'PAYMENT'])

        const again = await call('POST', `/customers/${c}/payments`, token, { amount: 1 })
        expect(again.status).toBe(400)
    })

    test('jumlah nol, negatif, atau bukan angka ditolak', async () => {
        const { token } = await registerStore('amount')
        const c = await addCustomer(token)
        for (const amount of [0, -5000, 'abc']) {
            const res = await call('POST', `/customers/${c}/payments`, token, { amount })
            expect(res.status).toBe(422)
        }
    })

    test('dua pembayaran bersamaan tidak melebihi sisa utang', async () => {
        const { token } = await registerStore('race')
        const p = await addProduct(token, { price: 10000 })
        const c = await addCustomer(token)
        await bonSale(token, c, p.productId, 10) // utang 100000

        // 12 pembayaran 20000 serentak terhadap utang 100000: tepat 5 yang boleh lolos.
        // Dua permintaan saja terlalu mudah lolos secara kebetulan tanpa kunci baris.
        const results = await Promise.all(
            Array.from({ length: 12 }, () => call('POST', `/customers/${c}/payments`, token, { amount: 20000 }))
        )
        const ok = results.filter(r => r.status === 201).length
        expect(ok).toBe(5)
        expect(results.filter(r => r.status === 400).length).toBe(7)

        const detail = await call('GET', `/customers/${c}`, token)
        expect(detail.body.balance).toBe(0)
    })

    test('kasir boleh mencatat pembayaran dan bon, tetapi tidak boleh menambah utang manual', async () => {
        const owner = await registerStore('peran')
        const kasirName = `kasir_${run}_${counter++}`
        await call('POST', '/staff', owner.token, { name: 'Kasir', username: kasirName, password: 'password-123' })
        const kasir = (await call('POST', '/login', undefined, { username: kasirName, password: 'password-123' })).body.token as string

        const p = await addProduct(owner.token, { price: 10000 })
        const c = await addCustomer(kasir, 'Pak Budi')

        expect((await bonSale(kasir, c, p.productId, 2)).status).toBe(201)
        expect((await call('POST', `/customers/${c}/payments`, kasir, { amount: 5000 })).status).toBe(201)
        expect((await call('POST', `/customers/${c}/charges`, kasir, { amount: 999999 })).status).toBe(403)

        const manual = await call('POST', `/customers/${c}/charges`, owner.token, { amount: 25000, note: 'bon kertas lama' })
        expect(manual.status).toBe(201)
        expect(manual.body.balance).toBe(40000) // 20000 - 5000 + 25000
    })
})

describe('isolasi bon antar toko', () => {
    test('toko B tidak bisa melihat, mengubah, membayar, atau berutang atas nama pelanggan toko A', async () => {
        const a = await registerStore('isoA')
        const b = await registerStore('isoB')
        const pa = await addProduct(a.token, { price: 10000 })
        const pb = await addProduct(b.token, { price: 10000 })
        const ca = await addCustomer(a.token, 'Pelanggan A')
        await bonSale(a.token, ca, pa.productId, 1)

        const listB = await call('GET', '/customers', b.token)
        expect(listB.body.customers).toEqual([])
        expect(listB.body.totalOutstanding).toBe(0)

        expect((await call('GET', `/customers/${ca}`, b.token)).status).toBe(404)
        expect((await call('PATCH', `/customers/${ca}`, b.token, { name: 'Dibajak' })).status).toBe(404)
        expect((await call('POST', `/customers/${ca}/payments`, b.token, { amount: 1000 })).status).toBe(404)
        expect((await call('POST', `/customers/${ca}/charges`, b.token, { amount: 1000 })).status).toBe(404)
        expect((await bonSale(b.token, ca, pb.productId, 1)).status).toBe(400)

        const detail = await call('GET', `/customers/${ca}`, a.token)
        expect(detail.body.customer.name).toBe('Pelanggan A')
        expect(detail.body.balance).toBe(10000)
        expect(detail.body.entries).toHaveLength(1)
    })

    test('daftar pelanggan: cari nama, filter yang berutang, dan total utang', async () => {
        const { token } = await registerStore('daftar')
        const p = await addProduct(token, { price: 10000 })
        const ani = await addCustomer(token, 'Bu Ani')
        await addCustomer(token, 'Pak Budi')
        const cici = await addCustomer(token, 'Mbak Cici')
        await bonSale(token, ani, p.productId, 2)  // 20000
        await bonSale(token, cici, p.productId, 5) // 50000

        const all = await call('GET', '/customers', token)
        expect(all.body.customers).toHaveLength(3)
        expect(all.body.totalOutstanding).toBe(70000)

        const withDebt = await call('GET', '/customers?withDebt=true', token)
        expect(withDebt.body.customers.map((c: any) => c.name)).toEqual(['Mbak Cici', 'Bu Ani'])

        const search = await call('GET', '/customers?search=budi', token)
        expect(search.body.customers.map((c: any) => c.name)).toEqual(['Pak Budi'])
    })

    test('route bon menolak permintaan tanpa token', async () => {
        for (const [m, p] of [['GET', '/customers'], ['POST', '/customers'], ['GET', '/customers/x']] as const) {
            expect((await call(m, p)).status).toBe(401)
        }
    })
})

describe('laporan dengan bon', () => {
    test('penjualan bon masuk omzet tetapi bukan uang masuk; pelunasan menambah uang masuk', async () => {
        const { token } = await registerStore('lapbon')
        const p = await addProduct(token, { price: 10000, costPrice: 6000 })
        const c = await addCustomer(token)

        await call('POST', '/transaction', token, { items: [{ productId: p.productId, quantity: 2 }], paymentMethod: 'CASH' })   // 20000 tunai
        await bonSale(token, c, p.productId, 3)                                                                                  // 30000 bon
        await call('POST', `/customers/${c}/payments`, token, { amount: 10000 })

        const rep = await call('GET', `/reports/daily?date=${todayWib()}`, token)
        expect(rep.status).toBe(200)
        expect(rep.body.revenue).toBe(50000)
        expect(rep.body.byPayment.BON).toEqual({ count: 1, revenue: 30000 })
        expect(rep.body.byPayment.CASH).toEqual({ count: 1, revenue: 20000 })
        expect(rep.body.debtPaymentsReceived).toBe(10000)
        expect(rep.body.cashIn).toBe(30000)          // 20000 tunai + 10000 pelunasan
        expect(rep.body.debtOutstanding).toBe(20000) // 30000 - 10000
        expect(rep.body.profit).toBe(20000)          // untung dihitung dari penjualan: 50000 - 5 * 6000
    })
})
