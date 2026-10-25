import ExcelJS from 'exceljs'
import { Elysia, t } from 'elysia'
import { prisma } from '../lib/prisma'
import { authMiddleware } from '../middleware/auth'
import { requireFeature } from '../lib/plan'
import { debtOutstanding, loadRange, parseLocalDate, summarize, todayIn, utcRange } from './report'

const DAY_MS = 24 * 60 * 60 * 1000
const DEFAULT_TZ_OFFSET_MIN = 7 * 60 // WIB
const MAX_DAYS = 366
const MAX_TRANSACTIONS = 20_000

const MONEY = '#,##0'
const DATETIME = 'yyyy-mm-dd hh:mm:ss'

type Column = { header: string; key: string; width: number; numFmt?: string }

function addSheet(wb: ExcelJS.Workbook, name: string, columns: Column[], rows: Array<Record<string, unknown>>) {
    const sheet = wb.addWorksheet(name)
    sheet.columns = columns.map(c => ({ header: c.header, key: c.key, width: c.width }))
    sheet.addRows(rows)
    sheet.getRow(1).font = { bold: true }
    sheet.views = [{ state: 'frozen', ySplit: 1 }]
    for (const c of columns) {
        if (c.numFmt) sheet.getColumn(c.key).numFmt = c.numFmt
    }
    // Baris judul tidak ikut diformat angka.
    sheet.getRow(1).eachCell(cell => { cell.numFmt = 'General' })
    return sheet
}

