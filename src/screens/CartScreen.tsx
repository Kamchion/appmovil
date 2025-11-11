import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  Alert,
  TextInput,
  ScrollView,
  Image,
  SafeAreaView,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { CartItem } from '../types';
import {
  getCart,
  updateCartItemQuantity,
  removeFromCart,
  clearCart,
  calculateCartTotal,
} from '../services/cart';
import { getCachedImagePath } from '../services/imageCache';

interface CartScreenProps {
  navigation: any;
}

// Componente para cada item del carrito
const CartItemCard = ({ 
  item, 
  onUpdateQuantity, 
  onRemove 
}: { 
  item: CartItem; 
  onUpdateQuantity: (id: string, qty: number) => void;
  onRemove: (id: string, name: string) => void;
}) => {
  const [imagePath, setImagePath] = useState<string | null>(null);
  const [quantity, setQuantity] = useState(item.quantity.toString());

  useEffect(() => {
    if (item.product?.image) {
      getCachedImagePath(item.product.image).then(setImagePath).catch(() => setImagePath(null));
    }
  }, [item.product?.image]);

  const handleQuantityChange = (text: string) => {
    setQuantity(text);
    const qty = parseInt(text);
    if (!isNaN(qty) && qty > 0) {
      onUpdateQuantity(item.product.id, qty);
    }
  };

  const incrementQuantity = () => {
    const newQty = item.quantity + 1;
    setQuantity(newQty.toString());
    onUpdateQuantity(item.product.id, newQty);
  };

  const decrementQuantity = () => {
    if (item.quantity > 1) {
      const newQty = item.quantity - 1;
      setQuantity(newQty.toString());
      onUpdateQuantity(item.product.id, newQty);
    }
  };

  const itemSubtotal = parseFloat(item.product.price) * item.quantity;

  return (
    <View style={styles.cartItemCard}>
      <View style={styles.cartItemContent}>
        {/* Imagen del producto */}
        {imagePath ? (
          <Image source={{ uri: imagePath }} style={styles.itemImage} />
        ) : (
          <View style={styles.itemImagePlaceholder}>
            <Text style={styles.itemImagePlaceholderText}>📦</Text>
          </View>
        )}

        {/* Info del producto */}
        <View style={styles.itemInfo}>
          <View style={styles.itemHeader}>
            <View style={styles.itemTitleContainer}>
              <Text style={styles.itemName} numberOfLines={2}>
                {item.product.name}
              </Text>
              <Text style={styles.itemSku}>SKU: {item.product.sku}</Text>
            </View>
            {/* Botón eliminar */}
            <TouchableOpacity
              style={styles.removeButton}
              onPress={() => onRemove(item.product.id, item.product.name)}
            >
              <Ionicons name="trash-outline" size={20} color="#ef4444" />
            </TouchableOpacity>
          </View>

          {/* Precio y controles */}
          <View style={styles.itemFooter}>
            <Text style={styles.itemPrice}>${item.product.price}</Text>
            
            {/* Controles de cantidad */}
            <View style={styles.quantityControls}>
              <TouchableOpacity
                style={styles.quantityButton}
                onPress={decrementQuantity}
              >
                <Ionicons name="remove" size={16} color="#64748b" />
              </TouchableOpacity>
              
              <TextInput
                style={styles.quantityInput}
                value={quantity}
                onChangeText={handleQuantityChange}
                keyboardType="numeric"
              />
              
              <TouchableOpacity
                style={styles.quantityButton}
                onPress={incrementQuantity}
              >
                <Ionicons name="add" size={16} color="#64748b" />
              </TouchableOpacity>
            </View>

            {/* Subtotal del item */}
            <Text style={styles.itemSubtotal}>${itemSubtotal.toFixed(2)}</Text>
          </View>
        </View>
      </View>
    </View>
  );
};

