import * as React from 'react'
import { FlatList, Pressable, RefreshControl, TextInput, View } from 'react-native'
import { useQuery } from '@tanstack/react-query'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import type { RootParams } from '../navigation'
import { colors, fonts, radius, space } from '../theme'
import { Badge, Button, Empty, ErrorState, Loading, Money, Row, Text, errorMessage } from '../ui'
import { getPlan, getProducts } from '../services/api'
import { getSession } from '../services/session'

type Props = NativeStackScreenProps<RootParams, 'Produk'>

export default function ProdukScreen({ navigation }: Props) {
    const isOwner = getSession()?.user.role === 'ADMIN'
    const products = useQuery({ queryKey: ['products'], queryFn: getProducts })
    const plan = useQuery({ queryKey: ['plan'], queryFn: getPlan })
    const [search, setSearch] = React.useState('')
    const [onlyLow, setOnlyLow] = React.useState(false)

    const visible = React.useMemo(() => {
        const q = search.trim().toLowerCase()
        return (products.data ?? []).filter(p =>
            (!onlyLow || p.lowStock) && (!q || p.name.toLowerCase().includes(q) || p.code.toLowerCase().includes(q)))
    }, [products.data, search, onlyLow])

    if (products.isLoading) return <Loading />
    if (products.isError) return <ErrorState message={errorMessage(products.error)} onRetry={() => products.refetch()} />

    const lowCount = (products.data ?? []).filter(p => p.lowStock).length
    const limit = plan.data?.limits.maxProducts ?? null
    const used = plan.data?.usage.products ?? products.data?.length ?? 0

    return (
        <FlatList
            style={{ backgroundColor: colors.bg }}
            data={visible}
            keyExtractor={p => p.productId}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ padding: space.lg, gap: space.sm, flexGrow: 1 }}
            refreshControl={<RefreshControl refreshing={products.isRefetching} onRefresh={() => { void products.refetch(); void plan.refetch() }} />}
            ListHeaderComponent={
                <View style={{ gap: space.sm, marginBottom: space.sm }}>
                    {limit !== null ? (
                        <Text size={13} color={used >= limit ? colors.danger : colors.inkSoft}>
                            {used} dari {limit} produk (paket Warung){used >= limit ? ' · batas tercapai' : ''}
                        </Text>
                    ) : null}
                    <TextInput
                        value={search}
                        onChangeText={setSearch}
                        placeholder="Cari produk atau kode"
                        placeholderTextColor={colors.inkSoft}
                        style={{
                            minHeight: 48, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.white,
                            paddingHorizontal: space.md, fontFamily: fonts.regular, fontSize: 16, color: colors.ink,
                        }}
                    />
                    <Row style={{ gap: space.sm }}>
                        {isOwner ? <Button label="+ Produk" variant="primary" onPress={() => navigation.navigate('ProdukForm', {})} style={{ flex: 1 }} /> : null}
                        <Button
                            label={onlyLow ? 'Tampilkan semua' : `Stok menipis (${lowCount})`}
                            variant="ghost"
                            onPress={() => setOnlyLow(v => !v)}
                            style={{ flex: 1 }}
                        />
                    </Row>
                </View>
            }
            ListEmptyComponent={<Empty title={search || onlyLow ? 'Tidak ada yang cocok' : 'Belum ada produk'} hint={isOwner && !search && !onlyLow ? 'Tekan + Produk untuk menambah.' : undefined} />}
            renderItem={({ item }) => {
                const margin = item.costPrice != null ? Number(item.price) - Number(item.costPrice) : null
                return (
                    <Pressable
                        disabled={!isOwner}
                        onPress={() => navigation.navigate('ProdukForm', { product: item })}
                        style={({ pressed }) => ({
                            backgroundColor: colors.card, borderRadius: radius.md, borderWidth: 1,
                            borderColor: item.lowStock ? colors.price : colors.line, padding: space.md, opacity: pressed ? 0.85 : 1,
                        })}
                    >
                        <Row style={{ justifyContent: 'space-between' }}>
                            <View style={{ flex: 1, paddingRight: space.md }}>
                                <Text weight="semibold" numberOfLines={2}>{item.name}</Text>
                                <Row style={{ marginTop: 4, gap: 6 }}>
                                    <Text mono size={12} color={colors.inkSoft}>{item.code}</Text>
                                    {item.stock <= 0 ? <Badge label="HABIS" tone="danger" /> : item.lowStock ? <Badge label="MENIPIS" tone="warn" /> : null}
                                </Row>
                            </View>
                            <View style={{ alignItems: 'flex-end' }}>
                                <Money value={item.price} size={16} weight="bold" />
                                <Text mono size={12} color={colors.inkSoft} style={{ marginTop: 4 }}>{item.stock} {item.unit}</Text>
                            </View>
                        </Row>
                        {isOwner ? (
                            <Text size={12} color={margin === null ? colors.warn : colors.inkSoft} style={{ marginTop: 6 }}>
                                {margin === null ? 'Harga modal belum diisi' : `Untung per ${item.unit}: Rp ${Math.round(margin).toLocaleString('id-ID')}`}
                            </Text>
                        ) : null}
                    </Pressable>
                )
            }}
        />
    )
}
