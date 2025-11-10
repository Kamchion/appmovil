/**
 * Tipos TypeScript para la aplicación móvil de vendedores
 * Actualizado para usar @imporkam/shared-types
 */

// Importar tipos compartidos (una vez instalado el paquete)
// import {
//   Product,
//   ProductListItem,
//   Client,
//   ClientListItem,
//   Order,
//   OrderItem,
//   OrderCreate,
//   PendingOrder,
//   CatalogResponse,
//   ClientsResponse,
//   UploadOrdersResponse,
//   AuthResponse,
//   SyncStatusResponse,
//   PriceType,
//   OrderStatus,
// } from '@imporkam/shared-types';

// Mientras tanto, definimos los tipos localmente con la misma estructura
import { z } from 'zod';

/**
 * Esquema de producto (compatible con @imporkam/shared-types)
 */
export const ProductSchema = z.object({
  id: z.string(),
  sku: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  category: z.string().nullable(),
  subcategory: z.string().nullable(),
  image: z.string().nullable(),
  basePrice: z.string(),
  priceCity: z.string(),
  priceInterior: z.string(),
  priceSpecial: z.string(),
  stock: z.number().int().min(0),
  minQuantity: z.number().int().min(1).default(1),
  updatedAt: z.string(),
  syncedAt: z.string().optional(),
});

export type Product = z.infer<typeof ProductSchema>;

/**
 * Esquema de cliente (compatible con @imporkam/shared-types)
 */
export const ClientSchema = z.object({
  id: z.string(),
  name: z.string().nullable(),
  companyName: z.string().nullable(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  address: z.string().nullable(),
  city: z.string().nullable(),
  priceType: z.enum(['ciudad', 'interior', 'especial']).default('ciudad'),
  status: z.enum(['active', 'inactive', 'pending']).default('active'),
});

export type Client = z.infer<typeof ClientSchema>;

/**
 * Esquema de item de pedido
 */
export const OrderItemSchema = z.object({
  id: z.string(),
  orderId: z.string(),
  productId: z.string(),
  productName: z.string(),
  sku: z.string().optional(),
  quantity: z.number().int().min(1),
  pricePerUnit: z.string(),
  subtotal: z.string(),
  customText: z.string().nullable(),
  customSelect: z.string().nullable(),
});

export type OrderItem = z.infer<typeof OrderItemSchema>;

/**
 * Esquema de pedido
 */
export const OrderSchema = z.object({
  id: z.string(),
  userId: z.string().nullable(),
  clientId: z.string().nullable(),
  orderNumber: z.string().nullable(),
  status: z.enum(['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled']).default('pending'),
  subtotal: z.string(),
  tax: z.string().default('0.00'),
  total: z.string(),
  notes: z.string().nullable(),
  customerName: z.string().nullable(),
  customerContact: z.string().nullable(),
  customerNote: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string().optional(),
  synced: z.boolean().default(false),
});

export type Order = z.infer<typeof OrderSchema>;

/**
 * Esquema de pedido pendiente (para SQLite)
 */
export const PendingOrderSchema = OrderSchema.extend({
  synced: z.number().int().min(0).max(1), // 0 = no sincronizado, 1 = sincronizado
});

export type PendingOrder = z.infer<typeof PendingOrderSchema>;

/**
 * Item del carrito de compras
 */
export interface CartItem {
  product: Product;
  quantity: number;
}

/**
 * Estado de sincronización
 */
export interface SyncStatus {
  lastSyncTimestamp: string | null;
  pendingOrders: number;
  totalProducts: number;
  isOnline: boolean;
}

/**
 * Respuesta de catálogo de productos
 */
export const CatalogResponseSchema = z.object({
  success: z.boolean(),
  timestamp: z.string(),
  products: z.array(ProductSchema),
  totalProducts: z.number().int().optional(),
});

export type CatalogResponse = z.infer<typeof CatalogResponseSchema>;

/**
 * Respuesta de lista de clientes
 */
export const ClientsResponseSchema = z.object({
  success: z.boolean(),
  clients: z.array(ClientSchema),
  totalClients: z.number().int().optional(),
});

export type ClientsResponse = z.infer<typeof ClientsResponseSchema>;

/**
 * Resultado de subida de pedido individual
 */
export const UploadOrderResultSchema = z.object({
  success: z.boolean(),
  orderId: z.string().optional(),
  orderNumber: z.string().optional(),
  createdAtOffline: z.string(),
  error: z.string().optional(),
});

export type UploadOrderResult = z.infer<typeof UploadOrderResultSchema>;

/**
 * Respuesta de subida de pedidos
 */
export const UploadOrdersResponseSchema = z.object({
  success: z.boolean(),
  uploaded: z.number().int().min(0),
  failed: z.number().int().min(0),
  results: z.array(UploadOrderResultSchema),
});

export type UploadOrdersResponse = z.infer<typeof UploadOrdersResponseSchema>;

/**
 * Respuesta de autenticación
 */
export const AuthResponseSchema = z.object({
  success: z.boolean(),
  token: z.string(),
  user: z.object({
    id: z.string(),
    username: z.string(),
    name: z.string().nullable(),
    email: z.string().nullable(),
    role: z.enum(['admin', 'vendedor', 'cliente']),
    priceType: z.enum(['ciudad', 'interior', 'especial']).optional(),
  }),
});

export type AuthResponse = z.infer<typeof AuthResponseSchema>;

/**
 * Helper para validar datos de manera segura
 */
export function validateData<T>(schema: z.ZodSchema<T>, data: unknown): { success: true; data: T } | { success: false; error: string } {
  try {
    const validated = schema.parse(data);
    return { success: true, data: validated };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        success: false,
        error: error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', '),
      };
    }
    return {
      success: false,
      error: 'Error de validación desconocido',
    };
  }
}
