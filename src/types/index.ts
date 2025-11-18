/**
 * Tipos TypeScript para la aplicación de vendedores
 */

export interface Product {
  id: string;
  sku: string;
  name: string;
  description: string | null;
  category: string | null;
  subcategory: string | null;
  image: string | null;
  basePrice: string;
  price?: string;
  stock: number;
  isActive?: number | boolean;
  displayOrder: number | null;
  parentSku: string | null;
  variantName: string | null;
  dimension: string | null;
  line1Text: string | null;
  line2Text: string | null;
  minQuantity: number;
  minimumQuantity?: number;
  location: string | null;
  unitsPerBox: number;
  hideInCatalog: number | boolean;
  customText: string | null;
  customSelect: string | null;
  createdAt: string | null;
  updatedAt: string;
  syncedAt: string;
}

export interface PendingOrder {
  id: string;
  clientId?: string;
  customerNote?: string;
  subtotal: string;
  tax: string;
  total: string;
  createdAt: string;
  synced: number; // 0 = no sincronizado, 1 = sincronizado
}

export interface PendingOrderItem {
  id: string;
  orderId: string;
  productId: string;
  productName: string;
  quantity: number;
  pricePerUnit: string;
  customText?: string;
  customSelect?: string;
}

export interface CartItem {
  product: Product;
  quantity: number;
  customText?: string;
  customSelect?: string;
}

export interface SyncStatus {
  lastSyncTimestamp: string | null;
  pendingOrders: number;
  totalProducts: number;
  isOnline: boolean;
}

export interface ApiCatalogResponse {
  success: boolean;
  timestamp: string;
  products: Array<{
    id: string;
    sku: string;
    name: string;
    description: string | null;
    category: string | null;
    subcategory: string | null;
    image: string | null;
    basePrice: string;
    price: string;
    stock: number;
    isActive: boolean;
    displayOrder: number | null;
    parentSku: string | null;
    variantName: string | null;
    dimension: string | null;
    line1Text: string | null;
    line2Text: string | null;
    minQuantity: number;
    minimumQuantity: number;
    location: string | null;
    unitsPerBox: number;
    hideInCatalog: boolean;
    customText: string | null;
    customSelect: string | null;
    createdAt: string | null;
    updatedAt: string;
  }>;
  totalProducts?: number;
}

export interface ApiUploadOrdersResponse {
  success: boolean;
  uploaded: number;
  failed: number;
  results: Array<{
    success: boolean;
    orderId?: string;
    createdAtOffline: string;
  }>;
  errors: Array<{
    success: boolean;
    error: string;
    createdAtOffline: string;
  }>;
}
