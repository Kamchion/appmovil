import AsyncStorage from '@react-native-async-storage/async-storage';
import { Product, CartItem } from '../types';

/**
 * Servicio de carrito de compras
 * Maneja el carrito en memoria y lo persiste localmente
 */

const CART_STORAGE_KEY = 'shopping_cart';

/**
 * Obtiene el carrito actual
 */
export async function getCart(): Promise<CartItem[]> {
  try {
    const cartJson = await AsyncStorage.getItem(CART_STORAGE_KEY);
    return cartJson ? JSON.parse(cartJson) : [];
  } catch (error) {
    console.error('Error al obtener carrito:', error);
    return [];
  }
}

/**
 * Guarda el carrito
 */
async function saveCart(cart: CartItem[]): Promise<void> {
  try {
    await AsyncStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart));
  } catch (error) {
    console.error('Error al guardar carrito:', error);
  }
}

/**
 * Agrega un producto al carrito
 */
export async function addToCart(
  product: Product,
  quantity: number
): Promise<CartItem[]> {
  const cart = await getCart();
  
  // Verificar si el producto ya está en el carrito
  const existingIndex = cart.findIndex((item) => item.product.id === product.id);

  if (existingIndex >= 0) {
    // Reemplazar cantidad (no sumar)
    cart[existingIndex].quantity = quantity;
  } else {
    // Agregar nuevo item
    cart.push({ product, quantity });
  }

  await saveCart(cart);
  return cart;
}

/**
 * Actualiza la cantidad de un producto en el carrito
 */
export async function updateCartItemQuantity(
  productId: string,
  quantity: number
): Promise<CartItem[]> {
  const cart = await getCart();
  
  const index = cart.findIndex((item) => item.product.id === productId);

  if (index >= 0) {
    if (quantity <= 0) {
      // Eliminar del carrito
      cart.splice(index, 1);
    } else {
      // Actualizar cantidad
      cart[index].quantity = quantity;
    }
  }

  await saveCart(cart);
  return cart;
}

/**
 * Elimina un producto del carrito
 */
export async function removeFromCart(productId: string): Promise<CartItem[]> {
  const cart = await getCart();
  const filteredCart = cart.filter((item) => item.product.id !== productId);
  await saveCart(filteredCart);
  return filteredCart;
}

/**
 * Limpia el carrito
 */
export async function clearCart(): Promise<void> {
  await AsyncStorage.removeItem(CART_STORAGE_KEY);
}

/**
 * Calcula el total del carrito
 */
export function calculateCartTotal(cart: CartItem[]): {
  subtotal: number;
  tax: number;
  total: number;
} {
  const subtotal = cart.reduce((sum, item) => {
    return sum + parseFloat(item.product.price) * item.quantity;
  }, 0);

  const tax = 0; // Puedes agregar lógica de impuestos aquí
  const total = subtotal + tax;

  return { subtotal, tax, total };
}

/**
 * Obtiene la cantidad total de items en el carrito
 */
export function getCartItemCount(cart: CartItem[]): number {
  return cart.reduce((sum, item) => sum + item.quantity, 0);
}
