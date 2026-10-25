import * as React from 'react'
import { FlatList, Modal, Pressable, ScrollView, TextInput, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import type { RootParams } from '../navigation'
import { colors, fonts, radius, space } from '../theme'
import { Badge, Button, Empty, ErrorState, Loading, Money, Row, Text, errorMessage, rupiah } from '../ui'
import { ApiError, createTransaction, getPlan, getProducts, type Customer, type PaymentMethod, type Product } from '../services/api'
import { getSession } from '../services/session'
import { PAYMENT_LABEL, type ReceiptData } from '../services/receipt'
import { CustomerPicker } from '../components/CustomerPicker'
import { UpgradeNotice } from '../components/UpgradeNotice'

type Props = NativeStackScreenProps<RootParams, 'Kasir'>

type Line = { product: Product; quantity: number }

const METHODS: PaymentMethod[] = ['CASH', 'QRIS', 'TRANSFER', 'BON']

export default function KasirScreen({ navigation }: Props) {
    const qc = useQueryClient()
    const products = useQuery({ queryKey: ['products'], queryFn: getProducts })
    const plan = useQuery({ queryKey: ['plan'], queryFn: getPlan })

    const [search, setSearch] = React.useState('')
    const [cart, setCart] = React.useState<Record<string, Line>>({})
    const [sheet, setSheet] = React.useState(false)
    const [method, setMethod] = React.useState<PaymentMethod>('CASH')
    const [customer, setCustomer] = React.useState<Customer | null>(null)
    const [pickerOpen, setPickerOpen] = React.useState(false)
    const [cash, setCash] = React.useState('')
    const [error, setError] = React.useState<string | null>(null)
    const [upgrade, setUpgrade] = React.useState<string | null>(null)

    const bonAllowed = plan.data?.features.bon ?? false
    const lines = Object.values(cart)
    const itemCount = lines.reduce((n, l) => n + l.quantity, 0)
    const total = lines.reduce((sum, l) => sum + Number(l.product.price) * l.quantity, 0)
    const cashNumber = Number(cash.replace(/\D/g, '')) || 0

    const visible = React.useMemo(() => {
        const q = search.trim().toLowerCase()
        const all = products.data ?? []
        return q ? all.filter(p => p.name.toLowerCase().includes(q) || p.code.toLowerCase().includes(q)) : all
    }, [products.data, search])

    const add = (p: Product) => {
        setCart(prev => {
            const current = prev[p.productId]?.quantity ?? 0
            if (current >= p.stock) return prev // tidak boleh melebihi stok
            return { ...prev, [p.productId]: { product: p, quantity: current + 1 } }
        })
    }

    const change = (productId: string, delta: number) => {
        setCart(prev => {
            const line = prev[productId]
            if (!line) return prev
            const quantity = Math.min(line.product.stock, line.quantity + delta)
            const next = { ...prev }
            if (quantity <= 0) delete next[productId]
            else next[productId] = { ...line, quantity }
            return next
        })
    }

    const chooseMethod = (m: PaymentMethod) => {
        setError(null)
        if (m === 'BON' && !bonAllowed) {
            setUpgrade('Buku bon untuk mencatat utang pelanggan tersedia di paket Toko.')
            return
        }
        setUpgrade(null)
        setMethod(m)
        if (m !== 'BON') setCustomer(null)
    }

    const pay = useMutation({
        mutationFn: () => createTransaction({
            items: lines.map(l => ({ productId: l.product.productId, quantity: l.quantity })),
            paymentMethod: method,
            ...(method === 'BON' && customer ? { customerId: customer.customerId } : {}),
        }),
        onSuccess: res => {
            const session = getSession()
            const receipt: ReceiptData = {
                storeName: session?.store.name ?? 'Warkas',
                code: res.transactionCode,
                createdAt: new Date().toISOString(),
                kasirName: session?.user.name,
                paymentMethod: method,
                customerName: customer?.name ?? null,
                items: lines.map(l => ({ name: l.product.name, quantity: l.quantity, price: Number(l.product.price) })),
                total,
                cashReceived: method === 'CASH' && cashNumber >= total ? cashNumber : undefined,
            }
            for (const key of ['products', 'report', 'plan', 'transactions', 'customers']) {
                void qc.invalidateQueries({ queryKey: [key] })
            }
            setCart({}); setSheet(false); setCash(''); setCustomer(null); setMethod('CASH')
            navigation.replace('Struk', { receipt, fromCheckout: true })
        },
        onError: e => {
            if (e instanceof ApiError && e.needsUpgrade) setUpgrade(e.message)
            else setError(errorMessage(e))
            // Stok bisa berubah dari perangkat lain; muat ulang supaya angka di layar benar.
            void products.refetch()
        },
    })

    const checkout = () => {
        setError(null)
        if (lines.length === 0) { setError('Keranjang masih kosong.'); return }
        if (method === 'BON' && !customer) { setError('Pilih pelanggan untuk transaksi bon.'); return }
        if (method === 'CASH' && cash && cashNumber < total) { setError('Uang diterima kurang dari total.'); return }
        pay.mutate()
    }

    if (products.isLoading) return <Loading />
    if (products.isError) return <ErrorState message={errorMessage(products.error)} onRetry={() => products.refetch()} />

    const quickCash = Array.from(new Set([total, 20000, 50000, 100000].filter(v => v >= total && v > 0))).slice(0, 4)

    return (
        <View style={{ flex: 1, backgroundColor: colors.bg }}>
            <View style={{ padding: space.lg, paddingBottom: space.sm }}>
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
            </View>

            <FlatList
                data={visible}
                keyExtractor={p => p.productId}
                contentContainerStyle={{ paddingHorizontal: space.lg, paddingBottom: itemCount ? 110 : space.xl, gap: space.sm, flexGrow: 1 }}
                keyboardShouldPersistTaps="handled"
                ListEmptyComponent={
                    <Empty
                        title={search ? 'Produk tidak ditemukan' : 'Belum ada produk'}
                        hint={search ? 'Coba kata kunci lain.' : getSession()?.user.role === 'ADMIN' ? 'Tambah produk lewat menu Produk.' : 'Minta pemilik toko menambah produk.'}
                    />
                }
                renderItem={({ item }) => {
                    const inCart = cart[item.productId]?.quantity ?? 0
                    const out = item.stock <= 0
                    return (
                        <Pressable
                            disabled={out || inCart >= item.stock}
                            onPress={() => add(item)}
                            style={({ pressed }) => ({
                                backgroundColor: colors.card, borderRadius: radius.md, borderWidth: 1,
                                borderColor: inCart ? colors.ink : colors.line, padding: space.md,
                                opacity: out ? 0.5 : pressed ? 0.85 : 1,
                            })}
                        >
                            <Row style={{ justifyContent: 'space-between' }}>
                                <View style={{ flex: 1, paddingRight: space.md }}>
                                    <Text weight="semibold" numberOfLines={2}>{item.name}</Text>
                                    <Row style={{ marginTop: 4, gap: 6 }}>
                                        <Text mono size={12} color={colors.inkSoft}>{item.code}</Text>
                                        {out ? <Badge label="HABIS" tone="danger" /> : item.lowStock ? <Badge label={`SISA ${item.stock}`} tone="warn" /> : null}
                                    </Row>
                                </View>
                                <View style={{ alignItems: 'flex-end' }}>
                                    <Money value={item.price} size={16} weight="bold" />
                                    {inCart ? <Text weight="bold" size={13} style={{ marginTop: 4 }}>× {inCart}</Text>
                                        : <Text size={12} color={colors.inkSoft} style={{ marginTop: 4 }}>stok {item.stock}</Text>}
                                </View>
                            </Row>
                        </Pressable>
                    )
                }}
            />

            {itemCount > 0 ? (
                <SafeAreaView edges={['bottom']} style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: space.lg }}>
                    <Pressable
                        onPress={() => setSheet(true)}
                        style={{ backgroundColor: colors.ink, borderRadius: radius.lg, padding: space.lg, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}
                    >
                        <View>
                            <Text color={colors.white} size={13}>{itemCount} item</Text>
                            <Text mono weight="bold" size={20} color={colors.white}>{rupiah(total)}</Text>
                        </View>
                        <View style={{ backgroundColor: colors.price, borderRadius: radius.md, paddingHorizontal: space.lg, paddingVertical: space.sm }}>
                            <Text weight="bold" color={colors.priceInk}>Bayar</Text>
                        </View>
                    </Pressable>
                </SafeAreaView>
            ) : null}

            <Modal visible={sheet} animationType="slide" onRequestClose={() => setSheet(false)}>
                <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
                    <Row style={{ justifyContent: 'space-between', padding: space.lg }}>
                        <Text weight="bold" size={20}>Pembayaran</Text>
                        <Button label="Kembali" variant="ghost" onPress={() => setSheet(false)} style={{ minHeight: 40 }} />
                    </Row>

                    <ScrollView contentContainerStyle={{ padding: space.lg, paddingTop: 0, gap: space.md }} keyboardShouldPersistTaps="handled">
                        <View style={{ backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line }}>
                            {lines.map((l, i) => (
                                <Row key={l.product.productId} style={{ padding: space.md, borderTopWidth: i ? 1 : 0, borderTopColor: colors.line }}>
                                    <View style={{ flex: 1, paddingRight: space.sm }}>
                                        <Text weight="semibold" numberOfLines={1}>{l.product.name}</Text>
                                        <Money value={Number(l.product.price) * l.quantity} size={13} color={colors.inkSoft} />
                                    </View>
                                    <Row style={{ gap: space.sm }}>
                                        <Pressable accessibilityLabel={`Kurangi ${l.product.name}`} onPress={() => change(l.product.productId, -1)} style={stepper}>
                                            <Text weight="bold" size={20}>−</Text>
                                        </Pressable>
                                        <Text mono weight="bold" style={{ minWidth: 24, textAlign: 'center' }}>{l.quantity}</Text>
                                        <Pressable
                                            accessibilityLabel={`Tambah ${l.product.name}`}
                                            disabled={l.quantity >= l.product.stock}
                                            onPress={() => change(l.product.productId, 1)}
                                            style={[stepper, l.quantity >= l.product.stock ? { opacity: 0.35 } : null]}
                                        >
                                            <Text weight="bold" size={20}>+</Text>
                                        </Pressable>
                                    </Row>
                                </Row>
                            ))}
                        </View>

                        <Row style={{ justifyContent: 'space-between' }}>
                            <Text weight="semibold" size={16}>Total</Text>
                            <Money value={total} size={22} weight="bold" />
                        </Row>

                        <View>
                            <Text size={13} color={colors.inkSoft} style={{ marginBottom: 6 }}>Metode bayar</Text>
                            <Row style={{ flexWrap: 'wrap', gap: space.sm }}>
                                {METHODS.map(m => {
                                    const on = method === m
                                    const locked = m === 'BON' && !bonAllowed
                                    return (
                                        <Pressable
                                            key={m}
                                            onPress={() => chooseMethod(m)}
                                            style={{
                                                paddingHorizontal: space.lg, minHeight: 44, borderRadius: radius.md, borderWidth: 1, justifyContent: 'center',
                                                backgroundColor: on ? colors.ink : colors.card, borderColor: on ? colors.ink : colors.line, opacity: locked ? 0.6 : 1,
                                            }}
                                        >
                                            <Text weight="semibold" color={on ? colors.white : colors.ink}>
                                                {m === 'BON' ? 'Bon' : PAYMENT_LABEL[m]}{locked ? ' · Toko' : ''}
                                            </Text>
                                        </Pressable>
                                    )
                                })}
                            </Row>
                        </View>

                        {method === 'BON' ? (
                            <Pressable
                                onPress={() => setPickerOpen(true)}
                                style={{ backgroundColor: colors.card, borderRadius: radius.md, borderWidth: 1, borderColor: customer ? colors.ink : colors.line, padding: space.md }}
                            >
                                <Text size={12} color={colors.inkSoft}>Pelanggan</Text>
                                {customer ? (
                                    <Row style={{ justifyContent: 'space-between' }}>
                                        <Text weight="semibold">{customer.name}</Text>
                                        <Text size={13} color={colors.warn}>utang saat ini {rupiah(customer.balance)}</Text>
                                    </Row>
                                ) : <Text weight="semibold" color={colors.ink}>Pilih pelanggan…</Text>}
                            </Pressable>
                        ) : null}

                        {method === 'CASH' ? (
                            <View>
                                <Text size={13} color={colors.inkSoft} style={{ marginBottom: 6 }}>Uang diterima (opsional)</Text>
                                <TextInput
                                    value={cash}
                                    onChangeText={t => setCash(t.replace(/\D/g, ''))}
                                    keyboardType="number-pad"
                                    placeholder="0"
                                    placeholderTextColor={colors.inkSoft}
                                    style={{
                                        minHeight: 48, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.white,
                                        paddingHorizontal: space.md, fontFamily: fonts.mono, fontSize: 18, color: colors.ink,
                                    }}
                                />
                                <Row style={{ flexWrap: 'wrap', gap: space.sm, marginTop: space.sm }}>
                                    {quickCash.map(v => (
                                        <Pressable key={v} onPress={() => setCash(String(v))} style={{ paddingHorizontal: space.md, minHeight: 40, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.card, justifyContent: 'center' }}>
                                            <Text mono size={13}>{v === total ? 'Uang pas' : rupiah(v)}</Text>
                                        </Pressable>
                                    ))}
                                </Row>
                                {cashNumber >= total && cashNumber > 0 ? (
                                    <Row style={{ justifyContent: 'space-between', marginTop: space.md }}>
                                        <Text weight="semibold">Kembalian</Text>
                                        <Money value={cashNumber - total} size={18} weight="bold" color={colors.ok} />
                                    </Row>
                                ) : null}
                            </View>
                        ) : null}

                        {upgrade ? <UpgradeNotice message={upgrade} /> : null}
                        {error ? <Text color={colors.danger} size={14}>{error}</Text> : null}

                        <Button label={`Selesaikan · ${rupiah(total)}`} variant="accent" onPress={checkout} loading={pay.isPending} />
                    </ScrollView>
                </SafeAreaView>

                <CustomerPicker
                    visible={pickerOpen}
                    onClose={() => setPickerOpen(false)}
                    onPick={c => { setCustomer(c); setPickerOpen(false); setError(null) }}
                />
            </Modal>
        </View>
    )
}

const stepper = {
    width: 40, height: 40, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line,
    backgroundColor: colors.white, alignItems: 'center' as const, justifyContent: 'center' as const,
}
