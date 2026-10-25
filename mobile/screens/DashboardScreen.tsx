import * as React from 'react'
import { RefreshControl, ScrollView, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useQuery } from '@tanstack/react-query'
import { colors, radius, space } from '../theme'
import { Badge, Button, Card, ErrorState, Loading, Money, Row, Text, formatDay } from '../ui'
import { getDailyReport, getPlan, getProducts, logout, type PlanInfo } from '../services/api'
import { getSession } from '../services/session'

function PlanCard({ plan }: { plan: PlanInfo }) {
    const limit = plan.limits.maxProducts
    if (plan.plan === 'TOKO') {
        const soon = plan.daysLeft !== null && plan.daysLeft <= 3
        return (
            <Card style={{ borderColor: soon ? colors.price : colors.line }}>
                <Row style={{ justifyContent: 'space-between' }}>
                    <Text weight="semibold">{plan.isTrial ? 'Trial paket Toko' : 'Paket Toko'}</Text>
                    <Badge label={plan.isTrial ? 'TRIAL' : 'AKTIF'} tone={plan.isTrial ? 'accent' : 'ok'} />
                </Row>
                <Text size={13} color={colors.inkSoft} style={{ marginTop: 4 }}>
                    {plan.daysLeft === null
                        ? 'Tanpa batas waktu.'
                        : plan.daysLeft === 0
                            ? 'Berakhir hari ini.'
                            : `Sisa ${plan.daysLeft} hari.`}
                    {plan.isTrial ? ' Setelah itu toko pindah ke paket Warung (gratis).' : ''}
                </Text>
            </Card>
        )
    }
    const near = limit !== null && plan.usage.products >= limit * 0.8
    return (
        <Card style={{ borderColor: near ? colors.price : colors.line }}>
            <Row style={{ justifyContent: 'space-between' }}>
                <Text weight="semibold">Paket Warung</Text>
                <Badge label="GRATIS" tone="neutral" />
            </Row>
            <Text size={13} color={colors.inkSoft} style={{ marginTop: 4 }}>
                {plan.usage.products} dari {limit} produk terpakai. Buku bon, laporan mingguan/bulanan, dan ekspor Excel ada di paket Toko (Rp39.000/bulan).
            </Text>
        </Card>
    )
}

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <View style={{ flex: 1, minWidth: '45%', paddingVertical: space.sm }}>
            <Text size={12} color={colors.inkSoft}>{label}</Text>
            <View style={{ marginTop: 2 }}>{children}</View>
        </View>
    )
}

export default function DashboardScreen() {
    const session = getSession()
    const isOwner = session?.user.role === 'ADMIN'

    const plan = useQuery({ queryKey: ['plan'], queryFn: getPlan })
    const today = useQuery({ queryKey: ['report', 'daily'], queryFn: () => getDailyReport(), enabled: isOwner })
    const products = useQuery({ queryKey: ['products'], queryFn: getProducts })

    const [refreshing, setRefreshing] = React.useState(false)
    const refresh = async () => {
        setRefreshing(true)
        await Promise.all([plan.refetch(), products.refetch(), isOwner ? today.refetch() : null])
        setRefreshing(false)
    }

    if (plan.isLoading) return <Loading />
    if (plan.isError || !plan.data) {
        return <ErrorState message={(plan.error as Error)?.message ?? 'Gagal memuat data.'} onRetry={() => plan.refetch()} />
    }

    const low = (products.data ?? []).filter(p => p.lowStock)
    const r = today.data

    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
            <ScrollView
                contentContainerStyle={{ padding: space.lg, gap: space.md }}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
            >
                <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <View style={{ flex: 1, paddingRight: space.md }}>
                        <Text weight="bold" size={28} style={{ letterSpacing: -0.5 }}>{session?.store.name}</Text>
                        <Text size={14} color={colors.inkSoft}>
                            {session?.user.name} · {isOwner ? 'Pemilik' : 'Kasir'}
                        </Text>
                    </View>
                    <Button label="Keluar" variant="ghost" onPress={() => { void logout() }} style={{ minHeight: 40, paddingHorizontal: space.md }} />
                </Row>

                <PlanCard plan={plan.data} />

                {isOwner ? (
                    <Card>
                        <Text weight="semibold">Hari ini{r ? ` · ${formatDay(r.date)}` : ''}</Text>
                        {today.isLoading ? (
                            <Text size={13} color={colors.inkSoft} style={{ marginTop: space.sm }}>Memuat…</Text>
                        ) : today.isError || !r ? (
                            <Text size={13} color={colors.danger} style={{ marginTop: space.sm }}>Laporan gagal dimuat. Tarik layar ke bawah untuk mencoba lagi.</Text>
                        ) : (
                            <>
                                <Row style={{ flexWrap: 'wrap', marginTop: space.xs }}>
                                    <Stat label="Omzet"><Money value={r.revenue} size={18} weight="bold" /></Stat>
                                    <Stat label="Uang masuk"><Money value={r.cashIn} size={18} /></Stat>
                                    <Stat label="Untung"><Money value={r.profit} size={18} color={colors.ok} /></Stat>
                                    <Stat label="Transaksi"><Text mono size={18}>{r.transactionCount}</Text></Stat>
                                </Row>
                                {!r.profitComplete ? (
                                    <Text size={12} color={colors.warn} style={{ marginTop: space.xs }}>
                                        Untung belum lengkap: {r.uncostedItemCount} item terjual tanpa harga modal.
                                    </Text>
                                ) : null}
                                {r.debtOutstanding > 0 ? (
                                    <Text size={13} color={colors.inkSoft} style={{ marginTop: space.sm }}>
                                        Sisa bon pelanggan: <Money value={r.debtOutstanding} size={13} />
                                    </Text>
                                ) : null}
                            </>
                        )}
                    </Card>
                ) : null}

                {low.length > 0 ? (
                    <Card style={{ backgroundColor: colors.warnSoft, borderColor: colors.price }}>
                        <Text weight="semibold">{low.length} produk stoknya menipis</Text>
                        {low.slice(0, 4).map(p => (
                            <Row key={p.productId} style={{ justifyContent: 'space-between', marginTop: space.xs }}>
                                <Text size={14} style={{ flex: 1 }} numberOfLines={1}>{p.name}</Text>
                                <Text mono size={14} color={colors.warn}>sisa {p.stock} {p.unit}</Text>
                            </Row>
                        ))}
                        {low.length > 4 ? <Text size={12} color={colors.inkSoft} style={{ marginTop: space.xs }}>dan {low.length - 4} lainnya</Text> : null}
                    </Card>
                ) : null}

                <View style={{ height: radius.lg }} />
            </ScrollView>
        </SafeAreaView>
    )
}
