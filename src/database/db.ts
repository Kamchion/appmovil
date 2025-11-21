import * as SQLite from 'expo-sqlite';

/**
 * Base de datos local SQLite para almacenamiento offline
 * Esquema espejo exacto de las tablas del backend web
 */

const DB_NAME = 'vendedor_offline.db';
const DB_VERSION = 7; // Incrementar cuando hay cambios en el esquema

let db: SQLite.SQLiteDatabase | null = null;

/**
 * Inicializa la base de datos y crea las tablas necesarias
 * Esquema espejo exacto del backend web
 */
export async function initDatabase(): Promise<void> {
  try {
    if (db) {
      console.log('✅ Base de datos ya inicializada');
      return;
    }
    
    db = await SQLite.openDatabaseAsync(DB_NAME);
    
    // Verificar versión de la base de datos
    await migrateDatabase(db);
    
    // Crear tabla de productos (espejo de products en web)
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS products (
        id TEXT,
        sku TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        category TEXT,
        subcategory TEXT,
        image TEXT,
        basePrice TEXT NOT NULL,
        priceCity TEXT,
        priceInterior TEXT,
        priceSpecial TEXT,
        stock INTEGER DEFAULT 0,
        isActive INTEGER DEFAULT 1,
        displayOrder INTEGER,
        parentSku TEXT,
        variantName TEXT,
        dimension TEXT,
        line1Text TEXT,
        line2Text TEXT,
        minQuantity INTEGER DEFAULT 1,
        location TEXT,
        unitsPerBox INTEGER DEFAULT 0,
        hideInCatalog INTEGER DEFAULT 0,
        customText TEXT,
        customSelect TEXT,
        createdAt TEXT,
        updatedAt TEXT NOT NULL,
        syncedAt TEXT NOT NULL
      );
    `);

    // Crear tabla de clientes (espejo de users con role='cliente' en web)
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS clients (
        id TEXT PRIMARY KEY,
        name TEXT,
        email TEXT,
        role TEXT DEFAULT 'cliente',
        companyName TEXT,
        companyTaxId TEXT,
        phone TEXT,
        address TEXT,
        gpsLocation TEXT,
        city TEXT,
        state TEXT,
        zipCode TEXT,
        country TEXT,
        isActive INTEGER DEFAULT 1,
        username TEXT,
        contactPerson TEXT,
        status TEXT DEFAULT 'active',
        agentNumber TEXT,
        clientNumber TEXT,
        priceType TEXT DEFAULT 'ciudad',
        assignedVendorId TEXT,
        createdAt TEXT,
        lastSignedIn TEXT,
        syncedAt TEXT,
        modifiedAt TEXT,
        needsSync INTEGER DEFAULT 0
      );
    `);

    // Crear tabla de precios por tipo (espejo de pricingByType en web)
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS pricing_by_type (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        productId TEXT NOT NULL,
        priceType TEXT NOT NULL,
        price TEXT NOT NULL,
        minQuantity INTEGER DEFAULT 1,
        createdAt TEXT,
        updatedAt TEXT,
        UNIQUE(productId, priceType)
      );
    `);

    // Crear tabla de pedidos pendientes (espejo de orders en web)
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS pending_orders (
        id TEXT PRIMARY KEY,
        userId TEXT,
        clientId TEXT,
        orderNumber TEXT,
        status TEXT DEFAULT 'pending',
        subtotal TEXT NOT NULL,
        tax TEXT DEFAULT '0.00',
        total TEXT NOT NULL,
        notes TEXT,
        customerName TEXT,
        customerContact TEXT,
        customerNote TEXT,
        createdAt TEXT NOT NULL,
        updatedAt TEXT,
        synced INTEGER DEFAULT 0
      );
    `);

    // Crear tabla de items de pedidos pendientes (espejo de orderItems en web)
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS pending_order_items (
        id TEXT PRIMARY KEY,
        orderId TEXT NOT NULL,
        productId TEXT NOT NULL,
        productName TEXT NOT NULL,
        quantity INTEGER NOT NULL,
        pricePerUnit TEXT NOT NULL,
        subtotal TEXT NOT NULL,
        customText TEXT,
        customSelect TEXT,
        createdAt TEXT,
        FOREIGN KEY (orderId) REFERENCES pending_orders(id) ON DELETE CASCADE
      );
    `);

    // Crear tabla de historial de pedidos (pedidos ya sincronizados del servidor)
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS order_history (
        id TEXT PRIMARY KEY,
        userId TEXT,
        clientId TEXT,
        orderNumber TEXT,
        status TEXT,
        subtotal TEXT,
        tax TEXT,
        total TEXT,
        notes TEXT,
        customerName TEXT,
        customerContact TEXT,
        customerNote TEXT,
        createdAt TEXT,
        updatedAt TEXT,
        syncedAt TEXT,
        synced INTEGER DEFAULT 1
      );
    `);

    // Crear tabla de items de historial de pedidos
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS order_history_items (
        id TEXT PRIMARY KEY,
        orderId TEXT NOT NULL,
        productId TEXT,
        productName TEXT,
        quantity INTEGER,
        pricePerUnit TEXT,
        subtotal TEXT,
        customText TEXT,
        customSelect TEXT,
        FOREIGN KEY (orderId) REFERENCES order_history(id) ON DELETE CASCADE
      );
    `);

    // Crear tabla de configuración
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS config (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);

    // Crear tabla de configuración de campos de producto
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS product_fields (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        field TEXT NOT NULL,
        label TEXT NOT NULL,
        enabled INTEGER DEFAULT 1,
        "order" INTEGER DEFAULT 0,
        displayType TEXT DEFAULT 'text',
        "column" TEXT DEFAULT 'full',
        textColor TEXT,
        fontSize TEXT,
        fontWeight TEXT,
        textAlign TEXT,
        options TEXT,
        maxLength INTEGER,
        syncedAt TEXT NOT NULL
      );
    `);

    // Crear tabla de estilos de tarjetas
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS card_styles (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        marginTop INTEGER DEFAULT 6,
        marginBottom INTEGER DEFAULT 8,
        marginLeft INTEGER DEFAULT 6,
        marginRight INTEGER DEFAULT 6,
        imageSpacing INTEGER DEFAULT 16,
        fieldSpacing INTEGER DEFAULT 4,
        syncedAt TEXT NOT NULL
      );
    `);

    // Crear índices para mejorar rendimiento
    await db.execAsync(`
      CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
      CREATE INDEX IF NOT EXISTS idx_products_sku ON products(sku);
      CREATE INDEX IF NOT EXISTS idx_products_active ON products(isActive);
      CREATE INDEX IF NOT EXISTS idx_products_parent ON products(parentSku);
      CREATE INDEX IF NOT EXISTS idx_products_hide ON products(hideInCatalog);
      CREATE INDEX IF NOT EXISTS idx_products_composite ON products(isActive, parentSku, hideInCatalog);
      CREATE INDEX IF NOT EXISTS idx_clients_active ON clients(isActive);
      CREATE INDEX IF NOT EXISTS idx_clients_vendor ON clients(assignedVendorId);
      CREATE INDEX IF NOT EXISTS idx_clients_pricetype ON clients(priceType);
      CREATE INDEX IF NOT EXISTS idx_pending_orders_synced ON pending_orders(synced);
      CREATE INDEX IF NOT EXISTS idx_pending_orders_client ON pending_orders(clientId);
      CREATE INDEX IF NOT EXISTS idx_pricing_product ON pricing_by_type(productId);
      CREATE INDEX IF NOT EXISTS idx_order_history_client ON order_history(clientId);
      CREATE INDEX IF NOT EXISTS idx_order_history_user ON order_history(userId);
      CREATE INDEX IF NOT EXISTS idx_order_history_status ON order_history(status);
    `);

    // Guardar versión de la base de datos
    await db.runAsync(
      'INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)',
      ['db_version', DB_VERSION.toString()]
    );

    // Inicializar estilos por defecto si no existen
    await initializeDefaultStyles(db);

    console.log('✅ Base de datos inicializada correctamente (versión ' + DB_VERSION + ')');
  } catch (error) {
    console.error('❌ Error al inicializar base de datos:', error);
    throw error;
  }
}

/**
 * Migra la base de datos a la versión actual
 */
async function migrateDatabase(database: SQLite.SQLiteDatabase): Promise<void> {
  try {
    // Crear tabla config si no existe
    await database.execAsync(`
      CREATE TABLE IF NOT EXISTS config (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);
    
    // Obtener versión actual
    const result = await database.getAllAsync<{ value: string }>(
      'SELECT value FROM config WHERE key = ?',
      ['db_version']
    );

    const currentVersion = result.length > 0 ? parseInt(result[0].value) : 0;

    if (currentVersion < DB_VERSION) {
      console.log(`🔄 Migrando base de datos de versión ${currentVersion} a ${DB_VERSION}...`);

      // Migración de v0/v1 a v2: Agregar columnas faltantes
      if (currentVersion < 2) {
        try {
          // Agregar columnas a clients si no existen
          await database.execAsync(`
            ALTER TABLE clients ADD COLUMN priceType TEXT DEFAULT 'ciudad';
          `);
        } catch (e) {
          // La columna ya existe, ignorar
        }

        try {
          await database.execAsync(`
            ALTER TABLE clients ADD COLUMN companyTaxId TEXT;
          `);
        } catch (e) {
          // La columna ya existe, ignorar
        }

        try {
          await database.execAsync(`
            ALTER TABLE clients ADD COLUMN gpsLocation TEXT;
          `);
        } catch (e) {
          // La columna ya existe, ignorar
        }

        try {
          await database.execAsync(`
            ALTER TABLE clients ADD COLUMN contactPerson TEXT;
          `);
        } catch (e) {
          // La columna ya existe, ignorar
        }

        try {
          await database.execAsync(`
            ALTER TABLE clients ADD COLUMN status TEXT DEFAULT 'active';
          `);
        } catch (e) {
          // La columna ya existe, ignorar
        }

        try {
          await database.execAsync(`
            ALTER TABLE clients ADD COLUMN agentNumber TEXT;
          `);
        } catch (e) {
          // La columna ya existe, ignorar
        }

        try {
          await database.execAsync(`
            ALTER TABLE clients ADD COLUMN assignedVendorId TEXT;
          `);
        } catch (e) {
          // La columna ya existe, ignorar
        }

        try {
          await database.execAsync(`
            ALTER TABLE clients ADD COLUMN zipCode TEXT;
          `);
        } catch (e) {
          // La columna ya existe, ignorar
        }

        try {
          await database.execAsync(`
            ALTER TABLE clients ADD COLUMN country TEXT;
          `);
        } catch (e) {
          // La columna ya existe, ignorar
        }

        try {
          await database.execAsync(`
            ALTER TABLE clients ADD COLUMN username TEXT;
          `);
        } catch (e) {
          // La columna ya existe, ignorar
        }

        try {
          await database.execAsync(`
            ALTER TABLE clients ADD COLUMN role TEXT DEFAULT 'cliente';
          `);
        } catch (e) {
          // La columna ya existe, ignorar
        }

        try {
          await database.execAsync(`
            ALTER TABLE clients ADD COLUMN createdAt TEXT;
          `);
        } catch (e) {
          // La columna ya existe, ignorar
        }

        try {
          await database.execAsync(`
            ALTER TABLE clients ADD COLUMN lastSignedIn TEXT;
          `);
        } catch (e) {
          // La columna ya existe, ignorar
        }

        try {
          await database.execAsync(`
            ALTER TABLE clients ADD COLUMN modifiedAt TEXT;
          `);
        } catch (e) {
          // La columna ya existe, ignorar
        }

        try {
          await database.execAsync(`
            ALTER TABLE clients ADD COLUMN needsSync INTEGER DEFAULT 0;
          `);
        } catch (e) {
          // La columna ya existe, ignorar
        }

        // Agregar columnas a products si no existen
        try {
          await database.execAsync(`
            ALTER TABLE products ADD COLUMN subcategory TEXT;
          `);
        } catch (e) {
          // La columna ya existe, ignorar
        }

        try {
          await database.execAsync(`
            ALTER TABLE products ADD COLUMN displayOrder INTEGER;
          `);
        } catch (e) {
          // La columna ya existe, ignorar
        }

        try {
          await database.execAsync(`
            ALTER TABLE products ADD COLUMN parentSku TEXT;
          `);
        } catch (e) {
          // La columna ya existe, ignorar
        }

        try {
          await database.execAsync(`
            ALTER TABLE products ADD COLUMN variantName TEXT;
          `);
        } catch (e) {
          // La columna ya existe, ignorar
        }

        try {
          await database.execAsync(`
            ALTER TABLE products ADD COLUMN dimension TEXT;
          `);
        } catch (e) {
          // La columna ya existe, ignorar
        }

        try {
          await database.execAsync(`
            ALTER TABLE products ADD COLUMN line1Text TEXT;
          `);
        } catch (e) {
          // La columna ya existe, ignorar
        }

        try {
          await database.execAsync(`
            ALTER TABLE products ADD COLUMN line2Text TEXT;
          `);
        } catch (e) {
          // La columna ya existe, ignorar
        }

        try {
          await database.execAsync(`
            ALTER TABLE products ADD COLUMN location TEXT;
          `);
        } catch (e) {
          // La columna ya existe, ignorar
        }

        try {
          await database.execAsync(`
            ALTER TABLE products ADD COLUMN unitsPerBox INTEGER DEFAULT 0;
          `);
        } catch (e) {
          // La columna ya existe, ignorar
        }

        try {
          await database.execAsync(`
            ALTER TABLE products ADD COLUMN hideInCatalog INTEGER DEFAULT 0;
          `);
        } catch (e) {
          // La columna ya existe, ignorar
        }

        try {
          await database.execAsync(`
            ALTER TABLE products ADD COLUMN customText TEXT;
          `);
        } catch (e) {
          // La columna ya existe, ignorar
        }

        try {
          await database.execAsync(`
            ALTER TABLE products ADD COLUMN customSelect TEXT;
          `);
        } catch (e) {
          // La columna ya existe, ignorar
        }

        try {
          await database.execAsync(`
            ALTER TABLE products ADD COLUMN isActive INTEGER DEFAULT 1;
          `);
        } catch (e) {
          // La columna ya existe, ignorar
        }

        try {
          await database.execAsync(`
            ALTER TABLE products ADD COLUMN createdAt TEXT;
          `);
        } catch (e) {
          // La columna ya existe, ignorar
        }

        console.log('✅ Migración v2 completada');
      }

      // Migración v3: Agregar columnas de precios por tipo
      if (currentVersion < 3) {
        console.log('🔄 Aplicando migración v3: Agregando columnas de precios...');
        
        try {
          await database.execAsync(`
            ALTER TABLE products ADD COLUMN priceCity TEXT;
          `);
        } catch (e) {
          // La columna ya existe, ignorar
        }

        try {
          await database.execAsync(`
            ALTER TABLE products ADD COLUMN priceInterior TEXT;
          `);
        } catch (e) {
          // La columna ya existe, ignorar
        }

        try {
          await database.execAsync(`
            ALTER TABLE products ADD COLUMN priceSpecial TEXT;
          `);
        } catch (e) {
          // La columna ya existe, ignorar
        }

        console.log('✅ Migración v3 completada');
      }

      // Migración v4: Agregar columnas synced y clientName a order_history
      if (currentVersion < 4) {
        console.log('🔄 Aplicando migración v4: Agregando columnas synced y clientName...');
        
        try {
          await database.execAsync(`
            ALTER TABLE order_history ADD COLUMN synced INTEGER DEFAULT 1;
          `);
        } catch (e) {
          // La columna ya existe, ignorar
        }

        try {
          await database.execAsync(`
            ALTER TABLE order_history ADD COLUMN clientName TEXT;
          `);
        } catch (e) {
          // La columna ya existe, ignorar
        }

        try {
          await database.execAsync(`
            ALTER TABLE order_history_items ADD COLUMN sku TEXT;
          `);
        } catch (e) {
          // La columna ya existe, ignorar
        }

        try {
          await database.execAsync(`
            ALTER TABLE order_history_items ADD COLUMN price TEXT;
          `);
        } catch (e) {
          // La columna ya existe, ignorar
        }

        console.log('✅ Migración v4 completada');
      }

      // Migración v5: Agregar columnas options y maxLength a product_fields
      if (currentVersion < 5) {
        console.log('🔄 Aplicando migración v5: Agregando columnas options y maxLength a product_fields...');
        
        try {
          await database.execAsync(`
            ALTER TABLE product_fields ADD COLUMN options TEXT;
          `);
        } catch (e) {
          // La columna ya existe, ignorar
        }

        try {
          await database.execAsync(`
            ALTER TABLE product_fields ADD COLUMN maxLength INTEGER;
          `);
        } catch (e) {
          // La columna ya existe, ignorar
        }

        console.log('✅ Migración v5 completada');
      }

      // Migración v6: Agregar columna synced a order_history
      if (currentVersion < 6) {
        console.log('🔄 Aplicando migración v6: Agregando columna synced a order_history...');
        
        try {
          await database.execAsync(`
            ALTER TABLE order_history ADD COLUMN synced INTEGER DEFAULT 1;
          `);
        } catch (e) {
          // La columna ya existe, ignorar
        }

        console.log('✅ Migración v6 completada');
      }

      // Actualizar versión en config
      await database.execAsync(
        'INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)',
        ['db_version', DB_VERSION.toString()]
      );
    }
  } catch (error) {
    console.warn('⚠️ Error en migración (puede ser normal):', error);
  }
}

