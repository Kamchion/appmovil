import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Alert,
  TextInput,
  Image,
} from 'react-native';
import { getDatabase } from '../database/db';
import { Product } from '../types';
import { syncCatalog, checkConnection } from '../services/sync';
import { getCachedImagePath } from '../services/imageCache';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { addToCart } from '../services/cart';
import { Modal } from 'react-native';

interface CatalogScreenProps {
  navigation: any;
}

// Componente separado para ProductCard para evitar problemas con hooks
const ProductCard = React.memo(({ item, navigation, priceType, onAddToCart }: { item: Product; navigation: any; priceType?: string; onAddToCart?: () => void }) => {
  const [imagePath, setImagePath] = useState<string | null>(null);
  const [quantity, setQuantity] = useState(item.minQuantity || 1);
  const [showImageModal, setShowImageModal] = useState(false);
  const [adding, setAdding] = useState(false);
  
  // Calcular precio según tipo de cliente
  const getPrice = () => {
    if (!priceType || priceType === 'ciudad') {
      return item.price || item.basePrice;
    } else if (priceType === 'interior') {
      return item.interiorPrice || item.price || item.basePrice;
    } else if (priceType === 'especial') {
      return item.specialPrice || item.price || item.basePrice;
    }
    return item.basePrice;
  };
  
  const displayPrice = getPrice();

  useEffect(() => {
    if (item?.image) {
      getCachedImagePath(item.image).then(setImagePath).catch(() => setImagePath(null));
    }
  }, [item?.image]);

  // Validar que item tenga los datos mínimos requeridos
  if (!item || !item.id || !item.name || !item.sku) {
    console.error('❌ ProductCard: Datos de producto inválidos', item);
    return null;
  }

  const handleAddToCart = async () => {
    if (adding) return;
    
    setAdding(true);
    try {
      const productWithPrice = {
        ...item,
        price: displayPrice.toString(),
      };
      
      await addToCart(productWithPrice, quantity);
      Alert.alert('✅ Agregado', `${quantity} × ${item.name} agregado al carrito`);
      
      // Resetear cantidad
      setQuantity(item.minQuantity || 1);
      
      // Notificar al padre para actualizar contador
      if (onAddToCart) onAddToCart();
    } catch (error) {
      console.error('Error al agregar al carrito:', error);
      Alert.alert('Error', 'No se pudo agregar al carrito');
    } finally {
      setAdding(false);
    }
  };

  const incrementQuantity = () => {
    setQuantity(prev => prev + 1);
  };

  const decrementQuantity = () => {
    const minQty = item.minQuantity || 1;
    if (quantity > minQty) {
      setQuantity(prev => prev - 1);
    }
  };

  return (
    <View style={styles.productCard}>
      {/* Modal de imagen grande */}
      <Modal
        visible={showImageModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowImageModal(false)}
      >
        <TouchableOpacity
          style={styles.imageModalOverlay}
          activeOpacity={1}
          onPress={() => setShowImageModal(false)}
        >
          <View style={styles.imageModalContent}>
            {imagePath ? (
              <Image
                source={{ uri: imagePath }}
                style={styles.imageModalImage}
                resizeMode="contain"
              />
            ) : (
              <Text style={styles.imageModalPlaceholder}>📦</Text>
            )}
            <TouchableOpacity
              style={styles.imageModalClose}
              onPress={() => setShowImageModal(false)}
            >
              <Ionicons name="close-circle" size={40} color="#ffffff" />
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Imagen del producto */}
      <TouchableOpacity onPress={() => setShowImageModal(true)}>
        {imagePath ? (
          <Image
            source={{ uri: imagePath }}
            style={styles.productImage}
            resizeMode="cover"
          />
        ) : (
          <View style={styles.productImagePlaceholder}>
            <Text style={styles.productImagePlaceholderText}>📦</Text>
          </View>
        )}
      </TouchableOpacity>

      {/* Info del producto */}
      <View style={styles.productInfo}>
        <Text style={styles.productName} numberOfLines={2}>
          {item.name || 'Sin nombre'}
        </Text>
        <Text style={styles.productSku}>SKU: {item.sku || 'N/A'}</Text>
        {item.category && (
          <View style={styles.categoryBadge}>
            <Text style={styles.categoryText}>{item.category}</Text>
          </View>
        )}
        <View style={styles.productPricing}>
          <Text style={styles.productPrice}>${displayPrice || '0.00'}</Text>
          <Text style={styles.productStock}>Stock: {item.stock || 0}</Text>
        </View>

        {/* Controles de cantidad */}
        <View style={styles.quantityContainer}>
          <TouchableOpacity
            style={styles.quantityButton}
            onPress={decrementQuantity}
          >
            <Ionicons name="remove" size={16} color="#64748b" />
          </TouchableOpacity>
          
          <Text style={styles.quantityText}>{quantity}</Text>
          
          <TouchableOpacity
            style={styles.quantityButton}
            onPress={incrementQuantity}
          >
            <Ionicons name="add" size={16} color="#64748b" />
          </TouchableOpacity>
        </View>

        {/* Botón agregar al carrito */}
        <TouchableOpacity
          style={[styles.addToCartButton, adding && styles.addToCartButtonDisabled]}
          onPress={handleAddToCart}
          disabled={adding}
        >
          <Ionicons name="cart" size={16} color="#ffffff" />
          <Text style={styles.addToCartButtonText}>
            {adding ? 'Agregando...' : 'Agregar'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
});

export default function CatalogScreen({ navigation }: CatalogScreenProps) {
  const [products, setProducts] = useState<Product[]>([]);
  const [cartCount, setCartCount] = useState({ lines: 0, items: 0 });
  const [filteredProducts, setFilteredProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [isOnline, setIsOnline] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [selectedClient, setSelectedClient] = useState<any>(null);

  useEffect(() => {
    loadProducts();
    loadSelectedClient();
    loadCartCount();
    checkConnectionStatus();
  }, []);

  useEffect(() => {
    // Actualizar contador cuando cambia la navegación (vuelve de carrito)
    const unsubscribe = navigation.addListener('focus', () => {
      loadCartCount();
    });
    return unsubscribe;
  }, [navigation]);
  
  const loadSelectedClient = async () => {
    try {
      const clientData = await AsyncStorage.getItem('selectedClientData');
      if (clientData) {
        const client = JSON.parse(clientData);
        setSelectedClient(client);
        console.log('👤 Cliente seleccionado:', client.companyName, '- Tipo:', client.priceType);
      }
    } catch (error) {
      console.error('❌ Error al cargar cliente seleccionado:', error);
    }
  };

  useEffect(() => {
    filterProducts();
  }, [searchQuery, selectedCategory, products]);

  const checkConnectionStatus = async () => {
    const online = await checkConnection();
    setIsOnline(online);
  };

  const loadCartCount = async () => {
    try {
      const db = getDatabase();
      const result = await db.getAllAsync<{ lines: number; items: number }>(
        'SELECT COUNT(DISTINCT productId) as lines, SUM(quantity) as items FROM cart'
      );
      if (result && result.length > 0) {
        setCartCount({
          lines: result[0].lines || 0,
          items: result[0].items || 0,
        });
      }
    } catch (error) {
      console.error('Error al cargar contador de carrito:', error);
    }
  };

  const loadProducts = async () => {
    try {
      console.log('📱 CatalogScreen: Cargando productos desde SQLite...');
      const db = getDatabase();
      
      // Primero verificar cuántos hay
      const countResult = await db.getAllAsync('SELECT COUNT(*) as count FROM products');
      const totalProducts = countResult[0]?.count || 0;
      console.log(`📊 Total de productos en BD: ${totalProducts}`);
      
      if (totalProducts === 0) {
        console.warn('⚠️ No hay productos en la base de datos');
        Alert.alert(
          'Sin productos',
          'No se encontraron productos. Por favor sincroniza desde la pantalla de Inicio.',
          [{ text: 'OK' }]
        );
        setProducts([]);
        setFilteredProducts([]);
        return;
      }
      
      // Filtrar productos principales (sin parentSku) y variantes ocultas
      const result = await db.getAllAsync<Product>(
        `SELECT * FROM products 
         WHERE isActive = 1 
         AND hideInCatalog = 0 
         AND (parentSku IS NULL OR parentSku = '') 
         ORDER BY displayOrder ASC, name ASC`
      );
      console.log(`✅ ${result.length} productos cargados exitosamente`);
      
      // Validar que los productos tengan los campos requeridos
      const validProducts = result.filter(p => p.id && p.sku && p.name && p.basePrice);
      if (validProducts.length < result.length) {
        console.warn(`⚠️ ${result.length - validProducts.length} productos inválidos filtrados`);
      }
      
      setProducts(validProducts);
      setFilteredProducts(validProducts);
      
      // Extraer categorías únicas
      const uniqueCategories = [...new Set(result.map(p => p.category).filter(c => c))].sort();
      setCategories(uniqueCategories as string[]);
    } catch (error) {
      console.error('❌ Error al cargar productos:', error);
      Alert.alert('Error', 'No se pudieron cargar los productos: ' + (error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const filterProducts = () => {
    let filtered = [...products];

    // Filtrar por búsqueda
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (product) =>
          product.name?.toLowerCase().includes(query) ||
          product.sku?.toLowerCase().includes(query) ||
          product.description?.toLowerCase().includes(query)
      );
    }

    // Filtrar por categoría
    if (selectedCategory) {
      filtered = filtered.filter((product) => product.category === selectedCategory);
    }

    setFilteredProducts(filtered);
  };

  const handleSync = async () => {
    setRefreshing(true);
    
    const result = await syncCatalog((message) => {
      console.log('Sync progress:', message);
    });

    if (result.success) {
      Alert.alert('Éxito', result.message);
      await loadProducts();
    } else {
      Alert.alert('Error', result.message);
    }

    await checkConnectionStatus();
    setRefreshing(false);
  };

  const renderProduct = ({ item }: { item: Product }) => (
    <ProductCard 
      item={item} 
      navigation={navigation} 
      priceType={selectedClient?.priceType}
      onAddToCart={loadCartCount} 
    />
  );

  const renderCategoryFilter = () => (
    <View style={styles.categoryFilterContainer}>
      <TouchableOpacity
        style={[
          styles.categoryFilterButton,
          !selectedCategory && styles.categoryFilterButtonActive,
        ]}
        onPress={() => setSelectedCategory('')}
      >
        <Text
          style={[
            styles.categoryFilterText,
            !selectedCategory && styles.categoryFilterTextActive,
          ]}
        >
          Todas
        </Text>
      </TouchableOpacity>
      {categories.map((category) => (
        <TouchableOpacity
          key={category}
          style={[
            styles.categoryFilterButton,
            selectedCategory === category && styles.categoryFilterButtonActive,
          ]}
          onPress={() => setSelectedCategory(category)}
        >
          <Text
            style={[
              styles.categoryFilterText,
              selectedCategory === category && styles.categoryFilterTextActive,
            ]}
          >
            {category}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#2563eb" />
        <Text style={styles.loadingText}>Cargando catálogo...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <View>
            <Text style={styles.headerTitle}>Catálogo</Text>
            <Text style={styles.headerSubtitle}>
              {filteredProducts.length} de {products.length} productos
            </Text>
          </View>
          <View style={styles.headerRight}>
            <TouchableOpacity
              style={styles.cartButton}
              onPress={() => navigation.navigate('Cart')}
            >
              <Ionicons name="cart" size={24} color="#2563eb" />
              {cartCount.lines > 0 && (
                <View style={styles.cartBadge}>
                  <Text style={styles.cartBadgeText}>{cartCount.lines}</Text>
                </View>
              )}
            </TouchableOpacity>
            <View style={styles.cartInfo}>
              <Text style={styles.cartInfoText}>{cartCount.lines} líneas</Text>
              <Text style={styles.cartInfoText}>{cartCount.items} items</Text>
            </View>
          </View>
        </View>

        {/* Search Bar */}
        <View style={styles.searchContainer}>
          <Text style={styles.searchIcon}>🔍</Text>
          <TextInput
            style={styles.searchInput}
            placeholder="Buscar por nombre, SKU o descripción..."
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoCapitalize="none"
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Text style={styles.clearButton}>✕</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Category Filters */}
        {categories.length > 0 && renderCategoryFilter()}
      </View>

      {/* Product List */}
      <FlatList
        data={filteredProducts}
        renderItem={renderProduct}
        keyExtractor={(item) => item.id}
        numColumns={2}
        columnWrapperStyle={styles.productRow}
        contentContainerStyle={styles.productList}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleSync} />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>📦</Text>
            <Text style={styles.emptyTitle}>No se encontraron productos</Text>
            <Text style={styles.emptySubtitle}>
              {searchQuery || selectedCategory
                ? 'Intenta con otros filtros de búsqueda'
                : 'Desliza hacia abajo para sincronizar'}
            </Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f9fafb',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f9fafb',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#6b7280',
  },
  header: {
    backgroundColor: '#ffffff',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  cartButton: {
    position: 'relative',
    padding: 8,
  },
  cartBadge: {
    position: 'absolute',
    top: 2,
    right: 2,
    backgroundColor: '#ef4444',
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  cartBadgeText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: 'bold',
  },
  cartInfo: {
    alignItems: 'flex-end',
  },
  cartInfoText: {
    fontSize: 11,
    color: '#6b7280',
    fontWeight: '500',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#111827',
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#6b7280',
    marginTop: 4,
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  onlineBadge: {
    backgroundColor: '#d1fae5',
  },
  offlineBadge: {
    backgroundColor: '#fee2e2',
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f3f4f6',
    borderRadius: 8,
    paddingHorizontal: 12,
    marginBottom: 12,
  },
  searchIcon: {
    fontSize: 16,
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 10,
    fontSize: 14,
    color: '#111827',
  },
  clearButton: {
    fontSize: 18,
    color: '#9ca3af',
    paddingHorizontal: 8,
  },
  categoryFilterContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  categoryFilterButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#f3f4f6',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  categoryFilterButtonActive: {
    backgroundColor: '#2563eb',
    borderColor: '#2563eb',
  },
  categoryFilterText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#6b7280',
  },
  categoryFilterTextActive: {
    color: '#ffffff',
  },
  productList: {
    padding: 8,
  },
  productRow: {
    justifyContent: 'space-between',
    paddingHorizontal: 8,
  },
  productCard: {
    flex: 1,
    backgroundColor: '#ffffff',
    borderRadius: 12,
    marginBottom: 16,
    marginHorizontal: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    overflow: 'hidden',
  },
  productImage: {
    width: '100%',
    height: 150,
  },
  productImagePlaceholder: {
    width: '100%',
    height: 150,
    backgroundColor: '#f3f4f6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  productImagePlaceholderText: {
    fontSize: 48,
  },
  productInfo: {
    padding: 12,
  },
  productName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 4,
  },
  productSku: {
    fontSize: 11,
    color: '#6b7280',
    marginBottom: 6,
  },
  categoryBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#dbeafe',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    marginBottom: 8,
  },
  categoryText: {
    fontSize: 10,
    fontWeight: '500',
    color: '#1e40af',
  },
  productPricing: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  productPrice: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#059669',
  },
  productStock: {
    fontSize: 11,
    color: '#6b7280',
  },
  quantityContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    marginBottom: 8,
  },
  quantityButton: {
    width: 28,
    height: 28,
    borderRadius: 6,
    backgroundColor: '#f3f4f6',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  quantityText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginHorizontal: 16,
    minWidth: 30,
    textAlign: 'center',
  },
  addToCartButton: {
    flexDirection: 'row',
    backgroundColor: '#2563eb',
    borderRadius: 6,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  addToCartButtonDisabled: {
    opacity: 0.6,
  },
  addToCartButtonText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '600',
    marginLeft: 6,
  },
  imageModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.9)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  imageModalContent: {
    width: '90%',
    height: '80%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  imageModalImage: {
    width: '100%',
    height: '100%',
  },
  imageModalPlaceholder: {
    fontSize: 100,
  },
  imageModalClose: {
    position: 'absolute',
    top: -50,
    right: 10,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 64,
  },
  emptyText: {
    fontSize: 64,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    color: '#6b7280',
    textAlign: 'center',
  },
});
