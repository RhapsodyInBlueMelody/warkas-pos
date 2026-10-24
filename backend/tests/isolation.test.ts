import { describe, expect, test } from 'bun:test'
import { app } from '../src/app'

// Butuh Postgres dengan migrasi sudah diterapkan. Lihat backend/README di PROGRESS.md.
// Jalankan: DATABASE_URL=... JWT_SECRET=... bun test

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
    const username = `${label}_${run}_${counter++}`
    const res = await call('POST', '/register', undefined, {
        storeName: `Toko ${label}`,
        name: `Pemilik ${label}`,
        username,
        password: 'password-123',
    })
    expect(res.status).toBe(201)
    return { token: res.body.token as string, username, storeId: res.body.store.storeId as string }
}

async function createProduct(token: string, extra: Record<string, unknown> = {}) {
    const res = await call('POST', '/products', token, {
        name: 'Barang Uji', price: 5000, stock: 10, unit: 'PCS', ...extra,
    })
    expect(res.status).toBe(201)
    return res.body.product as { productId: string; code: string; stock: number }
}

describe('autentikasi', () => {
    test('daftar membuat toko dan login berhasil; password salah ditolak', async () => {
        const a = await registerStore('auth')

        const ok = await call('POST', '/login', undefined, { username: a.username, password: 'password-123' })
        expect(ok.status).toBe(200)
        expect(ok.body.store.storeId).toBe(a.storeId)

        const bad = await call('POST', '/login', undefined, { username: a.username, password: 'salah-salah' })
        expect(bad.status).toBe(401)
        const ghost = await call('POST', '/login', undefined, { username: 'tidak_ada_xyz', password: 'salah-salah' })
        expect(ghost.status).toBe(401)
        expect(ghost.body).toEqual(bad.body)
    })

    test('username ganda ditolak dan password pendek ditolak', async () => {
        const a = await registerStore('dup')
        const dup = await call('POST', '/register', undefined, {
            storeName: 'Lain', name: 'Lain', username: a.username.toUpperCase(), password: 'password-123',
        })
        expect(dup.status).toBe(409)

        const weak = await call('POST', '/register', undefined, {
            storeName: 'Lain', name: 'Lain', username: `weak_${run}`, password: 'pendek',
        })
        expect(weak.status).toBe(422)
    })

    test('route terproteksi menolak tanpa token', async () => {
        for (const [m, p] of [['GET', '/products'], ['GET', '/transactions'], ['GET', '/profile'], ['GET', '/staff']] as const) {
            const res = await call(m, p)
            expect(res.status).toBe(401)
        }
    })
})

describe('isolasi antar toko', () => {
    test('kode produk boleh sama di dua toko', async () => {
        const a = await registerStore('kodeA')
        const b = await registerStore('kodeB')
        await createProduct(a.token, { code: 'SAMA001' })
        await createProduct(b.token, { code: 'SAMA001' })

        const dupInStore = await call('POST', '/products', a.token, {
            code: 'SAMA001', name: 'x', price: 1, stock: 1, unit: 'PCS',
        })
        expect(dupInStore.status).toBe(409)
    })

    test('daftar produk hanya berisi produk tokonya sendiri', async () => {
        const a = await registerStore('listA')
        const b = await registerStore('listB')
        const pa = await createProduct(a.token)

        const listB = await call('GET', '/products', b.token)
        expect(listB.status).toBe(200)
        expect(listB.body.products.map((p: any) => p.productId)).not.toContain(pa.productId)

        const listA = await call('GET', '/products', a.token)
        expect(listA.body.products.map((p: any) => p.productId)).toContain(pa.productId)
    })

    test('toko B tidak bisa mengubah atau menghapus produk toko A', async () => {
        const a = await registerStore('mutA')
        const b = await registerStore('mutB')
        const pa = await createProduct(a.token, { name: 'Asli' })

        const patch = await call('PATCH', `/product/${pa.productId}`, b.token, { name: 'Dibajak', price: 1 })
        expect(patch.status).toBe(404)
        const del = await call('DELETE', `/product/${pa.productId}`, b.token)
        expect(del.status).toBe(404)

        const after = await call('GET', '/products', a.token)
        const still = after.body.products.find((p: any) => p.productId === pa.productId)
        expect(still.name).toBe('Asli')
        expect(Number(still.price)).toBe(5000)
    })

    test('toko B tidak bisa menjual produk toko A', async () => {
        const a = await registerStore('selA')
        const b = await registerStore('selB')
        const pa = await createProduct(a.token, { stock: 10 })

        const trx = await call('POST', '/transaction', b.token, {
            items: [{ productId: pa.productId, quantity: 1 }], paymentMethod: 'CASH',
        })
        expect(trx.status).toBe(400)

        const after = await call('GET', '/products', a.token)
        expect(after.body.products.find((p: any) => p.productId === pa.productId).stock).toBe(10)
    })

    test('produk tidak bisa ditautkan ke kategori toko lain', async () => {
        const a = await registerStore('catA')
        const b = await registerStore('catB')
        const cat = await call('POST', '/categories', a.token, { name: 'Milik A' })
        expect(cat.status).toBe(201)

        const res = await call('POST', '/products', b.token, {
            name: 'x', price: 1, stock: 1, unit: 'PCS', categoryId: cat.body.category.categoryId,
        })
        expect(res.status).toBe(400)
    })

    test('riwayat transaksi dan profil dibatasi per toko', async () => {
        const a = await registerStore('hisA')
        const b = await registerStore('hisB')
        const pa = await createProduct(a.token)
        const sale = await call('POST', '/transaction', a.token, {
            items: [{ productId: pa.productId, quantity: 2 }], paymentMethod: 'QRIS',
        })
        expect(sale.status).toBe(201)

        const histA = await call('GET', '/transactions', a.token)
        expect(histA.body.data.map((t: any) => t.code)).toContain(sale.body.transactionCode)
        const histB = await call('GET', '/transactions', b.token)
        expect(histB.body.data).toEqual([])

        const prof = await call('GET', '/profile', b.token)
        expect(prof.body.profile.store.storeId).toBe(b.storeId)
    })
})