/**
 * Obtiene la instancia de la base de datos
 */
export function getDatabase(): SQLite.SQLiteDatabase {
  if (!db) {
    throw new Error('Base de datos no inicializada. Llama a initDatabase() primero.');
  }
  return db;
}

/**
 * Cierra la conexión a la base de datos
 */
export async function closeDatabase(): Promise<void> {
  if (db) {
    await db.closeAsync();
    db = null;
    console.log('✅ Base de datos cerrada');
  }
}

/**
 * Limpia toda la base de datos (útil para reset completo)
 */
export async function clearDatabase(): Promise<void> {
  const database = getDatabase();
  
  await database.execAsync(`
    DELETE FROM pending_order_items;
    DELETE FROM pending_orders;
    DELETE FROM pricing_by_type;
    DELETE FROM products;
    DELETE FROM clients;
    DELETE FROM config;
  `);
  
  console.log('✅ Base de datos limpiada');
}

/**
 * Elimina completamente la base de datos y la recrea
 * Útil para resolver problemas de corrupción
 */
export async function resetDatabase(): Promise<void> {
  try {
    if (db) {
      await db.closeAsync();
      db = null;
    }

    // Eliminar la base de datos
    await SQLite.deleteDatabaseAsync(DB_NAME);
    console.log('✅ Base de datos eliminada');

    // Limpiar timestamp de última sincronización para forzar sincronización completa
    const AsyncStorage = require('@react-native-async-storage/async-storage').default;
    await AsyncStorage.removeItem('last_sync_timestamp');
    console.log('✅ Timestamp de sincronización limpiado');

    // Reinicializar
    await initDatabase();
    console.log('✅ Base de datos recreada');
  } catch (error) {
    console.error('❌ Error al resetear base de datos:', error);
    throw error;
  }
}

