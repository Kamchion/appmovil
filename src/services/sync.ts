import NetInfo from '@react-native-community/netinfo';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getDatabase } from '../database/db';
import { getCatalog, uploadPendingOrders, getChanges, getAssignedClients } from './api';
import { getOrders } from './api-orders';
import { updateClientOnServer } from './api-client-update';
import { Product, PendingOrder, PendingOrderItem } from '../types';
import { cacheMultipleImages } from './imageCache';
import { API_BASE_URL } from './api';

const TOKEN_KEY = 'vendor_token';
const USER_KEY = 'vendor_user';

/**
 * Servicio de sincronización offline/online
 * Coordina la descarga de catálogo y subida de pedidos
 */

const LAST_SYNC_KEY = 'last_sync_timestamp';

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
 * Sincroniza el catálogo de productos
 * Descarga productos del servidor y los guarda localmente
 */
export async function syncCatalog(
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

    if (!response.success) {
      throw new Error('Error al descargar catálogo');
    }

    onProgress?.('Guardando productos localmente...');
    const db = getDatabase();
    const now = new Date().toISOString();

    console.log(`📦 Guardando ${response.products.length} productos en SQLite...`);
    
    // Guardar o actualizar productos en la base de datos local
    let savedCount = 0;
    for (const product of response.products) {
      try {
      await db.runAsync(
        `INSERT OR REPLACE INTO products 
         (id, sku, name, description, category, subcategory, image, basePrice, priceCity, priceInterior, priceSpecial, stock, isActive,
          displayOrder, parentSku, variantName, dimension, line1Text, line2Text, minQuantity,
          location, unitsPerBox, hideInCatalog, customText, customSelect, createdAt, updatedAt, syncedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          product.id,
          product.sku,
          product.name,
          product.description || null,
          product.category || null,
          product.subcategory || null,
          product.image || null,
          product.basePrice,
          product.priceCity || product.basePrice,
          product.priceInterior || product.basePrice,
          product.priceSpecial || product.basePrice,
          product.stock || 0,
          product.isActive !== undefined ? (product.isActive ? 1 : 0) : 1,
          product.displayOrder || null,
          product.parentSku || null,
          product.variantName || null,
          product.dimension || null,
          product.line1Text || null,
          product.line2Text || null,
          product.minQuantity || 1,
          product.location || null,
          product.unitsPerBox || 0,
          product.hideInCatalog !== undefined ? (product.hideInCatalog ? 1 : 0) : 0,
          product.customText || null,
          product.customSelect || null,
          product.createdAt || null,
          product.updatedAt,
          now,
        ]
      );
        savedCount++;
      } catch (insertError) {
        console.error(`❌ Error al guardar producto ${product.id}:`, insertError);
        console.error('Datos del producto:', JSON.stringify(product, null, 2));
      }
    }
    
    console.log(`✅ ${savedCount}/${response.products.length} productos guardados en SQLite`);
    
    // Verificar que se guardaron
    const verifyCount = await db.getAllAsync('SELECT COUNT(*) as count FROM products');
    console.log(`🔍 Total de productos en BD: ${verifyCount[0]?.count || 0}`);

    // Actualizar timestamp de última sincronización
    await setLastSyncTimestamp(response.timestamp);

    // Cachear imágenes de productos
    onProgress?.('Descargando imágenes...');
    const imageUrls = response.products
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
          `SELECT * FROM clients WHERE needsSync = 1`
        );

        if (modifiedClients.length > 0) {
          console.log(`🔄 Subiendo ${modifiedClients.length} clientes modificados...`);
          
          for (const client of modifiedClients) {
            try {
              await updateClientOnServer(token, client.id, {
                name: client.name,
                email: client.email,
                companyName: client.companyName,
                companyTaxId: client.companyTaxId,
                phone: client.phone,
                address: client.address,
                gpsLocation: client.gpsLocation,
                city: client.city,
                state: client.state,
                zipCode: client.zipCode,
                country: client.country,
                contactPerson: client.contactPerson,
                priceType: client.priceType,
              });

              // Marcar como sincronizado
              await db.runAsync(
                `UPDATE clients SET needsSync = 0, syncedAt = ? WHERE id = ?`,
                [now, client.id]
              );

              console.log(`✅ Cliente ${client.id} sincronizado`);
            } catch (clientError) {
              console.error(`❌ Error al sincronizar cliente ${client.id}:`, clientError);
            }
          }
        }
      }
    } catch (uploadError) {
      console.warn('⚠️ Error al subir cambios de clientes:', uploadError);
    }

    // Sincronizar clientes asignados (descargar del servidor)
    onProgress?.('Sincronizando clientes...');
    try {
      const clientsResponse = await getAssignedClients();
      if (clientsResponse.success && clientsResponse.clients) {
        for (const client of clientsResponse.clients) {
          await db.runAsync(
            `INSERT OR REPLACE INTO clients 
             (id, name, email, role, companyName, companyTaxId, phone, address, gpsLocation, 
              city, state, zipCode, country, isActive, username, contactPerson, status, 
              agentNumber, clientNumber, priceType, assignedVendorId, createdAt, lastSignedIn, syncedAt)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              client.id,
              client.name || null,
              client.email || null,
              client.role || 'cliente',
              client.companyName || null,
              client.companyTaxId || null,
              client.phone || null,
              client.address || null,
              client.gpsLocation || null,
              client.city || null,
              client.state || null,
              client.zipCode || null,
              client.country || null,
              client.isActive ? 1 : 0,
              client.username || null,
              client.contactPerson || null,
              client.status || 'active',
              client.agentNumber || null,
              client.clientNumber || null,
              client.priceType || 'ciudad',
              client.assignedVendorId || null,
              client.createdAt || null,
              client.lastSignedIn || null,
              now,
            ]
          );
        }
        console.log(`✅ ${clientsResponse.clients.length} clientes sincronizados`);
      }
    } catch (clientError) {
      console.warn('⚠️ Error al sincronizar clientes:', clientError);
      // No fallar la sincronización completa si falla la sincronización de clientes
    }

    // Sincronizar historial de pedidos
    onProgress?.('Sincronizando historial de pedidos...');
    try {
      const token = await getAuthToken();
      if (!token) {
        throw new Error('No hay token de autenticación');
      }
      const historyResponse = await getOrders(token);
      if (historyResponse.success && historyResponse.orders) {
        for (const order of historyResponse.orders) {
          // Insertar pedido en historial
          await db.runAsync(
            `INSERT OR REPLACE INTO order_history 
             (id, userId, clientId, orderNumber, status, subtotal, tax, total, notes, 
              customerName, customerContact, customerNote, createdAt, updatedAt, syncedAt)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              order.id,
              order.userId,
              order.clientId,
              order.orderNumber,
              order.status,
              order.subtotal,
              order.tax,
              order.total,
              order.notes || null,
              order.customerName || null,
              order.customerContact || null,
              order.customerNote || null,
              order.createdAt,
              order.updatedAt,
              now,
            ]
          );

          // Insertar items del pedido
          for (const item of order.items) {
            await db.runAsync(
              `INSERT OR REPLACE INTO order_history_items 
               (id, orderId, productId, productName, quantity, pricePerUnit, subtotal, customText, customSelect)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [
                item.id,
                order.id,
                item.productId,
                item.productName,
                item.quantity,
                item.pricePerUnit,
                item.subtotal,
                item.customText || null,
                item.customSelect || null,
              ]
            );
          }
        }
        console.log(`✅ ${historyResponse.orders.length} pedidos del historial sincronizados`);
      }
    } catch (historyError) {
      console.warn('⚠️ Error al sincronizar historial:', historyError);
      // No fallar la sincronización completa si falla el historial
    }

    return {
      success: true,
      message: `${response.products.length} productos actualizados`,
      productsUpdated: response.products.length,
    };
  } catch (error: any) {
    console.error('Error en syncCatalog:', error);
    return {
      success: false,
      message: error.message || 'Error desconocido',
      productsUpdated: 0,
    };
  }
}

