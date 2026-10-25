import * as React from 'react'
import { ScrollView, View } from 'react-native'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import type { RootParams } from '../navigation'
import { colors, radius, space } from '../theme'
import { Badge, Button, Card, ErrorState, Field, Loading, Money, Row, Text, errorMessage, formatDateTime, rupiah } from '../ui'
import { ApiError, addCharge, getCustomer, payDebt } from '../services/api'
import { getSession } from '../services/session'
import { UpgradeNotice } from '../components/UpgradeNotice'

type Props = NativeStackScreenProps<RootParams, 'Pelanggan'>

const digits = (t: string) => Number(t.replace(/\D/g, '')) || 0

export default function PelangganScreen({ route }: Props) {
    const { customerId } = route.params
    const qc = useQueryClient()
    const isOwner = getSession()?.user.role === 'ADMIN'
    const q = useQuery({ queryKey: ['customer', customerId], queryFn: () => getCustomer(customerId) })

    const [mode, setMode] = React.useState<'pay' | 'charge' | null>(null)
    const [amount, setAmount] = React.useState('')
    const [note, setNote] = React.useState('')
    const [error, setError] = React.useState<string | null>(null)
    const [upgrade, setUpgrade] = React.useState<string | null>(null)

    const done = () => {
        for (const key of ['customer', 'customers', 'report']) void qc.invalidateQueries({ queryKey: [key] })
        setMode(null); setAmount(''); setNote(''); setError(null)
    }
    const fail = (e: unknown) => {
        if (e instanceof ApiError && e.needsUpgrade) setUpgrade(e.message)
        else setError(errorMessage(e))
    }

    const pay = useMutation({ mutationFn: () => payDebt(customerId, digits(amount), note.trim() || undefined), onSuccess: done, onError: fail })
    const charge = useMutation({ mutationFn: () => addCharge(customerId, digits(amount), note.trim() || undefined), onSuccess: done, onError: fail })

    if (q.isLoading) return <Loading />
    if (q.isError || !q.data) return <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />

    const { customer, balance, entries } = q.data

    const submit = () => {
        const n = digits(amount)
        if (n <= 0) { setError('Isi jumlah lebih dari 0.'); return }
        if (mode === 'pay' && n > balance) { setError(`Melebihi sisa utang (${rupiah(balance)}).`); return }
        setError(null); setUpgrade(null)
        if (mode === 'pay') pay.mutate(); else charge.mutate()
    }

    return (
        <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={{ padding: space.lg, gap: space.md }} keyboardShouldPersistTaps="handled">
            <Card>
                <Text size={13} color={colors.inkSoft}>{customer.name}{customer.phone ? ` · ${customer.phone}` : ''}</Text>
                <Text size={13} color={colors.inkSoft} style={{ marginTop: 6 }}>Sisa utang</Text>
                <Money value={balance} size={30} weight="bold" color={balance > 0 ? colors.warn : colors.ok} />
                {balance === 0 ? <Text size={13} color={colors.ok} style={{ marginTop: 2 }}>Lunas</Text> : null}
            </Card>

            {upgrade ? <UpgradeNotice message={upgrade} /> : null}

            {mode ? (
                <Card>
                    <Text weight="semibold" style={{ marginBottom: space.sm }}>{mode === 'pay' ? 'Catat pembayaran' : 'Tambah utang manual'}</Text>
                    <Field
                        label="Jumlah (Rp)"
                        value={amount}
                        onChangeText={t => setAmount(t.replace(/\D/g, ''))}
                        keyboardType="number-pad"
                        placeholder="0"
                        hint={mode === 'pay' ? `Maksimal ${rupiah(balance)}` : 'Mis. memindahkan catatan bon kertas.'}
                    />
                    {mode === 'pay' && balance > 0 ? (
                        <Button label={`Lunasi ${rupiah(balance)}`} variant="ghost" onPress={() => setAmount(String(Math.round(balance)))} style={{ marginBottom: space.md }} />
                    ) : null}
                    <Field label="Catatan (opsional)" value={note} onChangeText={setNote} autoCapitalize="sentences" />
                    {error ? <Text color={colors.danger} size={14} style={{ marginBottom: space.md }}>{error}</Text> : null}
                    <Button label="Simpan" variant="accent" onPress={submit} loading={pay.isPending || charge.isPending} />
                    <Button label="Batal" variant="ghost" onPress={() => { setMode(null); setError(null) }} style={{ marginTop: space.sm }} />
                </Card>
            ) : (
                <Row style={{ gap: space.sm }}>
                    <Button label="Catat pembayaran" variant="primary" disabled={balance <= 0} onPress={() => { setUpgrade(null); setMode('pay') }} style={{ flex: 1 }} />
                    {isOwner ? <Button label="+ Utang" variant="ghost" onPress={() => { setUpgrade(null); setMode('charge') }} style={{ flex: 1 }} /> : null}
                </Row>
            )}

            <Text weight="semibold" style={{ marginTop: space.sm }}>Riwayat</Text>
            {entries.length === 0 ? <Text size={13} color={colors.inkSoft}>Belum ada catatan.</Text> : null}
            {entries.map(e => (
                <View key={e.debtEntryId} style={{ backgroundColor: colors.card, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, padding: space.md }}>
                    <Row style={{ justifyContent: 'space-between' }}>
                        <Badge label={e.type === 'CHARGE' ? 'UTANG' : 'BAYAR'} tone={e.type === 'CHARGE' ? 'warn' : 'ok'} />
                        <Money value={e.amount} size={15} weight="bold" color={e.type === 'CHARGE' ? colors.warn : colors.ok} />
                    </Row>
                    <Text size={12} color={colors.inkSoft} style={{ marginTop: 4 }}>
                        {formatDateTime(e.createdAt)}{e.transaction ? ` · ${e.transaction.code}` : ''}{e.note ? ` · ${e.note}` : ''}
                    </Text>
                </View>
            ))}
        </ScrollView>
    )
}
