import NetInfo from '@react-native-community/netinfo';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getDatabase } from '../database/db';
import { getCatalog, uploadPendingOrders, getChanges, getAssignedClients } from './api';
import { getOrders } from './api-orders';
import { updateClientOnServer } from './api-client-update';
import { 
  Product, 
  ProductSchema,
  CatalogResponseSchema,
  ClientsResponseSchema,
  UploadOrdersResponseSchema,
  validateData 
} from '../types/index-new';
import { cacheMultipleImages } from './imageCache';
import { API_BASE_URL } from './api';

const TOKEN_KEY = 'vendor_token';
const USER_KEY = 'vendor_user';
const LAST_SYNC_KEY = 'last_sync_timestamp';

/**
 * Servicio de sincronización mejorado con validación Zod
 * Valida todas las respuestas del servidor antes de procesarlas
 */

/**
 * Obtiene el token de autenticación guardado
 */
export async function getAuthToken(): Promise<string | null> {
  return await AsyncStorage.getItem(TOKEN_KEY);
}

/**
 * Obtiene los datos del usuario guardados
 */
export async function getUserData(): Promise<any | null> {
  const userData = await AsyncStorage.getItem(USER_KEY);
  return userData ? JSON.parse(userData) : null;
}

/**
 * Verifica si hay conexión a internet
 */
export async function checkConnection(): Promise<boolean> {
  const state = await NetInfo.fetch();
  return state.isConnected ?? false;
}

/**
 * Obtiene el timestamp de la última sincronización
 */
export async function getLastSyncTimestamp(): Promise<string | null> {
  return await AsyncStorage.getItem(LAST_SYNC_KEY);
}

/**
 * Guarda el timestamp de la última sincronización
 */
async function setLastSyncTimestamp(timestamp: string): Promise<void> {
  await AsyncStorage.setItem(LAST_SYNC_KEY, timestamp);
}

/**
 * Sincroniza el catálogo de productos con validación
 */
