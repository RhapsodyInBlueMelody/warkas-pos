import * as SecureStore from 'expo-secure-store'

export type Role = 'ADMIN' | 'KASIR'

export type Session = {
    token: string
    user: { name: string; role: Role; username: string }
    store: { storeId: string; name: string }
}

const KEY = 'warkas.session'

let current: Session | null = null
const listeners = new Set<(s: Session | null) => void>()

const emit = () => listeners.forEach(fn => fn(current))

export const getSession = () => current

export function subscribe(fn: (s: Session | null) => void) {
    listeners.add(fn)
    return () => { listeners.delete(fn) }
}

/** Dipanggil sekali saat aplikasi dibuka. Token disimpan terenkripsi di keystore perangkat. */
export async function loadSession(): Promise<Session | null> {
    try {
        const raw = await SecureStore.getItemAsync(KEY)
        current = raw ? (JSON.parse(raw) as Session) : null
    } catch {
        current = null
    }
    emit()
    return current
}

export async function saveSession(session: Session) {
    current = session
    try {
        await SecureStore.setItemAsync(KEY, JSON.stringify(session))
    } catch {
        // Tetap login untuk sesi ini walau penyimpanan gagal.
    }
    emit()
}

export async function clearSession() {
    current = null
    try {
        await SecureStore.deleteItemAsync(KEY)
    } catch {
        // abaikan
    }
    emit()
}