export default function CartScreen({ navigation }: CartScreenProps) {
  const [cart, setCart] = useState<CartItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedClient, setSelectedClient] = useState<any>(null);
  const [customerNote, setCustomerNote] = useState('');

  useEffect(() => {
    loadCart();
    loadSelectedClient();
    
    // Recargar carrito cuando la pantalla recibe foco
    const unsubscribe = navigation.addListener('focus', () => {
      loadCart();
      loadSelectedClient();
    });
    return unsubscribe;
  }, [navigation]);

  const loadCart = async () => {
    const currentCart = await getCart();
    setCart(currentCart);
    setLoading(false);
  };

  const loadSelectedClient = async () => {
    try {
      const clientData = await AsyncStorage.getItem('selectedClientData');
      if (clientData) {
        setSelectedClient(JSON.parse(clientData));
      }
    } catch (error) {
      console.error('Error al cargar cliente seleccionado:', error);
    }
  };

  const handleUpdateQuantity = async (productId: string, newQuantity: number) => {
    const updatedCart = await updateCartItemQuantity(productId, newQuantity);
    setCart(updatedCart);
  };

  const handleRemoveItem = async (productId: string, productName: string) => {
    Alert.alert(
      'Eliminar producto',
      `¿Estás seguro de eliminar "${productName}" del carrito?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: async () => {
            const updatedCart = await removeFromCart(productId);
            setCart(updatedCart);
          },
        },
      ]
    );
  };

  const handleSaveWithoutSending = async () => {
    if (cart.length === 0) {
      Alert.alert('Carrito vacío', 'No hay productos en el carrito');
      return;
    }

    if (!selectedClient) {
      Alert.alert('Cliente no asignado', '¿Deseas asignar un cliente a este pedido?', [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Asignar Cliente', onPress: () => navigation.navigate('Pedidos') }
      ]);
      return;
    }

    Alert.alert(
      'Guardar Pedido',
      `Cliente: ${selectedClient.companyName || selectedClient.contactPerson}\nTotal: $${total.toFixed(2)}\n\n¿Deseas guardar este pedido para continuar más tarde?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Guardar',
          onPress: async () => {
            setLoading(true);
            try {
              const { getDatabase } = require('../database/db');
              const db = getDatabase();
              const orderId = `PENDING-${Date.now()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;
              const now = new Date().toISOString();

              // Guardar pedido pendiente en la base de datos local
              await db.runAsync(
                `INSERT INTO pending_orders (id, clientId, orderNumber, customerName, customerNote, subtotal, tax, total, status, createdAt, synced) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
                [orderId, selectedClient.id.toString(), orderId, selectedClient.companyName || selectedClient.contactPerson || 'Cliente', customerNote || '', subtotal.toString(), tax.toString(), total.toString(), 'pending', now]
              );

              // Guardar items del pedido
              for (const item of cart) {
                const itemId = `${orderId}-${item.product.id}`;
                await db.runAsync(
                  `INSERT INTO pending_order_items (id, orderId, productId, productName, quantity, pricePerUnit, subtotal) VALUES (?, ?, ?, ?, ?, ?, ?)`,
                  [itemId, orderId, item.product.id, item.product.name, item.quantity, item.product.price, (parseFloat(item.product.price) * item.quantity).toString()]
                );
              }

              // Limpiar carrito y cliente seleccionado
              await clearCart();
              await AsyncStorage.removeItem('selectedClientId');
              await AsyncStorage.removeItem('selectedClientData');

              Alert.alert('Éxito', 'Pedido guardado. Puedes continuar más tarde desde el historial.', [
                { text: 'OK', onPress: () => navigation.reset({ index: 0, routes: [{ name: 'DashboardHome' }] }) }
              ]);
            } catch (error: any) {
              console.error('❌ Error al guardar pedido:', error);
              Alert.alert('Error', 'No se pudo guardar el pedido: ' + error.message);
            } finally {
              setLoading(false);
            }
          }
        }
      ]
    );
  };

  const handleCheckout = async () => {
    if (cart.length === 0) {
      Alert.alert('Carrito vacío', 'Agrega productos antes de realizar el pedido');
      return;
    }

    if (!selectedClient) {
      Alert.alert('Cliente no asignado', '¿Deseas asignar un cliente a este pedido?', [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Asignar Cliente', onPress: () => navigation.navigate('Pedidos') }
      ]);
      return;
    }

    Alert.alert(
      '¿Confirmar Pedido?',
      `Cliente: ${selectedClient.companyName || selectedClient.contactPerson}\nTotal: $${total.toFixed(2)}\n\n¿Deseas crear este pedido?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Confirmar',
          onPress: async () => {
            setLoading(true);
            try {
              const { createOrderOnline } = require('../services/api');
              const { getDatabase } = require('../database/db');
              const db = getDatabase();
              const agentNumber = await AsyncStorage.getItem('agentNumber');
              
              try {
                console.log('🌐 Intentando crear pedido en el backend...');
                const result = await createOrderOnline({
                  cart: cart.map(item => ({
                    product: { id: item.product.id, name: item.product.name, sku: item.product.sku, price: item.product.price },
                    quantity: item.quantity,
                  })),
                  customerNote,
                  selectedClientId: selectedClient.id.toString(),
                });

                // ✅ Guardar pedido en order_history local
                const orderId = result.orderId || `ORD-${Date.now()}`;
                const now = new Date().toISOString();
                
                console.log('💾 Guardando pedido en historial local...');
                await db.runAsync(
                  `INSERT INTO order_history (id, orderNumber, customerName, customerContact, subtotal, tax, total, status, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                  [
                    orderId,
                    orderId,
                    selectedClient.companyName || selectedClient.contactPerson || 'Cliente',
                    selectedClient.phone || selectedClient.email || '',
                    subtotal.toString(),
                    tax.toString(),
                    total.toString(),
                    'completed',
                    now
                  ]
                );
                
                console.log('✅ Pedido guardado en historial local');

                await clearCart();
                await AsyncStorage.removeItem('selectedClientId');
                await AsyncStorage.removeItem('selectedClientData');

                Alert.alert('✅ Éxito', 'Pedido enviado y guardado correctamente');

                // Redireccionar al dashboard de vendedores
                navigation.reset({ index: 0, routes: [{ name: 'DashboardHome' }] });

              } catch (apiError: any) {
                console.log('⚠️ Guardando localmente...');
                const orderId = `ORD-${Date.now()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;
                const now = new Date().toISOString();

                await db.runAsync(
                  `INSERT INTO pending_orders (id, clientId, orderNumber, customerName, customerNote, subtotal, tax, total, status, createdAt, synced) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
                  [orderId, selectedClient.id.toString(), orderId, selectedClient.companyName || selectedClient.contactPerson || 'Cliente', customerNote || '', subtotal.toString(), tax.toString(), total.toString(), 'pending', now]
                );

                for (const item of cart) {
                  const itemId = `${orderId}-${item.product.id}`;
                  await db.runAsync(
                    `INSERT INTO pending_order_items (id, orderId, productId, productName, quantity, pricePerUnit, subtotal) VALUES (?, ?, ?, ?, ?, ?, ?)`,
                    [itemId, orderId, item.product.id, item.product.name, item.quantity, item.product.price, (parseFloat(item.product.price) * item.quantity).toString()]
                  );
                }

                await clearCart();
                await AsyncStorage.removeItem('selectedClientId');
                await AsyncStorage.removeItem('selectedClientData');

                // Redireccionar al dashboard de vendedores
                navigation.reset({ index: 0, routes: [{ name: 'DashboardHome' }] });
              }
            } catch (error: any) {
              console.error('❌ Error:', error);
              Alert.alert('Error', 'No se pudo crear el pedido: ' + error.message);
            } finally {
              setLoading(false);
            }
          }
        }
      ]
    );
  };

  // Calcular totales
  const subtotal = cart.reduce((sum, item) => {
    return sum + (parseFloat(item.product.price) * item.quantity);
  }, 0);

  // Impuestos (10% IVA - ajustar según necesidad)
  const taxRate = 0.10;
  const tax = subtotal * taxRate;
  const total = subtotal + tax;

  // Si el carrito está vacío
  if (cart.length === 0) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => navigation.goBack()}
          >
            <Ionicons name="arrow-back" size={24} color="#1e293b" />
            <Text style={styles.backButtonText}>Volver al Catálogo</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.emptyContainer}>
          <Ionicons name="cart-outline" size={80} color="#cbd5e1" />
          <Text style={styles.emptyTitle}>Tu carrito está vacío</Text>
          <Text style={styles.emptySubtitle}>Agrega productos para comenzar a comprar</Text>
          <TouchableOpacity
            style={styles.explorButton}
            onPress={() => navigation.navigate('CatalogTabs')}
          >
            <Text style={styles.exploreButtonText}>Explorar Productos</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Ionicons name="arrow-back" size={24} color="#1e293b" />
          <Text style={styles.backButtonText}>Volver al Catálogo</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Título */}
        <Text style={styles.pageTitle}>Mi Carrito</Text>

        {/* Cliente seleccionado */}
        {selectedClient && (
          <View style={styles.clientBanner}>
            <Ionicons name="person" size={20} color="#2563eb" />
            <Text style={styles.clientBannerText}>
              Cliente: {selectedClient.companyName || selectedClient.contactPerson}
            </Text>
          </View>
        )}

        {/* Lista de items */}
        <View style={styles.itemsContainer}>
          {cart.map((item) => (
            <CartItemCard
              key={item.product.id}
              item={item}
              onUpdateQuantity={handleUpdateQuantity}
              onRemove={handleRemoveItem}
            />
          ))}
        </View>

        {/* Resumen del Pedido */}
        <View style={styles.summaryCard}>
          <Text style={styles.summaryTitle}>Resumen del Pedido</Text>
          
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Subtotal</Text>
            <Text style={styles.summaryValue}>${subtotal.toFixed(2)}</Text>
          </View>

          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Impuestos (10%)</Text>
            <Text style={styles.summaryValue}>${tax.toFixed(2)}</Text>
          </View>

          <View style={styles.summaryDivider} />

          <View style={styles.summaryRow}>
            <Text style={styles.summaryTotalLabel}>Total</Text>
            <Text style={styles.summaryTotalValue}>${total.toFixed(2)}</Text>
          </View>

          {/* Notas del cliente */}
          <View style={styles.notesContainer}>
            <Text style={styles.notesLabel}>Notas del pedido (opcional)</Text>
            <TextInput
              style={styles.notesInput}
              value={customerNote}
              onChangeText={setCustomerNote}
              placeholder="Agrega instrucciones especiales o comentarios..."
              placeholderTextColor="#94a3b8"
              multiline
              numberOfLines={3}
              textAlignVertical="top"
            />
          </View>

          {/* Botones de acción */}
          <View style={styles.actionButtons}>
            {/* Enviar Pedido */}
            <TouchableOpacity
              style={styles.checkoutButton}
              onPress={handleCheckout}
              disabled={loading}
            >
              <Text style={styles.checkoutButtonText}>
                {loading ? 'ENVIANDO...' : 'ENVIAR PEDIDO'}
              </Text>
            </TouchableOpacity>

            {/* Guardar sin Enviar */}
            <TouchableOpacity
              style={styles.saveButton}
              onPress={handleSaveWithoutSending}
              disabled={loading}
            >
              <Ionicons name="save-outline" size={18} color="#2563eb" />
              <Text style={styles.saveButtonText}>GUARDAR SIN ENVIAR</Text>
            </TouchableOpacity>

            {/* Seguir Comprando */}
            <TouchableOpacity
              style={styles.continueShoppingButton}
              onPress={() => navigation.navigate('CatalogTabs')}
            >
              <Text style={styles.continueShoppingButtonText}>SEGUIR COMPRANDO</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Espacio al final para scroll */}
        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

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
    paddingBottom: 12,
  },
  clientBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#dbeafe',
    paddingHorizontal: 20,
    paddingVertical: 12,
    marginHorizontal: 20,
    marginBottom: 16,
    borderRadius: 8,
  },
  clientBannerText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#1e40af',
    marginLeft: 8,
  },
  itemsContainer: {
    paddingHorizontal: 20,
  },
  cartItemCard: {
    backgroundColor: '#ffffff',
    borderRadius: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    overflow: 'hidden',
  },
  cartItemContent: {
    flexDirection: 'row',
    padding: 12,
  },
  itemImage: {
    width: 48,
    height: 48,
    borderRadius: 6,
    marginRight: 12,
    resizeMode: 'cover',
  },
  itemImagePlaceholder: {
    width: 48,
    height: 48,
    borderRadius: 6,
    backgroundColor: '#f1f5f9',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  itemImagePlaceholderText: {
    fontSize: 24,
  },
  itemInfo: {
    flex: 1,
  },
  itemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  itemTitleContainer: {
    flex: 1,
    marginRight: 8,
  },
  itemName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1e293b',
    marginBottom: 2,
  },
  itemSku: {
    fontSize: 12,
    color: '#64748b',
  },
  removeButton: {
    padding: 4,
  },
  itemFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  itemPrice: {
    fontSize: 14,
    fontWeight: '500',
    color: '#475569',
  },
  quantityControls: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  quantityButton: {
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  quantityInput: {
    width: 50,
    height: 32,
    textAlign: 'center',
    fontSize: 14,
    fontWeight: '600',
    color: '#1e293b',
  },
  itemSubtotal: {
    fontSize: 16,
    fontWeight: '600',
    color: '#2563eb',
  },
  summaryCard: {
    backgroundColor: '#ffffff',
    borderRadius: 8,
    padding: 20,
    marginHorizontal: 20,
    marginTop: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  summaryTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1e293b',
    marginBottom: 16,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  summaryLabel: {
    fontSize: 14,
    color: '#64748b',
  },
  summaryValue: {
    fontSize: 14,
    fontWeight: '500',
    color: '#1e293b',
  },
  summaryDivider: {
    height: 1,
    backgroundColor: '#e2e8f0',
    marginVertical: 12,
  },
  summaryTotalLabel: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1e293b',
  },
  summaryTotalValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#2563eb',
  },
  notesContainer: {
    marginTop: 16,
  },
  notesLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#1e293b',
    marginBottom: 8,
  },
  notesInput: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    color: '#1e293b',
    minHeight: 80,
  },
  actionButtons: {
    gap: 12,
    marginTop: 16,
  },
  checkoutButton: {
    backgroundColor: '#2563eb',
    borderRadius: 8,
    paddingVertical: 16,
    alignItems: 'center',
  },
  checkoutButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#ffffff',
    letterSpacing: 0.5,
  },
  saveButton: {
    backgroundColor: '#ffffff',
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#2563eb',
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#2563eb',
    letterSpacing: 0.5,
  },
  continueShoppingButton: {
    backgroundColor: '#059669',
    borderRadius: 8,
    paddingVertical: 16,
    alignItems: 'center',
  },
  continueShoppingButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#ffffff',
    letterSpacing: 0.5,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  emptyTitle: {
    fontSize: 24,
    fontWeight: '600',
    color: '#1e293b',
    marginTop: 24,
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    color: '#64748b',
    textAlign: 'center',
    marginBottom: 24,
  },
  explorButton: {
    backgroundColor: '#2563eb',
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 8,
  },
  exploreButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
  },
});
