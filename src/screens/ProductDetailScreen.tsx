import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Alert,
} from 'react-native';
import { Product } from '../types';
import { addToCart } from '../services/cart';
import { getCachedImagePath } from '../services/imageCache';

interface ProductDetailScreenProps {
  route: {
    params: {
      product: Product;
    };
  };
  navigation: any;
}

export default function ProductDetailScreen({
  route,
  navigation,
}: ProductDetailScreenProps) {
  const { product } = route.params;
  const [quantity, setQuantity] = useState((product.minQuantity || product.minimumQuantity || 1).toString());
  const [imagePath, setImagePath] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadImage();
  }, []);

  const loadImage = async () => {
    if (product.image) {
      const path = await getCachedImagePath(product.image);
      setImagePath(path);
    }
  };

  const handleAddToCart = async () => {
    const qty = parseInt(quantity);

    const minQty = product.minQuantity || product.minimumQuantity || 1;
    if (isNaN(qty) || qty < minQty) {
      Alert.alert(
        'Cantidad inválida',
        `La cantidad mínima es ${minQty}`
      );
      return;
    }

    if (qty > product.stock) {
      Alert.alert('Stock insuficiente', `Solo hay ${product.stock} unidades disponibles`);
      return;
    }

    setLoading(true);

    try {
      await addToCart(product, qty);
      Alert.alert('Éxito', 'Producto agregado al carrito', [
        {
          text: 'Ver carrito',
          onPress: () => navigation.navigate('Cart'),
        },
        {
          text: 'Continuar comprando',
          style: 'cancel',
        },
      ]);
    } catch (error) {
      Alert.alert('Error', 'No se pudo agregar al carrito');
    } finally {
      setLoading(false);
    }
  };

  const incrementQuantity = () => {
    const current = parseInt(quantity) || 0;
    const newQty = current + 1;
    if (newQty <= product.stock) {
      setQuantity(newQty.toString());
    }
  };

  const decrementQuantity = () => {
    const current = parseInt(quantity) || 0;
    const newQty = current - 1;
    const minQty = product.minQuantity || product.minimumQuantity || 1;
    if (newQty >= minQty) {
      setQuantity(newQty.toString());
    }
  };

  return (
    <ScrollView style={styles.container}>
      {imagePath ? (
        <Image source={{ uri: imagePath }} style={styles.productImage} />
      ) : (
        <View style={styles.imagePlaceholder}>
          <Text style={styles.placeholderText}>Sin imagen</Text>
        </View>
      )}

      <View style={styles.content}>
        <Text style={styles.productName}>{product.name}</Text>
        <Text style={styles.productSku}>SKU: {product.sku}</Text>
        
        {product.category && (
          <View style={styles.categoryBadge}>
            <Text style={styles.categoryText}>{product.category}</Text>
          </View>
        )}

        <View style={styles.priceContainer}>
          <Text style={styles.price}>${product.price || product.basePrice}</Text>
          <Text style={styles.stock}>Stock: {product.stock || 0}</Text>
        </View>

        {product.description && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Descripción</Text>
            <Text style={styles.description}>{product.description}</Text>
          </View>
        )}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Cantidad</Text>
          <Text style={styles.minimumNote}>
            Cantidad mínima: {product.minQuantity || product.minimumQuantity || 1}
          </Text>

          <View style={styles.quantityContainer}>
            <TouchableOpacity
              style={styles.quantityButton}
              onPress={decrementQuantity}
            >
              <Text style={styles.quantityButtonText}>-</Text>
            </TouchableOpacity>

            <TextInput
              style={styles.quantityInput}
              value={quantity}
              onChangeText={setQuantity}
              keyboardType="numeric"
            />

            <TouchableOpacity
              style={styles.quantityButton}
              onPress={incrementQuantity}
            >
              <Text style={styles.quantityButtonText}>+</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.totalContainer}>
          <Text style={styles.totalLabel}>Total:</Text>
          <Text style={styles.totalAmount}>
            ${(parseFloat(product.price || product.basePrice) * (parseInt(quantity) || 0)).toFixed(2)}
          </Text>
        </View>

        <TouchableOpacity
          style={[styles.addButton, loading && styles.addButtonDisabled]}
          onPress={handleAddToCart}
          disabled={loading}
        >
          <Text style={styles.addButtonText}>
            {loading ? 'Agregando...' : 'Agregar al carrito'}
          </Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  productImage: {
    width: '100%',
    height: 300,
    resizeMode: 'cover',
  },
  imagePlaceholder: {
    width: '100%',
    height: 300,
    backgroundColor: '#e2e8f0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderText: {
    fontSize: 16,
    color: '#64748b',
  },
  content: {
    padding: 20,
  },
  productName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1e293b',
    marginBottom: 8,
  },
  productSku: {
    fontSize: 14,
    color: '#64748b',
    marginBottom: 12,
  },
  categoryBadge: {
    backgroundColor: '#dbeafe',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    alignSelf: 'flex-start',
    marginBottom: 16,
  },
  categoryText: {
    fontSize: 12,
    color: '#2563eb',
    fontWeight: '600',
  },
  priceContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  price: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#2563eb',
  },
  stock: {
    fontSize: 14,
    color: '#64748b',
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1e293b',
    marginBottom: 8,
  },
  description: {
    fontSize: 14,
    color: '#475569',
    lineHeight: 22,
  },
  minimumNote: {
    fontSize: 12,
    color: '#64748b',
    marginBottom: 12,
  },
  quantityContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  quantityButton: {
    width: 50,
    height: 50,
    backgroundColor: '#2563eb',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  quantityButtonText: {
    fontSize: 24,
    color: '#fff',
    fontWeight: 'bold',
  },
  quantityInput: {
    width: 100,
    height: 50,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 8,
    textAlign: 'center',
    fontSize: 18,
    fontWeight: '600',
    marginHorizontal: 12,
  },
  totalContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    padding: 16,
    borderRadius: 8,
    marginBottom: 16,
  },
  totalLabel: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1e293b',
  },
  totalAmount: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#2563eb',
  },
  addButton: {
    backgroundColor: '#2563eb',
    borderRadius: 8,
    padding: 18,
    alignItems: 'center',
  },
  addButtonDisabled: {
    opacity: 0.6,
  },
  addButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
});
