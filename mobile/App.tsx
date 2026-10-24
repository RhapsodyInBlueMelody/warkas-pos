import * as React from 'react'; // Pakai import * biar aman dan konsisten
import { PaperProvider, MD3LightTheme, configureFonts } from 'react-native-paper'
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useFonts } from 'expo-font'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import AsyncStorage from '@react-native-async-storage/async-storage'; // <--- Tambah import ini

import LoginScreen from './screens/LoginScreen';
import DashboardScreen from './screens/DashboardScreen';
import ProductionScreen from './screens/ProductScreen';
import HistoryTransactionScreen from './screens/HistoryTransactionScreen';
import TransactionSuccessScreen from './screens/TransactionSuccessScreen';

const queryClient = new QueryClient()
const Stack = createNativeStackNavigator()

const baseFont = { fontFamily: 'Inter' as const };
const fontConfig = {
    displayLarge: baseFont, displayMedium: baseFont, displaySmall: baseFont,
    headlineLarge: baseFont, headlineMedium: baseFont, headlineSmall: baseFont,
    titleLarge: baseFont, titleMedium: baseFont, titleSmall: baseFont,
    labelLarge: baseFont, labelMedium: baseFont, labelSmall: baseFont,
    bodyLarge: baseFont, bodyMedium: baseFont, bodySmall: baseFont,
};

const theme = {
    ...MD3LightTheme,
    fonts: configureFonts({ config: fontConfig })
}

export default function App() {
    const [fontsLoaded] = useFonts({
        'Inter': require('./assets/fonts/Inter.ttf'),
    })

    // Tambah 2 state ini untuk kontrol bypass halaman login
    const [isSessionChecking, setIsSessionChecking] = React.useState(true);
    const [initialRoute, setInitialRoute] = React.useState<'Login' | 'Dashboard'>('Login');

    // Cek status token dan umur login pas aplikasi pertama kali di-load
    React.useEffect(() => {
        const checkSession = async () => {
            try {
                const token = await AsyncStorage.getItem('Token');
                const loginTimestampRaw = await AsyncStorage.getItem('LoginTimestamp');

                if (token && loginTimestampRaw) {
                    const loginTime = parseInt(loginTimestampRaw, 10);
                    const now = Date.now();

                    // Durasi expired: 3 menit (3 * 60 * 1000 ms)
                    const EXPIRED_DURATION = 3 * 60 * 1000;

                    if (now - loginTime < EXPIRED_DURATION) {
                        // Sesi valid dan segar! Langsung lempar kasir ke Dashboard
                        setInitialRoute('Dashboard');
                    } else {
                        // Sesi lewat dari 3 menit, bersihkan storage biar aman
                        await AsyncStorage.clear();
                        setInitialRoute('Login');
                    }
                } else {
                    setInitialRoute('Login');
                }
            } catch (err) {
                setInitialRoute('Login');
            } finally {
                // Selesai ngecek, matikan loading state
                setIsSessionChecking(false);
            }
        };

        checkSession();
    }, []);

    // Tunggu sampai Font selesai di-load DAN pengecekan sesi storage beres
    if (!fontsLoaded || isSessionChecking) return null

    return (
        <QueryClientProvider client={queryClient}>
            <PaperProvider theme={theme}>
                <NavigationContainer>
                    {/* initialRouteName sekarang dinamis tergantung hasil checkSession */}
                    <Stack.Navigator initialRouteName={initialRoute}>
                        <Stack.Screen name="Login" component={LoginScreen} />
                        <Stack.Screen name="Dashboard" component={DashboardScreen} />
                        <Stack.Screen name="Product" component={ProductionScreen} />
                        <Stack.Screen name="HistoryTransaction" component={HistoryTransactionScreen} />
                        <Stack.Screen name="TransactionSuccess" component={TransactionSuccessScreen} />
                    </Stack.Navigator>
                </NavigationContainer>
            </PaperProvider>
        </QueryClientProvider>
    );
}
