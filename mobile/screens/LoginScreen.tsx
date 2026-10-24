import * as React from 'react';
import { View, StyleSheet, Dimensions } from 'react-native'
import { Button, HelperText, TextInput, Text } from 'react-native-paper'
import { LinearGradient } from 'expo-linear-gradient'
import { BlurView } from 'expo-blur'
import { LoginProcess } from '../services/api';

const { width } = Dimensions.get('window')

const LoginScreen = ({ navigation }: any) => {
    const [username, setUsername] = React.useState("");
    const [password, setPassword] = React.useState("");
    const [passwordVisible, setPasswordVisibility] = React.useState(false);
    const [error, setError] = React.useState(false)

    const handleLogin = async () => {
        // Reset error state setiap kali tombol ditekan kembali
        setError(false);

        const result = await LoginProcess(username, password);
        if (result && result.token) {
            // Gunakan reset agar tumpukan stack bersih, Dashboard jadi root baru
            navigation.reset({
                index: 0,
                routes: [{ name: 'Dashboard' }],
            });
        } else {
            setError(true);
        }
    };

    return (
        <LinearGradient
            colors={['#0d2b1d', '#1a472a', '#2d6a4f']}
            style={styles.gradient}
        >
            <View style={styles.container}>
                <BlurView intensity={40} tint="dark" style={styles.card}>
                    <Text variant="headlineMedium" style={styles.title}>
                        🌿 Koperasi POS
                    </Text>
                    <Text variant="bodySmall" style={styles.subtitle}>
                        Masuk untuk melanjutkan
                    </Text>

                    <HelperText type='error' style={styles.error} visible={error}>
                        Username atau password salah!
                    </HelperText>

                    <TextInput
                        label="Username"
                        placeholder='username'
                        value={username}
                        onChangeText={text => setUsername(text)}
                        mode="outlined"
                        style={styles.input}
                        outlineColor='rgba(255,255,255,0.3)'
                        activeOutlineColor='#52b788'
                        textColor='white'
                        placeholderTextColor='rgba(255,255,255,0.5)'
                        theme={{ colors: { onSurfaceVariant: 'rgba(255,255,255,0.7)' } }}
                    />

                    <TextInput
                        label="Password"
                        placeholder='******'
                        value={password}
                        onChangeText={text => setPassword(text)}
                        secureTextEntry={!passwordVisible}
                        mode="outlined"
                        style={styles.input}
                        outlineColor='rgba(255,255,255,0.3)'
                        activeOutlineColor='#52b788'
                        textColor='white'
                        placeholderTextColor='rgba(255,255,255,0.5)'
                        theme={{ colors: { onSurfaceVariant: 'rgba(255,255,255,0.7)' } }}
                        right={
                            <TextInput.Icon
                                icon={passwordVisible ? "eye-off" : "eye"}
                                onPress={() => setPasswordVisibility(!passwordVisible)}
                                color='rgba(255,255,255,0.7)'
                            />
                        }
                    />

                    <Button
                        mode="contained"
                        onPress={handleLogin}
                        style={styles.button}
                        buttonColor='#52b788'
                        labelStyle={{ color: 'rgba(255,255,255,1)', fontSize: 16, fontWeight: 'bold' }}
                    >
                        Masuk
                    </Button>
                </BlurView>
            </View>
        </LinearGradient>
    );
};

const styles = StyleSheet.create({
    gradient: {
        flex: 1,
    },
    container: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 24,
    },
    card: {
        width: width * 0.88,
        borderRadius: 24,
        padding: 28,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.15)',
    },
    title: {
        color: 'white',
        fontWeight: '600',
        marginBottom: 4,
        textAlign: 'center',
    },
    subtitle: {
        color: `rgba(255,255,255,0.6)`,
        marginBottom: 16,
        textAlign: 'center',
    },
    input: {
        marginBottom: 12,
        backgroundColor: 'rgba(255,255,255,0.08)',
    },
    button: {
        marginTop: 8,
        borderRadius: 12,
        paddingVertical: 4,
    },
    error: {
        color: `rgba(255, 50, 50, 0.6)`,
        fontSize: 15,
        fontWeight: 500,
    }
})

export default LoginScreen;
