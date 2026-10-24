import React from 'react';
import { View, Text, StyleSheet, SafeAreaView, TouchableOpacity } from 'react-native';
import ReceiptView from '../components/ReceiptView';

export default function TransactionSuccessScreen({ route, navigation }: any) {
    // Ambil data transaksi yang dikirim dari screen keranjang/checkout sebelumnya
    const { transactionData } = route.params || {};

    const handleBackToDashboard = () => {
        // Reset navigasi secara bersih: Menjadikan Dashboard sebagai root utama kembali
        navigation.reset({
            index: 0,
            routes: [{ name: 'Dashboard' }],
        });
    };

    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.headerArea}>
                {/* Icon centang rilis selebrasi */}
                <Text style={styles.successIcon}>🎉</Text>
                <Text style={styles.successTitle}>Transaksi Berhasil!</Text>
                <Text style={styles.successSubtitle}>Data telah disimpan ke database dan stok otomatis terpotong.</Text>
            </View>

            {/* Render kertas struk menggunakan komponen reusable kita */}
            <View style={styles.receiptContainer}>
                {transactionData ? (
                    <ReceiptView transactionData={transactionData} />
                ) : (
                    <Text style={styles.textError}>Data transaksi tidak ditemukan.</Text>
                )}
            </View>

            {/* Tombol Aksi Bawah */}
            <View style={styles.actionArea}>
                <TouchableOpacity style={styles.btnPrint} onPress={() => alert("Fitur Cetak Bluetooth (Phase 2)")}>
                    <Text style={styles.textBtnPrint}>Cetak Struk Thermal</Text>
                </TouchableOpacity>

                {/* Mengarahkan tombol utama untuk memicu fungsi balik ke Dashboard */}
                <TouchableOpacity style={styles.btnHome} onPress={handleBackToDashboard}>
                    <Text style={styles.textBtnHome}>Kembali ke Dashboard</Text>
                </TouchableOpacity>
            </View>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#f5f5f5',
    },
    headerArea: {
        alignItems: 'center',
        paddingVertical: 20,
        backgroundColor: '#ffffff',
        borderBottomWidth: 1,
        borderColor: '#e0e0e0',
        paddingHorizontal: 24,
    },
    successIcon: {
        fontSize: 40,
        marginBottom: 8,
    },
    successTitle: {
        fontSize: 20,
        fontWeight: 'bold',
        color: '#1a472a', // Konsisten dengan warna tema hijau koperasi lu
    },
    successSubtitle: {
        fontSize: 12,
        color: '#666666',
        textAlign: 'center',
        marginTop: 4,
    },
    receiptContainer: {
        flex: 1,
        marginVertical: 12,
    },
    actionArea: {
        padding: 16,
        backgroundColor: '#ffffff',
        gap: 10,
        borderTopWidth: 1,
        borderColor: '#e0e0e0',
    },
    btnPrint: {
        backgroundColor: '#1a472a',
        paddingVertical: 14,
        borderRadius: 8,
        alignItems: 'center',
    },
    textBtnPrint: {
        color: '#ffffff',
        fontWeight: 'bold',
        fontSize: 15,
    },
    btnHome: {
        backgroundColor: '#eeeeee',
        paddingVertical: 14,
        borderRadius: 8,
        alignItems: 'center',
    },
    textBtnHome: {
        color: '#333333',
        fontWeight: '600',
        fontSize: 15,
    },
    textError: {
        textAlign: 'center',
        color: '#d32f2f',
        marginTop: 20,
    }
});

