import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  SafeAreaView,
  ActivityIndicator,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { CartItem } from '../types';
import { calculateCartTotal, clearCart } from '../services/cart';
import { getDatabase } from '../database/db';
import { checkConnection } from '../services/sync';

interface CheckoutScreenProps {
  route: {
    params: {
      cart: CartItem[];
      client: any;
      customerNote?: string;
    };
  };
  navigation: any;
}

export default function CheckoutScreen({ route, navigation }: CheckoutScreenProps) {
  const { cart, client, customerNote = '' } = route.params;
  const [loading, setLoading] = useState(false);
  const [isOnline, setIsOnline] = useState(false);

  useEffect(() => {
    checkConnectionStatus();
  }, []);

  const checkConnectionStatus = async () => {
    const online = await checkConnection();
    setIsOnline(online);
  };

  const generateOrderId = () => {
    return `ORD-${Date.now()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;
  };

  const handleCreateOrder = async () => {
    if (cart.length === 0) {
      Alert.alert('Error', 'El carrito está vacío');
      return;
    }

    if (!client || !client.id) {
      Alert.alert('Error', 'No se ha seleccionado un cliente');
      return;
    }

    setLoading(true);

    try {
      const db = getDatabase();
      const agentNumber = await AsyncStorage.getItem('agentNumber');
      const { subtotal, tax, total } = calculateCartTotal(cart);
      const orderId = generateOrderId();
      const now = new Date().toISOString();

      console.log('📝 Creando pedido:', {
        orderId,
        clientId: client.id,
        clientName: client.companyName,
        total: total.toFixed(2),
        items: cart.length
      });

      // Crear pedido en la tabla orders
      await db.runAsync(
        `INSERT INTO orders 
         (orderId, clientId, clientName, agentNumber, customerNote, subtotal, tax, total, status, createdAt, synced)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
        [
          orderId,
          client.id.toString(),
          client.companyName || client.contactPerson || 'Cliente',
          agentNumber || '',
          customerNote || '',
          subtotal.toString(),
          tax.toString(),
          total.toString(),
          'pending',
          now,
        ]
      );

      // Crear items del pedido
      for (const item of cart) {
        await db.runAsync(
          `INSERT INTO orderItems 
           (orderId, productId, productName, productSku, quantity, pricePerUnit, subtotal)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            orderId,
            item.product.id,
            item.product.name,
            item.product.sku,
            item.quantity,
            item.product.price,
            (parseFloat(item.product.price) * item.quantity).toString(),
          ]
        );
      }

      console.log('✅ Pedido creado exitosamente:', orderId);

      // Limpiar carrito
      await clearCart();

      // Limpiar cliente seleccionado
      await AsyncStorage.removeItem('selectedClientId');
      await AsyncStorage.removeItem('selectedClientData');

      console.log('🧹 Carrito y cliente seleccionado limpiados');

      Alert.alert(
        '✅ Pedido Creado',
        `Pedido ${orderId} creado exitosamente para ${client.companyName || client.contactPerson}`,
        [
          {
            text: 'Ver Pedidos',
            onPress: () => {
              navigation.reset({
                index: 0,
                routes: [{ name: 'Main' }],
              });
              navigation.navigate('Orders');
            },
          },
          {
            text: 'Crear Otro Pedido',
            onPress: () => {
              navigation.reset({
                index: 0,
                routes: [{ name: 'Main' }],
              });
              navigation.navigate('Pedidos');
            },
          },
        ]
      );
    } catch (error: any) {
      console.error('❌ Error al crear pedido:', error);
      Alert.alert('Error', 'No se pudo crear el pedido: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const { subtotal, tax, total } = calculateCartTotal(cart);

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
          disabled={loading}
        >
          <Ionicons name="arrow-back" size={24} color="#1e293b" />
          <Text style={styles.backButtonText}>Volver al Carrito</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Título */}
        <Text style={styles.pageTitle}>Confirmar Pedido</Text>

        {/* Información del Cliente */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="person" size={20} color="#2563eb" />
            <Text style={styles.sectionTitle}>Cliente</Text>
          </View>
          <View style={styles.clientInfo}>
            <Text style={styles.clientName}>{client.companyName || client.contactPerson}</Text>
            {client.contactPerson && client.companyName && (
              <Text style={styles.clientDetail}>Contacto: {client.contactPerson}</Text>
            )}
            {client.phone && (
              <Text style={styles.clientDetail}>Teléfono: {client.phone}</Text>
            )}
            {client.address && (
              <Text style={styles.clientDetail}>Dirección: {client.address}</Text>
            )}
            <View style={[styles.priceBadge, getPriceBadgeStyle(client.priceType)]}>
              <Text style={styles.priceBadgeText}>
                Tipo: {client.priceType || 'ciudad'}
              </Text>
            </View>
          </View>
        </View>

        {/* Notas del Pedido */}
        {customerNote && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Ionicons name="document-text" size={20} color="#2563eb" />
              <Text style={styles.sectionTitle}>Notas del Pedido</Text>
            </View>
            <Text style={styles.noteText}>{customerNote}</Text>
          </View>
        )}

        {/* Resumen del Pedido */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="cart" size={20} color="#2563eb" />
            <Text style={styles.sectionTitle}>Productos ({cart.length})</Text>
          </View>
          
          {cart.map((item, index) => (
            <View key={item.product.id} style={styles.orderItem}>
              <View style={styles.orderItemInfo}>
                <Text style={styles.orderItemName}>{item.product.name}</Text>
                <Text style={styles.orderItemDetails}>
                  SKU: {item.product.sku}
                </Text>
                <Text style={styles.orderItemDetails}>
                  {item.quantity} × ${item.product.price}
                </Text>
              </View>
              <Text style={styles.orderItemTotal}>
                ${(parseFloat(item.product.price) * item.quantity).toFixed(2)}
              </Text>
            </View>
          ))}
        </View>

        {/* Resumen de Totales */}
        <View style={styles.totalSection}>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Subtotal</Text>
            <Text style={styles.totalValue}>${subtotal.toFixed(2)}</Text>
          </View>

          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Impuestos (10%)</Text>
            <Text style={styles.totalValue}>${tax.toFixed(2)}</Text>
          </View>

          <View style={styles.totalDivider} />

          <View style={styles.totalRow}>
            <Text style={styles.grandTotalLabel}>Total</Text>
            <Text style={styles.grandTotalValue}>${total.toFixed(2)}</Text>
          </View>
        </View>

        {/* Status Banner */}
        <View style={[styles.statusBanner, isOnline ? styles.onlineBanner : styles.offlineBanner]}>
          <Ionicons 
            name={isOnline ? "cloud-done" : "cloud-offline"} 
            size={16} 
            color={isOnline ? "#059669" : "#64748b"} 
          />
          <Text style={[styles.statusText, isOnline ? styles.onlineText : styles.offlineText]}>
            {isOnline
              ? 'Online - El pedido se sincronizará automáticamente'
              : 'Offline - El pedido se guardará localmente'}
          </Text>
        </View>

        {/* Botones */}
        <TouchableOpacity
          style={[styles.createButton, loading && styles.createButtonDisabled]}
          onPress={handleCreateOrder}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <>
              <Ionicons name="checkmark-circle" size={20} color="#ffffff" />
              <Text style={styles.createButtonText}>Confirmar Pedido</Text>
            </>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.cancelButton}
          onPress={() => navigation.goBack()}
          disabled={loading}
        >
          <Text style={styles.cancelButtonText}>Volver al Carrito</Text>
        </TouchableOpacity>

        {/* Espacio al final */}
        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const getPriceBadgeStyle = (priceType: string) => {
  switch (priceType) {
    case 'ciudad':
      return { backgroundColor: '#dbeafe' };
    case 'interior':
      return { backgroundColor: '#dcfce7' };
    case 'especial':
      return { backgroundColor: '#f3e8ff' };
    default:
      return { backgroundColor: '#dbeafe' };
  }
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  header: {
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  backButtonText: {
    fontSize: 16,
    color: '#1e293b',
    marginLeft: 8,
  },
  content: {
    flex: 1,
  },
  pageTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#1e293b',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 16,
  },
  section: {
    backgroundColor: '#ffffff',
    borderRadius: 8,
    padding: 16,
    marginHorizontal: 20,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1e293b',
    marginLeft: 8,
  },
  clientInfo: {
    paddingTop: 8,
  },
  clientName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1e293b',
    marginBottom: 8,
  },
  clientDetail: {
    fontSize: 14,
    color: '#64748b',
    marginBottom: 4,
  },
  priceBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    marginTop: 8,
  },
  priceBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1e293b',
    textTransform: 'capitalize',
  },
  noteText: {
    fontSize: 14,
    color: '#475569',
    lineHeight: 20,
  },
  orderItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  orderItemInfo: {
    flex: 1,
    marginRight: 12,
  },
  orderItemName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1e293b',
    marginBottom: 4,
  },
  orderItemDetails: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 2,
  },
  orderItemTotal: {
    fontSize: 16,
    fontWeight: '600',
    color: '#2563eb',
  },
  totalSection: {
    backgroundColor: '#ffffff',
    borderRadius: 8,
    padding: 16,
    marginHorizontal: 20,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  totalLabel: {
    fontSize: 14,
    color: '#64748b',
  },
  totalValue: {
    fontSize: 14,
    fontWeight: '500',
    color: '#1e293b',
  },
  totalDivider: {
    height: 1,
    backgroundColor: '#e2e8f0',
    marginVertical: 8,
  },
  grandTotalLabel: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1e293b',
  },
  grandTotalValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#2563eb',
  },
  statusBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    padding: 12,
    marginHorizontal: 20,
    marginBottom: 16,
  },
  onlineBanner: {
    backgroundColor: '#d1fae5',
  },
  offlineBanner: {
    backgroundColor: '#f1f5f9',
  },
  statusText: {
    fontSize: 12,
    fontWeight: '500',
    marginLeft: 8,
  },
  onlineText: {
    color: '#059669',
  },
  offlineText: {
    color: '#64748b',
  },
  createButton: {
    flexDirection: 'row',
    backgroundColor: '#2563eb',
    borderRadius: 8,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 20,
    marginBottom: 12,
  },
  createButtonDisabled: {
    opacity: 0.6,
  },
  createButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  cancelButton: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 8,
    paddingVertical: 16,
    alignItems: 'center',
    marginHorizontal: 20,
  },
  cancelButtonText: {
    color: '#64748b',
    fontSize: 16,
    fontWeight: '600',
  },
});
