import * as React from 'react'
import { Pressable, RefreshControl, ScrollView, View } from 'react-native'
import { useQuery } from '@tanstack/react-query'
import { colors, radius, space } from '../theme'
import { Button, Card, ErrorState, Loading, Money, Row, Text, errorMessage, formatDay } from '../ui'
import { ApiError, downloadExport, getDailyReport, getPeriodReport, getPlan, type DailyReport, type PeriodReport } from '../services/api'
import { monthLabel, shiftDays, shiftMonths, todayLocal } from '../services/dates'
import { saveAndShare, XLSX_MIME } from '../services/files'
import { PAYMENT_LABEL } from '../services/receipt'
import { UpgradeNotice } from '../components/UpgradeNotice'

type Period = 'day' | 'week' | 'month'
const TABS: Array<{ key: Period; label: string }> = [
    { key: 'day', label: 'Hari' },
    { key: 'week', label: 'Minggu' },
    { key: 'month', label: 'Bulan' },
]

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <View style={{ flexBasis: '47%', flexGrow: 1, paddingVertical: space.sm }}>
            <Text size={12} color={colors.inkSoft}>{label}</Text>
            <View style={{ marginTop: 2 }}>{children}</View>
        </View>
    )
}

function Bars({ days }: { days: PeriodReport['days'] }) {
    const max = Math.max(1, ...days.map(d => d.revenue))
    const last = days.length - 1
    return (
        <View>
            <View style={{ flexDirection: 'row', alignItems: 'flex-end', height: 96, gap: days.length > 10 ? 2 : 6 }}>
                {days.map(d => (
                    <View
                        key={d.date}
                        accessibilityLabel={`${formatDay(d.date)}: ${d.revenue}`}
                        style={{
                            flex: 1, height: Math.max(3, (d.revenue / max) * 96), borderRadius: 3,
                            backgroundColor: d.revenue > 0 ? colors.ink : colors.line,
                        }}
                    />
                ))}
            </View>
            <Row style={{ justifyContent: 'space-between', marginTop: 4 }}>
                <Text mono size={11} color={colors.inkSoft}>{Number(days[0].date.slice(8))}</Text>
                <Text mono size={11} color={colors.inkSoft}>{Number(days[last].date.slice(8))}</Text>
            </Row>
        </View>
    )
}

