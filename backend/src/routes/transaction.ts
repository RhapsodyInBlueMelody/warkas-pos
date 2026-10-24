import { Elysia, t } from 'elysia';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { authMiddleware } from '../middleware/auth';

const transactionItemSchema = t.Object({
    productId: t.String({ minLength: 1 }),
    quantity: t.Integer({ minimum: 1 }),
});

const paymentMethodSchema = t.Union([
    t.Literal('QRIS'),
    t.Literal('CASH'),
    t.Literal('TRANSFER'),
    t.Literal('BON'),
]);

class TransactionInputError extends Error {}

export const transactionRoutes = new Elysia()
    .use(authMiddleware)
    .post('/transaction', async ({ body, user, set }) => {
        try {
            if (!user) {
                set.status = 401;
                return { message: 'Transaksi Gagal!', detail: 'Sesi kasir tidak valid.' };
            }

            const { items, paymentMethod, customerId } = body;
            const { storeId } = user;

            if (paymentMethod === 'BON' && !customerId) {
                set.status = 400;
                return { message: 'Transaksi Gagal!', detail: 'Pilih pelanggan untuk transaksi bon.' };
            }
            if (paymentMethod !== 'BON' && customerId) {
                set.status = 400;
                return { message: 'Transaksi Gagal!', detail: 'Pelanggan hanya dipakai untuk transaksi bon.' };
            }

            const productIds = new Set(items.map(item => item.productId));
            if (productIds.size !== items.length) {
                set.status = 400;
                return {
                    message: 'Transaksi Gagal!',
                    detail: 'Produk yang sama tidak boleh muncul lebih dari sekali dalam satu transaksi.'
                };
            }

            const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
            const transactionCode = `TRX${date}${crypto.randomUUID().replace(/-/g, '').slice(0, 12).toUpperCase()}`;

            const result = await prisma.$transaction(async (tx) => {
                if (paymentMethod === 'BON') {
                    const customer = await tx.customer.findFirst({
                        where: { customerId, storeId },
                        select: { customerId: true },
                    });
                    if (!customer) {
                        throw new TransactionInputError('Pelanggan tidak ditemukan.');
                    }
                }

                // Hanya produk milik toko ini yang bisa dijual. Produk toko lain
                // diperlakukan sama seperti produk yang tidak ada.
                const products = await Promise.all(
                    items.map(item => tx.product.findFirst({
                        where: { productId: item.productId, storeId },
                        select: {
                            productId: true,
                            name: true,
                            price: true,
                            costPrice: true,
                            stock: true,
                        }
                    }))
                );

                for (let index = 0; index < products.length; index++) {
                    const product = products[index];
                    const item = items[index];

                    if (!product) {
                        throw new TransactionInputError(`Produk dengan ID ${item.productId} tidak ditemukan.`);
                    }

                    if (product.stock < item.quantity) {
                        throw new TransactionInputError(`Stok untuk "${product.name}" tidak mencukupi! (Sisa: ${product.stock}, Diminta: ${item.quantity})`);
                    }
                }

                const totalPrice = products.reduce(
                    (sum, product, index) => product
                        ? sum.plus(product.price.mul(items[index].quantity))
                        : sum,
                    new Prisma.Decimal(0)
                );

                const transaction = await tx.transaction.create({
                    data: {
                        code: transactionCode,
                        totalPrice,
                        storeId,
                        kasirId: user.userId,
                        paymentMethod,
                        customerId: paymentMethod === 'BON' ? customerId : undefined,
                    }
                });

                for (let index = 0; index < products.length; index++) {
                    const product = products[index];
                    const item = items[index];

                    if (!product) {
                        throw new TransactionInputError(`Produk dengan ID ${item.productId} tidak ditemukan.`);
                    }

                    await tx.transactionItem.create({
                        data: {
                            code: `TRXITEM${crypto.randomUUID().replace(/-/g, '').toUpperCase()}`,
                            quantity: item.quantity,
                            priceAtTime: product.price,
                            costAtTime: product.costPrice,
                            transactionId: transaction.transactionId,
                            productId: product.productId,
                        }
                    });

                    const stockUpdate = await tx.product.updateMany({
                        where: {
                            productId: product.productId,
                            storeId,
                            stock: { gte: item.quantity },
                        },
                        data: {
                            stock: { decrement: item.quantity },
                        }
                    });

                    if (stockUpdate.count !== 1) {
                        throw new TransactionInputError(`Stok untuk "${product.name}" berubah dan tidak lagi mencukupi. Silakan coba lagi.`);
                    }
                }

                // Transaksi BON menambah utang dalam transaksi database yang sama:
                // kalau stok gagal dipotong, utang juga tidak tercatat.
                if (paymentMethod === 'BON' && customerId) {
                    await tx.debtEntry.create({
                        data: {
                            type: 'CHARGE',
                            amount: totalPrice,
                            storeId,
                            customerId,
                            transactionId: transaction.transactionId,
                            createdBy: user.userId,
                        }
                    });
                }

                return transaction;
            });

            set.status = 201;
            return { message: 'Transaksi Berhasil', transactionCode: result.code };

        } catch (error: unknown) {
            if (error instanceof TransactionInputError) {
                set.status = 400;
                return {
                    message: 'Transaksi Gagal!',
                    detail: error.message
                };
            }

            set.status = 500;
            return {
                message: 'Transaksi Gagal!',
                detail: 'Terjadi kesalahan internal pada database.'
            };
        }
    }, {
        body: t.Object({
            items: t.Array(transactionItemSchema, { minItems: 1 }),
            paymentMethod: paymentMethodSchema,
            customerId: t.Optional(t.String({ minLength: 1 })),
        })
    })
    .get('/transactions', async ({ user, set }) => {
        try {
            if (!user) {
                set.status = 401;
                return { message: 'Gagal memuat histori!', detail: 'Sesi kasir tidak valid.' };
            }

            const history = await prisma.transaction.findMany({
                where: {
                    storeId: user.storeId,
                    // Pemilik melihat seluruh transaksi tokonya; kasir hanya miliknya sendiri.
                    ...(user.role === 'ADMIN' ? {} : { kasirId: user.userId }),
                },
                include: {
                    kasir: { select: { name: true } },
                    customer: { select: { customerId: true, name: true } },
                    items: {
                        include: {
                            product: {
                                select: {
                                    name: true,
                                    code: true
                                }
                            }
                        }
                    }
                },
                orderBy: {
                    createdAt: 'desc'
                }
            });

            const formattedHistory = history.map(trx => ({
                ...trx,
                totalPrice: Number(trx.totalPrice),
                items: trx.items.map(({ costAtTime, ...item }) => ({
                    ...item,
                    priceAtTime: Number(item.priceAtTime),
                    // Modal hanya terlihat oleh pemilik.
                    ...(user.role === 'ADMIN' ? { costAtTime: costAtTime === null ? null : Number(costAtTime) } : {}),
                }))
            }));

            return {
                message: 'Histori transaksi berhasil dimuat',
                data: formattedHistory
            };

        } catch (error: unknown) {
            set.status = 500;
            return {
                message: 'Gagal memuat histori!',
                detail: 'Terjadi kesalahan internal pada database.'
            };
        }
    });
