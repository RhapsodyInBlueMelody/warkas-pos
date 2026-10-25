import * as React from 'react'
import { StatusBar } from 'expo-status-bar'
import { NavigationContainer } from '@react-navigation/native'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useFonts } from 'expo-font'
import {
    BricolageGrotesque_400Regular,
    BricolageGrotesque_500Medium,
    BricolageGrotesque_600SemiBold,
    BricolageGrotesque_700Bold,
} from '@expo-google-fonts/bricolage-grotesque'
import { IBMPlexMono_400Regular, IBMPlexMono_500Medium } from '@expo-google-fonts/ibm-plex-mono'

import { colors, fonts } from './theme'
import { getSession, loadSession, subscribe, type Session } from './services/session'
import LoginScreen from './screens/LoginScreen'
import RegisterScreen from './screens/RegisterScreen'
import DashboardScreen from './screens/DashboardScreen'

const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
})

export type RootParams = {
    Login: undefined
    Register: undefined
    Dashboard: undefined
}

const Stack = createNativeStackNavigator<RootParams>()

const screenOptions = {
    headerStyle: { backgroundColor: colors.bg },
    headerShadowVisible: false,
    headerTintColor: colors.ink,
    headerTitleStyle: { fontFamily: fonts.semibold, fontSize: 18 },
    contentStyle: { backgroundColor: colors.bg },
}

export default function App() {
    const [fontsLoaded] = useFonts({
        BricolageGrotesque_400Regular,
        BricolageGrotesque_500Medium,
        BricolageGrotesque_600SemiBold,
        BricolageGrotesque_700Bold,
        IBMPlexMono_400Regular,
        IBMPlexMono_500Medium,
    })
    const [ready, setReady] = React.useState(false)
    const [session, setSession] = React.useState<Session | null>(getSession())

    React.useEffect(() => {
        const unsubscribe = subscribe(next => {
            setSession(next)
            // Ganti akun tidak boleh memperlihatkan data cache toko sebelumnya.
            if (!next) queryClient.clear()
        })
        loadSession().finally(() => setReady(true))
        return unsubscribe
    }, [])

    if (!fontsLoaded || !ready) return null

    return (
        <SafeAreaProvider>
            <QueryClientProvider client={queryClient}>
                <StatusBar style="dark" />
                <NavigationContainer>
                    {/* Layar yang tampil ditentukan oleh sesi: 401 dari server atau tombol Keluar
                        mengosongkan sesi, dan navigator otomatis kembali ke layar masuk. */}
                    <Stack.Navigator screenOptions={screenOptions}>
                        {session ? (
                            <Stack.Screen name="Dashboard" component={DashboardScreen} options={{ headerShown: false }} />
                        ) : (
                            <>
                                <Stack.Screen name="Login" component={LoginScreen} options={{ headerShown: false }} />
                                <Stack.Screen name="Register" component={RegisterScreen} options={{ title: 'Daftar toko' }} />
                            </>
                        )}
                    </Stack.Navigator>
                </NavigationContainer>
            </QueryClientProvider>
        </SafeAreaProvider>
    )
}
