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
import { Picker } from '@react-native-picker/picker';
import { getDatabase } from '../database/db';
import { Product } from '../types';
import { syncCatalog, checkConnection } from '../services/sync';
import { getCachedImagePath } from '../services/imageCache';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { addToCart, removeFromCart, updateCartItemCustomFields } from '../services/cart';

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

// Componente para cada variante en el modal (sin botón individual)
const VariantItem = ({ 
  variant, 
  priceType, 
  quantity,
  onQuantityChange 
}: { 
  variant: Product; 
  priceType?: string; 
  quantity: number;
  onQuantityChange: (variantId: string, qty: number) => void;
}) => {
  // Validación defensiva
  if (!variant || !variant.id || !variant.sku || !variant.name) {
    console.error('❌ VariantItem: Variante inválida', variant);
    return null;
  }
  
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
      onQuantityChange(variant.id, minQty);
    } else {
      onQuantityChange(variant.id, quantity + 1);
    }
  };

  const decrementQuantity = () => {
    const minQty = variant.minQuantity || 1;
    if (quantity > minQty) {
      onQuantityChange(variant.id, quantity - 1);
    } else if (quantity === minQty) {
      onQuantityChange(variant.id, 0);
    }
  };

  const handleQuantityChange = (text: string) => {
    const numValue = parseInt(text) || 0;
    const maxStock = variant.stock || 999;
    const validValue = Math.max(0, Math.min(numValue, maxStock));
    onQuantityChange(variant.id, validValue);
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
        <Text style={styles.variantPrice}>{displayPrice}</Text>
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
          <TextInput
            style={styles.variantQuantityInput}
            value={quantity > 0 ? quantity.toString() : ''}
            onChangeText={handleQuantityChange}
            keyboardType="numeric"
            placeholder="0"
          />
          <TouchableOpacity
            style={styles.variantQuantityButton}
            onPress={incrementQuantity}
          >
            <Ionicons name="add" size={16} color="#64748b" />
          </TouchableOpacity>
        </View>
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
  // Estado para cantidades de variantes (key: variantId, value: quantity)
  const [variantQuantities, setVariantQuantities] = useState<Record<string, number>>({});
  // Estados para configuración dinámica de campos
  const [productFields, setProductFields] = useState<any[]>([]);
  const [cardStyles, setCardStyles] = useState<any>(null);
  // Estados para campos personalizados
  const [customText, setCustomText] = useState('');
  const [customSelect, setCustomSelect] = useState('');
  const [showCustomTextModal, setShowCustomTextModal] = useState(false);
  const [tempCustomText, setTempCustomText] = useState('');
  
  // Calcular precio según tipo de cliente usando la utilidad
  const displayPrice = getProductPrice(item, (priceType as PriceType) || 'ciudad');

  // Cargar imagen solo cuando cambia
  useEffect(() => {
    if (item?.image) {
      getCachedImagePath(item.image).then(setImagePath).catch(() => setImagePath(null));
    }
  }, [item?.image]);

  // Cargar variantes y configuración solo una vez al montar
  useEffect(() => {
    checkHasVariants();
    loadProductFieldsConfig();
  }, []);  // Sin dependencias = solo se ejecuta una vez

  const loadProductFieldsConfig = async () => {
    try {
      const db = getDatabase();
      const fields = await db.getAllAsync<any>(
        `SELECT field, label, enabled, "order", displayType, "column", textColor, fontSize, fontWeight, textAlign, options, maxLength
         FROM product_fields
         WHERE enabled = 1
         ORDER BY "order" ASC`
      );
      // Parsear options de JSON string a array
      const parsedFields = fields.map(f => ({
        ...f,
        options: f.options ? JSON.parse(f.options) : undefined
      }));
      setProductFields(parsedFields);
      
      const styles = await db.getFirstAsync<any>(
        'SELECT marginTop, marginBottom, marginLeft, marginRight, imageSpacing, fieldSpacing FROM card_styles WHERE id = 1'
      );
      setCardStyles(styles);
    } catch (error) {
      console.error('❌ Error al cargar configuración de campos:', error);
    }
  };

  const checkHasVariants = async () => {
    try {
      const db = getDatabase();
      console.log(`🔍 Verificando variantes para producto: ${item.name} (SKU: ${item.sku})`);
      
      const result = await db.getAllAsync<{count: number}>(
        'SELECT COUNT(*) as count FROM products WHERE parentSku = ? AND isActive = 1',
        [item.sku]
      );
      
      const count = result[0]?.count || 0;
      console.log(`   📊 Variantes encontradas: ${count}`);
      
      // Si hay variantes, también mostrar detalles
      if (count > 0) {
        const variantDetails = await db.getAllAsync<Product>(
          'SELECT sku, name, hideInCatalog FROM products WHERE parentSku = ? AND isActive = 1',
          [item.sku]
        );
        console.log(`   📋 Detalles de variantes:`);
        variantDetails.forEach(v => {
          console.log(`      - ${v.name} (${v.sku}) - hideInCatalog: ${v.hideInCatalog}`);
        });
      }
      
      setHasVariants(count > 0);
    } catch (error) {
      console.error('❌ Error al verificar variantes:', error);
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
      console.log(`📦 Cargando variantes para: ${item.name} (${item.sku})`);
      
      // ✅ SOLO cargar variantes VISIBLES (hideInCatalog = 0)
      const result = await db.getAllAsync<Product>(
        `SELECT * FROM products WHERE parentSku = ? AND isActive = 1 AND hideInCatalog = 0 
         ORDER BY 
           CASE WHEN displayOrder IS NULL THEN 0 ELSE 1 END,
           displayOrder ASC, 
           name ASC`,
        [item.sku]
      );
      
      console.log(`   📊 Variantes visibles cargadas: ${result.length}`);
      
      if (result.length > 0) {
        setVariants(result);
        setHasVariants(true);
      } else {
        console.warn(`   ⚠️ No se encontraron variantes visibles para ${item.sku}`);
        setHasVariants(false);
      }
    } catch (error) {
      console.error('❌ Error al cargar variantes:', error);
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

  // Función para renderizar un campo dinámico
  const renderDynamicField = (field: any, index: number) => {
    let value: any = (item as any)[field.field];
    
    // Manejar campo de precio especial
    if (field.field === 'rolePrice' || field.field === 'price') {
      value = displayPrice;
    }

    // Manejar campos personalizados editables
    // Nota: customText y customSelect se renderizan juntos más abajo
    if (field.field === 'customText' || field.field === 'customSelect') {
      return null; // No renderizar individualmente
    }

    if (!value && value !== 0) return null;

    const textStyle = {
      color: field.textColor || '#1e293b',
      fontSize: parseInt(field.fontSize || '12'),
      fontWeight: (field.fontWeight || '400') as any,
      textAlign: (field.textAlign || 'left') as any,
    };

    switch (field.displayType) {
      case 'price':
        return (
          <Text key={index} style={[styles.productPrice, textStyle]}>
            {formatPrice(value)}
          </Text>
        );
      
      case 'badge':
        return (
          <View key={index} style={styles.badgeContainer}>
            <Text style={[styles.badgeText, textStyle]}>
              {value}
            </Text>
          </View>
        );
      
      case 'number':
        if (field.field === 'stock') {
          return (
            <Text key={index} style={[styles.productStock, textStyle]}>
              Stock: {value}
            </Text>
          );
        }
        if (field.field === 'unitsPerBox') {
          return (
            <Text key={index} style={[styles.fieldText, textStyle]}>
              Caja: {value}
            </Text>
          );
        }
        if (field.field === 'minQuantity') {
          return (
            <Text key={index} style={[styles.fieldText, textStyle]}>
              Mín: {value}
            </Text>
          );
        }
        return (
          <Text key={index} style={[styles.fieldText, textStyle]}>
            {field.label}: {value}
          </Text>
        );
      
      case 'multiline':
        return (
          <Text key={index} style={[styles.productName, textStyle]} numberOfLines={2}>
            {value}
          </Text>
        );
      
      default:
        // Para campos de texto normales como name, sku, etc.
        if (field.field === 'name') {
          return (
            <Text key={index} style={[styles.productName, textStyle]} numberOfLines={2}>
              {value}
            </Text>
          );
        }
        if (field.field === 'sku') {
          return (
            <Text key={index} style={[styles.productSku, textStyle]}>
              SKU: {value}
            </Text>
          );
        }
        if (field.field === 'category') {
          return (
            <View key={index} style={styles.productCategory}>
              <Ionicons name="pricetag-outline" size={12} color="#64748b" />
              <Text style={[styles.productCategoryText, textStyle]}>{value}</Text>
            </View>
          );
        }
        return <Text key={index} style={[styles.fieldText, textStyle]}>{value}</Text>;
    }
  };

  const incrementQuantity = () => {
    const minQty = item.minQuantity || 1;
    const newQty = quantity === 0 ? minQty : quantity + 1;
    setQuantity(newQty);
    
    // Auto-agregar al carrito silenciosamente con la nueva cantidad
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
    
    // Auto-agregar al carrito o eliminar si llega a 0
    setTimeout(() => {
      if (newQty > 0) {
        handleAddToCart(newQty);
      } else {
        // Eliminar del carrito cuando la cantidad es 0
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
      
      // 🐛 DEBUG: Verificar valores de customText y customSelect
      console.log('🛒 Agregando al carrito:', {
        productId: item.id,
        productName: item.name,
        quantity: qtyToAdd,
        customText: customText,
        customSelect: customSelect,
      });
      
      await addToCart(productWithPrice, qtyToAdd, customText, customSelect);
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

        {/* Modal de customText */}
        <Modal
          visible={showCustomTextModal}
          transparent={true}
          animationType="slide"
          onRequestClose={() => setShowCustomTextModal(false)}
        >
          <View style={styles.customTextModalOverlay}>
            <View style={styles.customTextModalContent}>
              <Text style={styles.customTextModalTitle}>Ingresar texto</Text>
              <TextInput
                value={tempCustomText}
                onChangeText={setTempCustomText}
                placeholder="Texto"
                maxLength={productFields.find(f => f.field === 'customText')?.maxLength || 8}
                style={styles.customTextModalInput}
                autoFocus={true}
              />
              <View style={styles.customTextModalButtons}>
                <TouchableOpacity
                  style={[styles.customTextModalButton, styles.customTextModalButtonCancel]}
                  onPress={() => setShowCustomTextModal(false)}
                >
                  <Text style={styles.customTextModalButtonText}>Cancelar</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.customTextModalButton, styles.customTextModalButtonConfirm]}
                  onPress={async () => {
                    setCustomText(tempCustomText);
                    setShowCustomTextModal(false);
                    // Actualizar el carrito si el producto ya está agregado
                    if (quantity > 0) {
                      await updateCartItemCustomFields(item.id, tempCustomText, undefined);
                    }
                  }}
                >
                  <Text style={[styles.customTextModalButtonText, styles.customTextModalButtonTextConfirm]}>Aceptar</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
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
              <Text style={styles.variantsModalSubtitle}>Selecciona cantidades:</Text>
              <ScrollView style={styles.variantsModalList}>
                {variants.map((variant) => (
                  <VariantItem
                    key={variant.id}
                    variant={variant}
                    priceType={priceType}
                    quantity={variantQuantities[variant.id] || 0}
                    onQuantityChange={(variantId, qty) => {
                      setVariantQuantities(prev => ({
                        ...prev,
                        [variantId]: qty
                      }));
                    }}
                  />
                ))}
              </ScrollView>
              {/* Barra fija inferior con botón único */}
              <View style={styles.variantsModalFooter}>
                <TouchableOpacity
                  style={[
                    styles.variantsAddAllButton,
                    Object.values(variantQuantities).every(q => q === 0) && styles.variantsAddAllButtonDisabled
                  ]}
                  onPress={async () => {
                    try {
                      setAdding(true);
                      // Agregar todos los variantes con cantidad > 0
                      for (const variant of variants) {
                        const qty = variantQuantities[variant.id] || 0;
                        if (qty > 0) {
                          const productWithPrice = {
                            ...variant,
                            price: getProductPrice(variant, (priceType as PriceType) || 'ciudad').toString(),
                          };
                          await addToCart(productWithPrice, qty);
                        }
                      }
                      // Limpiar cantidades y cerrar modal
                      setVariantQuantities({});
                      setShowVariantsModal(false);
                      if (onAddToCart) onAddToCart();
                    } catch (error) {
                      console.error('Error al agregar variantes:', error);
                      Alert.alert('Error', 'No se pudieron agregar los productos');
                    } finally {
                      setAdding(false);
                    }
                  }}
                  disabled={Object.values(variantQuantities).every(q => q === 0) || adding}
                >
                  <Ionicons name="cart" size={24} color="#ffffff" />
                  <Text style={styles.variantsAddAllButtonText}>
                    {adding ? 'Agregando...' : 'Agregar al Carrito'}
                  </Text>
                </TouchableOpacity>
              </View>
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

        {/* Información del producto - Renderizado dinámico */}
        <View style={styles.productInfo}>
          {productFields.length > 0 ? (
            // Renderizar campos dinámicos según configuración
            <>
              {productFields.map((field, index) => {
                // Agrupar unitsPerBox y stock en una fila
                if (field.field === 'unitsPerBox') {
                  const stockField = productFields.find(f => f.field === 'stock');
                  if (stockField) {
                    return (
                      <View key={index} style={styles.boxStockRow}>
                        <Text style={styles.boxStockText}>Box: {item.unitsPerBox || 0}</Text>
                        <Text style={styles.boxStockText}>{item.stock || 0} stock</Text>
                      </View>
                    );
                  }
                }
                // Saltar el campo stock si ya fue renderizado con unitsPerBox
                if (field.field === 'stock' && productFields.some(f => f.field === 'unitsPerBox')) {
                  return null;
                }
                return renderDynamicField(field, index);
              })}
            </>
          ) : (
            // Fallback: mostrar campos por defecto si no hay configuración
            <>
              <Text style={styles.productName} numberOfLines={2}>{item.name}</Text>
              <Text style={styles.productSku}>SKU: {item.sku}</Text>
              <Text style={styles.productPrice}>{displayPrice || '0.00'}</Text>
              <Text style={styles.productStock}>Stock: {item.stock || 0}</Text>
            </>
          )}
          
          {/* Renderizar customText y customSelect en una fila si están habilitados */}
          {(productFields.some(f => f.field === 'customText') || productFields.some(f => f.field === 'customSelect')) && (
            <View style={styles.customFieldsRow}>
              {productFields.some(f => f.field === 'customText') && (
                <TouchableOpacity 
                  style={styles.customTextCompact}
                  onPress={() => {
                    setTempCustomText(customText);
                    setShowCustomTextModal(true);
                  }}
                >
                  <Text style={styles.customTextPlaceholder}>
                    {customText || 'Texto'}
                  </Text>
                </TouchableOpacity>
              )}
              {productFields.some(f => f.field === 'customSelect') && (
                <View style={styles.customSelectCompact}>
                  <Picker
                    selectedValue={customSelect}
                    onValueChange={async (itemValue) => {
                      setCustomSelect(itemValue);
                      // Actualizar el carrito si el producto ya está agregado
                      if (quantity > 0) {
                        await updateCartItemCustomFields(item.id, undefined, itemValue);
                      }
                    }}
                    style={styles.pickerStyle}
                  >
                    <Picker.Item label="Select" value="" />
                    {(productFields.find(f => f.field === 'customSelect')?.options || []).map((opt: string) => (
                      <Picker.Item key={opt} label={opt} value={opt} />
                    ))}
                  </Picker>
                </View>
              )}
            </View>
          )}
        </View>

        {/* Renderizado condicional según si tiene variantes o no */}
        {hasVariants ? (
          // Producto CON variantes → Botón "Ver opciones"
          <TouchableOpacity
            style={styles.viewOptionsButton}
            onPress={handleViewOptions}
          >
            <Ionicons name="options" size={16} color="#ffffff" />
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
                  // Auto-agregar al carrito o eliminar si es 0
                  if (quantity > 0) {
                    handleAddToCart(quantity);
                  } else {
                    // Eliminar del carrito cuando la cantidad es 0
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
  const [showSortMenu, setShowSortMenu] = useState(false);
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
      
      // OPTIMIZACIÓN: Consulta SQL optimizada que filtra directamente en la base de datos
      // Aplicar ORDER BY al final de toda la consulta para garantizar ordenamiento correcto
      const result = await db.getAllAsync<any>(
        `SELECT 
          p.*,
          COALESCE(v.variantCount, 0) as variantCount,
          COALESCE(v.visibleVariantCount, 0) as visibleVariantCount
         FROM products p
         LEFT JOIN (
           SELECT 
             parentSku,
             COUNT(*) as variantCount,
             SUM(CASE WHEN hideInCatalog = 0 THEN 1 ELSE 0 END) as visibleVariantCount
           FROM products
           WHERE isActive = 1 AND parentSku IS NOT NULL AND parentSku != ''
           GROUP BY parentSku
         ) v ON v.parentSku = p.sku
         WHERE p.isActive = 1 
           AND (p.parentSku IS NULL OR p.parentSku = '')
           AND (
             (v.variantCount > 0 AND v.visibleVariantCount > 0)
             OR (v.variantCount IS NULL AND p.hideInCatalog = 0)
           )
         ORDER BY 
           CASE WHEN p.displayOrder IS NULL THEN 0 ELSE 1 END,
           p.displayOrder ASC, 
           p.name ASC`
      );
      
      console.log(`✅ ${result.length} productos visibles cargados`);
      
      // Validación rápida de campos requeridos
      const validProducts = result.filter((p: Product) => 
        p.id && p.sku && p.name && (p.basePrice || p.priceCity || p.priceInterior || p.priceSpecial)
      );
      
      // ✅ FORZAR ORDENAMIENTO EN JAVASCRIPT para garantizar orden correcto
      // Esto asegura que el orden se respete sin importar cómo SQLite devuelva los datos
      const sortedProducts = validProducts.sort((a, b) => {
        // Productos sin displayOrder primero
        const aHasOrder = a.displayOrder !== null && a.displayOrder !== undefined;
        const bHasOrder = b.displayOrder !== null && b.displayOrder !== undefined;
        
        if (!aHasOrder && bHasOrder) return -1;
        if (aHasOrder && !bHasOrder) return 1;
        
        // Si ambos tienen displayOrder, ordenar por número
        if (aHasOrder && bHasOrder) {
          if (a.displayOrder !== b.displayOrder) {
            return (a.displayOrder || 0) - (b.displayOrder || 0);
          }
        }
        
        // Si tienen el mismo displayOrder (o ambos null), ordenar alfabéticamente
        return a.name.localeCompare(b.name);
      });
      
      console.log('🔢 Productos ordenados:', sortedProducts.slice(0, 5).map(p => ({
        name: p.name,
        displayOrder: p.displayOrder
      })));
      
      setProducts(sortedProducts);
      setFilteredProducts(sortedProducts);
      
      console.log(`🎯 Cargados ${validProducts.length} productos`);
      
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
              try {
                console.log('🗑️ Borrando carrito...');
                // Borrar el carrito de AsyncStorage
                const { clearCart } = require('../services/cart');
                await clearCart();
                console.log('✅ Carrito borrado exitosamente');
                // Regresar al panel principal
                navigation.navigate('DashboardHome' as never);
              } catch (error) {
                console.error('❌ Error al borrar carrito:', error);
                // Intentar navegar de todos modos
                navigation.navigate('DashboardHome' as never);
              }
            },
          },
        ]
      );
    } else {
      // Si no hay productos, salir directamente
      navigation.navigate('DashboardHome' as never);
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
            <Text style={styles.topBarCartText}>{cartTotal}</Text>
          </View>
          <TouchableOpacity
            style={styles.topBarMenuButton}
            onPress={() => setShowSortMenu(!showSortMenu)}
          >
            <Ionicons name="ellipsis-vertical" size={24} color="#ffffff" />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.topBarCartButton}
            onPress={() => navigation.navigate('Cart')}
          >
            <Ionicons name="cart" size={32} color="#FFC107" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Menú de Ordenamiento */}
      {showSortMenu && (
        <View style={styles.sortMenuContainer}>
          <TouchableOpacity
            style={styles.sortMenuItem}
            onPress={async () => {
              setShowSortMenu(false);
              setRefreshing(true);
              try {
                await loadProducts();
                Alert.alert('✅ Éxito', 'Productos reordenados correctamente');
              } catch (error) {
                Alert.alert('❌ Error', 'No se pudo reordenar: ' + (error as Error).message);
              } finally {
                setRefreshing(false);
              }
            }}
          >
            <Ionicons name="swap-vertical" size={20} color="#2563eb" />
            <Text style={styles.sortMenuItemText}>Reordenar productos</Text>
          </TouchableOpacity>
        </View>
      )}

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
                  <ScrollView style={styles.categoryDropdownScroll} nestedScrollEnabled={true}>
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
                  </ScrollView>
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
        removeClippedSubviews={true}
        maxToRenderPerBatch={10}
        updateCellsBatchingPeriod={50}
        initialNumToRender={10}
        windowSize={5}
        // refreshControl desactivado - usar botón de sincronización en panel
        // refreshControl={
        //   <RefreshControl refreshing={refreshing} onRefresh={handleSync} />
        // }
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
  topBarMenuButton: {
    padding: 4,
    marginRight: 8,
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
  sortMenuContainer: {
    position: 'absolute',
    top: 56,
    right: 16,
    backgroundColor: '#ffffff',
    borderRadius: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 10,
    zIndex: 9999,
    minWidth: 200,
  },
  sortMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    gap: 12,
  },
  sortMenuItemText: {
    fontSize: 16,
    color: '#1f2937',
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
  categoryDropdownScroll: {
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
    display: 'flex',
    flexDirection: 'column',
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
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'space-between',
  },
  productName: {
    fontSize: 10,
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
    fontSize: 14,
    fontWeight: 'bold',
    color: '#2563eb',
  },
  productStock: {
    fontSize: 11,
    color: '#6b7280',
  },
  boxStockRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  boxStockText: {
    fontSize: 11,
    color: '#6b7280',
  },
  fieldText: {
    fontSize: 12,
    color: '#1e293b',
    marginBottom: 4,
  },
  badgeContainer: {
    backgroundColor: '#f3f4f6',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    alignSelf: 'flex-start',
    marginBottom: 4,
  },
  badgeText: {
    fontSize: 11,
    color: '#64748b',
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
    backgroundColor: '#2563eb',
    borderWidth: 2,
    borderColor: '#2563eb',
    borderRadius: 6,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  viewOptionsButtonText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '600',
    marginLeft: 6,
  },
  productActions: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    marginTop: 4,
  },
  quantityContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
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
  quantityInput: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1f2937',
    minWidth: 50,
    textAlign: 'center',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 4,
    paddingVertical: 4,
    paddingHorizontal: 8,
    backgroundColor: '#ffffff',
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
  variantQuantityInput: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
    minWidth: 50,
    textAlign: 'center',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 6,
    paddingVertical: 4,
    paddingHorizontal: 8,
    backgroundColor: '#ffffff',
  },
  variantAddButton: {
    backgroundColor: '#2563eb',
    borderRadius: 6,
    padding: 8,
  },
  variantAddButtonDisabled: {
    opacity: 0.4,
  },
  variantsModalFooter: {
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: '#ffffff',
  },
  variantsAddAllButton: {
    backgroundColor: '#2563eb',
    borderRadius: 8,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  variantsAddAllButtonDisabled: {
    opacity: 0.4,
  },
  variantsAddAllButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  customFieldsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },
  customTextCompact: {
    flex: 1,
    height: 24,
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: '#ffffff',
    justifyContent: 'center',
  },
  customTextPlaceholder: {
    fontSize: 12,
    color: '#9ca3af',
  },
  customSelectCompact: {
    flex: 1,
    height: 24,
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 4,
    backgroundColor: '#ffffff',
    overflow: 'hidden',
    justifyContent: 'center',
  },
  pickerStyle: {
    height: 24,
    fontSize: 12,
  },
  customTextModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  customTextModalContent: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 20,
    width: '80%',
    maxWidth: 300,
  },
  customTextModalTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 16,
    textAlign: 'center',
  },
  customTextModalInput: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    marginBottom: 16,
  },
  customTextModalButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  customTextModalButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  customTextModalButtonCancel: {
    backgroundColor: '#f3f4f6',
  },
  customTextModalButtonConfirm: {
    backgroundColor: '#3b82f6',
  },
  customTextModalButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
  },
  customTextModalButtonTextConfirm: {
    color: '#ffffff',
  },
});
