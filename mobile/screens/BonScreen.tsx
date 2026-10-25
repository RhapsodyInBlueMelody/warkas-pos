import * as React from 'react'
import { FlatList, Pressable, RefreshControl, View } from 'react-native'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import type { RootParams } from '../navigation'
import { colors, radius, space } from '../theme'
import { Button, Card, Empty, ErrorState, Field, Loading, Money, Row, Text, errorMessage } from '../ui'
import { ApiError, createCustomer, getCustomers, getPlan } from '../services/api'
import { UpgradeNotice } from '../components/UpgradeNotice'

type Props = NativeStackScreenProps<RootParams, 'Bon'>

export default function BonScreen({ navigation }: Props) {
    const qc = useQueryClient()
    const plan = useQuery({ queryKey: ['plan'], queryFn: getPlan })
    const [onlyDebt, setOnlyDebt] = React.useState(false)
    const list = useQuery({ queryKey: ['customers', 'bon', onlyDebt], queryFn: () => getCustomers({ withDebt: onlyDebt }) })

    const [adding, setAdding] = React.useState(false)
    const [name, setName] = React.useState('')
    const [phone, setPhone] = React.useState('')
    const [error, setError] = React.useState<string | null>(null)
    const [upgrade, setUpgrade] = React.useState<string | null>(null)

    const bonAllowed = plan.data?.features.bon ?? false

    const add = useMutation({
        mutationFn: () => createCustomer({ name, phone: phone.trim() || undefined }),
        onSuccess: () => {
            void qc.invalidateQueries({ queryKey: ['customers'] })
            setAdding(false); setName(''); setPhone(''); setError(null)
        },
        onError: e => {
            if (e instanceof ApiError && e.needsUpgrade) setUpgrade(e.message)
            else setError(errorMessage(e))
        },
    })

    const startAdd = () => {
        if (!bonAllowed) { setUpgrade('Buku bon untuk mencatat utang pelanggan tersedia di paket Toko.'); return }
        setUpgrade(null); setAdding(true)
    }
    const submit = () => {
        if (!name.trim()) { setError('Nama pelanggan wajib diisi.'); return }
        setError(null); add.mutate()
    }

    if (list.isLoading) return <Loading />
    if (list.isError) return <ErrorState message={errorMessage(list.error)} onRetry={() => list.refetch()} />

    return (
        <FlatList
            style={{ backgroundColor: colors.bg }}
            data={list.data?.customers ?? []}
            keyExtractor={c => c.customerId}
            contentContainerStyle={{ padding: space.lg, gap: space.sm, flexGrow: 1 }}
            refreshControl={<RefreshControl refreshing={list.isRefetching} onRefresh={() => list.refetch()} />}
            ListHeaderComponent={
                <View style={{ gap: space.md, marginBottom: space.sm }}>
                    <Card>
                        <Text size={13} color={colors.inkSoft}>Total utang pelanggan</Text>
                        <Money value={list.data?.totalOutstanding ?? 0} size={26} weight="bold" color={(list.data?.totalOutstanding ?? 0) > 0 ? colors.warn : colors.ok} />
                    </Card>
                    {upgrade ? <UpgradeNotice message={upgrade} /> : null}
                    {adding ? (
                        <Card>
                            <Field label="Nama pelanggan" value={name} onChangeText={setName} autoCapitalize="words" />
                            <Field label="No. HP (opsional)" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
                            {error ? <Text color={colors.danger} size={14} style={{ marginBottom: space.md }}>{error}</Text> : null}
                            <Button label="Simpan" variant="accent" onPress={submit} loading={add.isPending} />
                            <Button label="Batal" variant="ghost" onPress={() => { setAdding(false); setError(null) }} style={{ marginTop: space.sm }} />
                        </Card>
                    ) : (
                        <Row style={{ gap: space.sm }}>
                            <Button label="+ Pelanggan" variant="primary" onPress={startAdd} style={{ flex: 1 }} />
                            <Button label={onlyDebt ? 'Tampilkan semua' : 'Yang berutang'} variant="ghost" onPress={() => setOnlyDebt(v => !v)} style={{ flex: 1 }} />
                        </Row>
                    )}
                </View>
            }
            ListEmptyComponent={
                <Empty
                    title={onlyDebt ? 'Tidak ada yang berutang' : 'Belum ada pelanggan'}
                    hint={bonAllowed ? 'Tambah pelanggan, lalu pilih Bon saat checkout di Kasir.' : 'Buku bon tersedia di paket Toko.'}
                />
            }
            renderItem={({ item }) => (
                <Pressable
                    onPress={() => navigation.navigate('Pelanggan', { customerId: item.customerId, name: item.name })}
                    style={({ pressed }) => ({
                        backgroundColor: colors.card, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line,
                        padding: space.md, opacity: pressed ? 0.85 : 1,
                    })}
                >
                    <Row style={{ justifyContent: 'space-between' }}>
                        <View style={{ flex: 1, paddingRight: space.md }}>
                            <Text weight="semibold" numberOfLines={1}>{item.name}</Text>
                            {item.phone ? <Text size={12} color={colors.inkSoft}>{item.phone}</Text> : null}
                        </View>
                        {item.balance > 0
                            ? <Money value={item.balance} size={16} weight="bold" color={colors.warn} />
                            : <Text size={13} weight="semibold" color={colors.ok}>Lunas</Text>}
                    </Row>
                </Pressable>
            )}
        />
    )
}
