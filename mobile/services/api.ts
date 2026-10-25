import { API_URL } from '../constants/api'
import { clearSession, getSession, saveSession, type Role, type Session } from './session'

// ---------- error ----------

export class ApiError extends Error {
    status: number
    code?: string
    feature?: string
    body: any

    constructor(status: number, message: string, body?: any) {
        super(message)
        this.status = status
        this.body = body
        this.code = body?.code
        this.feature = body?.feature
    }

    /** 402: fitur atau batas milik paket Toko. UI menampilkan ajakan upgrade, bukan pesan error biasa. */
    get needsUpgrade() {
        return this.status === 402
    }
}

// ---------- tipe respons ----------

export type PlanName = 'FREE' | 'TOKO'

export type PlanInfo = {
    plan: PlanName
    storedPlan: PlanName
    isTrial: boolean
    expiresAt: string | null
    daysLeft: number | null
    limits: { maxProducts: number | null }
    usage: { products: number }
    features: { bon: boolean; extendedReports: boolean; export: boolean }
}

export type Product = {
    productId: string
    code: string
    name: string
    unit: string
    price: string | number
    costPrice?: string | number | null // hanya dikirim untuk pemilik
    stock: number
    minStock: number
    lowStock: boolean
    categoryId: string | null
}

export type PaymentMethod = 'CASH' | 'QRIS' | 'TRANSFER' | 'BON'

export type Customer = { customerId: string; name: string; phone: string | null; balance: number }

export type DebtEntry = {
    debtEntryId: string
    type: 'CHARGE' | 'PAYMENT'
    amount: number
    note: string | null
    createdAt: string
    transaction: { code: string } | null
}

export type TransactionRecord = {
    transactionId: string
    code: string
    totalPrice: number
    paymentMethod: PaymentMethod
    createdAt: string
    kasir: { name: string }
    customer: { customerId: string; name: string } | null
    items: Array<{
        quantity: number
        priceAtTime: number
        costAtTime?: number | null
        product: { name: string; code: string }
    }>
}

export type ReportSummary = {
    transactionCount: number
    revenue: number
    cost: number
    profit: number
    profitComplete: boolean
    uncostedItemCount: number
    uncostedRevenue: number
    byPayment: Record<PaymentMethod, { count: number; revenue: number }>
    debtPaymentsReceived: number
    cashIn: number
    topProducts: Array<{ productId: string; name: string; quantity: number; revenue: number }>
    debtOutstanding: number
}

export type DailyReport = ReportSummary & { date: string; tzOffset: number }

export type PeriodReport = ReportSummary & {
    period: 'week' | 'month'
    from: string
    to: string
    days: Array<{
        date: string
        transactionCount: number
        revenue: number
        cost: number
        profit: number
        profitComplete: boolean
        cashIn: number
    }>
}

// ---------- inti ----------

type Options = { body?: unknown; query?: Record<string, string | number | undefined>; auth?: boolean }

function buildUrl(path: string, query?: Options['query']) {
    const params = Object.entries(query ?? {})
        .filter(([, v]) => v !== undefined && v !== '')
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    return `${API_URL}${path}${params.length ? `?${params.join('&')}` : ''}`
}

function messageFrom(status: number, body: any): string {
    if (typeof body?.detail === 'string') return body.detail
    if (typeof body?.message === 'string') return body.message
    if (status === 422) return 'Data yang dikirim tidak valid.'
    if (status >= 500) return 'Server sedang bermasalah. Coba lagi sebentar lagi.'
    return 'Permintaan gagal.'
}

