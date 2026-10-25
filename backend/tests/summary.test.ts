import { describe, expect, test } from 'bun:test'
import { app } from '../src/app'
import { prisma } from '../src/lib/prisma'

// Butuh Postgres dengan semua migrasi diterapkan. Jalankan: DATABASE_URL=... JWT_SECRET=... bun test
// Transaksi dibuat lewat API lalu waktunya dimundurkan ke tanggal tetap, jadi tes tidak bergantung pada jam berjalan.
// Tanggal acuan 2026-10-21 adalah hari Rabu; minggunya 2026-10-19 (Senin) sampai 2026-10-25 (Minggu).

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
    const username = `s_${label}_${run}_${counter++}`
    const res = await call('POST', '/register', undefined, {
        storeName: `Toko ${label}`, name: `Pemilik ${label}`, username, password: 'password-123',
    })
    expect(res.status).toBe(201)
    return { token: res.body.token as string, storeId: res.body.store.storeId as string }
}

async function addProduct(token: string) {
    const res = await call('POST', '/products', token, {
        name: 'Barang', unit: 'PCS', price: 10000, costPrice: 6000, stock: 1000,
    })
    expect(res.status).toBe(201)
    return res.body.product.productId as string
}

/** Jual 1 unit lalu mundurkan createdAt ke waktu tertentu (UTC). */
async function sellAt(token: string, productId: string, isoUtc: string, extra: Record<string, unknown> = {}) {
    const res = await call('POST', '/transaction', token, {
        items: [{ productId, quantity: 1 }], paymentMethod: 'CASH', ...extra,
    })
    expect(res.status).toBe(201)
    await prisma.transaction.update({
        where: { code: res.body.transactionCode },
        data: { createdAt: new Date(isoUtc) },
    })
}

const goFree = (storeId: string) => prisma.store.update({ where: { storeId }, data: { plan: 'FREE', planExpiresAt: null } })

// Satu toko dengan penjualan di sekitar batas hari/minggu/bulan, dibuat sekali dan dipakai ulang.
let shared: Promise<{ token: string; storeId: string }> | undefined
function sharedStore() {
    shared ??= (async () => {
        const s = await registerStore('batas')
        const p = await addProduct(s.token)
        for (const at of [
            '2026-10-18T16:59:59Z', // Sab 18 Okt 23:59:59 WIB -> minggu sebelumnya
            '2026-10-19T10:00:00Z', // Sen 19 Okt 17:00 WIB
            '2026-10-20T16:59:59Z', // Sel 20 Okt 23:59:59 WIB
            '2026-10-20T17:00:00Z', // Rab 21 Okt 00:00:00 WIB
            '2026-10-25T16:59:59Z', // Min 25 Okt 23:59:59 WIB
            '2026-10-25T17:00:00Z', // Sen 26 Okt 00:00:00 WIB -> minggu berikutnya
            '2026-10-31T17:00:00Z', // Min 1 Nov 00:00:00 WIB -> bulan berikutnya
        ]) await sellAt(s.token, p, at)
        return s
    })()
    return shared
}

describe('akses', () => {
    test('paket gratis ditolak 402 tetapi laporan harian tetap bisa', async () => {
        const s = await registerStore('gratis')
        await goFree(s.storeId)

        const week = await call('GET', '/reports/summary?period=week', s.token)
        expect(week.status).toBe(402)
        expect(week.body.code).toBe('PLAN_REQUIRED')
        expect(week.body.feature).toBe('extendedReports')
        expect((await call('GET', '/reports/summary?period=month', s.token)).status).toBe(402)
        expect((await call('GET', '/reports/daily', s.token)).status).toBe(200)
    })

    test('kasir ditolak 403; parameter salah ditolak', async () => {
        const owner = await registerStore('aksesperan')
        const kasirName = `kasir_${run}_${counter++}`
        await call('POST', '/staff', owner.token, { name: 'Kasir', username: kasirName, password: 'password-123' })
        const kasir = (await call('POST', '/login', undefined, { username: kasirName, password: 'password-123' })).body.token

        expect((await call('GET', '/reports/summary?period=week', kasir)).status).toBe(403)
        expect((await call('GET', '/reports/summary?period=year', owner.token)).status).toBe(422)
        expect((await call('GET', '/reports/summary', owner.token)).status).toBe(422)
        expect((await call('GET', '/reports/summary?period=week&date=2026-02-31', owner.token)).status).toBe(400)
        expect((await call('GET', '/reports/summary?period=week')).status).toBe(401)
    })
})