export default function LaporanScreen() {
    const today = todayLocal()
    const [period, setPeriod] = React.useState<Period>('day')
    const [anchor, setAnchor] = React.useState(today)
    const [exporting, setExporting] = React.useState(false)
    const [exportError, setExportError] = React.useState<string | null>(null)
    const [upgrade, setUpgrade] = React.useState<string | null>(null)

    const plan = useQuery({ queryKey: ['plan'], queryFn: getPlan })
    const extended = plan.data?.features.extendedReports ?? false
    const canExport = plan.data?.features.export ?? false
    const locked = period !== 'day' && plan.isSuccess && !extended

    const report = useQuery<DailyReport | PeriodReport>({
        queryKey: ['report', period, anchor],
        queryFn: () => (period === 'day' ? getDailyReport(anchor) : getPeriodReport(period, anchor)),
        enabled: !locked && plan.isSuccess,
    })

    const step = (dir: 1 | -1) => setAnchor(a => (period === 'day' ? shiftDays(a, dir) : period === 'week' ? shiftDays(a, 7 * dir) : shiftMonths(a, dir)))

    const r = report.data
    const rangeFrom = r ? ('from' in r ? r.from : r.date) : anchor
    const rangeTo = r ? ('to' in r ? r.to : r.date) : anchor
    const title = !r ? '…' : period === 'day' ? formatDay(rangeFrom) : period === 'week' ? `${formatDay(rangeFrom)} – ${formatDay(rangeTo)}` : monthLabel(rangeFrom)
    const atEnd = r ? rangeTo >= today : anchor >= today

    const exportXlsx = async () => {
        setExportError(null); setUpgrade(null)
        if (!canExport) { setUpgrade('Ekspor Excel tersedia di paket Toko.'); return }
        setExporting(true)
        try {
            const file = await downloadExport(rangeFrom, rangeTo)
            await saveAndShare(file.bytes, file.filename, XLSX_MIME)
        } catch (e) {
            if (e instanceof ApiError && e.needsUpgrade) setUpgrade(e.message)
            else setExportError(e instanceof ApiError ? e.message : e instanceof Error ? e.message : 'Ekspor gagal.')
        } finally {
            setExporting(false)
        }
    }

    return (
        <ScrollView
            style={{ backgroundColor: colors.bg }}
            contentContainerStyle={{ padding: space.lg, gap: space.md }}
            refreshControl={<RefreshControl refreshing={report.isRefetching} onRefresh={() => report.refetch()} />}
        >
            <Row style={{ backgroundColor: colors.line, borderRadius: radius.md, padding: 3 }}>
                {TABS.map(t => {
                    const on = period === t.key
                    return (
                        <Pressable
                            key={t.key}
                            onPress={() => { setPeriod(t.key); setAnchor(today); setExportError(null); setUpgrade(null) }}
                            style={{ flex: 1, minHeight: 40, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? colors.white : 'transparent' }}
                        >
                            <Text weight={on ? 'semibold' : 'regular'}>{t.label}{t.key !== 'day' && plan.isSuccess && !extended ? ' · Toko' : ''}</Text>
                        </Pressable>
                    )
                })}
            </Row>

            {locked ? (
                <UpgradeNotice message="Laporan mingguan dan bulanan tersedia di paket Toko. Laporan harian tetap gratis." />
            ) : (
                <>
                    <Text weight="semibold" size={18} style={{ textAlign: 'center' }}>{title}</Text>
                    <Row style={{ gap: space.sm }}>
                        <Button label="Sebelumnya" variant="ghost" onPress={() => step(-1)} style={{ flex: 1, minHeight: 44 }} />
                        <Button label="Berikutnya" variant="ghost" disabled={atEnd} onPress={() => step(1)} style={{ flex: 1, minHeight: 44 }} />
                    </Row>

                    {report.isLoading || plan.isLoading ? <Loading />
                        : report.isError || !r ? <ErrorState message={errorMessage(report.error)} onRetry={() => report.refetch()} />
                            : (
                                <>
                                    <Card>
                                        <Row style={{ flexWrap: 'wrap' }}>
                                            <Stat label="Omzet"><Money value={r.revenue} size={18} weight="bold" /></Stat>
                                            <Stat label="Uang masuk"><Money value={r.cashIn} size={18} /></Stat>
                                            <Stat label="Untung"><Money value={r.profit} size={18} color={colors.ok} /></Stat>
                                            <Stat label="Transaksi"><Text mono size={18}>{r.transactionCount}</Text></Stat>
                                        </Row>
                                        {!r.profitComplete ? (
                                            <Text size={12} color={colors.warn} style={{ marginTop: space.xs }}>
                                                Untung belum lengkap: {r.uncostedItemCount} item terjual tanpa harga modal (omzetnya {`Rp ${Math.round(r.uncostedRevenue).toLocaleString('id-ID')}`} tidak masuk hitungan untung). Isi harga modal di menu Produk.
                                            </Text>
                                        ) : null}
                                        <Text size={12} color={colors.inkSoft} style={{ marginTop: space.sm }}>
                                            Omzet termasuk penjualan bon. Uang masuk = penjualan non-bon + pelunasan bon (<Money value={r.debtPaymentsReceived} size={12} />).
                                        </Text>
                                    </Card>

                                    {'days' in r && r.days.length > 0 ? (
                                        <Card>
                                            <Text weight="semibold" style={{ marginBottom: space.sm }}>Omzet per hari</Text>
                                            <Bars days={r.days} />
                                        </Card>
                                    ) : null}

                                    <Card>
                                        <Text weight="semibold" style={{ marginBottom: space.xs }}>Metode bayar</Text>
                                        {(['CASH', 'QRIS', 'TRANSFER', 'BON'] as const).map(m => (
                                            <Row key={m} style={{ justifyContent: 'space-between', paddingVertical: 4 }}>
                                                <Text size={14}>{PAYMENT_LABEL[m]} <Text size={12} color={colors.inkSoft}>({r.byPayment[m].count})</Text></Text>
                                                <Money value={r.byPayment[m].revenue} size={14} />
                                            </Row>
                                        ))}
                                        <Row style={{ justifyContent: 'space-between', paddingTop: space.sm, marginTop: space.xs, borderTopWidth: 1, borderTopColor: colors.line }}>
                                            <Text size={14} weight="semibold">Sisa bon pelanggan (saat ini)</Text>
                                            <Money value={r.debtOutstanding} size={14} weight="bold" color={r.debtOutstanding > 0 ? colors.warn : colors.ink} />
                                        </Row>
                                    </Card>

                                    {r.topProducts.length > 0 ? (
                                        <Card>
                                            <Text weight="semibold" style={{ marginBottom: space.xs }}>Produk terlaris</Text>
                                            {r.topProducts.map((p, i) => (
                                                <Row key={p.productId} style={{ justifyContent: 'space-between', paddingVertical: 4 }}>
                                                    <Text size={14} style={{ flex: 1, paddingRight: space.md }} numberOfLines={1}>{i + 1}. {p.name}</Text>
                                                    <Text mono size={13} color={colors.inkSoft}>×{p.quantity}</Text>
                                                    <View style={{ width: 100, alignItems: 'flex-end' }}><Money value={p.revenue} size={14} /></View>
                                                </Row>
                                            ))}
                                        </Card>
                                    ) : null}

                                    {upgrade ? <UpgradeNotice message={upgrade} /> : null}
                                    {exportError ? <Text color={colors.danger} size={14}>{exportError}</Text> : null}
                                    <Button label={`Ekspor Excel${canExport ? '' : ' · Toko'}`} variant="ghost" onPress={exportXlsx} loading={exporting} />
                                </>
                            )}
                </>
            )}
        </ScrollView>
    )
}
