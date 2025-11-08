import * as SQLite from 'expo-sqlite';

/**
 * Base de datos local SQLite para almacenamiento offline
 * Esquema espejo exacto de las tablas del backend web
 */

const DB_NAME = 'vendedor_offline.db';
const DB_VERSION = 2; // Incrementar cuando hay cambios en el esquema

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
        id TEXT PRIMARY KEY,
        sku TEXT NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        category TEXT,
        subcategory TEXT,
        image TEXT,
        basePrice TEXT NOT NULL,
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
        syncedAt TEXT
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

    // Crear índices para mejorar rendimiento
    await db.execAsync(`
      CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
      CREATE INDEX IF NOT EXISTS idx_products_sku ON products(sku);
      CREATE INDEX IF NOT EXISTS idx_products_active ON products(isActive);
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

        console.log('✅ Migración completada');
      }
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

    // Reinicializar
    await initDatabase();
    console.log('✅ Base de datos recreada');
  } catch (error) {
    console.error('❌ Error al resetear base de datos:', error);
    throw error;
  }
}
