import * as React from 'react'
import { ScrollView, View } from 'react-native'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { colors, radius, space } from '../theme'
import { Badge, Button, Card, ErrorState, Field, Loading, Row, Text, errorMessage } from '../ui'
import { ApiError, createStaff, getStaff } from '../services/api'

type Errors = Partial<Record<'name' | 'username' | 'password', string>>

export default function StafScreen() {
    const qc = useQueryClient()
    const q = useQuery({ queryKey: ['staff'], queryFn: getStaff })
    const [adding, setAdding] = React.useState(false)
    const [name, setName] = React.useState('')
    const [username, setUsername] = React.useState('')
    const [password, setPassword] = React.useState('')
    const [errors, setErrors] = React.useState<Errors>({})
    const [formError, setFormError] = React.useState<string | null>(null)

    const add = useMutation({
        mutationFn: () => createStaff({ name, username, password }),
        onSuccess: () => {
            void qc.invalidateQueries({ queryKey: ['staff'] })
            setAdding(false); setName(''); setUsername(''); setPassword(''); setErrors({}); setFormError(null)
        },
        onError: e => {
            if (e instanceof ApiError && e.status === 409) setErrors({ username: 'Username sudah dipakai.' })
            else setFormError(errorMessage(e))
        },
    })

    const submit = () => {
        const found: Errors = {}
        if (!name.trim()) found.name = 'Nama wajib diisi.'
        if (!/^[A-Za-z0-9_.]{3,32}$/.test(username.trim())) found.username = '3-32 karakter: huruf, angka, titik, atau garis bawah.'
        if (password.length < 8) found.password = 'Minimal 8 karakter.'
        setErrors(found); setFormError(null)
        if (Object.keys(found).length === 0) add.mutate()
    }

    if (q.isLoading) return <Loading />
    if (q.isError) return <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />

    return (
        <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={{ padding: space.lg, gap: space.sm }} keyboardShouldPersistTaps="handled">
            {(q.data ?? []).map(s => (
                <View key={s.userId} style={{ backgroundColor: colors.card, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, padding: space.md }}>
                    <Row style={{ justifyContent: 'space-between' }}>
                        <Text weight="semibold">{s.name}</Text>
                        <Badge label={s.role === 'ADMIN' ? 'PEMILIK' : 'KASIR'} tone={s.role === 'ADMIN' ? 'accent' : 'neutral'} />
                    </Row>
                    <Text mono size={12} color={colors.inkSoft} style={{ marginTop: 2 }}>{s.username}</Text>
                </View>
            ))}

            {adding ? (
                <Card style={{ marginTop: space.sm }}>
                    <Text weight="semibold" style={{ marginBottom: space.sm }}>Kasir baru</Text>
                    <Field label="Nama" value={name} onChangeText={setName} autoCapitalize="words" error={errors.name} />
                    <Field label="Username" value={username} onChangeText={setUsername} error={errors.username} />
                    <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry error={errors.password} hint="Minimal 8 karakter. Berikan ke kasir yang bersangkutan." />
                    {formError ? <Text color={colors.danger} size={14} style={{ marginBottom: space.md }}>{formError}</Text> : null}
                    <Button label="Buat akun kasir" variant="accent" onPress={submit} loading={add.isPending} />
                    <Button label="Batal" variant="ghost" onPress={() => { setAdding(false); setErrors({}); setFormError(null) }} style={{ marginTop: space.sm }} />
                </Card>
            ) : (
                <Button label="+ Kasir" variant="primary" onPress={() => setAdding(true)} style={{ marginTop: space.sm }} />
            )}
            <Text size={12} color={colors.inkSoft} style={{ marginTop: space.sm }}>
                Kasir bisa berjualan, melihat produk, dan mencatat pembayaran bon, tetapi tidak melihat harga modal, untung, dan laporan.
            </Text>
        </ScrollView>
    )
}
