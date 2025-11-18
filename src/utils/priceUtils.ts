/**
 * Utilidades para manejo de precios según tipo de cliente
 */

export type PriceType = 'ciudad' | 'interior' | 'especial';

export interface Product {
  id: string;
  sku: string;
  name: string;
  basePrice: string;
  priceCity?: string;
  priceInterior?: string;
  priceSpecial?: string;
  [key: string]: any;
}

/**
 * Obtiene el precio correcto de un producto según el tipo de cliente
 * 
 * @param product - Producto con los 3 tipos de precios
 * @param priceType - Tipo de precio del cliente ('ciudad', 'interior', 'especial')
 * @returns El precio correspondiente al tipo de cliente
 * 
 * @example
 * const product = {
 *   name: "Oil 3-in-1",
 *   basePrice: "1.40",
 *   priceCity: "1.40",
 *   priceInterior: "1.50",
 *   priceSpecial: "1.57"
 * };
 * 
 * const client = { priceType: "interior" };
 * const price = getProductPrice(product, client.priceType);
 * // Returns: "1.50"
 */
export function getProductPrice(product: Product, priceType: PriceType): string {
  // Validación defensiva: verificar que product existe
  if (!product) {
    console.error('[getProductPrice] Product is null or undefined');
    return '0.00';
  }
  
  // Seleccionar el precio según el tipo de cliente
  if (priceType === 'ciudad' && product.priceCity) {
    return product.priceCity;
  }
  
  if (priceType === 'interior' && product.priceInterior) {
    return product.priceInterior;
  }
  
  if (priceType === 'especial' && product.priceSpecial) {
    return product.priceSpecial;
  }
  
  // Fallback: Si no existe el precio específico, usar basePrice
  // Validación adicional para evitar crash
  if (!product.basePrice) {
    console.error('[getProductPrice] Product has no basePrice:', product.sku || product.id);
    return '0.00';
  }
  
  return product.basePrice;
}

/**
 * Formatea un precio como string a formato de moneda
 * 
 * @param price - Precio como string
 * @param currency - Símbolo de moneda (default: '$')
 * @returns Precio formateado
 * 
 * @example
 * formatPrice("1.50") // Returns: "$1.50"
 * formatPrice("1.50", "Q") // Returns: "Q1.50"
 */
export function formatPrice(price: string, currency: string = ''): string {
  const numPrice = parseFloat(price);
  if (isNaN(numPrice)) {
    return `${currency}0.00`;
  }
  return `${currency}${numPrice.toFixed(2)}`;
}

/**
 * Obtiene el precio formateado de un producto según el tipo de cliente
 * 
 * @param product - Producto con los 3 tipos de precios
 * @param priceType - Tipo de precio del cliente
 * @param currency - Símbolo de moneda (default: '$')
 * @returns Precio formateado con símbolo de moneda
 * 
 * @example
 * const price = getFormattedProductPrice(product, "interior");
 * // Returns: "$1.50"
 */
export function getFormattedProductPrice(
  product: Product,
  priceType: PriceType,
  currency: string = ''
): string {
  const price = getProductPrice(product, priceType);
  return formatPrice(price, currency);
}

/**
 * Calcula el subtotal de un producto según cantidad y tipo de cliente
 * 
 * @param product - Producto con los 3 tipos de precios
 * @param quantity - Cantidad del producto
 * @param priceType - Tipo de precio del cliente
 * @returns Subtotal como string
 * 
 * @example
 * calculateSubtotal(product, 5, "interior")
 * // Returns: "7.50" (1.50 * 5)
 */
export function calculateSubtotal(
  product: Product,
  quantity: number,
  priceType: PriceType
): string {
  const price = parseFloat(getProductPrice(product, priceType));
  const subtotal = price * quantity;
  return subtotal.toFixed(2);
}

/**
 * Obtiene todos los precios de un producto
 * 
 * @param product - Producto con los 3 tipos de precios
 * @returns Objeto con los 3 tipos de precios
 * 
 * @example
 * const prices = getAllPrices(product);
 * // Returns: { ciudad: "1.40", interior: "1.50", especial: "1.57" }
 */
export function getAllPrices(product: Product): {
  ciudad: string;
  interior: string;
  especial: string;
} {
  return {
    ciudad: product.priceCity || product.basePrice,
    interior: product.priceInterior || product.basePrice,
    especial: product.priceSpecial || product.basePrice,
  };
}

/**
 * Verifica si un producto tiene precios diferenciados
 * 
 * @param product - Producto a verificar
 * @returns true si tiene al menos un precio diferenciado
 */
export function hasDifferentiatedPrices(product: Product): boolean {
  return !!(product.priceCity || product.priceInterior || product.priceSpecial);
}
