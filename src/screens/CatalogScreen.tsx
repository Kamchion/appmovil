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

interface CatalogScreenProps {
  navigation: any;
}

export default function CatalogScreen({ navigation }: CatalogScreenProps) {
  const [products, setProducts] = useState<Product[]>([]);
  const [filteredProducts, setFilteredProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [isOnline, setIsOnline] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');

  useEffect(() => {
    loadProducts();
    checkConnectionStatus();
  }, []);

  useEffect(() => {
    filterProducts();
  }, [searchQuery, selectedCategory, products]);

  const checkConnectionStatus = async () => {
    const online = await checkConnection();
    setIsOnline(online);
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
      
      const result = await db.getAllAsync<Product>(
        'SELECT * FROM products WHERE isActive = 1 AND hideInCatalog = 0 ORDER BY displayOrder ASC, name ASC'
      );
      console.log(`✅ ${result.length} productos cargados exitosamente`);
      setProducts(result);
      setFilteredProducts(result);
      
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

  const renderProduct = ({ item }: { item: Product }) => {
    const [imagePath, setImagePath] = useState<string | null>(null);

    useEffect(() => {
      if (item.image) {
        getCachedImagePath(item.image).then(setImagePath);
      }
    }, [item.image]);

    return (
      <TouchableOpacity
        style={styles.productCard}
        onPress={() => navigation.navigate('ProductDetail', { product: item })}
      >
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
        <View style={styles.productInfo}>
          <Text style={styles.productName} numberOfLines={2}>
            {item.name}
          </Text>
          <Text style={styles.productSku}>SKU: {item.sku}</Text>
          {item.category && (
            <View style={styles.categoryBadge}>
              <Text style={styles.categoryText}>{item.category}</Text>
            </View>
          )}
          <View style={styles.productPricing}>
            <Text style={styles.productPrice}>${item.basePrice}</Text>
            <Text style={styles.productStock}>Stock: {item.stock}</Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

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
          <View style={[styles.statusBadge, isOnline ? styles.onlineBadge : styles.offlineBadge]}>
            <Text style={styles.statusText}>
              {isOnline ? '🌐 Online' : '📱 Offline'}
            </Text>
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