describe('laporan mingguan', () => {
    test('rentang Senin-Minggu dan pembagian per hari memakai hari kalender WIB', async () => {
        const s = await sharedStore()
        const rep = await call('GET', '/reports/summary?period=week&date=2026-10-21', s.token)
        expect(rep.status).toBe(200)
        expect(rep.body.from).toBe('2026-10-19')
        expect(rep.body.to).toBe('2026-10-25')
        expect(rep.body.days.map((d: any) => d.date)).toEqual([
            '2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23', '2026-10-24', '2026-10-25',
        ])

        // Masuk minggu ini: 19 Okt, 20 Okt 23:59:59, 21 Okt 00:00:00, 25 Okt 23:59:59 = 4 transaksi.
        expect(rep.body.transactionCount).toBe(4)
        expect(rep.body.revenue).toBe(40000)
        expect(rep.body.cost).toBe(24000)
        expect(rep.body.profit).toBe(16000)
        expect(rep.body.profitComplete).toBe(true)

        const counts = rep.body.days.map((d: any) => d.transactionCount)
        expect(counts).toEqual([1, 1, 1, 0, 0, 0, 1])

        const sumRevenue = rep.body.days.reduce((a: number, d: any) => a + d.revenue, 0)
        const sumProfit = rep.body.days.reduce((a: number, d: any) => a + d.profit, 0)
        expect(sumRevenue).toBe(rep.body.revenue)
        expect(sumProfit).toBe(rep.body.profit)
    })

    test('tanggal acuan boleh hari apa pun dalam minggu itu', async () => {
        const s = await sharedStore()
        const mon = await call('GET', '/reports/summary?period=week&date=2026-10-19', s.token)
        const sun = await call('GET', '/reports/summary?period=week&date=2026-10-25', s.token)
        expect(mon.body.from).toBe('2026-10-19')
        expect(sun.body.from).toBe('2026-10-19')
        expect(sun.body.to).toBe('2026-10-25')
        expect(mon.body.transactionCount).toBe(sun.body.transactionCount)

        const prev = await call('GET', '/reports/summary?period=week&date=2026-10-18', s.token)
        expect(prev.body.from).toBe('2026-10-12')
        expect(prev.body.transactionCount).toBe(1) // hanya Sab 18 Okt 23:59:59 WIB
    })

    test('offset zona waktu menggeser batas hari', async () => {
        const s = await sharedStore()
        // Dengan UTC: 20 Okt 17:00Z tetap 20 Okt, dan 25 Okt 17:00Z masuk 25 Okt (masih minggu ini).
        const rep = await call('GET', '/reports/summary?period=week&date=2026-10-21&tzOffset=0', s.token)
        expect(rep.body.transactionCount).toBe(5)
        expect(rep.body.days.map((d: any) => d.transactionCount)).toEqual([1, 2, 0, 0, 0, 0, 2])
    })
})

