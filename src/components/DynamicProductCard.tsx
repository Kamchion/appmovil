import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  TextInput,
  Modal,
  Alert,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Product } from '../types';
import { getDatabase, getProductFields, getCardStyles } from '../database/db';
import { getCachedImagePath } from '../services/imageCache';
import { addToCart, removeFromCart } from '../services/cart';
import { getProductPrice, formatPrice, type PriceType } from '../utils/priceUtils';

interface DynamicProductCardProps {
  item: Product;
  navigation: any;
  priceType?: string;
  onAddToCart?: () => void;
}

interface FieldConfig {
  field: string;
  label: string;
  enabled: boolean;
  order: number;
  displayType: 'text' | 'badge' | 'price' | 'number' | 'multiline';
  column?: 'full' | 'left' | 'right';
  textColor?: string;
  fontSize?: string;
  fontWeight?: string;
  textAlign?: string;
}

const DynamicProductCard = React.memo(({ item, navigation, priceType, onAddToCart }: DynamicProductCardProps) => {
  const [imagePath, setImagePath] = useState<string | null>(null);
  const [showImageModal, setShowImageModal] = useState(false);
  const [showVariantsModal, setShowVariantsModal] = useState(false);
  const [variants, setVariants] = useState<Product[]>([]);
  const [hasVariants, setHasVariants] = useState(false);
  const [quantity, setQuantity] = useState(0);
  const [adding, setAdding] = useState(false);
  const [variantQuantities, setVariantQuantities] = useState<Record<string, number>>({});
  
  // Estados para configuración dinámica
  const [fields, setFields] = useState<FieldConfig[]>([]);
  const [cardStyles, setCardStyles] = useState<any>(null);
  
  // Calcular precio según tipo de cliente
  const displayPrice = getProductPrice(item, (priceType as PriceType) || 'ciudad');

  useEffect(() => {
    if (item?.image) {
      getCachedImagePath(item.image).then(setImagePath).catch(() => setImagePath(null));
    }
    checkHasVariants();
    loadFieldsAndStyles();
  }, [item?.image, item?.sku]);

  const loadFieldsAndStyles = async () => {
    try {
      const [fieldsData, stylesData] = await Promise.all([
        getProductFields(),
        getCardStyles()
      ]);
      setFields(fieldsData);
      setCardStyles(stylesData);
    } catch (error) {
      console.error('❌ Error al cargar configuración de campos:', error);
    }
  };

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
      console.error('❌ Error al verificar variantes:', error);
      setHasVariants(false);
    }
  };

  const loadVariants = async () => {
    if (variants.length > 0) return;
    
    try {
      const db = getDatabase();
      const result = await db.getAllAsync<Product>(
        'SELECT * FROM products WHERE parentSku = ? AND isActive = 1 AND hideInCatalog = 0 ORDER BY displayOrder ASC, name ASC',
        [item.sku]
      );
      
      if (result.length > 0) {
        setVariants(result);
        setHasVariants(true);
      } else {
        setHasVariants(false);
      }
    } catch (error) {
      console.error('❌ Error al cargar variantes:', error);
      setHasVariants(false);
    }
  };

  const handleViewOptions = async () => {
    await loadVariants();
    if (hasVariants || variants.length > 0) {
      setShowVariantsModal(true);
    } else {
      Alert.alert('Sin variantes', 'Este producto no tiene variantes disponibles');
    }
  };

  if (!item || !item.id || !item.name || !item.sku) {
    console.error('❌ DynamicProductCard: Datos de producto inválidos', item);
    return null;
  }

  const incrementQuantity = () => {
    const minQty = item.minQuantity || 1;
    const newQty = quantity === 0 ? minQty : quantity + 1;
    setQuantity(newQty);
    
    setTimeout(() => {
      if (newQty > 0) {
        handleAddToCart(newQty);
      }
    }, 50);
  };

  const decrementQuantity = () => {
    const minQty = item.minQuantity || 1;
    const newQty = quantity > minQty ? quantity - 1 : (quantity === minQty ? 0 : quantity);
    setQuantity(newQty);
    
    setTimeout(() => {
      if (newQty > 0) {
        handleAddToCart(newQty);
      } else {
        removeFromCart(item.id);
      }
    }, 50);
  };

  const handleAddToCart = async (qty?: number) => {
    const qtyToAdd = qty !== undefined ? qty : quantity;
    if (adding || qtyToAdd === 0) return;
    
    setAdding(true);
    try {
      const productWithPrice = {
        ...item,
        price: displayPrice.toString(),
      };
      
      await addToCart(productWithPrice, qtyToAdd);
      if (onAddToCart) onAddToCart();
    } catch (error) {
      console.error('Error al agregar al carrito:', error);
      Alert.alert('Error', 'No se pudo agregar al carrito');
    } finally {
      setAdding(false);
    }
  };

  // Renderizar valor de campo según configuración
  const renderFieldValue = (field: FieldConfig) => {
    let value: any = (item as any)[field.field];
    
    // Manejar campo de precio especial
    if (field.field === 'rolePrice' || field.field === 'price') {
      value = displayPrice;
    }

    if (!value && value !== 0) return null;

    // Crear estilos dinámicos desde BD (excepto para name y price que son forzados)
    const style = {
      color: field.textColor || '#000000',
      fontSize: parseInt(field.fontSize || '12'),
      fontWeight: (field.fontWeight || '400') as any,
      textAlign: (field.textAlign || 'left') as any,
    };
    
    // Estilos forzados para name y price (ignoran BD)
    const nameStyle = {
      fontSize: 10,
      fontWeight: '600' as any,
      color: '#1e293b',
    };
    
    const priceStyle = {
      fontSize: 14,
      fontWeight: 'bold' as any,
      color: '#2563eb',
    };

    // Aplicar estilos forzados para name y price
    const finalStyle = field.field === 'name' ? nameStyle : 
                       (field.field === 'rolePrice' || field.field === 'price') ? priceStyle : 
                       style;

    switch (field.displayType) {
      case 'price':
        return (
          <Text style={[styles.fieldText, priceStyle]}>
            {formatPrice(value)}
          </Text>
        );
      
      case 'badge':
        return (
          <View style={styles.badgeContainer}>
            <Text style={[styles.badgeText, style]}>
              {value}
            </Text>
          </View>
        );
      
      case 'number':
        if (field.field === 'stock') {
          return (
            <Text style={[styles.fieldText, style]}>
              Stock: {value}
            </Text>
          );
        }
        if (field.field === 'unitsPerBox') {
          return (
            <Text style={[styles.fieldText, style]}>
              Caja: {value}
            </Text>
          );
        }
        if (field.field === 'minQuantity') {
          return (
            <Text style={[styles.fieldText, style]}>
              Mín: {value}
            </Text>
          );
        }
        return (
          <Text style={[styles.fieldText, finalStyle]}>
            {field.label}: {value}
          </Text>
        );
      
      case 'multiline':
        return (
          <Text style={[styles.fieldText, finalStyle]} numberOfLines={2}>
            {value}
          </Text>
        );
      
      default:
        return <Text style={[styles.fieldText, finalStyle]}>{value}</Text>;
    }
  };

  // Agrupar campos por filas con orden personalizado
  const groupFieldsByRow = (fields: FieldConfig[]) => {
    // Separar campos por tipo
    const priceFields = fields.filter(f => f.field === 'rolePrice' || f.field === 'price');
    const customFields = fields.filter(f => f.field === 'customText' || f.field === 'customSelect');
    const otherFields = fields.filter(f => 
      f.field !== 'rolePrice' && 
      f.field !== 'price' && 
      f.field !== 'customText' && 
      f.field !== 'customSelect'
    );

    const rows: FieldConfig[][] = [];
    let currentRow: FieldConfig[] = [];

    // Primero: renderizar campos normales (nombre, stock, etc.)
    otherFields.forEach((field) => {
      const column = field.column || 'full';
      
      if (column === 'full') {
        if (currentRow.length > 0) {
          rows.push(currentRow);
          currentRow = [];
        }
        rows.push([field]);
      } else if (column === 'left') {
        if (currentRow.length > 0) {
          rows.push(currentRow);
          currentRow = [];
        }
        currentRow.push(field);
      } else if (column === 'right') {
        currentRow.push(field);
        rows.push(currentRow);
        currentRow = [];
      } else {
        if (currentRow.length > 0) {
          rows.push(currentRow);
          currentRow = [];
        }
        rows.push([field]);
      }
    });

    if (currentRow.length > 0) {
      rows.push(currentRow);
      currentRow = [];
    }

    // Segundo: customText y customSelect en una fila
    if (customFields.length > 0) {
      rows.push(customFields);
    }

    // Tercero: precio justo antes de cantidad
    if (priceFields.length > 0) {
      rows.push(priceFields);
    }

    return rows;
  };

  const fieldRows = groupFieldsByRow(fields);

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

        {/* Campos dinámicos */}
        <View style={styles.productInfo}>
          {fieldRows.map((row, rowIndex) => (
            <View key={rowIndex} style={styles.fieldRow}>
              {row.map((field, fieldIndex) => (
                <View 
                  key={fieldIndex} 
                  style={[
                    styles.fieldContainer,
                    field.column === 'full' ? styles.fieldFull : styles.fieldHalf
                  ]}
                >
                  {renderFieldValue(field)}
                </View>
              ))}
            </View>
          ))}
        </View>

        {/* Renderizado condicional según si tiene variantes o no */}
        {hasVariants ? (
          <TouchableOpacity
            style={styles.viewOptionsButton}
            onPress={handleViewOptions}
          >
            <Ionicons name="options" size={16} color="#2563eb" />
            <Text style={styles.viewOptionsButtonText}>Ver opciones</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.productActions}>
            <View style={styles.quantityContainer}>
              <TouchableOpacity
                style={styles.quantityButton}
                onPress={decrementQuantity}
              >
                <Ionicons name="remove" size={16} color="#64748b" />
              </TouchableOpacity>
              <TextInput
                style={styles.quantityInput}
                value={quantity > 0 ? quantity.toString() : ''}
                onChangeText={(text) => {
                  const numValue = parseInt(text) || 0;
                  const maxStock = item.stock || 999;
                  const validValue = Math.max(0, Math.min(numValue, maxStock));
                  setQuantity(validValue);
                }}
                onEndEditing={() => {
                  if (quantity > 0) {
                    handleAddToCart(quantity);
                  } else {
                    removeFromCart(item.id);
                  }
                }}
                keyboardType="numeric"
                placeholder="0"
              />
              <TouchableOpacity
                style={styles.quantityButton}
                onPress={incrementQuantity}
              >
                <Ionicons name="add" size={16} color="#64748b" />
              </TouchableOpacity>
            </View>
          </View>
        )}
      </View>
    );
  } catch (error) {
    console.error('❌ Error al renderizar DynamicProductCard:', error, item);
    return null;
  }
});

