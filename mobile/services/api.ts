import { API_URL } from '../constants/api'
import AsyncStorage from '@react-native-async-storage/async-storage';

export const LoginProcess = async (username: string, password: string) => {
    try {
        const response = await fetch(`${API_URL}/login`, {
            method: 'POST',
            headers: {
                Accept: 'application/json',
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ username, password })
        })

        const json = await response.json();

        if (json.token) {
            await AsyncStorage.setItem('Token', json.token);

            // Tambahkan baris ini untuk mencatat waktu kasir berhasil login (murni angka Epoch milidetik)
            await AsyncStorage.setItem('LoginTimestamp', Date.now().toString());

            if (json.user && json.user.name) {
                await AsyncStorage.setItem('DisplayName', json.user.name);
            }
        }

        return json;
    } catch (e) {
        console.error('Error:', e);
    }
}

export const GetAllProduct = async () => {
    try {
        const token = await AsyncStorage.getItem('Token')
        const response = await fetch(`${API_URL}/products`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                Accept: 'application/json',
            },
        })

        const json = await response.json();
        return json
    } catch (e) {
        console.error('Error:', e)
    }
}

export const CreateTransaction = async (payload: { items: any[]; paymentMethod: string }) => {
    try {
        const token = await AsyncStorage.getItem('Token');

        if (!token) {
            throw new Error("Sesi login Anda tidak ditemukan. Silakan login ulang.");
        }

        const response = await fetch(`${API_URL}/transaction`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Accept': 'application/json',
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.detail || "Terjadi kesalahan pada server.");
        }

        return await response.json();
    } catch (e: any) {
        throw e;
    }
};

export const GetTransactionHistory = async () => {
    try {
        const token = await AsyncStorage.getItem('Token')
        const response = await fetch(`${API_URL}/transactions`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                Accept: 'application/json',
            },
        })

        const json = await response.json();
        return json
    } catch (e) {
        console.error('Error:', e)
    }
}

