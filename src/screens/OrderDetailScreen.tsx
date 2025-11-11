import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import { getDatabase } from '../database/db';

interface OrderItem {
  productName: string;
  productSku: string;
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
        `SELECT items.*, p.name as productName, p.sku as productSku 
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
    } catch (error) {
      console.error('Error cargando detalles del pedido:', error);
      Alert.alert('Error', 'No se pudieron cargar los detalles del pedido');
    } finally {
      setLoading(false);
    }
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
          orderDetail.status === 'completed' && styles.statusCompleted,
        ]}>
          <Text style={styles.statusText}>
            {orderDetail.status === 'draft' ? 'Borrador' :
             orderDetail.status === 'pending' ? 'Pendiente' : 'Enviado'}
          </Text>
        </View>
      </View>

      {/* Productos */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Productos ({orderDetail.items.length})</Text>
        {orderDetail.items.map((item, index) => (
          <View key={index} style={styles.itemCard}>
            <View style={styles.itemHeader}>
              <Text style={styles.itemName}>{item.productName}</Text>
              <Text style={styles.itemSubtotal}>${item.subtotal.toFixed(2)}</Text>
            </View>
            <Text style={styles.itemSku}>SKU: {item.productSku}</Text>
            <View style={styles.itemFooter}>
              <Text style={styles.itemQuantity}>Cantidad: {item.quantity}</Text>
              <Text style={styles.itemPrice}>Precio: ${item.price.toFixed(2)}</Text>
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
});