const styles = StyleSheet.create({
  productCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  productImage: {
    width: '100%',
    height: 150,
    borderRadius: 8,
    marginBottom: 2,
  },
  productImagePlaceholder: {
    width: '100%',
    height: 150,
    borderRadius: 8,
    backgroundColor: '#f1f5f9',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 2,
  },
  productInfo: {
    marginBottom: 8,
  },
  fieldRow: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  fieldContainer: {
    paddingVertical: 2,
  },
  fieldFull: {
    flex: 1,
  },
  fieldHalf: {
    flex: 0.5,
  },
  fieldText: {
    fontSize: 12,
    color: '#1e293b',
  },
  priceText: {
    fontWeight: 'bold',
    fontSize: 14,
    color: '#2563eb',
  },
  badgeContainer: {
    backgroundColor: '#f3f4f6',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    alignSelf: 'flex-start',
  },
  badgeText: {
    fontSize: 11,
    color: '#64748b',
  },
  viewOptionsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#eff6ff',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    gap: 6,
  },
  viewOptionsButtonText: {
    color: '#2563eb',
    fontSize: 14,
    fontWeight: '600',
  },
  productActions: {
    marginTop: 8,
  },
  quantityContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f1f5f9',
    borderRadius: 8,
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  quantityButton: {
    padding: 8,
  },
  quantityInput: {
    flex: 1,
    textAlign: 'center',
    fontSize: 14,
    fontWeight: '600',
    color: '#1e293b',
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
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  imageModalClose: {
    position: 'absolute',
    top: 20,
    right: 20,
  },
});

export default DynamicProductCard;
