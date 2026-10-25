import * as React from 'react'
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { colors, space } from '../theme'
import { Button, Field, Text, errorMessage } from '../ui'
import { ApiError, login } from '../services/api'

export default function LoginScreen({ navigation }: any) {
    const [username, setUsername] = React.useState('')
    const [password, setPassword] = React.useState('')
    const [loading, setLoading] = React.useState(false)
    const [error, setError] = React.useState<string | null>(null)

    const submit = async () => {
        if (!username.trim() || !password) {
            setError('Isi username dan password.')
            return
        }
        setError(null)
        setLoading(true)
        try {
            await login(username, password)
            // Berhasil: sesi tersimpan dan navigator berpindah ke Dashboard sendiri.
        } catch (e) {
            setError(e instanceof ApiError && e.status === 401 ? 'Username atau password salah.' : errorMessage(e))
            setLoading(false)
        }
    }

    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
            <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
                <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: space.xl }} keyboardShouldPersistTaps="handled">
                    <View style={{ marginBottom: space.xl }}>
                        <Text weight="bold" size={44} style={{ letterSpacing: -1 }}>Warkas</Text>
                        <Text color={colors.inkSoft} size={16}>Kasir warung, tanpa ribet.</Text>
                        <View style={{ height: 4, width: 48, backgroundColor: colors.price, marginTop: space.md, borderRadius: 2 }} />
                    </View>

                    <Field
                        label="Username"
                        value={username}
                        onChangeText={setUsername}
                        autoComplete="username"
                        textContentType="username"
                        returnKeyType="next"
                    />
                    <Field
                        label="Password"
                        value={password}
                        onChangeText={setPassword}
                        secureTextEntry
                        autoComplete="password"
                        textContentType="password"
                        returnKeyType="go"
                        onSubmitEditing={submit}
                    />

                    {error ? <Text color={colors.danger} size={14} style={{ marginBottom: space.md }}>{error}</Text> : null}

                    <Button label="Masuk" variant="primary" onPress={submit} loading={loading} />

                    <Pressable onPress={() => navigation.navigate('Register')} style={{ paddingVertical: space.lg, alignItems: 'center' }}>
                        <Text color={colors.inkSoft}>
                            Belum punya toko? <Text weight="semibold">Daftar gratis</Text>
                        </Text>
                    </Pressable>
                </ScrollView>
            </KeyboardAvoidingView>
        </SafeAreaView>
    )
}
