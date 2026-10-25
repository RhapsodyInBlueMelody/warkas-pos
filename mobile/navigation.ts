import type { ReceiptData } from './services/receipt'

export type RootParams = {
    Login: undefined
    Register: undefined
    Dashboard: undefined
    Kasir: undefined
    Riwayat: undefined
    Struk: { receipt: ReceiptData; fromCheckout?: boolean }
}
