import type { PaymentMethod } from './api'

export type ReceiptData = {
    storeName: string
    code: string
    createdAt: string
    kasirName?: string
    paymentMethod: PaymentMethod
    customerName?: string | null
    items: Array<{ name: string; quantity: number; price: number }>
    total: number
    cashReceived?: number // hanya untuk tunai
}

export const PAYMENT_LABEL: Record<PaymentMethod, string> = {
    CASH: 'Tunai',
    QRIS: 'QRIS',
    TRANSFER: 'Transfer',
    BON: 'Bon (utang)',
}

const WIDTH = 32 // printer thermal 58mm

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des']

const num = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.')

const center = (text: string) => ' '.repeat(Math.max(0, Math.floor((WIDTH - text.length) / 2))) + text

/** Teks kiri dan kanan dalam satu baris; bila tak muat, kiri dipotong supaya angka tidak terpotong. */
function pair(left: string, right: string) {
    const room = WIDTH - right.length - 1
    const l = left.length > room ? left.slice(0, Math.max(0, room)) : left
    return l + ' '.repeat(Math.max(1, WIDTH - l.length - right.length)) + right
}

/** Nama panjang dibungkus ke beberapa baris, bukan dipotong. */
function wrap(text: string) {
    const lines: string[] = []
    let rest = text.trim()
    while (rest.length > WIDTH) {
        const cut = rest.lastIndexOf(' ', WIDTH)
        const at = cut > 0 ? cut : WIDTH
        lines.push(rest.slice(0, at))
        rest = rest.slice(at).trim()
    }
    lines.push(rest)
    return lines
}

export function generateReceiptText(r: ReceiptData): string {
    const line = '-'.repeat(WIDTH)
    const d = new Date(r.createdAt)
    const pad = (x: number) => String(x).padStart(2, '0')
    const when = `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()} ${pad(d.getHours())}.${pad(d.getMinutes())}`

    const out: string[] = []
    out.push(...wrap(r.storeName).map(center))
    out.push(line)
    out.push(pair('Nota', r.code))
    out.push(pair('Waktu', when))
    if (r.kasirName) out.push(pair('Kasir', r.kasirName))
    out.push(line)

    for (const item of r.items) {
        out.push(...wrap(item.name))
        out.push(pair(`${item.quantity} x ${num(item.price)}`, num(item.quantity * item.price)))
    }

    out.push(line)
    out.push(pair('TOTAL', `Rp ${num(r.total)}`))
    out.push(pair('Bayar', PAYMENT_LABEL[r.paymentMethod]))
    if (r.paymentMethod === 'CASH' && r.cashReceived && r.cashReceived >= r.total) {
        out.push(pair('Diterima', `Rp ${num(r.cashReceived)}`))
        out.push(pair('Kembali', `Rp ${num(r.cashReceived - r.total)}`))
    }
    if (r.paymentMethod === 'BON' && r.customerName) out.push(pair('Pelanggan', r.customerName))
    out.push(line)
    out.push(center('Terima kasih'))
    return out.join('\n')
}
