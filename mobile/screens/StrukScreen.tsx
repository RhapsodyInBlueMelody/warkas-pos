import * as React from 'react'
import { Platform, ScrollView, Share, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import type { RootParams } from '../navigation'
import { colors, fonts, radius, space } from '../theme'
import { Button, Text } from '../ui'
import { generateReceiptText } from '../services/receipt'

type Props = NativeStackScreenProps<RootParams, 'Struk'>

export default function StrukScreen({ route, navigation }: Props) {
    const { receipt, fromCheckout } = route.params
    const text = generateReceiptText(receipt)

    const share = () => { void Share.share({ message: text }) }

    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['bottom', 'left', 'right', 'top']}>
            <ScrollView contentContainerStyle={{ padding: space.lg, alignItems: 'center' }}>
                {fromCheckout ? (
                    <View style={{ alignItems: 'center', marginBottom: space.lg }}>
                        <View style={{ backgroundColor: colors.okSoft, borderRadius: 999, paddingHorizontal: space.md, paddingVertical: 4 }}>
                            <Text weight="semibold" size={13} color={colors.ok}>Transaksi tersimpan</Text>
                        </View>
                        <Text size={13} color={colors.inkSoft} style={{ marginTop: 6, textAlign: 'center' }}>Stok sudah dikurangi.</Text>
                    </View>
                ) : null}

                <View style={{
                    backgroundColor: '#FFFEF4', borderRadius: radius.sm, padding: space.lg, borderWidth: 1, borderColor: colors.line,
                    width: 300, maxWidth: '100%',
                }}>
                    <Text style={{ fontFamily: Platform.OS === 'ios' ? 'Courier' : fonts.mono, fontSize: 12, lineHeight: 17 }} color="#111111">{text}</Text>
                </View>
            </ScrollView>

            <View style={{ padding: space.lg, gap: space.sm }}>
                <Button label="Bagikan struk" variant="ghost" onPress={share} />
                {fromCheckout ? (
                    <>
                        <Button label="Transaksi baru" variant="accent" onPress={() => navigation.replace('Kasir')} />
                        <Button label="Ke dashboard" variant="ghost" onPress={() => navigation.popToTop()} />
                    </>
                ) : (
                    <Button label="Tutup" variant="primary" onPress={() => navigation.goBack()} />
                )}
            </View>
        </SafeAreaView>
    )
}
