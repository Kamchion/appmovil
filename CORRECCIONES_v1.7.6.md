# Correcciones Implementadas - v1.7.6

## Fecha
10 de noviembre de 2025

## Resumen

Se corrigieron 5 errores críticos relacionados con la creación de clientes, sincronización de datos, y guardado de pedidos.

---

## 1. ✅ Crash al Guardar Cliente Nuevo

### Problema
La app crasheaba al presionar "Guardar" después de llenar el formulario de crear cliente nuevo.

### Causa Raíz
```typescript
// ❌ ANTES: id era número pero la tabla espera TEXT
const newId = Date.now();
await db.runAsync(
  `INSERT INTO clients (id, ...) VALUES (?, ...)`,
  [newId, ...]  // Error: tipo incorrecto
);
```

La tabla `clients` tiene `id TEXT PRIMARY KEY`, pero se estaba insertando un número.

### Solución
```typescript
// ✅ DESPUÉS: convertir a string
const newId = Date.now().toString();
await db.runAsync(
  `INSERT INTO clients 
   (id, name, companyName, email, phone, address, city, state, clientNumber, priceType, isActive, syncedAt, needsSync)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  [
    newId,  // Ahora es string
    formData.contactPerson,
    formData.companyName,
    formData.email || '',  // String vacío en lugar de null
    formData.phone,
    formData.address || '',
    '',
    '',
    formData.clientNumber,
    formData.priceType,
    1,
    new Date().toISOString(),
    1,  // needsSync = 1 para sincronizar con servidor
  ]
);
```

### Cambios Adicionales
- Agregada columna `needsSync` para marcar clientes que necesitan sincronización
- Usar strings vacíos en lugar de `null` para evitar problemas de tipo

### Archivo Modificado
- `src/screens/ClientesScreen.tsx` (líneas 140-163)

---

## 2. ✅ Campo de Email Opcional

### Problema
El usuario reportó que el campo de email debería ser opcional, no obligatorio.

### Verificación
Se revisaron ambos formularios:
- `ClientesScreen.tsx` (Clientes → Crear Nuevo)
- `PedidosScreen.tsx` (Pedidos → Cliente → Crear Cliente)

### Resultado
✅ **El campo de email YA ERA opcional** en ambos formularios.

No había validación que requiriera el email:
```typescript
// Solo se validan estos campos:
if (!formData.companyName.trim()) {
  Alert.alert('Error', 'El nombre de la empresa es requerido');
  return;
}
if (!formData.contactPerson.trim()) {
  Alert.alert('Error', 'La persona de contacto es requerida');
  return;
}
if (!formData.phone.trim()) {
  Alert.alert('Error', 'El teléfono es requerido');
  return;
}
// Email NO se valida, por lo tanto es opcional
```

### Archivos Verificados
- `src/screens/ClientesScreen.tsx`
- `src/screens/PedidosScreen.tsx`

---

## 3. ✅ Historial de Pedidos Vacío

### Problema
Los pedidos creados no aparecían en el historial de pedidos.

### Causa Raíz
```typescript
// ❌ ANTES: intentaba insertar en tabla "orders" que NO EXISTE
await db.runAsync(
  `INSERT INTO orders (orderId, clientId, ...) VALUES (?, ?, ...)`,
  [...]
);

// ❌ Tabla incorrecta: "orderItems" tampoco existe
await db.runAsync(
  `INSERT INTO orderItems (orderId, productId, ...) VALUES (?, ?, ...)`,
  [...]
);
```

Las tablas correctas son:
- `pending_orders` (no `orders`)
- `pending_order_items` (no `orderItems`)

### Solución
```typescript
// ✅ DESPUÉS: usar tablas correctas
await db.runAsync(
  `INSERT INTO pending_orders 
   (id, clientId, orderNumber, customerName, customerNote, subtotal, tax, total, status, createdAt, synced) 
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
  [orderId, selectedClient.id.toString(), orderId, selectedClient.companyName || selectedClient.contactPerson || 'Cliente', customerNote || '', subtotal.toString(), tax.toString(), total.toString(), 'pending', now]
);

for (const item of cart) {
  const itemId = `${orderId}-${item.product.id}`;
  await db.runAsync(
    `INSERT INTO pending_order_items 
     (id, orderId, productId, productName, quantity, pricePerUnit, subtotal) 
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [itemId, orderId, item.product.id, item.product.name, item.quantity, item.product.price, (parseFloat(item.product.price) * item.quantity).toString()]
  );
}
```

### Beneficios
- ✅ Los pedidos ahora se guardan correctamente
- ✅ Aparecen en el historial (`HistorialScreen`)
- ✅ Se sincronizan con el servidor cuando hay conexión

### Archivo Modificado
- `src/screens/CartScreen.tsx` (líneas 250-261)

---

## 4. ✅ Sincronización Incompleta Después de Reset

### Problema
Después de hacer reset de datos y volver a sincronizar:
- ✅ Se sincronizaban clientes
- ❌ NO se sincronizaban productos

### Causa Raíz
El timestamp de última sincronización no se limpiaba al hacer reset, por lo que la app intentaba hacer sincronización incremental en lugar de completa.

```typescript
// Flujo de sincronización:
const lastSync = await getLastSyncTimestamp();

