import * as React from 'react'
import { Linking, View } from 'react-native'
import { colors, radius, space } from '../theme'
import { Button, Text } from '../ui'
import { TOKO_PRICE, UPGRADE_WHATSAPP } from '../constants/app'
import { getSession } from '../services/session'

/** Ajakan upgrade untuk fitur atau batas paket Toko. Aktivasi dilakukan manual oleh admin (belum ada pembayaran otomatis). */
export function UpgradeNotice({ message }: { message: string }) {
    const store = getSession()?.store.name ?? ''
    const open = () => {
        const text = encodeURIComponent(`Halo, saya ingin mengaktifkan paket Toko Warkas untuk toko "${store}".`)
        void Linking.openURL(`https://wa.me/${UPGRADE_WHATSAPP}?text=${text}`)
    }
    return (
        <View style={{ backgroundColor: colors.warnSoft, borderRadius: radius.md, padding: space.md, borderWidth: 1, borderColor: colors.price }}>
            <Text weight="semibold">Fitur paket Toko</Text>
            <Text size={14} style={{ marginTop: 2 }}>{message}</Text>
            <Text size={12} color={colors.inkSoft} style={{ marginTop: space.xs }}>
                Paket Toko {TOKO_PRICE}. Pembayaran belum otomatis: aktivasi dilakukan manual oleh admin Warkas.
            </Text>
            {UPGRADE_WHATSAPP ? <Button label="Hubungi admin" variant="accent" onPress={open} style={{ marginTop: space.md }} /> : null}
        </View>
    )
}
