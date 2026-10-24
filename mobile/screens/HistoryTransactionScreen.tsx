import React, { useEffect, useState } from 'react';
import {
    View,
    Text,
    FlatList,
    ActivityIndicator,
    StyleSheet,
    SafeAreaView,
    TouchableOpacity, // Tambahkan ini untuk membungkus kartu agar bisa di-klik
    Modal,            // Tambahkan ini untuk pop-up struk
    Button            // Tambahkan ini untuk tombol tutup modal
} from 'react-native';
import { GetTransactionHistory } from '../services/api';
import ReceiptView from '../components/ReceiptView'; // Import komponen struk kita
import { ReceiptData } from '../services/receipt';

export default function HistoryTransactionScreen() {
    const [history, setHistory] = useState<any[]>([]);
    const [loading, setLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);

    // State baru untuk mengatur modal detail struk
    const [modalVisible, setModalVisible] = useState<boolean>(false);
    const [selectedTransaction, setSelectedTransaction] = useState<ReceiptData | null>(null);

    useEffect(() => {
        fetchHistory();
    }, []);

    const fetchHistory = async () => {
        try {
            setLoading(true);
            setError(null);
            const response = await GetTransactionHistory();

            if (response && response.data) {
                setHistory(response.data);
            } else if (Array.isArray(response)) {
                setHistory(response);
            } else {
                setHistory([]);
            }
        } catch (err: any) {
            setError(err.message || "Gagal memuat histori transaksi.");
        } finally {
            setLoading(false);
        }
    };

    const formatRupiah = (amount: number) => {
        return `Rp ${amount.toLocaleString('id-ID')}`;
    };

    const formatTanggal = (isoString: string) => {
        const date = new Date(isoString);
        return date.toLocaleDateString('id-ID', {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    // Fungsi ketika kartu transaksi di-klik
    const handleOpenDetail = (transaction: any) => {
        setSelectedTransaction(transaction);
        setModalVisible(true);
    };

    const handleCloseModal = () => {
        setModalVisible(false);
        setSelectedTransaction(null);
    };

    const renderTransactionItem = ({ item }: { item: any }) => (
        // Bungkus baris item menggunakan TouchableOpacity agar bisa di-klik oleh kasir
        <TouchableOpacity style={styles.card} onPress={() => handleOpenDetail(item)} activeOpacity={0.7}>
            <View style={styles.cardHeader}>
                <View>
                    <Text style={styles.textCode}>{item.code}</Text>
                    <Text style={styles.textDate}>{formatTanggal(item.createdAt)}</Text>
                </View>
                <View style={[
                    styles.badgePayment,
                    { backgroundColor: item.paymentMethod === 'QRIS' ? '#e1f5fe' : item.paymentMethod === 'CASH' ? '#e8f5e9' : '#fff3e0' }
                ]}>
                    <Text style={[
                        styles.textBadge,
                        { color: item.paymentMethod === 'QRIS' ? '#0288d1' : item.paymentMethod === 'CASH' ? '#2e7d32' : '#ef6c00' }
                    ]}>
                        {item.paymentMethod}
                    </Text>
                </View>
            </View>

            <View style={styles.divider} />
            <View style={styles.itemContainer}>
                {item.items?.map((subItem: any) => (
                    <View key={subItem.transactionItemId} style={styles.productRow}>
                        <Text style={styles.textProductName} numberOfLines={1}>
                            {subItem.product?.name}
                        </Text>
                        <Text style={styles.textProductQty}>
                            {subItem.quantity} x {formatRupiah(subItem.priceAtTime)}
                        </Text>
                    </View>
                ))}
            </View>
            <View style={styles.divider} />

            <View style={styles.cardFooter}>
                <Text style={styles.textTotalLabel}>Total Belanja (Klik detail)</Text>
                <Text style={styles.textTotalPrice}>{formatRupiah(Number(item.totalPrice))}</Text>
            </View>
        </TouchableOpacity >
    );

    if (loading) {
        return (
            <View style={styles.centerContainer}>
                <ActivityIndicator size="large" color="#1a472a" />
            </View>
        );
    }

    if (error) {
        return (
            <View style={styles.centerContainer}>
                <Text style={styles.textError}>{error}</Text>
            </View>
        );
    }

    return (
        <SafeAreaView style={styles.container}>
            <FlatList
                data={history}
                keyExtractor={(item) => item.transactionId}
                renderItem={renderTransactionItem}
                contentContainerStyle={styles.listContent}
                ListEmptyComponent={
                    <View style={styles.emptyContainer}>
                        <Text style={styles.textEmpty}>Belum ada histori transaksi.</Text>
                    </View>
                }
            />

            {/* --- MODAL DETAIL STRUK BERGAYA POP-UP OVERLAY --- */}
            <Modal
                animationType="slide"
                transparent={true}
                visible={modalVisible}
                onRequestClose={handleCloseModal}
            >
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <Text style={styles.modalTitle}>Detail Struk Transaksi</Text>

                        {/* Render Tampilan Struk di Sini jika datanya ada */}
                        {selectedTransaction && (
                            <View style={styles.receiptWrapper}>
                                <ReceiptView transactionData={selectedTransaction} />
                            </View>
                        )}

                        <View style={styles.modalActions}>
                            <TouchableOpacity style={styles.btnPrintSimulate} onPress={() => alert("Fitur Cetak Bluetooth (Phase 2)")}>
                                <Text style={styles.textPrintBtn}>Cetak Struk</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.btnCloseModal} onPress={handleCloseModal}>
                                <Text style={styles.textCloseBtn}>Tutup</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#f5f5f5',
    },
    centerContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#f5f5f5',
    },
    listContent: {
        padding: 16,
    },
    card: {
        backgroundColor: '#ffffff',
        borderRadius: 8,
        padding: 16,
        marginBottom: 16,
        elevation: 2,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.2,
        shadowRadius: 1.41,
    },
    cardHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    textCode: {
        fontSize: 16,
        fontWeight: 'bold',
        color: '#333333',
    },
    textDate: {
        fontSize: 12,
        color: '#666666',
        marginTop: 2,
    },
    badgePayment: {
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 4,
    },
    textBadge: {
        fontSize: 11,
        fontWeight: 'bold',
    },
    divider: {
        height: 1,
        backgroundColor: '#eeeeee',
        marginVertical: 12,
    },
    itemContainer: {
        gap: 8,
    },
    productRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    textProductName: {
        fontSize: 14,
        color: '#444444',
        flex: 1,
        marginRight: 16,
    },
    textProductQty: {
        fontSize: 13,
        color: '#777777',
    },
    cardFooter: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    textTotalLabel: {
        fontSize: 12,
        fontWeight: '500',
        color: '#888888',
    },
    textTotalPrice: {
        fontSize: 16,
        fontWeight: 'bold',
        color: '#1a472a',
    },
    textError: {
        fontSize: 14,
        color: '#d32f2f',
        textAlign: 'center',
        paddingHorizontal: 16,
    },
    emptyContainer: {
        alignItems: 'center',
        marginTop: 40,
    },
    textEmpty: {
        fontSize: 14,
        color: '#888888',
    },
    // STYLES BARU UNTUK KEBUTUHAN MODAL STRUK
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.5)', // Efek backdrop gelap di belakang box
        justifyContent: 'center',
        alignItems: 'center',
    },
    modalContent: {
        backgroundColor: '#ffffff',
        borderRadius: 12,
        padding: 20,
        width: '90%',
        height: '70%', // KUNCI 1: Pakai height persentase agar modal punya tinggi yang pasti
        elevation: 5,
    },
    modalTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#333333',
        marginBottom: 12,
        textAlign: 'center',
    },
    receiptWrapper: {
        flex: 1, // KUNCI 2: Sekarang flex 1 akan bekerja karena induknya (modalContent) sudah punya tinggi 70%
        marginVertical: 12,
        borderWidth: 1,
        borderColor: '#e0e0e0',
        borderRadius: 4,
        backgroundColor: '#f5f5f5', // Warna dasar kontainer sebelum kertas struk dirender
    },
    modalActions: {
        flexDirection: 'row',
        gap: 12,
        justifyContent: 'flex-end',
    },
    btnPrintSimulate: {
        backgroundColor: '#1a472a',
        paddingVertical: 10,
        paddingHorizontal: 16,
        borderRadius: 6,
    },
    textPrintBtn: {
        color: '#ffffff',
        fontWeight: 'bold',
        fontSize: 14,
    },
    btnCloseModal: {
        backgroundColor: '#eeeeee',
        paddingVertical: 10,
        paddingHorizontal: 16,
        borderRadius: 6,
    },
    textCloseBtn: {
        color: '#333333',
        fontWeight: '600',
        fontSize: 14,
    },
});