export const exportRoutes = new Elysia()
    .use(authMiddleware)
    // Ekspor Excel untuk pemilik (memuat modal dan untung). Hanya paket Toko.
    .get('/export/xlsx', async ({ user, set, query }) => {
        if (user.role !== 'ADMIN') {
            set.status = 403
            return { message: 'Forbidden' }
        }

        const denied = await requireFeature(user.storeId, 'export')
        if (denied) {
            set.status = denied.status
            return denied.body
        }

        const tz = query.tzOffset ?? DEFAULT_TZ_OFFSET_MIN
        const to = query.to ?? todayIn(tz)
        const from = query.from ?? `${to.slice(0, 8)}01` // default: awal bulan dari tanggal akhir
        const fromMs = parseLocalDate(from)
        const toMs = parseLocalDate(to)
        if (fromMs === null || toMs === null) {
            set.status = 400
            return { message: 'Tanggal tidak valid' }
        }
        if (fromMs > toMs) {
            set.status = 400
            return { message: 'Tanggal awal tidak boleh setelah tanggal akhir' }
        }
        if ((toMs - fromMs) / DAY_MS + 1 > MAX_DAYS) {
            set.status = 400
            return { message: `Rentang maksimal ${MAX_DAYS} hari` }
        }

        const range = utcRange(fromMs, toMs + DAY_MS, tz)
        const where = { storeId: user.storeId, createdAt: { gte: range.from, lt: range.to } }

        const trxCount = await prisma.transaction.count({ where })
        if (trxCount > MAX_TRANSACTIONS) {
            set.status = 400
            return { message: `Terlalu banyak transaksi (${trxCount}). Pilih rentang yang lebih pendek.` }
        }

        const [transactions, data, outstanding, products, ledger] = await Promise.all([
            prisma.transaction.findMany({
                where,
                orderBy: { createdAt: 'asc' },
                include: {
                    kasir: { select: { name: true } },
                    customer: { select: { name: true } },
                    items: { include: { product: { select: { name: true, code: true } } } },
                },
            }),
            loadRange(user.storeId, range),
            debtOutstanding(user.storeId),
            prisma.product.findMany({
                where: { storeId: user.storeId },
                orderBy: { name: 'asc' },
                include: { category: { select: { name: true } } },
            }),
            prisma.debtEntry.groupBy({
                by: ['customerId', 'type'],
                where: { storeId: user.storeId },
                _sum: { amount: true },
            }),
        ])
        const s = summarize(data.transactions, data.items, data.payments)

        const store = await prisma.store.findUniqueOrThrow({
            where: { storeId: user.storeId },
            select: { name: true },
        })

        // Waktu lokal ditulis sebagai waktu UTC supaya Excel menampilkannya apa adanya.
        const local = (d: Date) => new Date(d.getTime() + tz * 60_000)

        // exceljs menulis string sebagai teks (bukan rumus), jadi nama produk atau pelanggan
        // yang diawali "=" tidak dieksekusi Excel.
        const wb = new ExcelJS.Workbook()
        wb.creator = 'Warkas'
        wb.created = new Date()

        const summarySheet = addSheet(wb, 'Ringkasan', [
            { header: 'Keterangan', key: 'label', width: 34 },
            { header: 'Nilai', key: 'value', width: 22, numFmt: MONEY },
        ], [
            { label: 'Toko', value: store.name },
            { label: 'Periode', value: `${from} s.d. ${to}` },
            { label: 'Jumlah transaksi', value: s.transactionCount },
            { label: 'Omzet (termasuk bon)', value: s.revenue },
            { label: 'Modal item yang punya harga modal', value: s.cost },
            { label: 'Untung (item yang punya harga modal)', value: s.profit },
            { label: 'Untung lengkap?', value: s.profitComplete ? 'Ya' : `Tidak, ${s.uncostedItemCount} item tanpa modal` },
            { label: 'Omzet tanpa harga modal', value: s.uncostedRevenue },
            { label: 'Uang masuk (non-bon + pelunasan bon)', value: s.cashIn },
            { label: 'Pelunasan bon pada periode', value: s.debtPaymentsReceived },
            { label: 'Sisa utang pelanggan saat ini', value: outstanding },
        ])
        summarySheet.getColumn('value').alignment = { horizontal: 'right' }

        addSheet(wb, 'Transaksi', [
            { header: 'Waktu', key: 'time', width: 20, numFmt: DATETIME },
            { header: 'Kode', key: 'code', width: 28 },
            { header: 'Kasir', key: 'kasir', width: 20 },
            { header: 'Pelanggan', key: 'customer', width: 22 },
            { header: 'Metode', key: 'method', width: 12 },
            { header: 'Total', key: 'total', width: 14, numFmt: MONEY },
        ], transactions.map(trx => ({
            time: local(trx.createdAt),
            code: trx.code,
            kasir: trx.kasir.name,
            customer: trx.customer?.name ?? '',
            method: trx.paymentMethod,
            total: Number(trx.totalPrice),
        })))

        addSheet(wb, 'Item terjual', [
            { header: 'Waktu', key: 'time', width: 20, numFmt: DATETIME },
            { header: 'Kode transaksi', key: 'trx', width: 28 },
            { header: 'Kode produk', key: 'pcode', width: 14 },
            { header: 'Produk', key: 'name', width: 30 },
            { header: 'Jumlah', key: 'qty', width: 9 },
            { header: 'Harga satuan', key: 'price', width: 14, numFmt: MONEY },
            { header: 'Modal satuan', key: 'cost', width: 14, numFmt: MONEY },
            { header: 'Subtotal', key: 'subtotal', width: 14, numFmt: MONEY },
            { header: 'Untung', key: 'profit', width: 14, numFmt: MONEY },
        ], transactions.flatMap(trx => trx.items.map(item => {
            const price = Number(item.priceAtTime)
            const cost = item.costAtTime === null ? null : Number(item.costAtTime)
            return {
                time: local(trx.createdAt),
                trx: trx.code,
                pcode: item.product.code,
                name: item.product.name,
                qty: item.quantity,
                price,
                cost,
                subtotal: price * item.quantity,
                // Kosong bila modal tidak diketahui, bukan 0, supaya tidak terbaca sebagai untung penuh.
                profit: cost === null ? null : (price - cost) * item.quantity,
            }
        })))

        addSheet(wb, 'Stok', [
            { header: 'Kode', key: 'code', width: 14 },
            { header: 'Produk', key: 'name', width: 30 },
            { header: 'Kategori', key: 'category', width: 18 },
            { header: 'Stok', key: 'stock', width: 9 },
            { header: 'Stok minimum', key: 'minStock', width: 13 },
            { header: 'Menipis', key: 'low', width: 10 },
            { header: 'Harga jual', key: 'price', width: 14, numFmt: MONEY },
            { header: 'Harga modal', key: 'cost', width: 14, numFmt: MONEY },
        ], products.map(p => ({
            code: p.code,
            name: p.name,
            category: p.category?.name ?? '',
            stock: p.stock,
            minStock: p.minStock,
            low: p.stock <= p.minStock ? 'Ya' : 'Tidak',
            price: Number(p.price),
            cost: p.costPrice === null ? null : Number(p.costPrice),
        })))

        const balances = new Map<string, number>()
        for (const row of ledger) {
            const sum = Number(row._sum.amount ?? 0)
            balances.set(row.customerId, (balances.get(row.customerId) ?? 0) + (row.type === 'CHARGE' ? sum : -sum))
        }
        const owing = [...balances.entries()].filter(([, b]) => b > 0)
        const customers = owing.length
            ? await prisma.customer.findMany({
                where: { storeId: user.storeId, customerId: { in: owing.map(([id]) => id) } },
                select: { customerId: true, name: true, phone: true },
            })
            : []
        addSheet(wb, 'Bon', [
            { header: 'Pelanggan', key: 'name', width: 28 },
            { header: 'Telepon', key: 'phone', width: 18 },
            { header: 'Sisa utang', key: 'balance', width: 16, numFmt: MONEY },
        ], customers
            .map(c => ({ name: c.name, phone: c.phone ?? '', balance: balances.get(c.customerId) ?? 0 }))
            .sort((a, b) => b.balance - a.balance))

        const buffer = await wb.xlsx.writeBuffer()
        return new Response(buffer as ArrayBuffer, {
            headers: {
                'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                'content-disposition': `attachment; filename="warkas-${from}_${to}.xlsx"`,
                'cache-control': 'no-store',
            },
        })
    }, {
        query: t.Object({
            from: t.Optional(t.String({ pattern: '^\\d{4}-\\d{2}-\\d{2}$' })),
            to: t.Optional(t.String({ pattern: '^\\d{4}-\\d{2}-\\d{2}$' })),
            tzOffset: t.Optional(t.Numeric({ minimum: -720, maximum: 840 })),
        })
    })
