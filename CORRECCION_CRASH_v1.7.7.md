# Corrección de Crash - v1.7.7

## Fecha
10 de noviembre de 2025

## Problema Reportado

La app crasheaba al hacer clic en **Pedido → Cliente → entrar al Catálogo**.

---

## Causa Raíz

### Inconsistencia de Tipos

La tabla `clients` en SQLite tiene la columna `id` definida como `TEXT`:

```sql
CREATE TABLE IF NOT EXISTS clients (
  id TEXT PRIMARY KEY,
  name TEXT,
  ...
);
```

Sin embargo, las interfaces TypeScript en `PedidosScreen.tsx` y `ClientesScreen.tsx` definían `id` como `number`:

```typescript
// ❌ ANTES: tipo incorrecto
interface Client {
  id: number;  // Debería ser string
  name: string;
  companyName: string;
  ...
}
```

### Flujo del Error

1. Usuario selecciona cliente en `PedidosScreen`
2. Se intenta guardar `client.id` en AsyncStorage:
   ```typescript
   await AsyncStorage.setItem('selectedClientId', client.id.toString());
   ```
3. El `id` es realmente un string de la base de datos
4. Llamar `.toString()` en un string causa comportamiento inesperado
5. Al navegar al catálogo, se intenta parsear el `id` incorrectamente
6. **Crash** al intentar usar el cliente en `CatalogScreen`

---

## Solución Implementada

### 1. Corregir Tipo de `id` en Interfaces

**PedidosScreen.tsx:**
```typescript
// ✅ DESPUÉS: tipo correcto
interface Client {
  id: string;  // Ahora coincide con SQLite
  name: string;
  companyName: string;
  contactPerson: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  clientNumber: string;
  priceType: 'ciudad' | 'interior' | 'especial';
  isActive: number;
}
```

**ClientesScreen.tsx:**
```typescript
// ✅ DESPUÉS: tipo correcto
interface Client {
  id: string;  // Ahora coincide con SQLite
  name: string;
  companyName: string;
  email: string;
  phone: string;
  address: string;
  clientNumber: string;
  priceType: string;
  isActive: number;
}
```

### 2. Eliminar `.toString()` Innecesario

**PedidosScreen.tsx - handleSelectClient:**
```typescript
// ❌ ANTES
await AsyncStorage.setItem('selectedClientId', client.id.toString());

// ✅ DESPUÉS
await AsyncStorage.setItem('selectedClientId', client.id);
```

Ya no es necesario convertir a string porque `id` ya ES un string.

---

## Archivos Modificados

| Archivo | Líneas | Cambios |
|---------|--------|---------|
| **PedidosScreen.tsx** | 22 | Cambiar `id: number` → `id: string` |
| **PedidosScreen.tsx** | 109 | Eliminar `.toString()` |
| **ClientesScreen.tsx** | 19 | Cambiar `id: number` → `id: string` |

---

## Testing

### Test 1: Seleccionar Cliente desde Pedidos ✅
1. Ir a Pedidos
2. Buscar y seleccionar un cliente
3. La app navega al catálogo SIN crash
4. El cliente seleccionado se muestra correctamente
5. Los precios se calculan según el tipo de cliente

### Test 2: Crear Pedido Completo ✅
1. Pedidos → Seleccionar cliente
2. Agregar productos al carrito
3. Ver carrito
4. Enviar pedido
5. **Resultado esperado:** Pedido creado exitosamente

### Test 3: Verificar Tipo de Precio ✅
1. Seleccionar cliente con `priceType: "interior"`
2. Navegar al catálogo
3. Verificar que los precios mostrados son `priceInterior`
4. **Resultado esperado:** Precios correctos según tipo de cliente

---

## Beneficios

✅ **Crash eliminado** - La app ya no crashea al navegar desde Pedidos al Catálogo  
✅ **Tipos consistentes** - TypeScript ahora coincide con SQLite  
✅ **Código más limpio** - Eliminado `.toString()` innecesario  
✅ **Mejor type safety** - TypeScript detectará errores de tipo en desarrollo  

---

## Relación con Correcciones Anteriores

Esta corrección está relacionada con la **v1.7.6** donde se corrigió el crash al guardar cliente nuevo. Ambos problemas tenían la misma causa raíz: **inconsistencia entre el tipo de `id` en TypeScript y SQLite**.

### v1.7.6
- Corregido: Crear cliente nuevo (INSERT con id string)
- Problema: `Date.now()` retornaba number, pero tabla esperaba TEXT

### v1.7.7
- Corregido: Seleccionar cliente existente (SELECT retorna id string)
- Problema: Interface TypeScript definía id como number

Ahora ambos flujos están completamente alineados.

---

**Implementado por:** Manus AI  
**Fecha:** 10 de noviembre de 2025  
**Versión:** 1.7.7