export async function request<T>(method: string, path: string, opts: Options = {}): Promise<T> {
    const auth = opts.auth ?? true
    const token = getSession()?.token
    if (auth && !token) throw new ApiError(401, 'Sesi login tidak ditemukan. Silakan masuk lagi.')

    let res: Response
    try {
        res = await fetch(buildUrl(path, opts.query), {
            method,
            headers: {
                Accept: 'application/json',
                ...(opts.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
                ...(auth ? { Authorization: `Bearer ${token}` } : {}),
            },
            body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
        })
    } catch {
        throw new ApiError(0, 'Tidak bisa terhubung ke server. Periksa koneksi internet.')
    }

    const text = await res.text()
    let body: any = null
    try { body = text ? JSON.parse(text) : null } catch { /* bukan JSON */ }

    if (!res.ok) {
        // Token kedaluwarsa atau dicabut: kembali ke layar masuk. Login yang salah (auth=false) tidak menyentuh sesi.
        if (res.status === 401 && auth) await clearSession()
        throw new ApiError(res.status, messageFrom(res.status, body), body)
    }
    return body as T
}

// ---------- auth ----------

type AuthResponse = { token: string; user: { name: string; role: Role; username: string }; store: { storeId: string; name: string } }

async function startSession(res: AuthResponse) {
    const session: Session = { token: res.token, user: res.user, store: { storeId: res.store.storeId, name: res.store.name } }
    await saveSession(session)
    return session
}

export async function login(username: string, password: string) {
    const res = await request<AuthResponse>('POST', '/login', { auth: false, body: { username: username.trim(), password } })
    return startSession(res)
}

export async function registerStore(input: { storeName: string; name: string; username: string; password: string }) {
    const res = await request<AuthResponse>('POST', '/register', {
        auth: false,
        body: { ...input, storeName: input.storeName.trim(), name: input.name.trim(), username: input.username.trim() },
    })
    return startSession(res)
}

export const logout = () => clearSession()

// ---------- data ----------

export const getPlan = () => request<PlanInfo>('GET', '/plan')

export const getProducts = async () => (await request<{ products: Product[] }>('GET', '/products')).products

export type ProductInput = {
    name: string
    unit: string
    price: number
    costPrice?: number
    stock: number
    minStock?: number
    code?: string
}

export const createProduct = (input: ProductInput) => request<{ product: Product }>('POST', '/products', { body: input })

export const updateProduct = (productId: string, input: Partial<ProductInput>) =>
    request<{ product: Product }>('PATCH', `/product/${productId}`, { body: input })

export const createTransaction = (input: {
    items: Array<{ productId: string; quantity: number }>
    paymentMethod: PaymentMethod
    customerId?: string
}) => request<{ message: string; transactionCode: string }>('POST', '/transaction', { body: input })

export const getTransactions = async () =>
    (await request<{ data: TransactionRecord[] }>('GET', '/transactions')).data

export const getCustomers = (opts: { search?: string; withDebt?: boolean } = {}) =>
    request<{ customers: Customer[]; totalOutstanding: number }>('GET', '/customers', {
        query: { search: opts.search, withDebt: opts.withDebt ? 'true' : undefined },
    })

export const createCustomer = (input: { name: string; phone?: string }) =>
    request<{ customer: Customer }>('POST', '/customers', { body: input })

export const getCustomer = (customerId: string) =>
    request<{
        customer: { customerId: string; name: string; phone: string | null; createdAt: string }
        balance: number
        entries: DebtEntry[]
    }>('GET', `/customers/${customerId}`)

export const payDebt = (customerId: string, amount: number, note?: string) =>
    request<{ balance: number; settled: boolean }>('POST', `/customers/${customerId}/payments`, {
        body: { amount, ...(note ? { note } : {}) },
    })

// Batas hari laporan mengikuti zona waktu perangkat (WIB/WITA/WIT), bukan tebakan server.
export const tzOffsetMinutes = () => -new Date().getTimezoneOffset()

export const addCharge = (customerId: string, amount: number, note?: string) =>
    request<{ balance: number }>('POST', `/customers/${customerId}/charges`, {
        body: { amount, ...(note ? { note } : {}) },
    })

export const getDailyReport = (date?: string) =>
    request<DailyReport>('GET', '/reports/daily', { query: { date, tzOffset: tzOffsetMinutes() } })

export const getPeriodReport = (period: 'week' | 'month', date?: string) =>
    request<PeriodReport>('GET', '/reports/summary', { query: { period, date, tzOffset: tzOffsetMinutes() } })

// ---------- ekspor dan staf ----------

/** Unduh ekspor Excel (paket Toko, pemilik). Mengembalikan isi berkas mentah. */
export async function downloadExport(from: string, to: string): Promise<{ bytes: Uint8Array; filename: string }> {
    const token = getSession()?.token
    if (!token) throw new ApiError(401, 'Sesi login tidak ditemukan. Silakan masuk lagi.')

    let res: Response
    try {
        res = await fetch(buildUrl('/export/xlsx', { from, to, tzOffset: tzOffsetMinutes() }), {
            headers: { Authorization: `Bearer ${token}` },
        })
    } catch {
        throw new ApiError(0, 'Tidak bisa terhubung ke server. Periksa koneksi internet.')
    }

    if (!res.ok) {
        let body: any = null
        try { body = await res.json() } catch { /* bukan JSON */ }
        if (res.status === 401) await clearSession()
        throw new ApiError(res.status, messageFrom(res.status, body), body)
    }
    return { bytes: new Uint8Array(await res.arrayBuffer()), filename: `warkas-${from}_${to}.xlsx` }
}

export type StaffMember = { userId: string; code: string; name: string; username: string; role: Role; createdAt: string }

export const getStaff = async () => (await request<{ staff: StaffMember[] }>('GET', '/staff')).staff

export const createStaff = (input: { name: string; username: string; password: string }) =>
    request<{ staff: StaffMember }>('POST', '/staff', { body: { ...input, name: input.name.trim(), username: input.username.trim() } })
