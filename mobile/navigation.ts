import type { Product } from './services/api'
import type { ReceiptData } from './services/receipt'

export type RootParams = {
    Login: undefined
    Register: undefined
    Dashboard: undefined
    Kasir: undefined
    Riwayat: undefined
    Produk: undefined
    ProdukForm: { product?: Product }
    Bon: undefined
    Pelanggan: { customerId: string; name: string }
    Struk: { receipt: ReceiptData; fromCheckout?: boolean }
}
