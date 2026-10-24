export interface ReceiptItem {
    quantity: number;
    priceAtTime: number;
    product: {
        name: string;
        code: string;
    };
}

export interface ReceiptData {
    code: string;
    totalPrice: number;
    createdAt: string;
    paymentMethod: string;
    items: ReceiptItem[];
}

export const generateReceiptText = (trx: ReceiptData): string => {
    const WIDTH = 32; // Standar lebar karakter printer thermal 58mm
    const separator = "-".repeat(WIDTH) + "\n";

    let r = "";

    // 1. Header (Rata Tengah Manual)
    const title = "KOPERASI POS";
    const subTitle = "Kantin Kampus Unesa";
    r += " ".repeat(Math.max(0, Math.floor((WIDTH - title.length) / 2))) + title + "\n";
    r += " ".repeat(Math.max(0, Math.floor((WIDTH - subTitle.length) / 2))) + subTitle + "\n";
    r += separator;

    // 2. Metadata Transaksi
    r += `Nota : ${trx.code}\n`;
    const tanggal = new Date(trx.createdAt).toLocaleDateString('id-ID', {
        day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
    });
    r += `Tgl  : ${tanggal}\n`;
    r += `Bayar: ${trx.paymentMethod}\n`;
    r += separator;

    // 3. Looping Items Belanjaan
    trx.items.forEach((item) => {
        // Nama produk (potong kalau kepanjangan biar gak ngerusak baris)
        const name = item.product.name.substring(0, WIDTH);
        r += `${name}\n`;

        // Baris kalkulasi: "2 x 10,000" dan "20,000"
        const qtyPrice = `${item.quantity} x ${item.priceAtTime.toLocaleString('id-ID')}`;
        const totalItem = (item.quantity * item.priceAtTime).toLocaleString('id-ID');

        // Hitung sisa spasi agar totalItem rata kanan
        const sisaSpasi = WIDTH - qtyPrice.length - totalItem.length;
        r += qtyPrice + " ".repeat(sisaSpasi > 0 ? sisaSpasi : 1) + totalItem + "\n";
    });

    r += separator;

    // 4. Footer & Total Harga
    const totalLabel = "TOTAL BANYAKNYA:";
    const grandTotal = trx.totalPrice.toLocaleString('id-ID');
    const sisaSpasiTotal = WIDTH - totalLabel.length - grandTotal.length;
    r += totalLabel + " ".repeat(sisaSpasiTotal > 0 ? sisaSpasiTotal : 1) + grandTotal + "\n";

    r += separator;
    const footerMsg = "Terima Kasih Atas Kunjungan Anda";
    r += " ".repeat(Math.max(0, Math.floor((WIDTH - footerMsg.length) / 2))) + footerMsg + "\n\n\n";

    return r;
};
