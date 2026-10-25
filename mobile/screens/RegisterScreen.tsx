import * as React from 'react'
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native'
import { colors, radius, space } from '../theme'
import { Button, Field, Text, errorMessage } from '../ui'
import { ApiError, registerStore } from '../services/api'

type Errors = Partial<Record<'storeName' | 'name' | 'username' | 'password', string>>

export default function RegisterScreen() {
    const [storeName, setStoreName] = React.useState('')
    const [name, setName] = React.useState('')
    const [username, setUsername] = React.useState('')
    const [password, setPassword] = React.useState('')
    const [errors, setErrors] = React.useState<Errors>({})
    const [formError, setFormError] = React.useState<string | null>(null)
    const [loading, setLoading] = React.useState(false)

    const validate = (): Errors => {
        const e: Errors = {}
        if (!storeName.trim()) e.storeName = 'Nama toko wajib diisi.'
        if (!name.trim()) e.name = 'Nama kamu wajib diisi.'
        if (!/^[A-Za-z0-9_.]{3,32}$/.test(username.trim())) e.username = '3-32 karakter: huruf, angka, titik, atau garis bawah.'
        if (password.length < 8) e.password = 'Minimal 8 karakter.'
        return e
    }

    const submit = async () => {
        const found = validate()
        setErrors(found)
        setFormError(null)
        if (Object.keys(found).length) return

        setLoading(true)
        try {
            await registerStore({ storeName, name, username, password })
            // Berhasil: sesi tersimpan dan navigator berpindah ke Dashboard sendiri.
        } catch (e) {
            if (e instanceof ApiError && e.status === 409) setErrors({ username: 'Username sudah dipakai.' })
            else setFormError(errorMessage(e))
            setLoading(false)
        }
    }

    return (
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <ScrollView contentContainerStyle={{ padding: space.xl }} keyboardShouldPersistTaps="handled">
                <View style={{ backgroundColor: colors.warnSoft, borderRadius: radius.md, padding: space.md, marginBottom: space.xl }}>
                    <Text weight="semibold" size={14}>Gratis 14 hari paket Toko</Text>
                    <Text size={13} color={colors.inkSoft} style={{ marginTop: 2 }}>
                        Semua fitur terbuka selama trial. Setelah itu toko otomatis pindah ke paket Warung (gratis, maks. 50 produk).
                    </Text>
                </View>

                <Field label="Nama toko" value={storeName} onChangeText={setStoreName} autoCapitalize="words" error={errors.storeName} />
                <Field label="Nama kamu" value={name} onChangeText={setName} autoCapitalize="words" error={errors.name} />
                <Field label="Username" value={username} onChangeText={setUsername} error={errors.username} hint="Dipakai untuk masuk." />
                <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry error={errors.password} hint="Minimal 8 karakter." />

                {formError ? <Text color={colors.danger} size={14} style={{ marginBottom: space.md }}>{formError}</Text> : null}

                <Button label="Buat toko" variant="accent" onPress={submit} loading={loading} />
            </ScrollView>
        </KeyboardAvoidingView>
    )
}
