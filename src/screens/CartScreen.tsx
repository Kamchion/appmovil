import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  Alert,
  TextInput,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { CartItem } from '../types';
import {
  getCart,
  updateCartItemQuantity,
  removeFromCart,
  clearCart,
  calculateCartTotal,
} from '../services/cart';

interface CartScreenProps {
  navigation: any;
}

export default function CartScreen({ navigation }: CartScreenProps) {
  const [cart, setCart] = useState<CartItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedClient, setSelectedClient] = useState<any>(null);

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

  const handleClearCart = () => {
    Alert.alert(
      'Vaciar carrito',
      '¿Estás seguro de vaciar todo el carrito?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Vaciar',
          style: 'destructive',
          onPress: async () => {
            await clearCart();
            setCart([]);
          },
        },
      ]
    );
  };

  const handleCheckout = () => {
    if (cart.length === 0) {
      Alert.alert('Carrito vacío', 'Agrega productos antes de crear un pedido');
      return;
    }

    // Validar que haya un cliente asignado
    if (!selectedClient) {
      Alert.alert(
        'Cliente no asignado',
        '¿Deseas asignar un cliente a este pedido?',
        [
          {
            text: 'Cancelar',
            style: 'cancel'
          },
          {
            text: 'Asignar Cliente',
            onPress: () => navigation.navigate('Pedidos')
          }
        ]
      );
      return;
    }

    navigation.navigate('Checkout', { cart, client: selectedClient });
  };

  const handleAssignClient = () => {
    navigation.navigate('Pedidos');
  };

  const renderCartItem = ({ item }: { item: CartItem }) => (
    <View style={styles.cartItem}>
      <View style={styles.itemInfo}>
        <Text style={styles.itemName}>{item.product.name}</Text>
        <Text style={styles.itemSku}>SKU: {item.product.sku}</Text>
        <Text style={styles.itemPrice}>${item.product.price} c/u</Text>
      </View>

      <View style={styles.itemActions}>
        <View style={styles.quantityControl}>
          <TouchableOpacity
            style={styles.quantityBtn}
            onPress={() =>
              handleUpdateQuantity(item.product.id, item.quantity - 1)
            }
          >
            <Text style={styles.quantityBtnText}>-</Text>
          </TouchableOpacity>

          <Text style={styles.quantityText}>{item.quantity}</Text>

          <TouchableOpacity
            style={styles.quantityBtn}
            onPress={() =>
              handleUpdateQuantity(item.product.id, item.quantity + 1)
            }
          >
            <Text style={styles.quantityBtnText}>+</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.itemTotal}>
          ${(parseFloat(item.product.price) * item.quantity).toFixed(2)}
        </Text>

        <TouchableOpacity
          style={styles.removeBtn}
          onPress={() => handleRemoveItem(item.product.id, item.product.name)}
        >
          <Text style={styles.removeBtnText}>🗑️</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const { subtotal, tax, total } = calculateCartTotal(cart);

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <Text>Cargando carrito...</Text>
      </View>
    );
  }

  if (cart.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyText}>🛒</Text>
        <Text style={styles.emptyTitle}>Carrito vacío</Text>
        <Text style={styles.emptySubtitle}>
          Agrega productos desde el catálogo
        </Text>
        <TouchableOpacity
          style={styles.browseButton}
          onPress={() => navigation.navigate('Catalog')}
        >
          <Text style={styles.browseButtonText}>Ver catálogo</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Mi Carrito</Text>
        <TouchableOpacity onPress={handleClearCart}>
          <Text style={styles.clearButton}>Vaciar</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={cart}
        renderItem={renderCartItem}
        keyExtractor={(item) => item.product.id}
        contentContainerStyle={styles.listContainer}
      />

      <View style={styles.footer}>
        {/* Sección de cliente asignado */}
        <View style={styles.clientSection}>
          {selectedClient ? (
            <View style={styles.clientInfo}>
              <Text style={styles.clientLabel}>👤 Cliente:</Text>
              <Text style={styles.clientName}>{selectedClient.companyName || selectedClient.name}</Text>
              <TouchableOpacity 
                style={styles.changeClientBtn}
                onPress={handleAssignClient}
              >
                <Text style={styles.changeClientText}>Cambiar</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity 
              style={styles.assignClientBtn}
              onPress={handleAssignClient}
            >
              <Text style={styles.assignClientText}>👤 Asignar Cliente</Text>
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>Subtotal:</Text>
          <Text style={styles.totalValue}>${subtotal.toFixed(2)}</Text>
        </View>

        {tax > 0 && (
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Impuestos:</Text>
            <Text style={styles.totalValue}>${tax.toFixed(2)}</Text>
          </View>
        )}

        <View style={[styles.totalRow, styles.grandTotal]}>
          <Text style={styles.grandTotalLabel}>Total:</Text>
          <Text style={styles.grandTotalValue}>${total.toFixed(2)}</Text>
        </View>

        <TouchableOpacity style={styles.checkoutButton} onPress={handleCheckout}>
          <Text style={styles.checkoutButtonText}>Crear Pedido</Text>
        </TouchableOpacity>
      </View>
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
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1e293b',
  },
  clearButton: {
    fontSize: 14,
    color: '#ef4444',
    fontWeight: '600',
  },
  listContainer: {
    padding: 16,
  },
  cartItem: {
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
  itemInfo: {
    marginBottom: 12,
  },
  itemName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1e293b',
    marginBottom: 4,
  },
  itemSku: {
    fontSize: 12,
    color: '#64748b',
    marginBottom: 4,
  },
  itemPrice: {
    fontSize: 14,
    color: '#64748b',
  },
  itemActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  quantityControl: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  quantityBtn: {
    width: 32,
    height: 32,
    backgroundColor: '#2563eb',
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  quantityBtnText: {
    fontSize: 18,
    color: '#fff',
    fontWeight: 'bold',
  },
  quantityText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1e293b',
    marginHorizontal: 16,
    minWidth: 30,
    textAlign: 'center',
  },
  itemTotal: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#2563eb',
  },
  removeBtn: {
    padding: 8,
  },
  removeBtnText: {
    fontSize: 20,
  },
  footer: {
    backgroundColor: '#fff',
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
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
    color: '#1e293b',
    fontWeight: '600',
  },
  grandTotal: {
    marginTop: 8,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
    marginBottom: 16,
  },
  grandTotalLabel: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1e293b',
  },
  grandTotalValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#2563eb',
  },
  clientSection: {
    marginBottom: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  clientInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#f1f5f9',
    padding: 12,
    borderRadius: 8,
  },
  clientLabel: {
    fontSize: 14,
    color: '#64748b',
    marginRight: 8,
  },
  clientName: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    color: '#1e293b',
  },
  changeClientBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#fff',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#2563eb',
  },
  changeClientText: {
    color: '#2563eb',
    fontSize: 14,
    fontWeight: '600',
  },
  assignClientBtn: {
    backgroundColor: '#10b981',
    padding: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  assignClientText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  checkoutButton: {
    backgroundColor: '#2563eb',
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
  },
  checkoutButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
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
  },
  browseButton: {
    backgroundColor: '#2563eb',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  browseButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