describe('laporan bulanan', () => {
    test('batas bulan memakai hari kalender WIB', async () => {
        const s = await sharedStore()
        const oct = await call('GET', '/reports/summary?period=month&date=2026-10-21', s.token)
        expect(oct.body.from).toBe('2026-10-01')
        expect(oct.body.to).toBe('2026-10-31')
        expect(oct.body.days).toHaveLength(31)
        // 6 transaksi di Oktober WIB; yang 31 Okt 17:00Z sudah 1 Nov WIB.
        expect(oct.body.transactionCount).toBe(6)

        const nov = await call('GET', '/reports/summary?period=month&date=2026-11-15', s.token)
        expect(nov.body.from).toBe('2026-11-01')
        expect(nov.body.to).toBe('2026-11-30')
        expect(nov.body.transactionCount).toBe(1)
        expect(nov.body.days[0].date).toBe('2026-11-01')
        expect(nov.body.days[0].transactionCount).toBe(1)
    })

    test('panjang bulan benar, termasuk Februari kabisat', async () => {
        const s = await sharedStore()
        const feb26 = await call('GET', '/reports/summary?period=month&date=2026-02-10', s.token)
        expect(feb26.body.days).toHaveLength(28)
        expect(feb26.body.to).toBe('2026-02-28')
        const feb28 = await call('GET', '/reports/summary?period=month&date=2028-02-10', s.token)
        expect(feb28.body.days).toHaveLength(29)
        expect(feb28.body.to).toBe('2028-02-29')
        expect(feb28.body.transactionCount).toBe(0)
    })
})

describe('isi laporan', () => {
    test('memuat bon, pelunasan, dan rincian metode bayar dalam rentang', async () => {
        const s = await registerStore('bonweek')
        const p = await addProduct(s.token)
        const c = (await call('POST', '/customers', s.token, { name: 'Bu Ani' })).body.customer.customerId

        await sellAt(s.token, p, '2026-10-20T05:00:00Z')                               // tunai 10000
        await sellAt(s.token, p, '2026-10-22T05:00:00Z', { paymentMethod: 'BON', customerId: c }) // bon 10000
        await call('POST', `/customers/${c}/payments`, s.token, { amount: 4000 })
        await prisma.debtEntry.updateMany({
            where: { customerId: c, type: 'PAYMENT' },
            data: { createdAt: new Date('2026-10-23T05:00:00Z') },
        })

        const rep = await call('GET', '/reports/summary?period=week&date=2026-10-21', s.token)
        expect(rep.body.revenue).toBe(20000)
        expect(rep.body.byPayment.CASH).toEqual({ count: 1, revenue: 10000 })
        expect(rep.body.byPayment.BON).toEqual({ count: 1, revenue: 10000 })
        expect(rep.body.debtPaymentsReceived).toBe(4000)
        expect(rep.body.cashIn).toBe(14000)        // 10000 tunai + 4000 pelunasan
        expect(rep.body.debtOutstanding).toBe(6000) // 10000 - 4000, seluruh waktu

        const thu = rep.body.days.find((d: any) => d.date === '2026-10-23')
        expect(thu.cashIn).toBe(4000)
        expect(thu.revenue).toBe(0)
    })

    test('data toko lain tidak ikut dan produk tanpa modal menandai untung tidak lengkap', async () => {
        const a = await registerStore('isoA')
        const b = await registerStore('isoB')
        const pa = await addProduct(a.token)
        await sellAt(a.token, pa, '2026-10-20T05:00:00Z')

        const repB = await call('GET', '/reports/summary?period=month&date=2026-10-21', b.token)
        expect(repB.body.transactionCount).toBe(0)
        expect(repB.body.revenue).toBe(0)

        const noCost = (await call('POST', '/products', b.token, {
            name: 'Tanpa modal', unit: 'PCS', price: 5000, stock: 10,
        })).body.product.productId
        await sellAt(b.token, noCost, '2026-10-20T05:00:00Z')
        const repB2 = await call('GET', '/reports/summary?period=month&date=2026-10-21', b.token)
        expect(repB2.body.revenue).toBe(5000)
        expect(repB2.body.profitComplete).toBe(false)
        expect(repB2.body.uncostedRevenue).toBe(5000)
    })
})
