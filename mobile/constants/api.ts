// Alamat backend. Atur lewat EXPO_PUBLIC_API_URL (mis. di file .env di folder mobile).
// Bawaan 10.0.2.2 adalah alamat komputer host dari dalam emulator Android;
// untuk HP asli pakai IP komputer di jaringan yang sama, mis. http://192.168.1.3:3000.
export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://10.0.2.2:3000'