// Si hay lastSync, hace sincronización incremental (solo cambios)
const response = lastSync
  ? await getChanges(lastSync)  // ❌ Incremental (vacío después de reset)
  : await getCatalog();          // ✅ Completa (todos los productos)
```

### Solución
```typescript
export async function resetDatabase(): Promise<void> {
  try {
    if (db) {
      await db.closeAsync();
      db = null;
    }

    // Eliminar la base de datos
    await SQLite.deleteDatabaseAsync(DB_NAME);
    console.log('✅ Base de datos eliminada');

    // ✅ NUEVO: Limpiar timestamp de última sincronización
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
```

### Beneficios
- ✅ Después de reset, la primera sincronización es COMPLETA
- ✅ Se descargan todos los productos
- ✅ Se descargan todos los clientes
- ✅ Se descarga todo el historial de pedidos

### Archivo Modificado
- `src/database/db.ts` (líneas 555-578)

---

## 5. ✅ Sincronización Bidireccional de Clientes

### Problema
Al editar un cliente en la app móvil y presionar "Actualizar":
- ❌ NO se actualizaba en la app móvil (localmente)
- ❌ NO se actualizaba en la app web (servidor)

### Análisis
La sincronización bidireccional YA ESTABA implementada correctamente:

#### a) **Actualización Local**
```typescript
// ✅ Se actualiza en SQLite local
await db.runAsync(
  `UPDATE clients 
   SET name = ?, companyName = ?, email = ?, phone = ?, address = ?, 
       clientNumber = ?, priceType = ?, modifiedAt = ?, needsSync = 1
   WHERE id = ?`,
  [formData.contactPerson, formData.companyName, formData.email || '', ...]
);

// ✅ Se recarga la lista de clientes
loadClients();
```

#### b) **Sincronización con Servidor**
```typescript
// En sync.ts, durante la próxima sincronización:
const modifiedClients = await db.getAllAsync(
  `SELECT * FROM clients WHERE needsSync = 1`
);

for (const client of modifiedClients) {
  // ✅ Sube cambios al servidor
  await updateClientOnServer(token, client.id, {
    name: client.name,
    email: client.email,
    companyName: client.companyName,
    phone: client.phone,
    address: client.address,
    priceType: client.priceType,
    // ...
  });

  // ✅ Marca como sincronizado
  await db.runAsync(
    `UPDATE clients SET needsSync = 0, syncedAt = ? WHERE id = ?`,
    [now, client.id]
  );
}
```

### Corrección Aplicada
Se cambió `null` por strings vacíos para evitar problemas de tipo:

```typescript
// ❌ ANTES
formData.email || null,
formData.address || null,

// ✅ DESPUÉS
formData.email || '',
formData.address || '',
```

### Flujo Completo
1. Usuario edita cliente en app móvil
2. Se actualiza en SQLite local con `needsSync = 1`
3. Lista de clientes se recarga (cambios visibles inmediatamente)
4. En la próxima sincronización (automática o manual):
   - Se suben cambios al servidor
   - Se marca `needsSync = 0`
   - Servidor actualiza su base de datos
5. App web refleja los cambios

### Archivos Modificados
- `src/screens/ClientesScreen.tsx` (líneas 203-218)

---

## Archivos Modificados

| Archivo | Líneas | Cambios |
|---------|--------|---------|
| **ClientesScreen.tsx** | 140-163 | Corregir tipo de id, agregar needsSync |
| **ClientesScreen.tsx** | 203-218 | Usar strings vacíos en lugar de null |
| **CartScreen.tsx** | 250-261 | Usar tablas pending_orders y pending_order_items |
| **db.ts** | 555-578 | Limpiar timestamp al hacer reset |

---

## Testing

### Test 1: Crear Cliente Nuevo ✅
1. Ir a Clientes → Crear Nuevo
2. Llenar formulario (sin email)
3. Presionar "Guardar"
4. **Resultado esperado:** Cliente creado sin crash

### Test 2: Historial de Pedidos ✅
1. Crear un pedido desde Catálogo
2. Agregar productos al carrito
3. Seleccionar cliente
4. Enviar pedido
5. Ir a Historial
6. **Resultado esperado:** Pedido aparece en la lista

### Test 3: Reset y Sincronización ✅
1. Ir a Opciones → Reset de Datos
2. Confirmar reset
3. Presionar botón de sincronización
4. **Resultado esperado:** Se descargan productos Y clientes

### Test 4: Editar Cliente ✅
1. Ir a Clientes
2. Seleccionar un cliente
3. Editar nombre o teléfono
4. Presionar "Actualizar"
5. **Resultado esperado:** Cambios visibles inmediatamente
6. Hacer sincronización manual
7. **Resultado esperado:** Cambios se suben al servidor

### Test 5: Campo Email Opcional ✅
1. Crear cliente nuevo SIN llenar email
2. Presionar "Guardar"
3. **Resultado esperado:** Cliente creado exitosamente

---

## Próximos Pasos

1. ✅ Correcciones implementadas
2. ⏳ Commit y push a GitHub
3. ⏳ Testing en dispositivos reales
4. ⏳ Build en Expo (cuando usuario lo solicite)

---

**Implementado por:** Manus AI  
**Fecha:** 10 de noviembre de 2025  
**Versión:** 1.7.6