/**
 * Sincroniza pedidos pendientes
 * Sube pedidos creados offline al servidor
 */
export async function syncPendingOrders(
  onProgress?: (message: string) => void
): Promise<{ success: boolean; message: string; ordersSynced: number }> {
  try {
    onProgress?.('Verificando conexión...');
    const isOnline = await checkConnection();
    
    if (!isOnline) {
      return {
        success: false,
        message: 'Sin conexión a internet',
        ordersSynced: 0,
      };
    }

    onProgress?.('Obteniendo pedidos pendientes...');
    const db = getDatabase();
    
    // Obtener pedidos pendientes (no sincronizados)
    const pendingOrders = await db.getAllAsync<PendingOrder>(
      'SELECT * FROM pending_orders WHERE synced = 0'
    );

    if (pendingOrders.length === 0) {
      return {
        success: true,
        message: 'No hay pedidos pendientes',
        ordersSynced: 0,
      };
    }

    onProgress?.(`Subiendo ${pendingOrders.length} pedidos...`);

    // Preparar datos para enviar
    const ordersToUpload = await Promise.all(
      pendingOrders.map(async (order) => {
        const items = await db.getAllAsync<PendingOrderItem>(
          'SELECT * FROM pending_order_items WHERE orderId = ?',
          [order.id]
        );

        return {
          clientId: order.clientId,
          customerNote: order.customerNote,
          items: items.map((item) => ({
            productId: item.productId,
            quantity: item.quantity,
            pricePerUnit: item.pricePerUnit,
          })),
          createdAtOffline: order.createdAt,
        };
      })
    );

    // Subir pedidos al servidor
    const response = await uploadPendingOrders(ordersToUpload);

    if (!response.success) {
      throw new Error('Error al subir pedidos');
    }

    onProgress?.('Actualizando estado local...');

    // Marcar pedidos como sincronizados
    for (const result of response.results) {
      if (result.success) {
        await db.runAsync(
          'UPDATE pending_orders SET synced = 1 WHERE createdAt = ?',
          [result.createdAtOffline]
        );
      }
    }

    return {
      success: true,
      message: `${response.uploaded} pedidos sincronizados`,
      ordersSynced: response.uploaded,
    };
  } catch (error: any) {
    console.error('Error en syncPendingOrders:', error);
    return {
      success: false,
      message: error.message || 'Error desconocido',
      ordersSynced: 0,
    };
  }
}

