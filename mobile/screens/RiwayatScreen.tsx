import * as React from 'react'
import { FlatList, Pressable, RefreshControl } from 'react-native'
import { useQuery } from '@tanstack/react-query'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import type { RootParams } from '../navigation'
import { colors, radius, space } from '../theme'
import { Badge, Empty, ErrorState, Loading, Money, Row, Text, errorMessage, formatDateTime } from '../ui'
import { getTransactions, type TransactionRecord } from '../services/api'
import { getSession } from '../services/session'
import { PAYMENT_LABEL, type ReceiptData } from '../services/receipt'

type Props = NativeStackScreenProps<RootParams, 'Riwayat'>

function toReceipt(t: TransactionRecord): ReceiptData {
    return {
        storeName: getSession()?.store.name ?? 'Warkas',
        code: t.code,
        createdAt: t.createdAt,
        kasirName: t.kasir.name,
        paymentMethod: t.paymentMethod,
        customerName: t.customer?.name ?? null,
        items: t.items.map(i => ({ name: i.product.name, quantity: i.quantity, price: i.priceAtTime })),
        total: t.totalPrice,
    }
}

export default function RiwayatScreen({ navigation }: Props) {
    const isOwner = getSession()?.user.role === 'ADMIN'
    const q = useQuery({ queryKey: ['transactions'], queryFn: getTransactions })

    if (q.isLoading) return <Loading />
    if (q.isError) return <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />

    return (
        <FlatList
            style={{ backgroundColor: colors.bg }}
            data={q.data ?? []}
            keyExtractor={t => t.transactionId}
            contentContainerStyle={{ padding: space.lg, gap: space.sm, flexGrow: 1 }}
            refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => q.refetch()} />}
            ListEmptyComponent={<Empty title="Belum ada transaksi" hint="Transaksi dari menu Kasir muncul di sini." />}
            renderItem={({ item }) => (
                <Pressable
                    onPress={() => navigation.navigate('Struk', { receipt: toReceipt(item) })}
                    style={({ pressed }) => ({
                        backgroundColor: colors.card, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line,
                        padding: space.md, opacity: pressed ? 0.85 : 1,
                    })}
                >
                    <Row style={{ justifyContent: 'space-between' }}>
                        <Text size={13} color={colors.inkSoft}>{formatDateTime(item.createdAt)}</Text>
                        <Badge label={PAYMENT_LABEL[item.paymentMethod].toUpperCase()} tone={item.paymentMethod === 'BON' ? 'warn' : 'neutral'} />
                    </Row>
                    <Row style={{ justifyContent: 'space-between', marginTop: space.xs }}>
                        <Text size={14} style={{ flex: 1, paddingRight: space.md }} numberOfLines={1}>
                            {item.items.map(i => `${i.product.name} ×${i.quantity}`).join(', ')}
                        </Text>
                        <Money value={item.totalPrice} size={16} weight="bold" />
                    </Row>
                    {item.customer || isOwner ? (
                        <Text size={12} color={colors.inkSoft} style={{ marginTop: 4 }}>
                            {[item.customer ? `Bon: ${item.customer.name}` : null, isOwner ? `Kasir: ${item.kasir.name}` : null].filter(Boolean).join(' · ')}
                        </Text>
                    ) : null}
                </Pressable>
            )}
        />
    )
}
