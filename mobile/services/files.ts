import { Platform } from 'react-native'

export const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

/** Simpan berkas lalu buka lembar bagikan (Android/iOS) atau unduh langsung (pratinjau web). */
export async function saveAndShare(bytes: Uint8Array, filename: string, mimeType: string) {
    if (Platform.OS === 'web') {
        const blob = new Blob([bytes as BlobPart], { type: mimeType })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = filename
        a.click()
        setTimeout(() => URL.revokeObjectURL(url), 1000)
        return
    }

    // Dimuat saat dipakai supaya modul native tidak ikut dimuat di web.
    const { File, Paths } = await import('expo-file-system')
    const Sharing = await import('expo-sharing')

    const file = new File(Paths.cache, filename)
    file.create({ overwrite: true })
    file.write(bytes)

    if (!(await Sharing.isAvailableAsync())) {
        throw new Error('Berbagi berkas tidak tersedia di perangkat ini.')
    }
    await Sharing.shareAsync(file.uri, { mimeType, dialogTitle: filename })
}
