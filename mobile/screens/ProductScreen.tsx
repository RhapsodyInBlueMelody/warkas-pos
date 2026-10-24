import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import { FlatList, View, Dimensions, StyleSheet, Text, ScrollView } from 'react-native';
import { ActivityIndicator, Button, Portal, Modal, Surface, IconButton, TouchableRipple } from 'react-native-paper';
import { CreateTransaction, GetAllProduct } from '../services/api';

const { width } = Dimensions.get('window');
const OUTER_PADDING = 16;
const GAP_SIZE = 12;
const CARD_WIDTH = (width - (OUTER_PADDING * 2) - GAP_SIZE) / 2;

const formatRp = (value: string | number) => {
    return new Intl.NumberFormat('id-ID', {
        style: 'currency',
        currency: 'IDR',
        minimumFractionDigits: 0,
    }).format(Number(value));
};

// Interface untuk struktur data Item di Keranjang (DIPERBARUI: Tambah code)
interface CartItem {
    productId: string;
    name: string;
    price: number;
    quantity: number;
    code: string;
}

// PERBAIKAN 1: Gunakan destructuring { navigation } agar tidak crash saat pindah screen
export default function ProductionScreen({ navigation }: any) {
    // State untuk Detail Product Modal
    const [detailVisible, setDetailVisible] = React.useState(false);
    const [selectedProduct, setSelectedProduct] = React.useState<any>(null);

    // State untuk Sistem Keranjang (Cart)
    const [cart, setCart] = React.useState<CartItem[]>([]);
    // State untuk memunculkan Bottom Sheet isi keranjang
    const [cartSheetVisible, setCartSheetVisible] = React.useState(false);

    const { data: products, isLoading, isError, error, refetch } = useQuery({
        queryKey: ['products'],
        queryFn: async () => {
            const json = await GetAllProduct();
            return json.products;
        }
    });

    // --- FUNGSI UTAMA CART ---
    const addToCart = (product: any) => {
        setCart((prevCart) => {
            const existingItem = prevCart.find(item => item.productId === product.productId);

            if (existingItem) {
                return prevCart.map(item =>
                    item.productId === product.productId
                        ? { ...item, quantity: item.quantity + 1 }
                        : item
                );
            }
            // PERBAIKAN 3: Ikut sertakan kode produk ke dalam state cart
            return [...prevCart, {
                productId: product.productId,
                name: product.name,
                price: Number(product.price),
                quantity: 1,
                code: product.code || 'PRD-UNKNOWN'
            }];
        });
    };

    // PERBAIKAN 2: Logika map + filter yang lebih aman untuk React Native state
    const updateQuantity = (productId: string, change: number) => {
        setCart((prevCart) => {
            return prevCart
                .map(item => item.productId === productId ? { ...item, quantity: item.quantity + change } : item)
                .filter(item => item.quantity > 0);
        });
    };

    const handleCheckout = async () => {
        try {
            if (cart.length === 0) {
                alert("Keranjang masih kosong!");
                return;
            }

            const payload = {
                items: cart.map(item => ({
                    productId: item.productId,
                    quantity: item.quantity,
                    priceAtTime: item.price
                })),
                paymentMethod: "CASH"
            };

            const result = await CreateTransaction(payload);

            const transactionDataForReceipt = {
                code: result.transactionCode || 'TRX-SUCCESS',
                totalPrice: cart.reduce((sum, item) => sum + (item.price * item.quantity), 0),
                createdAt: new Date().toISOString(),
                paymentMethod: "CASH",
                items: cart.map(item => ({
                    quantity: item.quantity,
                    priceAtTime: item.price,
                    product: {
                        name: item.name,
                        code: item.code // Sekarang aman karena data code sudah ada di state cart
                    }
                }))
            };

            setCart([]);
            setCartSheetVisible(false);

            navigation.navigate('TransactionSuccess', {
                transactionData: transactionDataForReceipt
            });

        } catch (error: any) {
            alert(error.message || "Transaksi gagal diproses.");
        }
    };

    const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);
    const totalPrice = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);

    const openDetails = (product: any) => {
        setSelectedProduct(product);
        setDetailVisible(true);
    };

    const renderItem = ({ item }: any) => (
        <Surface style={styles.cardSurface} elevation={1}>
            <TouchableRipple
                onPress={() => openDetails(item)}
                rippleColor="rgba(98, 0, 238, 0.12)"
                style={styles.rippleContainer}
            >
                <View style={styles.cardInnerContent}>
                    <View style={styles.iconWrapper}>
                        <IconButton icon="package-variant-closed" size={24} iconColor="#6200ee" style={{ margin: 0 }} />
                    </View>

                    <Text style={styles.productName} numberOfLines={2}>{item.name}</Text>
                    <Text style={styles.productCode}>{item.code}</Text>

                    <View style={styles.cardFooter}>
                        <Text style={styles.productPrice}>{formatRp(item.price)}</Text>
                        <Text style={styles.productStock}>Stock: {item.stock}</Text>
                    </View>
                </View>
            </TouchableRipple>
        </Surface>
    );

    if (isLoading) return <View style={styles.centerContainer}><ActivityIndicator size="large" color="#6200ee" /></View>;
    if (isError) return <View style={styles.centerContainer}><Text>Error: {error?.message}</Text></View>;

    return (
        <View style={styles.container}>
            <FlatList
                data={products}
                renderItem={renderItem}
                keyExtractor={item => item.productId}
                numColumns={2}
                columnWrapperStyle={styles.row}
                contentContainerStyle={[
                    styles.listPadding,
                    { paddingBottom: totalItems > 0 ? 100 : 32 }
                ]}
            />

            {totalItems > 0 && (
                <Surface style={styles.floatingCartBar} elevation={4}>
                    <TouchableRipple
                        style={styles.cartBarTouchable}
                        onPress={() => setCartSheetVisible(true)}
                    >
                        <View style={styles.cartBarContent}>
                            <View style={styles.cartBarLeft}>
                                <View style={styles.badgeCount}>
                                    <Text style={styles.badgeText}>{totalItems}</Text>
                                </View>
                                <View style={{ marginLeft: 12 }}>
                                    <Text style={styles.cartBarTitle}>Keranjang Belanja</Text>
                                    <Text style={styles.cartBarSub}>{formatRp(totalPrice)}</Text>
                                </View>
                            </View>
                            <Button mode="contained" buttonColor="#ffffff" textColor="#6200ee" labelStyle={{ fontWeight: 'bold' }}>
                                Lihat Detail
                            </Button>
                        </View>
                    </TouchableRipple>
                </Surface>
            )}

            <Portal>
                <Modal visible={detailVisible} onDismiss={() => setDetailVisible(false)} contentContainerStyle={styles.modalContainer}>
                    {selectedProduct && (
                        <Surface style={styles.modalContent} elevation={4}>
                            <View style={styles.modalHeader}>
                                <Text style={styles.modalTitle}>Detail Produk</Text>
                                <IconButton icon="close" onPress={() => setDetailVisible(false)} size={20} />
                            </View>
                            <Text style={styles.detailValue}>{selectedProduct.name}</Text>
                            <Text style={[styles.detailValue, { color: '#6200ee', marginTop: 8 }]}>{formatRp(selectedProduct.price)}</Text>

                            <Button
                                mode="contained"
                                style={styles.actionButton}
                                icon="cart-plus"
                                onPress={() => {
                                    addToCart(selectedProduct);
                                    setDetailVisible(false);
                                }}
                            >
                                Tambah ke Keranjang
                            </Button>
                        </Surface>
                    )}
                </Modal>

                <Modal
                    visible={cartSheetVisible}
                    onDismiss={() => setCartSheetVisible(false)}
                    contentContainerStyle={styles.sheetContainer}
                >
                    <Surface style={styles.sheetContent} elevation={5}>
                        <View style={styles.sheetHeader}>
                            <View>
                                <Text style={styles.sheetTitle}>Item di Keranjang</Text>
                                <Text style={styles.sheetSubTitle}>Total transaksi: {formatRp(totalPrice)}</Text>
                            </View>
                            <IconButton icon="chevron-down" size={28} onPress={() => setCartSheetVisible(false)} />
                        </View>

                        <ScrollView style={styles.sheetScrollList}>
                            {cart.map((item) => (
                                <View key={item.productId} style={styles.cartItemRow}>
                                    <View style={{ flex: 1 }}>
                                        <Text style={styles.cartItemName} numberOfLines={1}>{item.name}</Text>
                                        <Text style={styles.cartItemPrice}>{formatRp(item.price * item.quantity)}</Text>
                                    </View>

                                    <View style={styles.qtyContainer}>
                                        <IconButton icon="minus-circle-outline" iconColor="#6200ee" size={24} style={{ margin: 0 }} onPress={() => updateQuantity(item.productId, -1)} />
                                        <Text style={styles.qtyText}>{item.quantity}</Text>
                                        <IconButton icon="plus-circle-outline" iconColor="#6200ee" size={24} style={{ margin: 0 }} onPress={() => updateQuantity(item.productId, 1)} />
                                    </View>
                                </View>
                            ))}
                        </ScrollView>

                        <Button
                            mode="contained"
                            style={styles.checkoutButton}
                            icon="cash-register"
                            onPress={handleCheckout}
                        >
                            Proses Bayar / Checkout
                        </Button>
                    </Surface>
                </Modal>
            </Portal>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#f8f9fa' },
    centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    listPadding: { paddingHorizontal: OUTER_PADDING, paddingTop: 16 },
    row: { flexDirection: 'row', justifyContent: 'flex-start', gap: GAP_SIZE, marginBottom: GAP_SIZE },
    cardSurface: { width: CARD_WIDTH, backgroundColor: '#ffffff', borderRadius: 12, overflow: 'hidden' },
    rippleContainer: { width: '100%', padding: 12 },
    cardInnerContent: { alignItems: 'center' },
    iconWrapper: { backgroundColor: '#f3e8ff', borderRadius: 24, width: 44, height: 44, justifyContent: 'center', alignItems: 'center', marginBottom: 8 },
    productName: { fontSize: 14, fontWeight: 'bold', textAlign: 'center', color: '#1a1a1a', lineHeight: 18, height: 36 },
    productCode: { fontSize: 11, color: '#868e96', marginTop: 2 },
    cardFooter: { width: '100%', alignItems: 'center', marginTop: 10, borderTopWidth: 1, borderTopColor: '#f1f3f5', paddingTop: 8 },
    productPrice: { fontSize: 14, color: '#6200ee', fontWeight: 'bold' },
    productStock: { fontSize: 11, color: '#495057', marginTop: 1 },
    modalContainer: { padding: 20 },
    modalContent: { backgroundColor: '#ffffff', padding: 20, borderRadius: 16 },
    modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
    modalTitle: { fontSize: 18, fontWeight: 'bold' },
    detailValue: { fontSize: 16, color: '#212529', fontWeight: '600' },
    actionButton: { marginTop: 16, paddingVertical: 4, backgroundColor: '#6200ee' },
    floatingCartBar: { position: 'absolute', bottom: 20, left: 16, right: 16, backgroundColor: '#6200ee', borderRadius: 12, overflow: 'hidden' },
    cartBarTouchable: { padding: 14 },
    cartBarContent: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    cartBarLeft: { flexDirection: 'row', alignItems: 'center' },
    badgeCount: { backgroundColor: '#ffffff', width: 28, height: 28, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
    badgeText: { color: '#6200ee', fontWeight: 'bold', fontSize: 14 },
    cartBarTitle: { color: '#ffffff', fontWeight: 'bold', fontSize: 14 },
    cartBarSub: { color: '#e0d0ff', fontSize: 12, marginTop: 1 },
    sheetContainer: { justifyContent: 'flex-end', margin: 0 },
    sheetContent: { backgroundColor: '#ffffff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, maxHeight: Dimensions.get('window').height * 0.7 },
    sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, borderBottomWidth: 1, borderBottomColor: '#f1f3f5', paddingBottom: 12 },
    sheetTitle: { fontSize: 18, fontWeight: 'bold', color: '#1a1a1a' },
    sheetSubTitle: { fontSize: 14, color: '#6200ee', fontWeight: '600', marginTop: 2 },
    sheetScrollList: { marginVertical: 8 },
    cartItemRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, borderBottomWidth: 1, borderBottomColor: '#f8f9fa', paddingBottom: 10 },
    cartItemName: { fontSize: 15, fontWeight: '600', color: '#1a1a1a' },
    cartItemPrice: { fontSize: 13, color: '#6c757d', marginTop: 2 },
    qtyContainer: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    qtyText: { fontSize: 15, fontWeight: 'bold', minWidth: 20, textAlign: 'center' },
    checkoutButton: { marginTop: 16, paddingVertical: 6, backgroundColor: '#6200ee', borderRadius: 8 }
});
