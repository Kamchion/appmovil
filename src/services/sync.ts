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

    onProgress?.('Descargando catálogo completo...');
    
    // ✅ SIEMPRE descargar catálogo completo para garantizar que todas las variantes
    // y productos estén actualizados, especialmente productos con variantes
    const response = await getCatalog();

    if (!response.success) {
      throw new Error('Error al descargar catálogo');
    }

    onProgress?.('Guardando productos localmente...');
    const db = getDatabase();
    const now = new Date().toISOString();

    console.log(`📦 Procesando ${response.products.length} productos...`);
    
    // Guardar, actualizar o eliminar productos en la base de datos local
    let savedCount = 0;
    let deletedCount = 0;
    
    for (const product of response.products) {
      try {
        // ✅ Si el producto está inactivo, eliminarlo de la BD local
        if (product.isActive === false) {
          await db.runAsync(
            `DELETE FROM products WHERE id = ?`,
            [product.id]
          );
          deletedCount++;
          console.log(`🗑️ Producto eliminado: ${product.name} (${product.sku})`);
          continue;
        }
        
        // Si está activo, guardarlo o actualizarlo
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
    
    console.log(`✅ Sincronización completada:`);
    console.log(`   - ${savedCount} productos guardados/actualizados`);
    console.log(`   - ${deletedCount} productos eliminados`);
    console.log(`   - Total procesados: ${response.products.length}`);
    
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
    
    // Obtener pedidos pendientes (no sincronizados y con status='pending')
    // ✅ Excluir borradores (status='draft') de la sincronización automática
    const pendingOrders = await db.getAllAsync<PendingOrder>(
      "SELECT * FROM pending_orders WHERE synced = 0 AND status = 'pending'"
    );

    console.log(`📊 syncPendingOrders: Encontrados ${pendingOrders.length} pedidos pendientes`);
    console.log('📋 Pedidos:', pendingOrders.map(o => ({ id: o.id, status: o.status, synced: o.synced })));

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
    console.log('📤 Enviando pedidos al servidor:', ordersToUpload.length);
    const response = await uploadPendingOrders(ordersToUpload);
    console.log('📥 Respuesta del servidor:', response);

    if (!response.success) {
      throw new Error('Error al subir pedidos');
    }

    onProgress?.('Actualizando estado local...');

    // Importar la función para generar números B
    const { generateSentOrderNumber } = await import('../utils/orderNumber');

    // Mover pedidos sincronizados a order_history
    for (const result of response.results) {
      if (result.success) {
        // Obtener el pedido original
        const order = await db.getFirstAsync<PendingOrder>(
          'SELECT * FROM pending_orders WHERE createdAt = ?',
          [result.createdAtOffline]
        );
        
        if (order) {
          // Generar nuevo número B para el pedido enviado
          const sentOrderNumber = await generateSentOrderNumber();
          
          // Obtener los items del pedido
          const items = await db.getAllAsync<PendingOrderItem>(
            'SELECT * FROM pending_order_items WHERE orderId = ?',
            [order.id]
          );
          
          // Insertar en order_history con número B y status "enviado"
          const historyResult = await db.runAsync(
            `INSERT INTO order_history (
              orderNumber, clientId, customerName, customerNote,
              subtotal, total, tax, status, synced, createdAt
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              sentOrderNumber, // Nuevo número B
              order.clientId,
              order.customerName,
              order.customerNote,
              order.subtotal,
              order.total,
              order.tax,
              'enviado', // Status cambiado a "enviado"
              1, // synced = 1
              order.createdAt,
            ]
          );
          
          // Obtener el ID generado automáticamente
          const newHistoryId = historyResult.lastInsertRowId;
          
          // Insertar items en order_history_items
          for (const item of items) {
            await db.runAsync(
              `INSERT INTO order_history_items (
                orderId, productId, productName, quantity, pricePerUnit, subtotal
              ) VALUES (?, ?, ?, ?, ?, ?)`,
              [
                newHistoryId, // Usar el nuevo ID de order_history
                item.productId,
                item.productName,
                item.quantity,
                item.pricePerUnit,
                item.subtotal,
              ]
            );
          }
          
          // Eliminar de pending_orders y pending_order_items
          await db.runAsync('DELETE FROM pending_order_items WHERE orderId = ?', [order.id]);
          await db.runAsync('DELETE FROM pending_orders WHERE id = ?', [order.id]);
        }
      }
    }

    return {
      success: true,
      message: `${response.uploaded} pedidos sincronizados`,
      ordersSynced: response.uploaded,
    };
  } catch (error: any) {
    console.error('❌ Error en syncPendingOrders:', error);
    console.error('Stack:', error.stack);
    return {
      success: false,
      message: error.message || 'Error desconocido',
      ordersSynced: 0,
    };
  }
}

/**
 * Sincroniza un solo pedido específico
 */
export async function syncSingleOrder(
  orderId: string,
  onProgress?: (message: string) => void
): Promise<{ success: boolean; message: string }> {
  try {
    onProgress?.('Verificando conexión...');
    const isOnline = await checkConnection();
    
    if (!isOnline) {
      return {
        success: false,
        message: 'Sin conexión a internet',
      };
    }

    onProgress?.('Obteniendo pedido...');
    const db = getDatabase();
    
    // Obtener el pedido específico (puede ser draft o pending)
    const order = await db.getFirstAsync<PendingOrder>(
      "SELECT * FROM pending_orders WHERE id = ? AND status IN ('draft', 'pending')",
      [orderId]
    );

    if (!order) {
      return {
        success: false,
        message: 'Pedido no encontrado o ya fue enviado',
      };
    }

    onProgress?.('Preparando pedido...');

    // Obtener items del pedido
    const items = await db.getAllAsync<PendingOrderItem>(
      'SELECT * FROM pending_order_items WHERE orderId = ?',
      [order.id]
    );

    // Preparar datos para enviar
    const orderToUpload = {
      clientId: order.clientId,
      customerNote: order.customerNote,
      items: items.map((item) => ({
        productId: item.productId,
        quantity: item.quantity,
        pricePerUnit: item.pricePerUnit,
      })),
      createdAtOffline: order.createdAt,
    };

    // Subir pedido al servidor
    onProgress?.('Enviando pedido...');
    const response = await uploadPendingOrders([orderToUpload]);

    if (!response.success || response.results[0]?.success !== true) {
      throw new Error('Error al subir el pedido');
    }

    onProgress?.('Actualizando estado local...');

    // Importar la función para generar números B
    const { generateSentOrderNumber } = await import('../utils/orderNumber');

    // Generar nuevo número B para el pedido enviado
    const sentOrderNumber = await generateSentOrderNumber();
    
    // Insertar en order_history con número B y status "enviado"
    await db.runAsync(
      `INSERT INTO order_history (
        id, orderNumber, clientId, customerName, clientName, customerNote, notes,
        total, tax, status, synced, createdAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        order.id,
        sentOrderNumber,
        order.clientId,
        order.customerName,
        order.clientName,
        order.customerNote,
        order.notes,
        order.total,
        order.tax,
        'enviado',
        1,
        order.createdAt,
      ]
    );
    
    // Insertar items en order_history_items
    for (const item of items) {
      await db.runAsync(
        `INSERT INTO order_history_items (
          id, orderId, productId, sku, quantity, pricePerUnit, price
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          item.id,
          item.orderId,
          item.productId,
          item.sku,
          item.quantity,
          item.pricePerUnit,
          item.price,
        ]
      );
    }
    
    // Eliminar de pending_orders y pending_order_items
    await db.runAsync('DELETE FROM pending_order_items WHERE orderId = ?', [order.id]);
    await db.runAsync('DELETE FROM pending_orders WHERE id = ?', [order.id]);

    return {
      success: true,
      message: 'Pedido enviado correctamente',
    };
  } catch (error: any) {
    console.error('Error en syncSingleOrder:', error);
    return {
      success: false,
      message: error.message || 'Error desconocido',
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
 * Sincronización incremental inteligente
 * Solo sube y descarga cambios desde la última sincronización
 */
export async function incrementalSync(
  onProgress?: (message: string) => void
): Promise<{
  success: boolean;
  message: string;
  productsUpdated: number;
  ordersSynced: number;
  clientsUpdated: number;
}> {
  try {
    const db = getDatabase();
    const lastSync = await getLastSyncTimestamp();
    
    if (!lastSync) {
      // Si no hay sincronización previa, hacer fullSync
      onProgress?.('Primera sincronización, descargando todo...');
      const result = await fullSync(onProgress);
      return {
        ...result,
        clientsUpdated: 0,
      };
    }

    // ========== SUBIR CAMBIOS ==========
    
    // 1. Subir pedidos pendientes
    onProgress?.('Enviando pedidos pendientes...');
    const ordersResult = await syncPendingOrders(onProgress);
    
    // 2. Subir clientes pendientes (nuevos y modificados)
    onProgress?.('Enviando clientes pendientes...');
    const modifiedClients = await db.getAllAsync<any>(
      'SELECT * FROM clients WHERE needsSync = 1'
    );
    
    console.log(`📤 Encontrados ${modifiedClients.length} clientes pendientes de sincronización`);
    
    for (const client of modifiedClients) {
      try {
        const token = await getAuthToken();
        if (!token) {
          console.warn('⚠️ No hay token, omitiendo sincronización de clientes');
          break;
        }

        // Detectar si es cliente nuevo (ID generado localmente) o existente
        const isNewClient = client.id && client.id.toString().length < 20; // IDs locales son timestamps
        
        if (isNewClient) {
          // Cliente creado offline - usar createClientOnServer
          console.log(`✨ Creando cliente nuevo en servidor: ${client.companyName}`);
          const { createClientOnServer } = require('./api-client-update');
          
          await createClientOnServer(token, {
            clientNumber: client.clientNumber || `CLI-${Date.now().toString().slice(-6)}`,
            companyName: client.companyName || 'Sin nombre',
            contactPerson: client.name || client.contactPerson || 'Sin contacto',
            email: client.email || '',
            phone: client.phone || '',
            address: client.address || '',
            gpsLocation: client.gpsLocation || '',
            companyTaxId: client.companyTaxId || '',
            priceType: client.priceType || 'ciudad',
          });
        } else {
          // Cliente existente modificado - usar updateClientOnServer
          console.log(`🔄 Actualizando cliente existente: ${client.companyName}`);
          await updateClientOnServer(token, client.clientNumber, {
            name: client.name,
            email: client.email,
            phone: client.phone,
            address: client.address,
            companyName: client.companyName,
            companyTaxId: client.companyTaxId,
          });
        }
        
        // Marcar como sincronizado
        await db.runAsync(
          'UPDATE clients SET needsSync = 0 WHERE id = ?',
          [client.id]
        );
        
        console.log(`✅ Cliente sincronizado: ${client.companyName}`);
      } catch (error: any) {
        console.error(`❌ Error al sincronizar cliente ${client.companyName}:`, error.message);
        // Continuar con el siguiente cliente aunque falle uno
      }
    }

    // ========== DESCARGAR CAMBIOS ==========
    
    // 3. Descargar cambios en productos
    onProgress?.('Descargando cambios en catálogo...');
    const productChanges = await getChanges(lastSync);
    
    let productsUpdated = 0;
    let imagesDownloaded = 0;
    
    if (productChanges.success && productChanges.products) {
      for (const product of productChanges.products) {
        // Si el producto está inactivo, eliminarlo
        if (!product.isActive) {
          await db.runAsync('DELETE FROM products WHERE id = ?', [product.id]);
          productsUpdated++;
          continue;
        }
        
        // Verificar si la imagen cambió
        const existingProduct = await db.getAllAsync<any>(
          'SELECT image, updatedAt FROM products WHERE id = ?',
          [product.id]
        );
        
        const imageChanged = existingProduct.length === 0 || 
                            existingProduct[0].image !== product.image ||
                            existingProduct[0].updatedAt !== product.updatedAt;
        
        // Actualizar producto
        await db.runAsync(
          `INSERT OR REPLACE INTO products 
           (id, sku, name, description, category, image, basePrice, price, stock, 
            isActive, minimumQuantity, hideInCatalog, parentSku, updatedAt)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            product.id,
            product.sku,
            product.name,
            product.description,
            product.category,
            product.image,
            product.basePrice,
            product.price,
            product.stock,
            product.isActive ? 1 : 0,
            product.minimumQuantity,
            product.hideInCatalog ? 1 : 0,
            product.parentSku || null,
            product.updatedAt,
          ]
        );
        
        productsUpdated++;
        
        // Descargar imagen solo si cambió
        if (imageChanged && product.image) {
          try {
            await cacheMultipleImages([product.image]);
            imagesDownloaded++;
          } catch (error) {
            console.warn('Error al descargar imagen:', product.image);
          }
        }
      }
    }
    
    // 4. Descargar cambios en clientes
    onProgress?.('Descargando cambios en clientes...');
    
    let clientsUpdated = 0;
    
    try {
      const { getClientChanges } = require('./api');
      const clientChanges = await getClientChanges(lastSync);
    
    if (clientChanges.success && clientChanges.clients) {
      for (const client of clientChanges.clients) {
        // Si el cliente fue removido (reasignado a otro vendedor)
        if (client._removed) {
          await db.runAsync('DELETE FROM clients WHERE id = ?', [client.id]);
          clientsUpdated++;
          continue;
        }
        
        // Actualizar o insertar cliente
        await db.runAsync(
          `INSERT OR REPLACE INTO clients 
           (id, name, email, phone, address, companyName, companyTaxId, 
            priceType, isActive, createdAt, updatedAt, needsSync)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
          [
            client.id,
            client.name,
            client.email,
            client.phone,
            client.address,
            client.companyName,
            client.companyTaxId,
            client.priceType || 'ciudad',
            client.isActive ? 1 : 0,
            client.createdAt,
            client.updatedAt,
          ]
        );
        
        clientsUpdated++;
      }
    }
    } catch (error: any) {
      console.error('❌ Error al descargar cambios de clientes:', error.message);
      // Continuar aunque falle la descarga de clientes
    }
    
    // Actualizar timestamp de última sincronización
    const now = new Date().toISOString();
    await AsyncStorage.setItem(LAST_SYNC_KEY, now);
    
    const message = `${productsUpdated} productos, ${clientsUpdated} clientes, ${imagesDownloaded} imágenes actualizadas`;
    
    onProgress?.(message);
    
    return {
      success: true,
      message,
      productsUpdated,
      ordersSynced: ordersResult.ordersSynced,
      clientsUpdated,
    };
  } catch (error: any) {
    console.error('Error en incrementalSync:', error);
    return {
      success: false,
      message: error.message || 'Error desconocido',
      productsUpdated: 0,
      ordersSynced: 0,
      clientsUpdated: 0,
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