export async function syncCatalogWithValidation(
  onProgress?: (message: string) => void
): Promise<{ success: boolean; message: string; productsUpdated: number }> {
  try {
    onProgress?.('Verificando conexión...');
    const isOnline = await checkConnection();
    
    if (!isOnline) {
      return {
        success: false,
        message: 'Sin conexión a internet',
        productsUpdated: 0,
      };
    }

    onProgress?.('Descargando catálogo...');
    const lastSync = await getLastSyncTimestamp();
    
    // Descargar catálogo (completo o incremental)
    const response = lastSync
      ? await getChanges(lastSync)
      : await getCatalog();

    // ✅ VALIDAR respuesta del servidor con Zod
    const validation = validateData(CatalogResponseSchema, response);
    
    if (!validation.success) {
      console.error('❌ Error de validación:', validation.error);
      return {
        success: false,
        message: `Datos inválidos del servidor: ${validation.error}`,
        productsUpdated: 0,
      };
    }

    const validatedResponse = validation.data;

    if (!validatedResponse.success) {
      throw new Error('Error al descargar catálogo');
    }

    onProgress?.('Guardando productos localmente...');
    const db = getDatabase();
    const now = new Date().toISOString();
    let productsUpdated = 0;

    // Guardar o actualizar productos en la base de datos local
    for (const product of validatedResponse.products) {
      // ✅ VALIDAR cada producto individualmente
      const productValidation = validateData(ProductSchema, product);
      
      if (!productValidation.success) {
        console.warn(`⚠️ Producto inválido (${product.sku}):`, productValidation.error);
        continue; // Saltar productos inválidos
      }

      const validProduct = productValidation.data;

      try {
        await db.runAsync(
          `INSERT OR REPLACE INTO products 
           (id, sku, name, description, category, subcategory, image, basePrice, stock, isActive,
            displayOrder, parentSku, variantName, dimension, line1Text, line2Text, minQuantity,
            location, unitsPerBox, hideInCatalog, customText, customSelect, createdAt, updatedAt, syncedAt)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            validProduct.id,
            validProduct.sku,
            validProduct.name,
            validProduct.description || null,
            validProduct.category || null,
            validProduct.subcategory || null,
            validProduct.image || null,
            validProduct.basePrice,
            validProduct.stock || 0,
            1, // isActive
            null, // displayOrder
            null, // parentSku
            null, // variantName
            null, // dimension
            null, // line1Text
            null, // line2Text
            validProduct.minQuantity || 1,
            null, // location
            0, // unitsPerBox
            0, // hideInCatalog
            null, // customText
            null, // customSelect
            null, // createdAt
            validProduct.updatedAt,
            now,
          ]
        );
        productsUpdated++;
      } catch (error) {
        console.error(`❌ Error guardando producto ${validProduct.sku}:`, error);
      }
    }

    // Actualizar timestamp de última sincronización
    await setLastSyncTimestamp(validatedResponse.timestamp);

    // Cachear imágenes de productos
    onProgress?.('Descargando imágenes...');
    const imageUrls = validatedResponse.products
      .filter((p) => p.image)
      .map((p) => p.image!);
    
    if (imageUrls.length > 0) {
      await cacheMultipleImages(imageUrls, (current, total) => {
        onProgress?.(`Descargando imágenes: ${current}/${total}`);
      });
    }

    // Subir cambios de clientes modificados localmente
    onProgress?.('Subiendo cambios de clientes...');
    try {
      const token = await getAuthToken();
      if (token) {
        const modifiedClients = await db.getAllAsync(
          'SELECT * FROM clients WHERE needsSync = 1'
        );

        for (const client of modifiedClients) {
          try {
            await updateClientOnServer(client);
            await db.runAsync(
              'UPDATE clients SET needsSync = 0, syncedAt = ? WHERE id = ?',
              [now, client.id]
            );
          } catch (error) {
            console.error('Error actualizando cliente:', error);
          }
        }
      }
    } catch (error) {
      console.error('Error en sincronización de clientes:', error);
    }

    // Subir pedidos pendientes
    onProgress?.('Subiendo pedidos pendientes...');
    await syncPendingOrdersWithValidation();

    return {
      success: true,
      message: `✅ ${productsUpdated} productos sincronizados`,
      productsUpdated,
    };
  } catch (error: any) {
    console.error('❌ Error en sincronización:', error);
    return {
      success: false,
      message: error.message || 'Error desconocido',
      productsUpdated: 0,
    };
  }
}

/**
 * Sincroniza pedidos pendientes con validación
 */
export async function syncPendingOrdersWithValidation(): Promise<{
  success: boolean;
  uploaded: number;
  failed: number;
}> {
  try {
    const isOnline = await checkConnection();
    if (!isOnline) {
      return { success: false, uploaded: 0, failed: 0 };
    }

    const db = getDatabase();
    const pendingOrders = await db.getAllAsync(
      'SELECT * FROM pending_orders WHERE synced = 0'
    );

    if (pendingOrders.length === 0) {
      return { success: true, uploaded: 0, failed: 0 };
    }

    // Obtener items de cada pedido
    const ordersWithItems = await Promise.all(
      pendingOrders.map(async (order: any) => {
        const items = await db.getAllAsync(
          'SELECT * FROM pending_order_items WHERE orderId = ?',
          [order.id]
        );
        return { ...order, items };
      })
    );

    // Subir pedidos al servidor
    const response = await uploadPendingOrders(ordersWithItems);

    // ✅ VALIDAR respuesta
    const validation = validateData(UploadOrdersResponseSchema, response);
    
    if (!validation.success) {
      console.error('❌ Error validando respuesta de subida:', validation.error);
      return { success: false, uploaded: 0, failed: pendingOrders.length };
    }

    const validatedResponse = validation.data;

    // Marcar pedidos exitosos como sincronizados
    for (const result of validatedResponse.results) {
      if (result.success && result.orderId) {
        await db.runAsync(
          'UPDATE pending_orders SET synced = 1, orderNumber = ? WHERE id = ?',
          [result.orderNumber || null, result.orderId]
        );
      }
    }

    return {
      success: true,
      uploaded: validatedResponse.uploaded,
      failed: validatedResponse.failed,
    };
  } catch (error) {
    console.error('❌ Error sincronizando pedidos:', error);
    return { success: false, uploaded: 0, failed: 0 };
  }
}

/**
 * Sincroniza clientes asignados con validación
 */
export async function syncClientsWithValidation(
  onProgress?: (message: string) => void
): Promise<{ success: boolean; clientsUpdated: number }> {
  try {
    onProgress?.('Descargando clientes...');
    
    const response = await getAssignedClients();

    // ✅ VALIDAR respuesta
    const validation = validateData(ClientsResponseSchema, response);
    
    if (!validation.success) {
      console.error('❌ Error validando clientes:', validation.error);
      return { success: false, clientsUpdated: 0 };
    }

    const validatedResponse = validation.data;

    if (!validatedResponse.success) {
      throw new Error('Error al descargar clientes');
    }

    const db = getDatabase();
    const now = new Date().toISOString();
    let clientsUpdated = 0;

    for (const client of validatedResponse.clients) {
      try {
        await db.runAsync(
          `INSERT OR REPLACE INTO clients 
           (id, name, email, role, companyName, companyTaxId, phone, address, gpsLocation,
            city, state, zipCode, country, isActive, username, contactPerson, status,
            agentNumber, clientNumber, priceType, assignedVendorId, createdAt, lastSignedIn,
            syncedAt, modifiedAt, needsSync)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            client.id,
            client.name,
            client.email,
            'cliente',
            client.companyName,
            null, // companyTaxId
            client.phone,
            client.address,
            null, // gpsLocation
            client.city,
            null, // state
            null, // zipCode
            null, // country
            client.status === 'active' ? 1 : 0,
            null, // username
            null, // contactPerson
            client.status,
            null, // agentNumber
            null, // clientNumber
            client.priceType,
            null, // assignedVendorId
            null, // createdAt
            null, // lastSignedIn
            now,
            null, // modifiedAt
            0, // needsSync
          ]
        );
        clientsUpdated++;
      } catch (error) {
        console.error(`❌ Error guardando cliente ${client.id}:`, error);
      }
    }

    return { success: true, clientsUpdated };
  } catch (error: any) {
    console.error('❌ Error sincronizando clientes:', error);
    return { success: false, clientsUpdated: 0 };
  }
}
