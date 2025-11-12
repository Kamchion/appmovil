import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
  TouchableOpacity,
  Image,
} from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import { getDatabase } from '../database/db';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface OrderItem {
  productName: string;
  productSku: string;
  productImage?: string;
  quantity: number;
  price: number;
  subtotal: number;
}

interface OrderDetail {
  orderId: string;
  clientName: string;
  status: string;
  total: number;
  tax: number;
  subtotal: number;
  notes: string;
  createdAt: string;
  items: OrderItem[];
}

export default function OrderDetailScreen() {
  const route = useRoute();
  const navigation = useNavigation();
  const { orderId } = route.params as { orderId: string };

  const [loading, setLoading] = useState(true);
  const [orderDetail, setOrderDetail] = useState<OrderDetail | null>(null);
  const [isPending, setIsPending] = useState(false);

  useEffect(() => {
    loadOrderDetail();
  }, []);

  const loadOrderDetail = async () => {
    try {
      console.log('📋 OrderDetailScreen - Cargando pedido:', orderId);
      const db = getDatabase();

      // Buscar primero en pending_orders (donde están TODOS los pedidos locales)
      console.log('🔍 Buscando en pending_orders...');
      let order = await db.getFirstAsync<any>(
        'SELECT * FROM pending_orders WHERE id = ?',
        [orderId]
      );
      
      let itemsTableName = 'pending_order_items';
      let foundInPending = !!order;
      
      // Si no está en pending_orders, buscar en order_history
      if (!order) {
        console.log('🔍 No encontrado en pending_orders, buscando en order_history...');
        order = await db.getFirstAsync<any>(
          'SELECT * FROM order_history WHERE id = ?',
          [orderId]
        );
        itemsTableName = 'order_history_items';
      }

      console.log('📦 Pedido encontrado:', order ? 'SÍ' : 'NO', foundInPending ? '(en pending_orders)' : '(en order_history)');
      
      if (!order) {
        console.error('❌ Pedido no encontrado en ninguna tabla');
        Alert.alert('Error', 'Pedido no encontrado');
        navigation.goBack();
        return;
      }

      // Obtener items del pedido con JOIN a productos
      console.log('🔍 Buscando items en', itemsTableName, '...');
      const itemsRaw = await db.getAllAsync<any>(
        `SELECT items.*, p.name as productName, p.sku as productSku, p.imageUrl as productImage 
         FROM ${itemsTableName} items 
         LEFT JOIN products p ON items.productId = p.id 
         WHERE items.orderId = ?`,
        [orderId]
      );

      console.log('📦 Items encontrados:', itemsRaw.length);
      console.log('📝 Items raw:', JSON.stringify(itemsRaw, null, 2));

      // Mapear items al formato esperado
      const items: OrderItem[] = itemsRaw.map(item => ({
        productName: item.productName || 'Producto',
        productSku: item.productSku || item.sku || 'N/A',
        productImage: item.productImage,
        quantity: item.quantity,
        price: parseFloat(item.pricePerUnit || item.price || '0'),
        subtotal: item.quantity * parseFloat(item.pricePerUnit || item.price || '0'),
      }));
      
      console.log('✅ Items mapeados:', items.length);

      // Calcular totales
      const subtotal = items.reduce((sum, item) => sum + item.subtotal, 0);
      const tax = parseFloat(order.tax || '0');
      const total = parseFloat(order.total || '0');

      setOrderDetail({
        orderId: order.id,
        clientName: order.customerName || order.clientName || 'Cliente',
        status: order.status || 'pending',
        total: total || subtotal,
        tax: tax,
        subtotal: subtotal,
        notes: order.customerNote || order.notes || '',
        createdAt: order.createdAt || '',
        items,
      });
      setIsPending(foundInPending);
    } catch (error) {
      console.error('Error cargando detalles del pedido:', error);
      Alert.alert('Error', 'No se pudieron cargar los detalles del pedido');
    } finally {
      setLoading(false);
    }
  };

  const handleContinueOrder = async () => {
    try {
      if (!orderDetail) return;

      // 1. Cargar el pedido completo de pending_orders
      const db = getDatabase();
      const order = await db.getFirstAsync<any>(
        'SELECT * FROM pending_orders WHERE id = ?',
        [orderId]
      );

      if (!order) {
        Alert.alert('Error', 'Pedido no encontrado');
        return;
      }

      // 2. Cargar el cliente asociado
      const client = await db.getFirstAsync<any>(
        'SELECT * FROM clients WHERE id = ?',
        [order.clientId]
      );

      if (!client) {
        Alert.alert('Error', 'Cliente no encontrado');
        return;
      }

      // 3. Guardar el cliente en AsyncStorage (como si lo hubiera seleccionado)
      await AsyncStorage.setItem('selectedClientId', client.id);
      await AsyncStorage.setItem('selectedClientData', JSON.stringify(client));

      // 4. Cargar los items del pedido
      const items = await db.getAllAsync<any>(
        'SELECT * FROM pending_order_items WHERE orderId = ?',
        [orderId]
      );

      // 5. Cargar los productos completos para cada item
      const cartItems = [];
      for (const item of items) {
        const product = await db.getFirstAsync<any>(
          'SELECT * FROM products WHERE id = ?',
          [item.productId]
        );
        
        if (product) {
          // Usar el precio que se guardó en el pedido (pricePerUnit)
          cartItems.push({
            product: {
              ...product,
              price: item.pricePerUnit, // Usar el precio del pedido, no el actual del producto
            },
            quantity: item.quantity,
          });
        }
      }

      // 6. Guardar los items en AsyncStorage como carrito
      await AsyncStorage.setItem('shopping_cart', JSON.stringify(cartItems));

      // 7. Guardar el orderId para que el catálogo sepa que está editando un pedido existente
      await AsyncStorage.setItem('editingOrderId', orderId);

      // 8. Navegar a CatalogTabs (CatalogScreen) para continuar comprando
      navigation.navigate('CatalogTabs' as never);
    } catch (error) {
      console.error('Error al continuar con el pedido:', error);
      Alert.alert('Error', 'No se pudo cargar el pedido');
    }
  };

  const handleSendOrder = async () => {
    Alert.alert(
      'Enviar pedido',
      '¿Desea enviar este pedido al servidor?',
      [
        {
          text: 'Cancelar',
          style: 'cancel',
        },
        {
          text: 'Enviar',
          onPress: async () => {
            setLoading(true);
            try {
              const { createOrderOnline } = require('../services/api');
              const { getDatabase } = require('../database/db');
              const { generateSentOrderNumber } = require('../utils/orderNumber');
              const db = getDatabase();

              // 1. Cargar el pedido completo de pending_orders
              const order = await db.getFirstAsync<any>(
                'SELECT * FROM pending_orders WHERE id = ?',
                [orderId]
              );

              if (!order) {
                Alert.alert('Error', 'Pedido no encontrado');
                setLoading(false);
                return;
              }

              // 2. Cargar los items del pedido
              const items = await db.getAllAsync<any>(
                'SELECT * FROM pending_order_items WHERE orderId = ?',
                [orderId]
              );

              // 3. Cargar los productos completos para enviar
              const cart = [];
              for (const item of items) {
                const product = await db.getFirstAsync<any>(
                  'SELECT * FROM products WHERE id = ?',
                  [item.productId]
                );
                if (product) {
                  cart.push({
                    product: {
                      id: product.id,
                      name: product.name,
                      sku: product.sku,
                      price: item.pricePerUnit
                    },
                    quantity: item.quantity,
                  });
                }
              }

              try {
                // 4. Intentar enviar al servidor
                console.log('🌐 Intentando enviar pedido al backend...');
                const result = await createOrderOnline({
                  cart: cart,
                  customerNote: order.customerNote || '',
                  selectedClientId: order.clientId.toString(),
                });

                // 5. Si tiene éxito, mover a order_history con número B
                const sentOrderNumber = await generateSentOrderNumber();
                const now = new Date().toISOString();

                console.log('💾 Guardando pedido en historial local...');
                await db.runAsync(
                  `INSERT INTO order_history (
                    id, orderNumber, clientId, customerName, customerNote,
                    subtotal, tax, total, status, synced, createdAt
                  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                  [
                    order.id,
                    sentOrderNumber,
                    order.clientId,
                    order.customerName,
                    order.customerNote,
                    order.subtotal,
                    order.tax,
                    order.total,
                    'enviado',
                    1,
                    order.createdAt  // Usar fecha original, no now
                  ]
                );

                // 6. Guardar items en order_history_items
                for (const item of items) {
                  await db.runAsync(
                    `INSERT INTO order_history_items (
                      id, orderId, productId, productName, quantity, pricePerUnit, subtotal
                    ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
                    [
                      item.id,
                      item.orderId,
                      item.productId,
                      item.productName,
                      item.quantity,
                      item.pricePerUnit,
                      item.subtotal,
                    ]
                  );
                }

                // 7. Eliminar de pending_orders
                await db.runAsync('DELETE FROM pending_order_items WHERE orderId = ?', [orderId]);
                await db.runAsync('DELETE FROM pending_orders WHERE id = ?', [orderId]);

                Alert.alert('✅ Éxito', 'Pedido enviado y guardado correctamente');
                navigation.goBack();

              } catch (apiError: any) {
                // 8. Si falla, mostrar el error real
                console.error('❌ Error al enviar pedido:', apiError);
                console.error('Error message:', apiError.message);
                console.error('Error stack:', apiError.stack);
                
                // Actualizar status a 'pending' para sincronizar después
                await db.runAsync(
                  "UPDATE pending_orders SET status = 'pending' WHERE id = ?",
                  [orderId]
                );

                // Mostrar el error real al usuario
                Alert.alert(
                  '❌ Error al enviar',
                  `No se pudo enviar el pedido: ${apiError.message || 'Error desconocido'}\n\nEl pedido se guardará como pendiente.`
                );
                navigation.goBack();
              }
            } catch (error: any) {
              console.error('❌ Error:', error);
              Alert.alert('Error', 'No se pudo enviar el pedido: ' + error.message);
            } finally {
              setLoading(false);
            }
          },
        },
      ]
    );
  };

  const handleDeleteOrder = () => {
    Alert.alert(
      'Eliminar pedido',
      '¿Está seguro que desea eliminar este pedido? Esta acción no se puede deshacer.',
      [
        {
          text: 'Cancelar',
          style: 'cancel',
        },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: async () => {
            try {
              const db = getDatabase();
              await db.runAsync('DELETE FROM pending_order_items WHERE orderId = ?', [orderId]);
              await db.runAsync('DELETE FROM pending_orders WHERE id = ?', [orderId]);
              Alert.alert('Éxito', 'Pedido eliminado correctamente');
              navigation.goBack();
            } catch (error) {
              console.error('Error al eliminar pedido:', error);
              Alert.alert('Error', 'No se pudo eliminar el pedido');
            }
          },
        },
      ]
    );
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#2563EB" />
        <Text style={styles.loadingText}>Cargando detalles...</Text>
      </View>
    );
  }

  if (!orderDetail) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>No se encontraron detalles del pedido</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Detalles del Pedido</Text>
        <Text style={styles.orderId}>#{orderDetail.orderId}</Text>
      </View>

      {/* Cliente */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Cliente</Text>
        <Text style={styles.clientName}>{orderDetail.clientName}</Text>
      </View>

      {/* Estado */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Estado</Text>
        <View style={[
          styles.statusBadge,
          orderDetail.status === 'draft' && styles.statusDraft,
          orderDetail.status === 'pending' && styles.statusPending,
          orderDetail.status === 'enviado' && styles.statusCompleted,
        ]}>
          <Text style={styles.statusText}>
            {orderDetail.status === 'draft' ? 'Borrador' :
             orderDetail.status === 'pending' ? 'Pendiente por enviar' : 'Enviado'}
          </Text>
        </View>
      </View>

      {/* Productos */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Productos ({orderDetail.items.length})</Text>
        {orderDetail.items.map((item, index) => (
          <View key={index} style={styles.itemCard}>
            <View style={styles.itemRow}>
              {/* Imagen del producto */}
              <View style={styles.itemImageContainer}>
                {item.productImage ? (
                  <Image 
                    source={{ uri: item.productImage }} 
                    style={styles.itemImage}
                    resizeMode="cover"
                  />
                ) : (
                  <View style={styles.itemImagePlaceholder}>
                    <Text style={styles.placeholderText}>📦</Text>
                  </View>
                )}
              </View>
              
              {/* Información del producto */}
              <View style={styles.itemInfo}>
                <View style={styles.itemHeader}>
                  <Text style={styles.itemName} numberOfLines={2}>{item.productName}</Text>
                  <Text style={styles.itemSubtotal}>${item.subtotal.toFixed(2)}</Text>
                </View>
                <Text style={styles.itemSku}>SKU: {item.productSku}</Text>
                <View style={styles.itemFooter}>
                  <Text style={styles.itemQuantity}>Cantidad: {item.quantity}</Text>
                  <Text style={styles.itemPrice}>Precio: ${item.price.toFixed(2)}</Text>
                </View>
              </View>
            </View>
          </View>
        ))}
      </View>

      {/* Resumen */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Resumen</Text>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Subtotal:</Text>
          <Text style={styles.summaryValue}>${orderDetail.subtotal.toFixed(2)}</Text>
        </View>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Impuestos:</Text>
          <Text style={styles.summaryValue}>${orderDetail.tax.toFixed(2)}</Text>
        </View>
        <View style={[styles.summaryRow, styles.totalRow]}>
          <Text style={styles.totalLabel}>Total:</Text>
          <Text style={styles.totalValue}>${orderDetail.total.toFixed(2)}</Text>
        </View>
      </View>

      {/* Notas */}
      {orderDetail.notes ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Notas</Text>
          <Text style={styles.notes}>{orderDetail.notes}</Text>
        </View>
      ) : null}

      {/* Fecha */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Fecha de Creación</Text>
        <Text style={styles.date}>{new Date(orderDetail.createdAt).toLocaleString()}</Text>
      </View>

      {/* Botones de acción para pedidos pendientes */}
      {isPending && orderDetail.status === 'draft' && (
        <View style={styles.actionsSection}>
          <TouchableOpacity 
            style={[styles.actionButton, styles.continueButton]}
            onPress={handleContinueOrder}
          >
            <Text style={styles.actionButtonText}>Continuar con el pedido</Text>
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={[styles.actionButton, styles.sendButton]}
            onPress={handleSendOrder}
          >
            <Text style={styles.actionButtonText}>Enviar el pedido</Text>
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={[styles.actionButton, styles.deleteButton]}
            onPress={handleDeleteOrder}
          >
            <Text style={styles.actionButtonText}>Eliminar el pedido</Text>
          </TouchableOpacity>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F3F4F6',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#6B7280',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
    padding: 20,
  },
  errorText: {
    fontSize: 16,
    color: '#EF4444',
    textAlign: 'center',
  },
  header: {
    backgroundColor: '#FFFFFF',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 4,
  },
  orderId: {
    fontSize: 14,
    color: '#6B7280',
  },
  section: {
    backgroundColor: '#FFFFFF',
    padding: 16,
    marginTop: 12,
    borderRadius: 8,
    marginHorizontal: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 12,
  },
  clientName: {
    fontSize: 18,
    color: '#111827',
    fontWeight: '500',
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    alignSelf: 'flex-start',
  },
  statusDraft: {
    backgroundColor: '#FEF3C7',
  },
  statusPending: {
    backgroundColor: '#DBEAFE',
  },
  statusCompleted: {
    backgroundColor: '#D1FAE5',
  },
  statusText: {
    fontSize: 14,
    fontWeight: '600',
  },
  itemCard: {
    backgroundColor: '#F9FAFB',
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
  },
  itemRow: {
    flexDirection: 'row',
    gap: 12,
  },
  itemImageContainer: {
    width: 80,
    height: 80,
    borderRadius: 8,
    overflow: 'hidden',
  },
  itemImage: {
    width: '100%',
    height: '100%',
  },
  itemImagePlaceholder: {
    width: '100%',
    height: '100%',
    backgroundColor: '#E5E7EB',
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderText: {
    fontSize: 32,
  },
  itemInfo: {
    flex: 1,
  },
  itemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 4,
  },
  itemName: {
    flex: 1,
    fontSize: 16,
    fontWeight: '500',
    color: '#111827',
    marginRight: 8,
  },
  itemSubtotal: {
    fontSize: 16,
    fontWeight: '600',
    color: '#2563EB',
  },
  itemSku: {
    fontSize: 12,
    color: '#6B7280',
    marginBottom: 8,
  },
  itemFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  itemQuantity: {
    fontSize: 14,
    color: '#374151',
  },
  itemPrice: {
    fontSize: 14,
    color: '#374151',
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  summaryLabel: {
    fontSize: 14,
    color: '#6B7280',
  },
  summaryValue: {
    fontSize: 14,
    color: '#111827',
  },
  totalRow: {
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    paddingTop: 12,
    marginTop: 4,
  },
  totalLabel: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
  },
  totalValue: {
    fontSize: 18,
    fontWeight: '700',
    color: '#2563EB',
  },
  notes: {
    fontSize: 14,
    color: '#374151',
    lineHeight: 20,
  },
  date: {
    fontSize: 14,
    color: '#6B7280',
  },
  actionsSection: {
    padding: 16,
    paddingBottom: 32,
    gap: 12,
  },
  actionButton: {
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  continueButton: {
    backgroundColor: '#3b82f6',
  },
  sendButton: {
    backgroundColor: '#10b981',
  },
  deleteButton: {
    backgroundColor: '#ef4444',
  },
  actionButtonText: {
    fontSize: 16,
    color: '#fff',
    fontWeight: '600',
  },
});
