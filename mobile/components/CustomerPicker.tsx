import * as React from 'react'
import { FlatList, Modal, Pressable, TextInput, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { colors, fonts, radius, space } from '../theme'
import { Button, Empty, ErrorState, Field, Loading, Money, Row, Text, errorMessage } from '../ui'
import { createCustomer, getCustomers, type Customer } from '../services/api'

/** Memilih pelanggan untuk transaksi bon, atau menambah pelanggan baru. */
export function CustomerPicker({ visible, onClose, onPick }: {
    visible: boolean
    onClose: () => void
    onPick: (customer: Customer) => void
}) {
    const qc = useQueryClient()
    const [search, setSearch] = React.useState('')
    const [adding, setAdding] = React.useState(false)
    const [name, setName] = React.useState('')
    const [phone, setPhone] = React.useState('')
    const [formError, setFormError] = React.useState<string | null>(null)

    const list = useQuery({ queryKey: ['customers', search], queryFn: () => getCustomers({ search }), enabled: visible })

    const add = useMutation({
        mutationFn: () => createCustomer({ name, phone: phone.trim() || undefined }),
        onSuccess: ({ customer }) => {
            void qc.invalidateQueries({ queryKey: ['customers'] })
            setAdding(false); setName(''); setPhone(''); setFormError(null)
            onPick(customer)
        },
        onError: e => setFormError(errorMessage(e)),
    })

    const submitNew = () => {
        if (!name.trim()) { setFormError('Nama pelanggan wajib diisi.'); return }
        setFormError(null)
        add.mutate()
    }

    return (
        <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
            <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
                <Row style={{ justifyContent: 'space-between', padding: space.lg }}>
                    <Text weight="bold" size={20}>Pilih pelanggan</Text>
                    <Button label="Tutup" variant="ghost" onPress={onClose} style={{ minHeight: 40 }} />
                </Row>

                {adding ? (
                    <View style={{ padding: space.lg }}>
                        <Field label="Nama pelanggan" value={name} onChangeText={setName} autoCapitalize="words" />
                        <Field label="No. HP (opsional)" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
                        {formError ? <Text color={colors.danger} size={14} style={{ marginBottom: space.md }}>{formError}</Text> : null}
                        <Button label="Simpan dan pilih" variant="accent" onPress={submitNew} loading={add.isPending} />
                        <Button label="Batal" variant="ghost" onPress={() => setAdding(false)} style={{ marginTop: space.sm }} />
                    </View>
                ) : (
                    <>
                        <View style={{ paddingHorizontal: space.lg, paddingBottom: space.md }}>
                            <TextInput
                                value={search}
                                onChangeText={setSearch}
                                placeholder="Cari nama pelanggan"
                                placeholderTextColor={colors.inkSoft}
                                style={{
                                    minHeight: 48, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line,
                                    backgroundColor: colors.white, paddingHorizontal: space.md, fontFamily: fonts.regular, fontSize: 16, color: colors.ink,
                                }}
                            />
                            <Button label="+ Pelanggan baru" variant="ghost" onPress={() => setAdding(true)} style={{ marginTop: space.sm }} />
                        </View>
                        {list.isLoading ? <Loading />
                            : list.isError ? <ErrorState message={errorMessage(list.error)} onRetry={() => list.refetch()} />
                                : (
                                    <FlatList
                                        data={list.data?.customers ?? []}
                                        keyExtractor={c => c.customerId}
                                        contentContainerStyle={{ paddingHorizontal: space.lg, gap: space.sm, flexGrow: 1 }}
                                        ListEmptyComponent={<Empty title="Belum ada pelanggan" hint="Tambah pelanggan baru untuk mencatat bon." />}
                                        renderItem={({ item }) => (
                                            <Pressable
                                                onPress={() => onPick(item)}
                                                style={({ pressed }) => ({
                                                    backgroundColor: colors.card, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line,
                                                    padding: space.md, opacity: pressed ? 0.8 : 1,
                                                })}
                                            >
                                                <Row style={{ justifyContent: 'space-between' }}>
                                                    <Text weight="semibold" style={{ flex: 1 }} numberOfLines={1}>{item.name}</Text>
                                                    {item.balance > 0 ? <Money value={item.balance} size={14} color={colors.warn} /> : <Text size={12} color={colors.ok}>Lunas</Text>}
                                                </Row>
                                                {item.phone ? <Text size={12} color={colors.inkSoft}>{item.phone}</Text> : null}
                                            </Pressable>
                                        )}
                                    />
                                )}
                    </>
                )}
            </SafeAreaView>
        </Modal>
    )
}
