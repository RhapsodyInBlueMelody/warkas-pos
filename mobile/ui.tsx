import * as React from 'react'
import {
    ActivityIndicator, Pressable, StyleSheet, Text as RNText, TextInput, View,
    type StyleProp, type TextInputProps, type TextProps, type TextStyle, type ViewStyle,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { colors, fonts, radius, space } from './theme'
import { ApiError } from './services/api'

// ---------- format ----------

/** 39000 -> "Rp 39.000". Dihitung manual karena Intl id-ID tidak selalu tersedia di Hermes. */
export function rupiah(value: number | string | null | undefined): string {
    const n = Math.round(Number(value ?? 0))
    const digits = String(Math.abs(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.')
    return `${n < 0 ? '-' : ''}Rp ${digits}`
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des']

/** Tanggal dan jam lokal perangkat, mis. "25 Okt 2026, 16.30". */
export function formatDateTime(iso: string): string {
    const d = new Date(iso)
    const pad = (x: number) => String(x).padStart(2, '0')
    return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}, ${pad(d.getHours())}.${pad(d.getMinutes())}`
}

/** "2026-10-25" -> "25 Okt 2026" (tanpa konversi zona waktu). */
export function formatDay(isoDate: string): string {
    const [y, m, d] = isoDate.split('-').map(Number)
    return `${d} ${MONTHS[m - 1]} ${y}`
}

export function errorMessage(e: unknown): string {
    return e instanceof ApiError ? e.message : 'Terjadi kesalahan. Coba lagi.'
}

// ---------- teks ----------

type Weight = 'regular' | 'medium' | 'semibold' | 'bold'
type TextOwnProps = TextProps & { weight?: Weight; mono?: boolean; size?: number; color?: string }

export function Text({ weight = 'regular', mono, size = 15, color = colors.ink, style, ...rest }: TextOwnProps) {
    const family = mono ? (weight === 'regular' ? fonts.mono : fonts.monoBold) : fonts[weight]
    return <RNText {...rest} style={[{ fontFamily: family, fontSize: size, color }, style]} />
}

/** Angka uang dengan font mono supaya digit sejajar. */
export function Money({ value, size = 15, weight = 'medium', color }: { value: number | string; size?: number; weight?: Weight; color?: string }) {
    return <Text mono weight={weight} size={size} color={color}>{rupiah(value)}</Text>
}

// ---------- layout ----------

export function Screen({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
    return (
        <SafeAreaView style={[styles.screen, style]} edges={['bottom', 'left', 'right']}>
            {children}
        </SafeAreaView>
    )
}

export function Card({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
    return <View style={[styles.card, style]}>{children}</View>
}

export function Row({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
    return <View style={[{ flexDirection: 'row', alignItems: 'center' }, style]}>{children}</View>
}

// ---------- tombol ----------

type ButtonProps = {
    label: string
    onPress: () => void
    variant?: 'primary' | 'accent' | 'ghost' | 'danger'
    loading?: boolean
    disabled?: boolean
    style?: StyleProp<ViewStyle>
}

export function Button({ label, onPress, variant = 'primary', loading, disabled, style }: ButtonProps) {
    const palette = {
        primary: { bg: colors.ink, fg: colors.white, border: colors.ink },
        accent: { bg: colors.price, fg: colors.priceInk, border: colors.price },
        ghost: { bg: 'transparent', fg: colors.ink, border: colors.line },
        danger: { bg: colors.danger, fg: colors.white, border: colors.danger },
    }[variant]
    const off = disabled || loading
    return (
        <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: !!off, busy: !!loading }}
            disabled={off}
            onPress={onPress}
            style={({ pressed }) => [
                styles.button,
                { backgroundColor: palette.bg, borderColor: palette.border, opacity: off ? 0.5 : pressed ? 0.85 : 1 },
                style,
            ]}
        >
            {loading ? <ActivityIndicator color={palette.fg} /> : <Text weight="semibold" color={palette.fg}>{label}</Text>}
        </Pressable>
    )
}

// ---------- form ----------

type FieldProps = TextInputProps & { label: string; error?: string | null; hint?: string }

export function Field({ label, error, hint, style, ...rest }: FieldProps) {
    return (
        <View style={{ marginBottom: space.md }}>
            <Text weight="medium" size={13} color={colors.inkSoft} style={{ marginBottom: 4 }}>{label}</Text>
            <TextInput
                placeholderTextColor={colors.inkSoft}
                autoCapitalize="none"
                {...rest}
                style={[styles.input, error ? { borderColor: colors.danger } : null, style]}
            />
            {error ? <Text size={12} color={colors.danger} style={{ marginTop: 4 }}>{error}</Text>
                : hint ? <Text size={12} color={colors.inkSoft} style={{ marginTop: 4 }}>{hint}</Text> : null}
        </View>
    )
}

// ---------- status ----------

export function Badge({ label, tone = 'neutral' }: { label: string; tone?: 'neutral' | 'ok' | 'warn' | 'danger' | 'accent' }) {
    const palette = {
        neutral: { bg: colors.line, fg: colors.ink },
        ok: { bg: colors.okSoft, fg: colors.ok },
        warn: { bg: colors.warnSoft, fg: colors.warn },
        danger: { bg: colors.dangerSoft, fg: colors.danger },
        accent: { bg: colors.price, fg: colors.priceInk },
    }[tone]
    return (
        <View style={[styles.badge, { backgroundColor: palette.bg }]}>
            <Text weight="semibold" size={11} color={palette.fg}>{label}</Text>
        </View>
    )
}

export function Loading() {
    return <View style={styles.center}><ActivityIndicator size="large" color={colors.ink} /></View>
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
    return (
        <View style={styles.center}>
            <Text color={colors.danger} style={{ textAlign: 'center', marginBottom: space.md }}>{message}</Text>
            {onRetry ? <Button label="Coba lagi" variant="ghost" onPress={onRetry} /> : null}
        </View>
    )
}

export function Empty({ title, hint }: { title: string; hint?: string }) {
    return (
        <View style={styles.center}>
            <Text weight="semibold" style={{ textAlign: 'center' }}>{title}</Text>
            {hint ? <Text size={13} color={colors.inkSoft} style={{ textAlign: 'center', marginTop: 4 }}>{hint}</Text> : null}
        </View>
    )
}

export type { TextStyle }

const styles = StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.bg },
    card: {
        backgroundColor: colors.card,
        borderRadius: radius.lg,
        padding: space.lg,
        borderWidth: 1,
        borderColor: colors.line,
    },
    button: {
        minHeight: 48,
        borderRadius: radius.md,
        borderWidth: 1,
        paddingHorizontal: space.lg,
        alignItems: 'center',
        justifyContent: 'center',
    },
    input: {
        minHeight: 48,
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: colors.line,
        backgroundColor: colors.white,
        paddingHorizontal: space.md,
        fontFamily: fonts.regular,
        fontSize: 16,
        color: colors.ink,
    },
    badge: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.xl },
})