describe('peran dan stok', () => {
    test('kasir tidak bisa kelola produk atau staf; hanya melihat transaksinya sendiri', async () => {
        const owner = await registerStore('roleO')
        const kasirName = `kasir_${run}_${counter++}`
        const add = await call('POST', '/staff', owner.token, { name: 'Kasir Satu', username: kasirName, password: 'password-123' })
        expect(add.status).toBe(201)
        expect(add.body.staff.role).toBe('KASIR')

        const login = await call('POST', '/login', undefined, { username: kasirName, password: 'password-123' })
        const kasirToken = login.body.token as string

        expect((await call('POST', '/products', kasirToken, { name: 'x', price: 1, stock: 1, unit: 'PCS' })).status).toBe(403)
        expect((await call('POST', '/staff', kasirToken, { name: 'y', username: `y_${run}`, password: 'password-123' })).status).toBe(403)
        expect((await call('GET', '/staff', kasirToken)).status).toBe(403)

        const p = await createProduct(owner.token, { stock: 20 })
        await call('POST', '/transaction', owner.token, { items: [{ productId: p.productId, quantity: 1 }], paymentMethod: 'CASH' })
        const sale = await call('POST', '/transaction', kasirToken, { items: [{ productId: p.productId, quantity: 1 }], paymentMethod: 'CASH' })
        expect(sale.status).toBe(201)

        const kasirHist = await call('GET', '/transactions', kasirToken)
        expect(kasirHist.body.data.length).toBe(1)
        const ownerHist = await call('GET', '/transactions', owner.token)
        expect(ownerHist.body.data.length).toBe(2)
    })

    test('dua checkout bersamaan tidak membuat stok negatif', async () => {
        const a = await registerStore('race')
        const p = await createProduct(a.token, { stock: 10 })

        const body = { items: [{ productId: p.productId, quantity: 6 }], paymentMethod: 'CASH' }
        const [r1, r2] = await Promise.all([
            call('POST', '/transaction', a.token, body),
            call('POST', '/transaction', a.token, body),
        ])

        const statuses = [r1.status, r2.status].sort()
        expect(statuses).toEqual([201, 400])

        const after = await call('GET', '/products', a.token)
        expect(after.body.products.find((x: any) => x.productId === p.productId).stock).toBe(4)
    })

    test('stok tidak cukup ditolak dan harga ditentukan server', async () => {
        const a = await registerStore('stok')
        const p = await createProduct(a.token, { stock: 2, price: 2500 })

        const over = await call('POST', '/transaction', a.token, { items: [{ productId: p.productId, quantity: 3 }], paymentMethod: 'CASH' })
        expect(over.status).toBe(400)

        const ok = await call('POST', '/transaction', a.token, {
            items: [{ productId: p.productId, quantity: 2, price: 1 }], paymentMethod: 'CASH',
        } as any)
        // field price tidak ada di skema; ditolak atau diabaikan, tapi total harus 5000.
        if (ok.status === 201) {
            const hist = await call('GET', '/transactions', a.token)
            expect(hist.body.data[0].totalPrice).toBe(5000)
        } else {
            expect(ok.status).toBe(422)
        }
    })
})
