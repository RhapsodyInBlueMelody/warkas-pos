import React from 'react';
import { FlatList, View, StyleSheet, useWindowDimensions, Text } from 'react-native';
import { Surface, Avatar, TouchableRipple } from 'react-native-paper';
import AsyncStorage from '@react-native-async-storage/async-storage';

const MENU_ITEMS = [
    { id: 'products', title: 'Products', icon: 'package-variant-closed', color: '#1a472a', route: 'Product' },
    { id: 'transaction', title: 'History Transaksi', icon: 'package-variant-closed', color: '#1a472a', route: 'HistoryTransaction' },
];

const OUTER_PADDING = 16;
const GAP_SIZE = 12;

export default function DashboardScreen({ navigation }: any) {
    const { width } = useWindowDimensions();
    const [displayUser, setDisplayUser] = React.useState('Kasir');

    // Read the display name value on screen initialization mount
    React.useEffect(() => {
        const loadUserDisplayDetails = async () => {
            try {
                const storedName = await AsyncStorage.getItem('DisplayName');
                if (storedName) {
                    setDisplayUser(storedName); // Will set to "Kasir Utama" or "Administrator"
                }
            } catch (e) {
                console.error("Failed to read user data records", e);
            }
        };
        loadUserDisplayDetails();
    }, []);

    const cardWidth = (width - (OUTER_PADDING * 2) - GAP_SIZE) / 2;

    const renderGridItem = ({ item }: any) => (
        <Surface style={[styles.cardSurface, { width: cardWidth }]} elevation={1}>
            <TouchableRipple
                onPress={() => navigation.navigate(item.route)}
                rippleColor="rgba(26, 71, 42, 0.22)"
                style={styles.rippleContainer}
            >
                <View style={styles.cardInnerContent}>
                    <Avatar.Icon
                        size={52}
                        icon={item.icon}
                        backgroundColor="#eef7f2"
                        color={item.color}
                    />
                    <Text style={styles.cardTitle}>
                        {item.title}
                    </Text>
                </View>
            </TouchableRipple>
        </Surface>
    );

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                {/* Dynamically displays the user's friendly name string */}
                <Text style={styles.welcomeText}>Selamat Datang, {displayUser}! 👋</Text>
                <Text style={styles.subText}>Kelola operasional tokomu di bawah ini.</Text>
            </View>

            <FlatList
                data={MENU_ITEMS}
                renderItem={renderGridItem}
                keyExtractor={item => item.id}
                numColumns={2}
                columnWrapperStyle={styles.row}
                contentContainerStyle={styles.listPadding}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#f4f7f5',
    },
    header: {
        paddingHorizontal: OUTER_PADDING,
        paddingTop: 24,
        paddingBottom: 16,
    },
    welcomeText: {
        fontSize: 22,
        fontWeight: 'bold',
        color: '#1a472a',
    },
    subText: {
        fontSize: 14,
        color: '#6c7d72',
        marginTop: 4,
    },
    listPadding: {
        paddingHorizontal: OUTER_PADDING,
        paddingBottom: 24,
    },
    row: {
        flexDirection: 'row',
        justifyContent: 'flex-start',
        gap: GAP_SIZE,
        marginBottom: GAP_SIZE,
    },
    cardSurface: {
        backgroundColor: '#ffffff',
        borderRadius: 16,
        overflow: 'hidden',
    },
    rippleContainer: {
        width: '100%',
    },
    cardInnerContent: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 28,
        paddingHorizontal: 12,
        backgroundColor: '#ffffff',
    },
    cardTitle: {
        marginTop: 14,
        fontSize: 15,
        fontWeight: 'bold',
        color: '#122315',
        textAlign: 'center',
    },
});
