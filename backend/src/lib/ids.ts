/** Kode pendek yang mudah dibaca, mis. PRD3F9A21BC. Unik per toko dijaga oleh database. */
export function genCode(prefix: string): string {
    return `${prefix}${crypto.randomUUID().replace(/-/g, '').slice(0, 8).toUpperCase()}`
}
