// Tanggal kalender lokal perangkat sebagai string "YYYY-MM-DD". Hitung geser memakai UTC supaya tidak terpengaruh DST.
const pad = (n: number) => String(n).padStart(2, '0')

export function todayLocal(): string {
    const d = new Date()
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function parse(iso: string) {
    const [y, m, d] = iso.split('-').map(Number)
    return { y, m, d }
}

export function shiftDays(iso: string, days: number): string {
    const { y, m, d } = parse(iso)
    const dt = new Date(Date.UTC(y, m - 1, d + days))
    return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`
}

/** Geser bulan; hari diset ke tanggal 1 karena hanya bulannya yang dipakai laporan bulanan. */
export function shiftMonths(iso: string, months: number): string {
    const { y, m } = parse(iso)
    const dt = new Date(Date.UTC(y, m - 1 + months, 1))
    return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-01`
}

const MONTHS_LONG = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember']

export function monthLabel(iso: string): string {
    const { y, m } = parse(iso)
    return `${MONTHS_LONG[m - 1]} ${y}`
}