/**
 * Sincronización completa (catálogo + pedidos)
 */
export async function fullSync(
  onProgress?: (message: string) => void
): Promise<{
  success: boolean;
  message: string;
  productsUpdated: number;
  ordersSynced: number;
}> {
  try {
    // Primero sincronizar pedidos pendientes
    const ordersResult = await syncPendingOrders(onProgress);
    
    // Luego sincronizar catálogo
    const catalogResult = await syncCatalog(onProgress);

    const success = ordersResult.success && catalogResult.success;
    const message = success
      ? 'Sincronización completa exitosa'
      : 'Sincronización completada con errores';

    return {
      success,
      message,
      productsUpdated: catalogResult.productsUpdated,
      ordersSynced: ordersResult.ordersSynced,
    };
  } catch (error: any) {
    console.error('Error en fullSync:', error);
    return {
      success: false,
      message: error.message || 'Error desconocido',
      productsUpdated: 0,
      ordersSynced: 0,
    };
  }
}

/**
 * Configura sincronización automática al detectar conexión
 */
export function setupAutoSync(
  onSyncComplete?: (result: any) => void
): () => void {
  const unsubscribe = NetInfo.addEventListener((state) => {
    if (state.isConnected) {
      console.log('🌐 Conexión detectada, iniciando sincronización automática...');
      fullSync().then((result) => {
        console.log('✅ Sincronización automática completada:', result);
        onSyncComplete?.(result);
      });
    }
  });

  return unsubscribe;
}
