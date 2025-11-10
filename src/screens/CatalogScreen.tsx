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
  ScrollView,
  Dimensions,
} from 'react-native';
import { getDatabase } from '../database/db';
import { Product } from '../types';
import { syncCatalog, checkConnection } from '../services/sync';
import { getCachedImagePath } from '../services/imageCache';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { addToCart } from '../services/cart';

// Función para calcular número de columnas según tamaño de pantalla
const getNumColumns = () => {
  const screenWidth = Dimensions.get('window').width;
  
  // Teléfonos pequeños (< 360px): 2 columnas
  if (screenWidth < 360) return 2;
  
  // Teléfonos normales (360-600px): 2 columnas
  if (screenWidth < 600) return 2;
  
  // Tablets pequeñas (600-900px): 3 columnas
  if (screenWidth < 900) return 3;
  
  // Tablets grandes (>= 900px): 4 columnas
  return 4;
};

import { Modal } from 'react-native';
import { getProductPrice, formatPrice, type PriceType } from '../utils/priceUtils';

interface CatalogScreenProps {
  navigation: any;
}

// Componente para cada variante en el modal
const VariantItem = ({ variant, priceType, onAddToCart }: { variant: Product; priceType?: string; onAddToCart: () => void }) => {
  // Validación defensiva: verificar que variant tiene datos mínimos
  if (!variant || !variant.id || !variant.sku || !variant.name) {
    console.error('❌ VariantItem: Variante inválida', variant);
    return null;
  }
  
  const [quantity, setQuantity] = useState(0);
  const [adding, setAdding] = useState(false);
  const [imagePath, setImagePath] = useState<string | null>(null);
  const displayPrice = getProductPrice(variant, (priceType as PriceType) || 'ciudad');
  
  // Cargar imagen de la variante
  useEffect(() => {
    if (variant?.image) {
      getCachedImagePath(variant.image).then(setImagePath).catch(() => setImagePath(null));
    }
  }, [variant?.image]);

  const incrementQuantity = () => {
    const minQty = variant.minQuantity || 1;
    if (quantity === 0) {
      setQuantity(minQty);
    } else {
      setQuantity(prev => prev + 1);
    }
  };

  const decrementQuantity = () => {
    const minQty = variant.minQuantity || 1;
    if (quantity > minQty) {
      setQuantity(prev => prev - 1);
    } else if (quantity === minQty) {
      setQuantity(0);
    }
  };

  const handleAddToCart = async () => {
    if (adding || quantity === 0) return;
    
    setAdding(true);
    try {
      const productWithPrice = {
        ...variant,
        price: displayPrice.toString(),
      };
      
      await addToCart(productWithPrice, quantity);
      setQuantity(0);
      onAddToCart();
    } catch (error) {
      console.error('Error al agregar variante al carrito:', error);
      Alert.alert('Error', 'No se pudo agregar al carrito');
    } finally {
      setAdding(false);
    }
  };

  return (
    <View style={styles.variantItem}>
      {imagePath && (
        <Image 
          source={{ uri: imagePath }} 
          style={styles.variantImage} 
        />
      )}
      <View style={styles.variantInfo}>
        <Text style={styles.variantName}>{variant.variantName || variant.name}</Text>
        <Text style={styles.variantSku}>SKU: {variant.sku}</Text>
        <Text style={styles.variantPrice}>${displayPrice}</Text>
        <Text style={styles.variantStock}>Stock: {variant.stock || 0}</Text>
      </View>
      <View style={styles.variantControls}>
        <View style={styles.variantQuantityContainer}>
          <TouchableOpacity
            style={styles.variantQuantityButton}
            onPress={decrementQuantity}
          >
            <Ionicons name="remove" size={16} color="#64748b" />
          </TouchableOpacity>
          <Text style={styles.variantQuantityText}>{quantity}</Text>
          <TouchableOpacity
            style={styles.variantQuantityButton}
            onPress={incrementQuantity}
          >
            <Ionicons name="add" size={16} color="#64748b" />
          </TouchableOpacity>
        </View>
        <TouchableOpacity
          style={[styles.variantAddButton, (adding || quantity === 0) && styles.variantAddButtonDisabled]}
          onPress={handleAddToCart}
          disabled={adding || quantity === 0}
        >
          <Ionicons name="cart" size={16} color="#ffffff" />
        </TouchableOpacity>
      </View>
    </View>
  );
};

