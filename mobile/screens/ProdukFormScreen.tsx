import * as React from 'react'
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import type { RootParams } from '../navigation'
import { colors, space } from '../theme'
import { Button, Field, Text, errorMessage } from '../ui'
import { ApiError, createProduct, updateProduct, type ProductInput } from '../services/api'
import { UpgradeNotice } from '../components/UpgradeNotice'

type Props = NativeStackScreenProps<RootParams, 'ProdukForm'>

const onlyDigits = (t: string) => t.replace(/\D/g, '')
const money = (v: string | number | null | undefined) => (v == null ? '' : String(Math.round(Number(v))))

type Errors = Partial<Record<'name' | 'unit' | 'price' | 'stock', string>>

export default function ProdukFormScreen({ route, navigation }: Props) {
    const editing = route.params.product
    const qc = useQueryClient()

    const [name, setName] = React.useState(editing?.name ?? '')
    const [unit, setUnit] = React.useState(editing?.unit ?? 'PCS')
    const [price, setPrice] = React.useState(money(editing?.price))
    const [cost, setCost] = React.useState(money(editing?.costPrice))
    const [stock, setStock] = React.useState(editing ? String(editing.stock) : '')
    const [minStock, setMinStock] = React.useState(editing ? String(editing.minStock) : '5')
    const [code, setCode] = React.useState(editing?.code ?? '')
    const [errors, setErrors] = React.useState<Errors>({})
    const [formError, setFormError] = React.useState<string | null>(null)
    const [upgrade, setUpgrade] = React.useState<string | null>(null)

    const save = useMutation({
        mutationFn: (input: ProductInput) => (editing ? updateProduct(editing.productId, input) : createProduct(input)),
        onSuccess: () => {
            for (const key of ['products', 'plan']) void qc.invalidateQueries({ queryKey: [key] })
            navigation.goBack()
        },
        onError: e => {
            if (e instanceof ApiError && e.needsUpgrade) setUpgrade(e.message)
            else if (e instanceof ApiError && e.status === 409) setFormError('Kode produk sudah dipakai.')
            else setFormError(errorMessage(e))
        },
    })

    const submit = () => {
        const found: Errors = {}
        if (!name.trim()) found.name = 'Nama produk wajib diisi.'
        if (!unit.trim()) found.unit = 'Satuan wajib diisi.'
        if (price === '') found.price = 'Harga jual wajib diisi.'
        if (stock === '') found.stock = 'Stok wajib diisi.'
        setErrors(found); setFormError(null); setUpgrade(null)
        if (Object.keys(found).length) return

        const input: ProductInput = {
            name: name.trim(),
            unit: unit.trim().toUpperCase(),
            price: Number(price),
            stock: Number(stock),
            minStock: minStock === '' ? 5 : Number(minStock),
            // Harga modal yang dikosongkan tidak dikirim: server tidak mendukung menghapus modal.
            ...(cost !== '' ? { costPrice: Number(cost) } : {}),
            ...(code.trim() ? { code: code.trim() } : {}),
        }
        save.mutate(input)
    }

    return (
        <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <ScrollView contentContainerStyle={{ padding: space.lg }} keyboardShouldPersistTaps="handled">
                <Field label="Nama produk" value={name} onChangeText={setName} autoCapitalize="words" error={errors.name} />
                <Field label="Satuan" value={unit} onChangeText={setUnit} autoCapitalize="characters" error={errors.unit} hint="Mis. PCS, BOTOL, PACK, KG." />
                <Field label="Harga jual (Rp)" value={price} onChangeText={t => setPrice(onlyDigits(t))} keyboardType="number-pad" error={errors.price} />
                <Field
                    label="Harga modal (Rp)"
                    value={cost}
                    onChangeText={t => setCost(onlyDigits(t))}
                    keyboardType="number-pad"
                    hint="Isi supaya untung di laporan terhitung. Tidak terlihat oleh kasir."
                />
                <Field label="Stok" value={stock} onChangeText={t => setStock(onlyDigits(t))} keyboardType="number-pad" error={errors.stock} />
                <Field label="Batas stok menipis" value={minStock} onChangeText={t => setMinStock(onlyDigits(t))} keyboardType="number-pad" hint="Produk ditandai menipis saat stok sama atau di bawah angka ini." />
                <Field label="Kode (opsional)" value={code} onChangeText={setCode} autoCapitalize="characters" hint="Dibuat otomatis bila dikosongkan." />

                {upgrade ? <View style={{ marginBottom: space.md }}><UpgradeNotice message={upgrade} /></View> : null}
                {formError ? <Text color={colors.danger} size={14} style={{ marginBottom: space.md }}>{formError}</Text> : null}

                <Button label={editing ? 'Simpan perubahan' : 'Tambah produk'} variant="accent" onPress={submit} loading={save.isPending} />
            </ScrollView>
        </KeyboardAvoidingView>
    )
}
