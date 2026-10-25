import { describe, expect, test } from 'bun:test'
import ExcelJS from 'exceljs'
import { app } from '../src/app'
import { prisma } from '../src/lib/prisma'

// Butuh Postgres dengan semua migrasi diterapkan. Jalankan: DATABASE_URL=... JWT_SECRET=... bun test

async function raw(path: string, token?: string) {
    return app.handle(new Request(`http://localhost${path}`, {
        headers: token ? { authorization: `Bearer ${token}` } : {},
    }))
}

async function call(method: string, path: string, token?: string, body?: unknown) {
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
    const username = `x_${label}_${run}_${counter++}`
    const res = await call('POST', '/register', undefined, {
        storeName: `Toko ${label}`, name: `Pemilik ${label}`, username, password: 'password-123',
    })
    expect(res.status).toBe(201)
    return { token: res.body.token as string, storeId: res.body.store.storeId as string }
}

async function addProduct(token: string, name: string, extra: Record<string, unknown> = {}) {
    const res = await call('POST', '/products', token, {
        name, unit: 'PCS', price: 10000, costPrice: 6000, stock: 100, ...extra,
    })
    expect(res.status).toBe(201)
    return res.body.product.productId as string
}

async function sellAt(token: string, productId: string, isoUtc: string, extra: Record<string, unknown> = {}) {
    const res = await call('POST', '/transaction', token, {
        items: [{ productId, quantity: 1 }], paymentMethod: 'CASH', ...extra,
    })
    expect(res.status).toBe(201)
    await prisma.transaction.update({ where: { code: res.body.transactionCode }, data: { createdAt: new Date(isoUtc) } })
}

async function load(res: Response) {
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(Buffer.from(await res.arrayBuffer()) as any)
    return wb
}

const column = (wb: ExcelJS.Workbook, sheet: string, col: number) => {
    const out: unknown[] = []
    wb.getWorksheet(sheet)!.eachRow((row, n) => { if (n > 1) out.push(row.getCell(col).value) })
    return out
}

describe('akses ekspor', () => {
    test('paket gratis 402, kasir 403, tanpa token 401, parameter salah ditolak', async () => {
        const owner = await registerStore('akses')
        const kasirName = `kasir_${run}_${counter++}`
        await call('POST', '/staff', owner.token, { name: 'Kasir', username: kasirName, password: 'password-123' })
        const kasir = (await call('POST', '/login', undefined, { username: kasirName, password: 'password-123' })).body.token

        expect((await raw('/export/xlsx')).status).toBe(401)
        expect((await raw('/export/xlsx', kasir)).status).toBe(403)
        expect((await raw('/export/xlsx?from=2026-10-01&to=2026-10-02', owner.token)).status).toBe(200)

        await prisma.store.update({ where: { storeId: owner.storeId }, data: { plan: 'FREE', planExpiresAt: null } })
        const free = await call('GET', '/export/xlsx', owner.token)
        expect(free.status).toBe(402)
        expect(free.body.code).toBe('PLAN_REQUIRED')
        expect(free.body.feature).toBe('export')

        await prisma.store.update({ where: { storeId: owner.storeId }, data: { plan: 'TOKO', planExpiresAt: null } })
        expect((await raw('/export/xlsx?from=2026-10-10&to=2026-10-01', owner.token)).status).toBe(400)
        expect((await raw('/export/xlsx?from=2026-02-31&to=2026-03-01', owner.token)).status).toBe(400)
        expect((await raw('/export/xlsx?from=2025-01-01&to=2026-10-01', owner.token)).status).toBe(400) // > 366 hari
        expect((await raw('/export/xlsx?from=abc', owner.token)).status).toBe(422)
    })
})