// Componente separado para ProductCard para evitar problemas con hooks
// Componente separado para ProductCard para evitar problemas con hooks
const ProductCard = React.memo(({ item, navigation, priceType, onAddToCart }: { item: Product; navigation: any; priceType?: string; onAddToCart?: () => void }) => {
  const [imagePath, setImagePath] = useState<string | null>(null);
  const [showImageModal, setShowImageModal] = useState(false);
  const [showVariantsModal, setShowVariantsModal] = useState(false);
  const [variants, setVariants] = useState<Product[]>([]);
  const [hasVariants, setHasVariants] = useState(false);
  const [quantity, setQuantity] = useState(0);
  const [adding, setAdding] = useState(false);
  
  // Calcular precio según tipo de cliente usando la utilidad
  const displayPrice = getProductPrice(item, (priceType as PriceType) || 'ciudad');

  useEffect(() => {
    if (item?.image) {
      getCachedImagePath(item.image).then(setImagePath).catch(() => setImagePath(null));
    }
    // Verificar si tiene variantes
    checkHasVariants();
  }, [item?.image, item?.sku]);

  const checkHasVariants = async () => {
    try {
      const db = getDatabase();
      const result = await db.getAllAsync<{count: number}>(
        'SELECT COUNT(*) as count FROM products WHERE parentSku = ? AND isActive = 1',
        [item.sku]
      );
      
      const count = result[0]?.count || 0;
      setHasVariants(count > 0);
    } catch (error) {
      console.error('Error al verificar variantes:', error);
      setHasVariants(false);
    }
  };


  const loadVariants = async () => {
    // Si ya se cargaron, no volver a cargar
    if (variants.length > 0) {
      return;
    }
    
    try {
      const db = getDatabase();
      const result = await db.getAllAsync<Product>(
        'SELECT * FROM products WHERE parentSku = ? AND isActive = 1 ORDER BY displayOrder ASC, name ASC',
        [item.sku]
      );
      if (result.length > 0) {
        setVariants(result);
        setHasVariants(true);
      } else {
        setHasVariants(false);
      }
    } catch (error) {
      console.error('Error al cargar variantes:', error);
      setHasVariants(false);
    }
  };
  
  const handleViewOptions = async () => {
    // Cargar variantes solo cuando el usuario hace clic en "Ver opciones"
    await loadVariants();
    if (hasVariants || variants.length > 0) {
      setShowVariantsModal(true);
    } else {
      Alert.alert('Sin variantes', 'Este producto no tiene variantes disponibles');
    }
  };

  // Validar que item tenga los datos mínimos requeridos
  if (!item || !item.id || !item.name || !item.sku) {
    console.error('❌ ProductCard: Datos de producto inválidos', item);
    return null;
  }

  const incrementQuantity = () => {
    const minQty = item.minQuantity || 1;
    if (quantity === 0) {
      setQuantity(minQty);
    } else {
      setQuantity(prev => prev + 1);
    }
  };

  const decrementQuantity = () => {
    const minQty = item.minQuantity || 1;
    if (quantity > minQty) {
      setQuantity(prev => prev - 1);
    } else if (quantity === minQty) {
      setQuantity(0);
    }
  };

  const handleAddToCart = async () => {
    if (adding || quantity === 0) return;
    
    setAdding(true);
    try {
      const productWithPrice = {
        ...item,
        price: displayPrice.toString(),
      };
      
      await addToCart(productWithPrice, quantity);
      // NO resetear cantidad - mantener el valor para que el usuario vea cuánto agregó
      // setQuantity(0); // Comentado: ahora la cantidad persiste
      if (onAddToCart) onAddToCart();
    } catch (error) {
      console.error('Error al agregar al carrito:', error);
      Alert.alert('Error', 'No se pudo agregar al carrito');
    } finally {
      setAdding(false);
    }
  };

  try {
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
                <View style={styles.imageModalPlaceholder}>
                  <Ionicons name="image-outline" size={80} color="#cbd5e1" />
                </View>
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

        {/* Modal de variantes */}
        <Modal
          visible={showVariantsModal}
          transparent={true}
          animationType="slide"
          onRequestClose={() => setShowVariantsModal(false)}
        >
          <View style={styles.variantsModalOverlay}>
            <View style={styles.variantsModalContent}>
              <View style={styles.variantsModalHeader}>
                <Text style={styles.variantsModalTitle}>{item.name}</Text>
                <TouchableOpacity onPress={() => setShowVariantsModal(false)}>
                  <Ionicons name="close" size={28} color="#64748b" />
                </TouchableOpacity>
              </View>
              <Text style={styles.variantsModalSubtitle}>Selecciona una opción:</Text>
              <ScrollView style={styles.variantsModalList}>
                {variants.map((variant) => (
                  <VariantItem
                    key={variant.id}
                    variant={variant}
                    priceType={priceType}
                    onAddToCart={() => {
                      setShowVariantsModal(false);
                      if (onAddToCart) onAddToCart();
                    }}
                  />
                ))}
              </ScrollView>
            </View>
          </View>
        </Modal>

        {/* Imagen del producto */}
        <TouchableOpacity onPress={() => setShowImageModal(true)}>
          {imagePath ? (
            <Image
              source={{ uri: imagePath }}
              style={styles.productImage}
              resizeMode="contain"
            />
          ) : (
            <View style={styles.productImagePlaceholder}>
              <Ionicons name="image-outline" size={40} color="#cbd5e1" />
            </View>
          )}
        </TouchableOpacity>

        {/* Información del producto */}
        <View style={styles.productInfo}>
          <Text style={styles.productName} numberOfLines={2}>{item.name}</Text>
          <Text style={styles.productSku}>SKU: {item.sku}</Text>
          {item.category && (
            <View style={styles.productCategory}>
              <Ionicons name="pricetag-outline" size={12} color="#64748b" />
              <Text style={styles.productCategoryText}>{item.category}</Text>
            </View>
          )}
        </View>
        <View style={styles.productPricing}>
          <Text style={styles.productPrice}>${displayPrice || '0.00'}</Text>
          <Text style={styles.productStock}>Stock: {item.stock || 0}</Text>
        </View>

        {/* Renderizado condicional según si tiene variantes o no */}
        {hasVariants ? (
          // Producto CON variantes → Botón "Ver opciones"
          <TouchableOpacity
            style={styles.viewOptionsButton}
            onPress={handleViewOptions}
          >
            <Ionicons name="options" size={16} color="#2563eb" />
            <Text style={styles.viewOptionsButtonText}>Ver opciones</Text>
          </TouchableOpacity>
        ) : (
          // Producto SIN variantes → Controles de cantidad + Botón agregar
          <View style={styles.productActions}>
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
            <TouchableOpacity
              style={[styles.addToCartButton, (adding || quantity === 0) && styles.addToCartButtonDisabled]}
              onPress={handleAddToCart}
              disabled={adding || quantity === 0}
            >
              <Ionicons name="cart" size={16} color="#ffffff" />
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  } catch (error) {
    console.error('❌ Error al renderizar ProductCard:', error, item);
    return null;
  }
});

export default function CatalogScreen({ navigation }: CatalogScreenProps) {
  const [products, setProducts] = useState<Product[]>([]);
  const [cartCount, setCartCount] = useState({ lines: 0, items: 0 });
  const [cartTotal, setCartTotal] = useState('0.00');
  const [filteredProducts, setFilteredProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [numColumns, setNumColumns] = useState(getNumColumns());
  const [refreshing, setRefreshing] = useState(false);
  const [isOnline, setIsOnline] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [showCategoryDropdown, setShowCategoryDropdown] = useState(false);
  const [selectedClient, setSelectedClient] = useState<any>(null);

  // Actualizar número de columnas si cambia el tamaño de pantalla
  useEffect(() => {
    const subscription = Dimensions.addEventListener('change', () => {
      setNumColumns(getNumColumns());
    });
    
    return () => subscription?.remove();
  }, []);

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
      // Usar getCart de AsyncStorage para consistencia con CartScreen
      const { getCart } = require('../services/cart');
      const cart = await getCart();
      
      // Contar líneas (productos únicos)
      const lines = cart.length;
      
      // Contar items totales
      const items = cart.reduce((sum: number, item: any) => sum + item.quantity, 0);
      
      setCartCount({ lines, items });
      
      // Calcular total del carrito
      let total = 0;
      cart.forEach((item: any) => {
        const price = parseFloat(item.product.price || '0');
        total += price * item.quantity;
      });
      setCartTotal(total.toFixed(2));
    } catch (error) {
      console.error('❌ Error al cargar contador del carrito:', error);
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
      
      // 🔍 DEBUG: Verificar productos SPRAY
      const sprayProducts = await db.getAllAsync<Product>(
        `SELECT sku, name, parentSku, isActive, hideInCatalog, basePrice, priceCity, priceInterior, priceSpecial 
         FROM products 
         WHERE name LIKE '%SPRAY%' OR sku LIKE '%SPRAY%'`
      );
      if (sprayProducts.length > 0) {
        console.log(`\n🔍 DEBUG: Productos SPRAY en BD (${sprayProducts.length}):`);
        sprayProducts.forEach(p => {
          console.log(`  - ${p.name} (${p.sku})`);
          console.log(`    parentSku: ${p.parentSku || 'NULL'}`);
          console.log(`    isActive: ${p.isActive}, hideInCatalog: ${p.hideInCatalog}`);
          console.log(`    Precios: base=${p.basePrice}, city=${p.priceCity}, interior=${p.priceInterior}, special=${p.priceSpecial}`);
        });
      }
      
      // Validar que los productos tengan los campos requeridos
      // Debe tener al menos un precio válido (basePrice o alguno de los diferenciados)
      const validProducts = result.filter(p => {
        const hasBasicFields = p.id && p.sku && p.name;
        const hasPrice = p.basePrice || p.priceCity || p.priceInterior || p.priceSpecial;
        
        if (!hasBasicFields || !hasPrice) {
          console.warn('⚠️ Producto inválido filtrado:', {
            sku: p.sku,
            name: p.name,
            hasBasicFields,
            hasPrice,
            basePrice: p.basePrice,
            priceCity: p.priceCity,
            priceInterior: p.priceInterior,
            priceSpecial: p.priceSpecial
          });
          // 🔍 DEBUG: Alertar si es un producto SPRAY
          if (p.name?.includes('SPRAY') || p.sku?.includes('SPRAY')) {
            console.error('❌ SPRAY FILTRADO - Razón:', !hasBasicFields ? 'Campos básicos faltantes' : 'Sin precios válidos');
          }
          return false;
        }
        
        return true;
      });
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

  const handleGoBack = () => {
    // Si hay productos en el carrito, advertir antes de salir
    if (cartCount.lines > 0) {
      Alert.alert(
        'Advertencia',
        'Tienes productos en el carrito. Si sales, se borrará todo el pedido. ¿Deseas continuar?',
        [
          {
            text: 'Cancelar',
            style: 'cancel',
          },
          {
            text: 'Salir y Borrar',
            style: 'destructive',
            onPress: async () => {
              // Borrar el carrito
              const db = getDatabase();
              await db.runAsync('DELETE FROM cart');
              // Regresar al panel principal
              navigation.navigate('Home');
            },
          },
        ]
      );
    } else {
      // Si no hay productos, salir directamente
      navigation.navigate('Home');
    }
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
      {/* Barra Superior Azul con Carrito */}
      <View style={styles.topBar}>
        <TouchableOpacity
          style={styles.topBarBackButton}
          onPress={handleGoBack}
        >
          <Ionicons name="arrow-back" size={24} color="#ffffff" />
        </TouchableOpacity>
        <View style={styles.topBarRight}>
          <View style={styles.topBarCartInfo}>
            <Text style={styles.topBarCartText}>{cartCount.lines} líneas</Text>
            <Text style={styles.topBarCartText}>${cartTotal}</Text>
          </View>
          <TouchableOpacity
            style={styles.topBarCartButton}
            onPress={() => navigation.navigate('Cart')}
          >
            <Ionicons name="cart" size={24} color="#ffffff" />
            {cartCount.lines > 0 && (
              <View style={styles.topBarCartBadge}>
                <Text style={styles.topBarCartBadgeText}>{cartCount.lines}</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>
      </View>

      {/* Barra de Búsqueda y Categorías */}
      <View style={styles.searchBar}>

        <View style={styles.searchRow}>
          {/* Dropdown de Categorías */}
          {categories.length > 0 && (
            <View style={styles.categoryDropdownContainer}>
              <TouchableOpacity 
                style={styles.categoryDropdown}
                onPress={() => setShowCategoryDropdown(!showCategoryDropdown)}
              >
                <Text style={styles.categoryDropdownText}>
                  {selectedCategory || 'Categorías'}
                </Text>
                <Ionicons name={showCategoryDropdown ? "chevron-up" : "chevron-down"} size={20} color="#666" />
              </TouchableOpacity>
              {showCategoryDropdown && (
                <View style={styles.categoryDropdownMenu}>
                  <TouchableOpacity
                    style={styles.categoryDropdownItem}
                    onPress={() => {
                      setSelectedCategory('');
                      setShowCategoryDropdown(false);
                    }}
                  >
                    <Text style={[styles.categoryDropdownItemText, !selectedCategory && styles.categoryDropdownItemTextActive]}>
                      Todas
                    </Text>
                  </TouchableOpacity>
                  {categories.map((category) => (
                    <TouchableOpacity
                      key={category}
                      style={styles.categoryDropdownItem}
                      onPress={() => {
                        setSelectedCategory(category);
                        setShowCategoryDropdown(false);
                      }}
                    >
                      <Text style={[styles.categoryDropdownItemText, selectedCategory === category && styles.categoryDropdownItemTextActive]}>
                        {category}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>
          )}
          
          {/* Campo de Búsqueda */}
          <View style={styles.searchContainer}>
            <Text style={styles.searchIcon}>🔍</Text>
            <TextInput
              style={styles.searchInput}
              placeholder="Buscar..."
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
        </View>
      </View>

      {/* Product List */}
      <FlatList
        data={filteredProducts}
        renderItem={renderProduct}
        keyExtractor={(item) => item.id}
        numColumns={numColumns}
        key={numColumns}
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
  topBar: {
    backgroundColor: '#2563eb',
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  topBarBackButton: {
    padding: 4,
  },
  topBarTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#ffffff',
  },
  topBarRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  topBarCartInfo: {
    alignItems: 'flex-end',
  },
  topBarCartText: {
    fontSize: 11,
    color: '#ffffff',
    fontWeight: '500',
  },
  topBarCartButton: {
    position: 'relative',
    padding: 4,
  },
  topBarCartBadge: {
    position: 'absolute',
    top: -2,
    right: -2,
    backgroundColor: '#ef4444',
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  topBarCartBadgeText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: 'bold',
  },
  searchBar: {
    backgroundColor: '#ffffff',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
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
  headerLeft: {
    flex: 1,
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
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  categoryDropdownContainer: {
    position: 'relative',
    width: 140,
  },
  categoryDropdown: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#f3f4f6',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  categoryDropdownText: {
    fontSize: 14,
    color: '#111827',
    fontWeight: '500',
    flex: 1,
  },
  categoryDropdownMenu: {
    position: 'absolute',
    top: 42,
    left: 0,
    right: 0,
    backgroundColor: '#ffffff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    zIndex: 1000,
    maxHeight: 300,
  },
  categoryDropdownItem: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  categoryDropdownItemText: {
    fontSize: 14,
    color: '#6b7280',
  },
  categoryDropdownItemTextActive: {
    color: '#2563eb',
    fontWeight: '600',
  },
  searchContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f3f4f6',
    borderRadius: 8,
    paddingHorizontal: 12,
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
    aspectRatio: 1,
    resizeMode: 'contain',
    backgroundColor: '#f9fafb',
  },
  productImagePlaceholder: {
    width: '100%',
    aspectRatio: 1,
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
  productCategory: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 6,
  },
  productCategoryText: {
    fontSize: 11,
    color: '#64748b',
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
  viewOptionsButton: {
    flexDirection: 'row',
    backgroundColor: '#ffffff',
    borderWidth: 2,
    borderColor: '#2563eb',
    borderRadius: 6,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  viewOptionsButtonText: {
    color: '#2563eb',
    fontSize: 13,
    fontWeight: '600',
    marginLeft: 6,
  },
  productActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },
  quantityContainer: {
    flex: 0.72,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#f3f4f6',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  quantityButton: {
    padding: 4,
  },
  quantityText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1f2937',
    minWidth: 30,
    textAlign: 'center',
  },
  addToCartButton: {
    flex: 0.28,
    backgroundColor: '#2563eb',
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addToCartButtonDisabled: {
    backgroundColor: '#94a3b8',
  },
  variantsModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  variantsModalContent: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '90%',
    paddingBottom: 20,
  },
  variantsModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  variantsModalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#111827',
    flex: 1,
  },
  variantsModalSubtitle: {
    fontSize: 14,
    color: '#6b7280',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 8,
  },
  variantsModalList: {
    paddingHorizontal: 20,
  },
  variantItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  variantImage: {
    width: 60,
    height: 60,
    borderRadius: 8,
    marginRight: 12,
    backgroundColor: '#f3f4f6',
  },
  variantInfo: {
    flex: 1,
  },
  variantName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 4,
  },
  variantSku: {
    fontSize: 12,
    color: '#6b7280',
  },
  variantPrice: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#2563eb',
    marginTop: 4,
  },
  variantStock: {
    fontSize: 12,
    color: '#6b7280',
  },
  variantControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  variantQuantityContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f3f4f6',
    borderRadius: 6,
    paddingHorizontal: 4,
  },
  variantQuantityButton: {
    padding: 6,
  },
  variantQuantityText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
    minWidth: 30,
    textAlign: 'center',
  },
  variantAddButton: {
    backgroundColor: '#2563eb',
    borderRadius: 6,
    padding: 8,
  },
  variantAddButtonDisabled: {
    opacity: 0.4,
  },
});
