// ../components/ReceiptView.tsx
import React from 'react';
import { View, Text, StyleSheet, Platform, ScrollView } from 'react-native';
import { generateReceiptText, ReceiptData } from '../services/receipt';

interface ReceiptViewProps {
    transactionData: ReceiptData;
}

export default function ReceiptView({ transactionData }: ReceiptViewProps) {
    const rawText = generateReceiptText(transactionData);

    return (
        // Tambahkan style={{ flex: 1 }} pada ScrollView
        <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.scrollContainer}>
            <View style={styles.receiptPaper}>
                <Text style={styles.receiptText}>{rawText}</Text>
            </View>
        </ScrollView>
    );
}


const styles = StyleSheet.create({
    scrollContainer: {
        alignItems: 'center',
        paddingVertical: 10,
        backgroundColor: '#f5f5f5', // Pastikan kontainer luar dapet warna netral
    },
    receiptPaper: {
        backgroundColor: '#FFFEEF',
        paddingHorizontal: 16,
        paddingVertical: 24,
        width: 290, // Gw kecilin dikit ukurannya biar pas di dalam modal layar HP lu
        borderRadius: 4,
        elevation: 3,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.15,
        shadowRadius: 3.84,
    },
    receiptText: {
        fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
        fontSize: 12, // Gw sesuaikan ukuran font-nya biar proporsional
        lineHeight: 16,
        color: '#111111', // KUNCI UTAMA: Wajib hitam pekat agar gak ketimpa tema HP lu!
    },
});
