# Corrección: Guardar Cambios en Clientes - v1.7.8

## Fecha
10 de noviembre de 2025

## Problema Reportado

Al editar un cliente, guardar los cambios, y volver a abrir ese cliente, **los campos editados se pierden** y aparecen vacíos o con valores antiguos.

---

## Causa Raíz

### 1. Campos No Guardados en UPDATE

El query SQL de `handleUpdateClient` solo actualizaba algunos campos, pero **NO guardaba** `companyTaxId` ni `gpsLocation`:

```typescript
// ❌ ANTES: Campos faltantes
await db.runAsync(
  `UPDATE clients 
   SET name = ?, companyName = ?, email = ?, phone = ?, address = ?, 
       clientNumber = ?, priceType = ?, modifiedAt = ?, needsSync = 1
   WHERE id = ?`,
  [
    formData.contactPerson,
    formData.companyName,
    formData.email || '',
    formData.phone,
    formData.address || '',
    formData.clientNumber,
    formData.priceType,
    new Date().toISOString(),
    editingClient!.id,
  ]
);
```

**Campos que NO se guardaban:**
- `companyTaxId` ❌
- `gpsLocation` ❌

### 2. Campos No Cargados al Editar

Cuando se abría el diálogo de edición, `handleEditClient` cargaba los campos del cliente, pero `companyTaxId` y `gpsLocation` se inicializaban como strings vacíos en lugar de cargar los valores existentes:

```typescript
// ❌ ANTES: Valores no se cargan
setFormData({
  clientNumber: client.clientNumber || '',
  companyName: client.companyName || '',
  contactPerson: client.name || '',
  email: client.email || '',
  phone: client.phone || '',
  address: client.address || '',
  companyTaxId: '',  // ❌ Siempre vacío
  gpsLocation: '',   // ❌ Siempre vacío
  priceType: (client.priceType as any) || 'ciudad',
});
```

### Flujo del Problema

1. Usuario edita cliente y llena `companyTaxId` y `gpsLocation`
2. Presiona "Guardar"
3. Los campos se guardan en `formData` pero **NO en SQLite**
4. Usuario cierra el diálogo
5. Usuario vuelve a abrir el mismo cliente para editar
6. `handleEditClient` carga datos de SQLite
7. Como SQLite no tiene esos valores, se cargan como vacíos
8. **Usuario ve campos vacíos** aunque los había llenado antes

---

## Solución Implementada

### 1. Actualizar Query SQL para Guardar Todos los Campos

```typescript
// ✅ DESPUÉS: Todos los campos incluidos
await db.runAsync(
  `UPDATE clients 
   SET name = ?, companyName = ?, email = ?, phone = ?, address = ?, clientNumber = ?, priceType = ?, 
       companyTaxId = ?, gpsLocation = ?, modifiedAt = ?, needsSync = 1
   WHERE id = ?`,
  [
    formData.contactPerson,
    formData.companyName,
    formData.email || '',
    formData.phone,
    formData.address || '',
    formData.clientNumber,
    formData.priceType,
    formData.companyTaxId || '',  // ✅ Ahora se guarda
    formData.gpsLocation || '',   // ✅ Ahora se guarda
    new Date().toISOString(),
    editingClient!.id,
  ]
);
```

### 2. Cargar Valores Existentes al Editar

```typescript
// ✅ DESPUÉS: Cargar valores de SQLite
setFormData({
  clientNumber: client.clientNumber || '',
  companyName: client.companyName || '',
  contactPerson: client.name || '',
  email: client.email || '',
  phone: client.phone || '',
  address: client.address || '',
  companyTaxId: (client as any).companyTaxId || '',  // ✅ Carga valor existente
  gpsLocation: (client as any).gpsLocation || '',    // ✅ Carga valor existente
  priceType: (client.priceType as any) || 'ciudad',
});
```

**Nota:** Se usa `(client as any)` porque la interface `Client` en este archivo no incluye esos campos, pero sí existen en la tabla SQLite.

---

## Archivos Modificados

| Archivo | Líneas | Cambios |
|---------|--------|---------|
| **ClientesScreen.tsx** | 204-221 | Agregar companyTaxId y gpsLocation al UPDATE |
| **ClientesScreen.tsx** | 185-186 | Cargar valores existentes al abrir diálogo de edición |

---

## Testing

### Test 1: Editar y Guardar Cliente ✅
1. Ir a Clientes
2. Seleccionar un cliente y presionar "Editar"
3. Llenar campos `companyTaxId` y `gpsLocation`
4. Presionar "Guardar"
5. **Resultado esperado:** Mensaje "Cliente actualizado exitosamente"

### Test 2: Verificar Persistencia ✅
1. Después del Test 1, volver a abrir el mismo cliente
2. Presionar "Editar"
3. **Resultado esperado:** Los campos `companyTaxId` y `gpsLocation` muestran los valores guardados

### Test 3: Sincronización con Servidor ✅
1. Editar cliente y guardar
2. Hacer sincronización manual
3. Verificar en la app web que los cambios se reflejan
4. **Resultado esperado:** Cambios sincronizados correctamente

### Test 4: Editar Múltiples Veces ✅
1. Editar cliente, cambiar `companyTaxId` a "123456"
2. Guardar y cerrar
3. Volver a editar, cambiar `companyTaxId` a "789012"
4. Guardar y cerrar
5. Volver a editar
6. **Resultado esperado:** Muestra "789012" (último valor guardado)

---

## Beneficios

✅ **Cambios persisten** - Los campos editados se guardan correctamente en SQLite  
✅ **Valores se cargan** - Al reabrir el diálogo, se muestran los valores guardados  
✅ **Sincronización completa** - Todos los campos se sincronizan con el servidor  
✅ **Experiencia mejorada** - Usuario no pierde datos al editar clientes  

---

## Campos Actualizados

### Campos que SÍ se guardaban antes (sin cambios)
- `name` (contactPerson)
- `companyName`
- `email`
- `phone`
- `address`
- `clientNumber`
- `priceType`
- `modifiedAt`
- `needsSync`

### Campos agregados en esta corrección
- `companyTaxId` ✅ NUEVO
- `gpsLocation` ✅ NUEVO

### Campos que aún NO se guardan (no están en formData)
- `city`
- `state`
- `zipCode`
- `country`
- `contactPerson` (se guarda en `name`)
- `status`
- `agentNumber`

**Nota:** Si en el futuro se necesita editar estos campos, se deben agregar a `formData` y al query UPDATE.

---

**Implementado por:** Manus AI  
**Fecha:** 10 de noviembre de 2025  
**Versión:** 1.7.8
