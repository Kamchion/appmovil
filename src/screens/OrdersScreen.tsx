import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  RefreshControl,
  Alert,
  Modal,
} from 'react-native';
import { getDatabase } from '../database/db';
import { PendingOrder } from '../types';
import { syncPendingOrders, checkConnection } from '../services/sync';

interface OrdersScreenProps {
  navigation: any;
}

export default function OrdersScreen({ navigation }: OrdersScreenProps) {
  const [orders, setOrders] = useState<PendingOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [isOnline, setIsOnline] = useState(false);
  const [menuVisible, setMenuVisible] = useState(false);

  useEffect(() => {
    loadOrders();
    checkConnectionStatus();

    // Recargar cuando la pantalla recibe foco
    const unsubscribe = navigation.addListener('focus', loadOrders);
    return unsubscribe;
  }, [navigation]);

  const checkConnectionStatus = async () => {
    const online = await checkConnection();
    setIsOnline(online);
  };

  const loadOrders = async () => {
    try {
      const db = getDatabase();
      const result = await db.getAllAsync<PendingOrder>(
        'SELECT * FROM pending_orders ORDER BY createdAt DESC'
      );
      setOrders(result);
    } catch (error) {
      console.error('Error al cargar pedidos:', error);
      Alert.alert('Error', 'No se pudieron cargar los pedidos');
    } finally {
      setLoading(false);
    }
  };

  const handleSync = async () => {
    setRefreshing(true);

    const result = await syncPendingOrders((message) => {
      console.log('Sync progress:', message);
    });

    if (result.success) {
      Alert.alert('Éxito', result.message);
      await loadOrders();
    } else {
      Alert.alert('Error', result.message);
    }

    await checkConnectionStatus();
    setRefreshing(false);
  };

  const renderOrder = ({ item }: { item: PendingOrder }) => {
    const date = new Date(item.createdAt);
    const formattedDate = date.toLocaleDateString('es-ES', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

    const handleOrderPress = () => {
      // Navegar a la pantalla de detalles del pedido
      // OrderDetailScreen buscará automáticamente en pending_orders y order_history
      navigation.navigate('OrderDetail', {
        orderId: item.id,
      });
    };

    const handleOrderActions = async () => {
      try {
        console.log('👆 Click en pedido:', item.id);
        // Obtener items del pedido para mostrar detalles
        const db = getDatabase();
        console.log('💾 Obteniendo items del pedido...');
        
        // Intentar buscar en pending_order_items primero (borradores y pendientes)
        let items = await db.getAllAsync<any>(
          `SELECT poi.*, p.name as productName, p.sku 
           FROM pending_order_items poi 
           LEFT JOIN products p ON poi.productId = p.id 
           WHERE poi.orderId = ?`,
          [item.id]
        );
        
        // Si no se encuentran items, buscar en order_history_items (pedidos enviados)
        if (items.length === 0) {
          console.log('🔍 No encontrado en pending_order_items, buscando en order_history_items...');
          items = await db.getAllAsync<any>(
            `SELECT ohi.*, p.name as productName, p.sku 
             FROM order_history_items ohi 
             LEFT JOIN products p ON ohi.productId = p.id 
             WHERE ohi.orderId = ?`,
            [item.id]
          );
        }
      
      console.log('📝 Items encontrados:', items.length);
      
      const itemsText = items.map(i => 
        `${i.productName || 'Producto'} (${i.sku})\n  Cantidad: ${i.quantity} x $${i.pricePerUnit} = $${(i.quantity * parseFloat(i.pricePerUnit)).toFixed(2)}`
      ).join('\n\n');
      
      const detailText = `Pedido #${item.id.slice(-8)}\nCliente: ${item.customerName}\nTotal: $${item.total}\n\nProductos:\n${itemsText}\n\n¿Qué deseas hacer?`;
      
      // Mostrar acciones solo para borradores y pendientes
      if (item.status === 'draft') {
        Alert.alert(
          'Pedido Borrador',
          detailText,
          [
            { text: 'Cancelar', style: 'cancel' },
            {
              text: 'Continuar Editando',
              onPress: async () => {
                // Cargar items del pedido al carrito
                try {
                  const db = getDatabase();
                  const items = await db.getAllAsync(
                    'SELECT * FROM pending_order_items WHERE orderId = ?',
                    [item.id]
                  );

                  // Limpiar carrito actual
                  await db.runAsync('DELETE FROM cart');

                  // Agregar items al carrito
                  for (const orderItem of items) {
                    await db.runAsync(
                      `INSERT INTO cart (productId, quantity, createdAt) VALUES (?, ?, ?)`,
                      [orderItem.productId, orderItem.quantity, new Date().toISOString()]
                    );
                  }

                  // Establecer cliente seleccionado
                  const AsyncStorage = require('@react-native-async-storage/async-storage').default;
                  await AsyncStorage.setItem('selectedClientId', item.clientId);

                  // Borrar pedido pendiente
                  await db.runAsync('DELETE FROM pending_order_items WHERE orderId = ?', [item.id]);
                  await db.runAsync('DELETE FROM pending_orders WHERE id = ?', [item.id]);

                  // Navegar al carrito
                  navigation.navigate('Cart');
                  Alert.alert('Éxito', 'Pedido cargado en el carrito. Puedes continuar comprando.');
                } catch (error: any) {
                  console.error('❌ Error al cargar pedido:', error);
                  Alert.alert('Error', 'No se pudo cargar el pedido: ' + error.message);
                }
              },
            },
            {
              text: 'Enviar Pedido',
              onPress: async () => {
                // Enviar pedido directamente
                try {
                  const { createOrderOnline } = require('../services/api');
                  const db = getDatabase();
                  
                  // Obtener items del pedido
                  const items = await db.getAllAsync(
                    'SELECT * FROM pending_order_items WHERE orderId = ?',
                    [item.id]
                  );

                  // Obtener productos para construir el cart
                  const cart = [];
                  for (const orderItem of items) {
                    const product = await db.getAllAsync(
                      'SELECT * FROM products WHERE id = ?',
                      [orderItem.productId]
                    );
                    if (product.length > 0) {
                      cart.push({
                        product: {
                          id: product[0].id,
                          name: product[0].name,
                          sku: product[0].sku,
                          price: orderItem.pricePerUnit,
                        },
                        quantity: orderItem.quantity,
                      });
                    }
                  }

                  // Enviar pedido al backend
                  const result = await createOrderOnline({
                    cart,
                    customerNote: item.customerNote || '',
                    selectedClientId: item.clientId,
                  });

                  // Borrar pedido pendiente
                  await db.runAsync('DELETE FROM pending_order_items WHERE orderId = ?', [item.id]);
                  await db.runAsync('DELETE FROM pending_orders WHERE id = ?', [item.id]);

                  Alert.alert('Éxito', 'Pedido enviado correctamente');
                  await loadOrders();
                } catch (error: any) {
                  console.error('❌ Error al enviar pedido:', error);
                  Alert.alert('Error', 'No se pudo enviar el pedido: ' + error.message);
                }
              },
            },
          ]
        );
      } else if (item.status === 'pending' && !item.synced) {
        // Pedido pendiente (no borrador, esperando sincronización)
        Alert.alert(
          'Pedido Pendiente',
          detailText,
          [
            { text: 'Cancelar', style: 'cancel' },
            {
              text: 'Continuar Editando',
              onPress: async () => {
                try {
                  const db = getDatabase();
                  const items = await db.getAllAsync(
                    'SELECT * FROM pending_order_items WHERE orderId = ?',
                    [item.id]
                  );

                  await db.runAsync('DELETE FROM cart');

                  for (const orderItem of items) {
                    await db.runAsync(
                      `INSERT INTO cart (productId, quantity, createdAt) VALUES (?, ?, ?)`,
                      [orderItem.productId, orderItem.quantity, new Date().toISOString()]
                    );
                  }

                  const AsyncStorage = require('@react-native-async-storage/async-storage').default;
                  await AsyncStorage.setItem('selectedClientId', item.clientId);

                  await db.runAsync('DELETE FROM pending_order_items WHERE orderId = ?', [item.id]);
                  await db.runAsync('DELETE FROM pending_orders WHERE id = ?', [item.id]);

                  navigation.navigate('Cart');
                  Alert.alert('Éxito', 'Pedido cargado en el carrito.');
                } catch (error: any) {
                  console.error('❌ Error al cargar pedido:', error);
                  Alert.alert('Error', 'No se pudo cargar el pedido: ' + error.message);
                }
              },
            },
            {
              text: 'Enviar Pedido',
              onPress: async () => {
                try {
                  const { createOrderOnline } = require('../services/api');
                  const db = getDatabase();
                  
                  const items = await db.getAllAsync(
                    'SELECT * FROM pending_order_items WHERE orderId = ?',
                    [item.id]
                  );

                  const cart = [];
                  for (const orderItem of items) {
                    const product = await db.getAllAsync(
                      'SELECT * FROM products WHERE id = ?',
                      [orderItem.productId]
                    );
                    if (product.length > 0) {
                      cart.push({
                        product: {
                          id: product[0].id,
                          name: product[0].name,
                          sku: product[0].sku,
                          price: orderItem.pricePerUnit,
                        },
                        quantity: orderItem.quantity,
                      });
                    }
                  }

                  await createOrderOnline({
                    cart,
                    customerNote: item.customerNote || '',
                    selectedClientId: item.clientId,
                  });

                  await db.runAsync('DELETE FROM pending_order_items WHERE orderId = ?', [item.id]);
                  await db.runAsync('DELETE FROM pending_orders WHERE id = ?', [item.id]);

                  Alert.alert('Éxito', 'Pedido enviado correctamente');
                  await loadOrders();
                } catch (error: any) {
                  console.error('❌ Error al enviar pedido:', error);
                  Alert.alert('Error', 'No se pudo enviar el pedido: ' + error.message);
                }
              },
            },
          ]
        );
      } else {
        // Pedido sincronizado - solo mostrar detalles
        Alert.alert(
          'Pedido Sincronizado',
          detailText.replace('¿Qué deseas hacer?', ''),
          [{ text: 'Cerrar' }]
        );
      }
      } catch (error) {
        console.error('❌ Error en handleOrderActions:', error);
        Alert.alert('Error', 'No se pudieron cargar los detalles del pedido: ' + error.message);
      }
    };

    return (
      <TouchableOpacity
        style={styles.orderCard}
        onPress={handleOrderPress}
      >
        <View style={styles.orderHeader}>
          <View style={{ flex: 1 }}>
            <Text style={styles.orderId}>{item.orderNumber || item.id}</Text>
            <Text style={styles.orderDate}>{formattedDate}</Text>
          </View>
          <View
            style={[
              styles.statusBadge,
              item.synced ? styles.syncedBadge : styles.pendingBadge,
            ]}
          >
            <Text style={styles.statusText}>
              {item.synced ? '✓ Sincronizado' : '⏳ Pendiente'}
            </Text>
          </View>
        </View>

        {item.clientId && (
          <Text style={styles.clientId}>Cliente: {item.clientId}</Text>
        )}

        {item.customerNote && (
          <Text style={styles.note} numberOfLines={2}>
            {item.customerNote}
          </Text>
        )}

        <View style={styles.orderFooter}>
          <Text style={styles.totalLabel}>Total:</Text>
          <Text style={styles.totalValue}>${item.total}</Text>
          <TouchableOpacity 
            style={styles.viewButton}
            onPress={handleOrderPress}
          >
            <Text style={styles.viewButtonText}>Ver</Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    );
  };

  const pendingCount = orders.filter((o) => !o.synced).length;

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <Text>Cargando pedidos...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Mis Pedidos</Text>
          <Text style={styles.headerSubtitle}>
            {orders.length} pedidos • {pendingCount} pendientes
          </Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View style={[styles.statusIndicator, isOnline ? styles.online : styles.offline]}>
            <Text style={styles.statusIndicatorText}>
              {isOnline ? '🌐' : '📱'}
            </Text>
          </View>
          <TouchableOpacity 
            style={styles.menuButton}
            onPress={() => setMenuVisible(true)}
          >
            <Text style={styles.menuButtonText}>⋮</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Modal de menú */}
      <Modal
        visible={menuVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setMenuVisible(false)}
      >
        <TouchableOpacity 
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setMenuVisible(false)}
        >
          <View style={styles.menuModal}>
            <TouchableOpacity 
              style={styles.menuItem}
              onPress={() => {
                setMenuVisible(false);
                handleSync();
              }}
            >
              <Text style={styles.menuItemIcon}>🔄</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.menuItemText}>Sincronizar Todo</Text>
                {pendingCount > 0 && (
                  <Text style={styles.menuItemSubtext}>
                    {pendingCount} pedido(s) pendiente(s)
                  </Text>
                )}
              </View>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {orders.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>📋</Text>
          <Text style={styles.emptyTitle}>No hay pedidos</Text>
          <Text style={styles.emptySubtitle}>
            Los pedidos que crees aparecerán aquí
          </Text>
          <TouchableOpacity
            style={styles.createButton}
            onPress={() => navigation.navigate('Catalog')}
          >
            <Text style={styles.createButtonText}>Crear primer pedido</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={orders}
          renderItem={renderOrder}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContainer}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleSync}
              colors={['#2563eb']}
            />
          }
        />
      )}
    </View>
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
  },
  header: {
    backgroundColor: '#fff',
    padding: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1e293b',
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#64748b',
    marginTop: 4,
  },
  statusIndicator: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  online: {
    backgroundColor: '#dcfce7',
  },
  offline: {
    backgroundColor: '#fee2e2',
  },
  statusIndicatorText: {
    fontSize: 20,
  },
  syncBanner: {
    backgroundColor: '#fef3c7',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#fbbf24',
  },
  emptyText: {
    fontSize: 16,
    color: '#64748b',
    textAlign: 'center',
  },
  menuButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#f1f5f9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  menuButtonText: {
    fontSize: 24,
    color: '#475569',
    fontWeight: 'bold',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-start',
    alignItems: 'flex-end',
    paddingTop: 60,
    paddingRight: 16,
  },
  menuModal: {
    backgroundColor: '#fff',
    borderRadius: 12,
    minWidth: 250,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 8,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  menuItemIcon: {
    fontSize: 24,
    marginRight: 12,
  },
  menuItemText: {
    fontSize: 16,
    color: '#1e293b',
    fontWeight: '600',
  },
  menuItemSubtext: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 2,
  },
  viewButton: {
    backgroundColor: '#3b82f6',
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 8,
  },
  viewButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
}); fontWeight: '600',
  },
  listContainer: {
    padding: 16,
  },
  orderCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  orderHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  orderId: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1e293b',
    marginBottom: 4,
  },
  orderDate: {
    fontSize: 12,
    color: '#64748b',
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  syncedBadge: {
    backgroundColor: '#dcfce7',
  },
  pendingBadge: {
    backgroundColor: '#fef3c7',
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
  },
  clientId: {
    fontSize: 14,
    color: '#475569',
    marginBottom: 8,
  },
  note: {
    fontSize: 12,
    color: '#64748b',
    fontStyle: 'italic',
    marginBottom: 12,
  },
  orderFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
  },
  totalLabel: {
    fontSize: 14,
    color: '#64748b',
  },
  totalValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#2563eb',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  emptyText: {
    fontSize: 64,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1e293b',
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    color: '#64748b',
    marginBottom: 24,
    textAlign: 'center',
  },
  createButton: {
    backgroundColor: '#2563eb',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  createButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