describe('isi ekspor', () => {
    test('header file, sheet, angka, batas hari WIB, dan modal kosong tidak jadi untung penuh', async () => {
        const s = await registerStore('isi')
        const p = await addProduct(s.token, 'Barang A')
        const noCost = await addProduct(s.token, 'Tanpa Modal', { costPrice: undefined, price: 5000 })
        await sellAt(s.token, p, '2026-10-20T16:59:59Z')     // 20 Okt 23:59:59 WIB (masuk)
        await sellAt(s.token, p, '2026-10-20T17:00:00Z')     // 21 Okt 00:00:00 WIB (keluar)
        await sellAt(s.token, p, '2026-10-19T16:59:59Z')     // 19 Okt 23:59:59 WIB (keluar)
        await sellAt(s.token, noCost, '2026-10-20T05:00:00Z') // 20 Okt 12:00 WIB (masuk)

        const res = await raw('/export/xlsx?from=2026-10-20&to=2026-10-20', s.token)
        expect(res.status).toBe(200)
        expect(res.headers.get('content-type')).toContain('spreadsheetml.sheet')
        expect(res.headers.get('content-disposition')).toContain('warkas-2026-10-20_2026-10-20.xlsx')

        const wb = await load(res)
        expect(wb.worksheets.map(w => w.name)).toEqual(['Ringkasan', 'Transaksi', 'Item terjual', 'Stok', 'Bon'])

        expect((column(wb, 'Transaksi', 6) as number[]).sort((a, b) => a - b)).toEqual([5000, 10000])
        const items = wb.getWorksheet('Item terjual')!
        expect(items.rowCount - 1).toBe(2)

        // Item tanpa modal: kolom modal dan untung kosong, bukan 0.
        const noCostRow = [...Array(items.rowCount).keys()].map(i => items.getRow(i + 1))
            .find(r => r.getCell(4).value === 'Tanpa Modal')!
        expect(noCostRow.getCell(7).value).toBeNull()
        expect(noCostRow.getCell(9).value).toBeNull()

        const summary = new Map<string, unknown>()
        wb.getWorksheet('Ringkasan')!.eachRow(r => summary.set(String(r.getCell(1).value), r.getCell(2).value))
        expect(summary.get('Jumlah transaksi')).toBe(2)
        expect(summary.get('Omzet (termasuk bon)')).toBe(15000)
        expect(summary.get('Untung (item yang punya harga modal)')).toBe(4000)
        expect(String(summary.get('Untung lengkap?'))).toContain('Tidak')
        expect(summary.get('Omzet tanpa harga modal')).toBe(5000)
    })

    test('waktu ditulis dalam jam lokal sesuai tzOffset', async () => {
        const s = await registerStore('tz')
        const p = await addProduct(s.token, 'Barang')
        await sellAt(s.token, p, '2026-10-20T05:00:00Z')

        const wib = await load(await raw('/export/xlsx?from=2026-10-20&to=2026-10-20', s.token))
        const t = column(wib, 'Transaksi', 1)[0] as Date
        expect(t.toISOString()).toBe('2026-10-20T12:00:00.000Z') // 12:00 WIB tampil apa adanya

        const utc = await load(await raw('/export/xlsx?from=2026-10-20&to=2026-10-20&tzOffset=0', s.token))
        expect((column(utc, 'Transaksi', 1)[0] as Date).toISOString()).toBe('2026-10-20T05:00:00.000Z')
    })

    test('rumus tidak dieksekusi: nama yang diawali "=" tersimpan sebagai teks', async () => {
        const s = await registerStore('rumus')
        const p = await addProduct(s.token, '=HYPERLINK("http://evil","x")')
        await sellAt(s.token, p, '2026-10-20T05:00:00Z')
        const wb = await load(await raw('/export/xlsx?from=2026-10-20&to=2026-10-20', s.token))
        const cell = wb.getWorksheet('Item terjual')!.getRow(2).getCell(4)
        expect(cell.type).toBe(ExcelJS.ValueType.String)
        expect(cell.value).toBe('=HYPERLINK("http://evil","x")')
    })

    test('stok dan bon hanya milik toko sendiri; toko lain tidak bocor', async () => {
        const a = await registerStore('bocorA')
        const b = await registerStore('bocorB')
        const pa = await addProduct(a.token, 'Produk Rahasia A', { stock: 2, minStock: 5 })
        const pb = await addProduct(b.token, 'Produk B')
        await sellAt(a.token, pa, '2026-10-20T05:00:00Z')
        const ca = (await call('POST', '/customers', a.token, { name: 'Pelanggan A' })).body.customer.customerId
        await sellAt(a.token, pa, '2026-10-20T06:00:00Z', { paymentMethod: 'BON', customerId: ca })

        const wbA = await load(await raw('/export/xlsx?from=2026-10-20&to=2026-10-20', a.token))
        expect(column(wbA, 'Stok', 2)).toEqual(['Produk Rahasia A'])
        expect(column(wbA, 'Stok', 6)).toEqual(['Ya']) // stok 0 <= minimum 5
        expect(column(wbA, 'Bon', 1)).toEqual(['Pelanggan A'])
        expect(column(wbA, 'Bon', 3)).toEqual([10000])

        const wbB = await load(await raw('/export/xlsx?from=2026-10-20&to=2026-10-20', b.token))
        expect(column(wbB, 'Stok', 2)).toEqual(['Produk B'])
        expect(column(wbB, 'Transaksi', 2)).toEqual([])
        expect(column(wbB, 'Bon', 1)).toEqual([])
        void pb
    })
})