/**
 * Sincroniza la configuración de campos de producto desde el servidor
 */
export async function syncProductFields(fields: any[]): Promise<void> {
  const database = getDatabase();
  
  try {
    // Limpiar campos existentes
    await database.runAsync('DELETE FROM product_fields');
    
    // Insertar nuevos campos
    for (const field of fields) {
      await database.runAsync(
        `INSERT INTO product_fields (field, label, enabled, "order", displayType, "column", textColor, fontSize, fontWeight, textAlign, options, maxLength, syncedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          field.field,
          field.label,
          field.enabled ? 1 : 0,
          field.order || 0,
          field.displayType || 'text',
          field.column || 'full',
          field.textColor || null,
          field.fontSize || null,
          field.fontWeight || null,
          field.textAlign || null,
          field.options ? JSON.stringify(field.options) : null,
          field.maxLength || null,
          new Date().toISOString()
        ]
      );
    }
    
    console.log(`✅ ${fields.length} campos de producto sincronizados`);
  } catch (error) {
    console.error('❌ Error al sincronizar campos de producto:', error);
    throw error;
  }
}

/**
 * Obtiene la configuración de campos de producto desde la base de datos local
 */
export async function getProductFields(): Promise<any[]> {
  const database = getDatabase();
  
  try {
    const fields = await database.getAllAsync<any>(
      `SELECT field, label, enabled, "order", displayType, "column", textColor, fontSize, fontWeight, textAlign, options, maxLength
       FROM product_fields
       WHERE enabled = 1
       ORDER BY "order" ASC`
    );
    
    return fields.map(field => ({
      field: field.field,
      label: field.label,
      enabled: field.enabled === 1,
      order: field.order,
      displayType: field.displayType,
      column: field.column,
      textColor: field.textColor,
      fontSize: field.fontSize,
      fontWeight: field.fontWeight,
      textAlign: field.textAlign,
      options: field.options ? JSON.parse(field.options) : undefined,
      maxLength: field.maxLength,
    }));
  } catch (error) {
    console.error('❌ Error al obtener campos de producto:', error);
    return [];
  }
}

/**
 * Sincroniza los estilos de tarjetas desde el servidor
 */
export async function syncCardStyles(styles: any): Promise<void> {
  const database = getDatabase();
  
  try {
    const margins = styles.margins || { top: 6, bottom: 8, left: 6, right: 6 };
    const imageSpacing = styles.imageSpacing || 16;
    const fieldSpacing = styles.fieldSpacing || 4;
    
    await database.runAsync(
      `INSERT OR REPLACE INTO card_styles (id, marginTop, marginBottom, marginLeft, marginRight, imageSpacing, fieldSpacing, syncedAt)
       VALUES (1, ?, ?, ?, ?, ?, ?, ?)`,
      [
        margins.top,
        margins.bottom,
        margins.left,
        margins.right,
        imageSpacing,
        fieldSpacing,
        new Date().toISOString()
      ]
    );
    
    console.log('✅ Estilos de tarjetas sincronizados');
  } catch (error) {
    console.error('❌ Error al sincronizar estilos de tarjetas:', error);
    throw error;
  }
}

/**
 * Obtiene los estilos de tarjetas desde la base de datos local
 */
export async function getCardStyles(): Promise<any> {
  const database = getDatabase();
  
  try {
    const result = await database.getFirstAsync<any>(
      'SELECT marginTop, marginBottom, marginLeft, marginRight, imageSpacing, fieldSpacing FROM card_styles WHERE id = 1'
    );
    
    if (!result) {
      // Retornar valores por defecto si no hay estilos guardados
      return {
        margins: { top: 6, bottom: 8, left: 6, right: 6 },
        imageSpacing: 16,
        fieldSpacing: 4,
      };
    }
    
    return {
      margins: {
        top: result.marginTop,
        bottom: result.marginBottom,
        left: result.marginLeft,
        right: result.marginRight,
      },
      imageSpacing: result.imageSpacing,
      fieldSpacing: result.fieldSpacing,
    };
  } catch (error) {
    console.error('❌ Error al obtener estilos de tarjetas:', error);
    return {
      margins: { top: 6, bottom: 8, left: 6, right: 6 },
      imageSpacing: 16,
      fieldSpacing: 4,
    };
  }
}


/**
 * Inicializa los estilos por defecto en la base de datos local
 * Simula que el servidor envió esta configuración
 */
async function initializeDefaultStyles(database: SQLite.SQLiteDatabase): Promise<void> {
  try {
    // Verificar si ya existen estilos
    const existingFields = await database.getAllAsync<any>(
      'SELECT COUNT(*) as count FROM product_fields'
    );
    
    if (existingFields[0].count > 0) {
      console.log('✅ Estilos ya inicializados, omitiendo...');
      return;
    }
    
    console.log('🎨 Inicializando estilos por defecto...');
    
    // Configuración de campos por defecto
    const defaultFields = [
      {
        field: 'name',
        label: 'Nombre',
        enabled: 1,
        order: 1,
        displayType: 'multiline',
        column: 'full',
        textColor: '#1e293b',
        fontSize: '10',
        fontWeight: '600',
        textAlign: 'left'
      },
      {
        field: 'rolePrice',
        label: 'Precio',
        enabled: 1,
        order: 2,
        displayType: 'price',
        column: 'full',
        textColor: '#2563eb',
        fontSize: '14',
        fontWeight: 'bold',
        textAlign: 'left'
      },
      {
        field: 'stock',
        label: 'Stock',
        enabled: 1,
        order: 3,
        displayType: 'number',
        column: 'full',
        textColor: '#6b7280',
        fontSize: '12',
        fontWeight: '400',
        textAlign: 'left'
      }
    ];
    
    // Insertar campos por defecto
    for (const field of defaultFields) {
      await database.runAsync(
        `INSERT INTO product_fields (field, label, enabled, "order", displayType, "column", textColor, fontSize, fontWeight, textAlign, syncedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          field.field,
          field.label,
          field.enabled,
          field.order,
          field.displayType,
          field.column,
          field.textColor,
          field.fontSize,
          field.fontWeight,
          field.textAlign,
          new Date().toISOString()
        ]
      );
    }
    
    // Insertar estilos de tarjeta por defecto
    await database.runAsync(
      `INSERT OR REPLACE INTO card_styles (id, marginTop, marginBottom, marginLeft, marginRight, imageSpacing, fieldSpacing, syncedAt)
       VALUES (1, 6, 8, 6, 6, 16, 4, ?)`,
      [new Date().toISOString()]
    );
    
    console.log('✅ Estilos por defecto inicializados');
  } catch (error) {
    console.error('❌ Error al inicializar estilos por defecto:', error);
  }
}
