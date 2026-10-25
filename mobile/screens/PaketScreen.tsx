import * as React from 'react'
import { ScrollView, View } from 'react-native'
import { useQuery } from '@tanstack/react-query'
import { colors, radius, space } from '../theme'
import { Badge, Card, ErrorState, Loading, Row, Text, errorMessage, formatDay } from '../ui'
import { getPlan } from '../services/api'
import { TOKO_PRICE } from '../constants/app'
import { UpgradeNotice } from '../components/UpgradeNotice'

const FEATURES: Array<{ label: string; free: string; toko: string }> = [
    { label: 'Produk', free: 'Maks. 50', toko: 'Tanpa batas' },
    { label: 'Kasir, stok, struk', free: 'Ya', toko: 'Ya' },
    { label: 'Laporan harian + untung', free: 'Ya', toko: 'Ya' },
    { label: 'Buku bon pelanggan', free: '—', toko: 'Ya' },
    { label: 'Laporan mingguan/bulanan', free: '—', toko: 'Ya' },
    { label: 'Ekspor Excel', free: '—', toko: 'Ya' },
]

export default function PaketScreen() {
    const q = useQuery({ queryKey: ['plan'], queryFn: getPlan })
    if (q.isLoading) return <Loading />
    if (q.isError || !q.data) return <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />
    const plan = q.data

    const status = plan.plan === 'TOKO'
        ? plan.isTrial ? 'Trial paket Toko' : 'Paket Toko aktif'
        : 'Paket Warung (gratis)'
    const detail = plan.plan === 'TOKO'
        ? plan.expiresAt
            ? `${plan.isTrial ? 'Trial' : 'Aktif'} sampai ${formatDay(plan.expiresAt.slice(0, 10))} (sisa ${plan.daysLeft} hari).${plan.isTrial ? ' Setelah itu toko pindah ke paket Warung; data tetap aman.' : ''}`
            : 'Tanpa batas waktu.'
        : plan.storedPlan === 'TOKO'
            ? 'Paket Toko sudah berakhir. Data tetap aman; fitur Toko terkunci sampai diaktifkan lagi.'
            : `${plan.usage.products} dari ${plan.limits.maxProducts} produk terpakai.`

    return (
        <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={{ padding: space.lg, gap: space.md }}>
            <Card>
                <Row style={{ justifyContent: 'space-between' }}>
                    <Text weight="bold" size={18}>{status}</Text>
                    <Badge label={plan.plan === 'TOKO' ? (plan.isTrial ? 'TRIAL' : 'AKTIF') : 'GRATIS'} tone={plan.plan === 'TOKO' ? (plan.isTrial ? 'accent' : 'ok') : 'neutral'} />
                </Row>
                <Text size={14} color={colors.inkSoft} style={{ marginTop: 6 }}>{detail}</Text>
            </Card>

            <View style={{ backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line }}>
                <Row style={{ padding: space.md }}>
                    <Text weight="semibold" style={{ flex: 1.6 }}> </Text>
                    <Text weight="semibold" size={13} style={{ flex: 1, textAlign: 'center' }}>Warung</Text>
                    <Text weight="semibold" size={13} style={{ flex: 1, textAlign: 'center' }}>Toko</Text>
                </Row>
                {FEATURES.map(f => (
                    <Row key={f.label} style={{ padding: space.md, borderTopWidth: 1, borderTopColor: colors.line }}>
                        <Text size={14} style={{ flex: 1.6 }}>{f.label}</Text>
                        <Text size={13} color={colors.inkSoft} style={{ flex: 1, textAlign: 'center' }}>{f.free}</Text>
                        <Text size={13} weight="semibold" style={{ flex: 1, textAlign: 'center' }}>{f.toko}</Text>
                    </Row>
                ))}
            </View>

            {plan.plan === 'FREE' || plan.isTrial ? (
                <UpgradeNotice message={`Paket Toko ${TOKO_PRICE}.`} />
            ) : null}
        </ScrollView>
    )
}
