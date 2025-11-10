# Corrección del Sistema de Precios por Tipo de Cliente

## Fecha
10 de noviembre de 2025

## Problema Identificado

La aplicación móvil no mostraba el precio correcto según el tipo de cliente (ciudad, interior, especial). Aunque el backend enviaba los 3 tipos de precios, la app móvil no los guardaba ni utilizaba correctamente.

## Solución Implementada

Se implementó un sistema completo para manejar los 3 tipos de precios siguiendo esta arquitectura:

### 1. Base de Datos (db.ts) - Migración v3

**Cambios:**
- Incrementada versión de DB a v3
- Agregadas columnas `priceCity`, `priceInterior`, `priceSpecial` a la tabla `products`
- Migración automática para bases de datos existentes

**Código:**
```typescript
const DB_VERSION = 3;

CREATE TABLE IF NOT EXISTS products (
  ...
  basePrice TEXT NOT NULL,
  priceCity TEXT,
  priceInterior TEXT,
  priceSpecial TEXT,
  ...
);
```

**Migración:**
```typescript
if (currentVersion < 3) {
  await database.execAsync(`ALTER TABLE products ADD COLUMN priceCity TEXT;`);
  await database.execAsync(`ALTER TABLE products ADD COLUMN priceInterior TEXT;`);
  await database.execAsync(`ALTER TABLE products ADD COLUMN priceSpecial TEXT;`);
}
```

### 2. Utilidad de Precios (priceUtils.ts) - NUEVO ARCHIVO

**Ubicación:** `src/utils/priceUtils.ts`

**Función principal:**
```typescript
export function getProductPrice(product: Product, priceType: PriceType): string {
  if (priceType === 'ciudad' && product.priceCity) {
    return product.priceCity;
  }
  
  if (priceType === 'interior' && product.priceInterior) {
    return product.priceInterior;
  }
  
  if (priceType === 'especial' && product.priceSpecial) {
    return product.priceSpecial;
  }
  
  // Fallback: Si no existe el precio específico, usar basePrice
  return product.basePrice;
}
```

**Funciones adicionales:**
- `formatPrice()` - Formatea precio con símbolo de moneda
- `getFormattedProductPrice()` - Obtiene precio formateado
- `calculateSubtotal()` - Calcula subtotal según cantidad
- `getAllPrices()` - Obtiene los 3 tipos de precios
- `hasDifferentiatedPrices()` - Verifica si tiene precios diferenciados

### 3. Sincronización (sync.ts)

**Cambios:**
- Actualizada consulta SQL INSERT para incluir los 3 precios
- Guarda `priceCity`, `priceInterior`, `priceSpecial` desde el backend

**Antes:**
```typescript
INSERT OR REPLACE INTO products 
  (id, sku, name, ..., basePrice, stock, ...)
VALUES (?, ?, ?, ..., ?, ?, ...)
```

**Después:**
```typescript
INSERT OR REPLACE INTO products 
  (id, sku, name, ..., basePrice, priceCity, priceInterior, priceSpecial, stock, ...)
VALUES (?, ?, ?, ..., ?, ?, ?, ?, ?, ...)

// Valores
product.basePrice,
product.priceCity || product.basePrice,
product.priceInterior || product.basePrice,
product.priceSpecial || product.basePrice,
```

### 4. Pantalla de Catálogo (CatalogScreen.tsx)

**Cambios:**
- Importada función `getProductPrice` y tipo `PriceType`
- Reemplazada lógica manual de precios con la función utilitaria
- Simplificado el código

**Antes:**
```typescript
const getPrice = () => {
  if (!priceType || priceType === 'ciudad') {
    return item.price || item.basePrice;
  } else if (priceType === 'interior') {
    return item.interiorPrice || item.price || item.basePrice;
  } else if (priceType === 'especial') {
    return item.specialPrice || item.price || item.basePrice;
  }
  return item.basePrice;
};

const displayPrice = getPrice();
```

**Después:**
```typescript
import { getProductPrice, type PriceType } from '../utils/priceUtils';

const displayPrice = getProductPrice(item, (priceType as PriceType) || 'ciudad');
```

### 5. Detalle de Producto (ProductDetailScreen.tsx)

**Cambios:**
- Agregado estado para `priceType`
- Carga el tipo de precio del cliente seleccionado desde AsyncStorage
- Usa `getProductPrice()` para mostrar precio y calcular total

**Código agregado:**
```typescript
import { getProductPrice, type PriceType } from '../utils/priceUtils';
import AsyncStorage from '@react-native-async-storage/async-storage';

const [priceType, setPriceType] = useState<PriceType>('ciudad');

const loadPriceType = async () => {
  const clientData = await AsyncStorage.getItem('selected_client');
  if (clientData) {
    const client = JSON.parse(clientData);
    setPriceType(client.priceType || 'ciudad');
  }
};

// Mostrar precio
<Text style={styles.price}>${getProductPrice(product, priceType)}</Text>

// Calcular total
${(parseFloat(getProductPrice(product, priceType)) * parseInt(quantity)).toFixed(2)}
```

## Flujo Completo

### 1. Backend → App Móvil
```
Backend (sync-router.ts)
  ↓ Envía producto con 3 precios
  {
    name: "Oil 3-in-1",
    basePrice: "1.40",
    priceCity: "1.40",
    priceInterior: "1.50",
    priceSpecial: "1.57"
  }
  ↓
Sincronización (sync.ts)
  ↓ Guarda en SQLite
  INSERT INTO products (..., priceCity, priceInterior, priceSpecial)
  ↓
SQLite Database
  | name       | priceCity | priceInterior | priceSpecial |
  |------------|-----------|---------------|--------------|
  | Oil 3-in-1 | 1.40      | 1.50          | 1.57         |
```

### 2. Mostrar Precio Correcto
```
Cliente seleccionado
  { priceType: "interior" }
  ↓
Producto cargado de SQLite
  {
    name: "Oil 3-in-1",
    priceCity: "1.40",
    priceInterior: "1.50",
    priceSpecial: "1.57"
  }
  ↓
getProductPrice(product, "interior")
  ↓ Retorna
  "1.50"
  ↓
UI muestra
  $1.50
```

## Archivos Modificados

1. ✅ `src/database/db.ts`
   - Versión de DB: 2 → 3
   - Agregadas columnas de precios
   - Migración v3 implementada

2. ✅ `src/utils/priceUtils.ts` (NUEVO)
   - Función `getProductPrice()`
   - Funciones auxiliares de formateo

3. ✅ `src/services/sync.ts`
   - Actualizada consulta SQL INSERT
   - Guarda los 3 precios

4. ✅ `src/screens/CatalogScreen.tsx`
   - Usa `getProductPrice()`
   - Código simplificado

5. ✅ `src/screens/ProductDetailScreen.tsx`
   - Carga `priceType` del cliente
   - Usa `getProductPrice()`

## Testing

### Caso de Prueba 1: Cliente Ciudad
```
Cliente: { priceType: "ciudad" }
Producto: { priceCity: "1.40", priceInterior: "1.50", priceSpecial: "1.57" }
Resultado esperado: $1.40 ✅
```

### Caso de Prueba 2: Cliente Interior
```
Cliente: { priceType: "interior" }
Producto: { priceCity: "1.40", priceInterior: "1.50", priceSpecial: "1.57" }
Resultado esperado: $1.50 ✅
```

### Caso de Prueba 3: Cliente Especial
```
Cliente: { priceType: "especial" }
Producto: { priceCity: "1.40", priceInterior: "1.50", priceSpecial: "1.57" }
Resultado esperado: $1.57 ✅
```

### Caso de Prueba 4: Fallback a basePrice
```
Cliente: { priceType: "interior" }
Producto: { basePrice: "1.40", priceCity: null, priceInterior: null }
Resultado esperado: $1.40 (fallback) ✅
```

## Beneficios

1. ✅ **Precios correctos** según tipo de cliente
2. ✅ **Código reutilizable** con función utilitaria
3. ✅ **Fácil mantenimiento** centralizado en un lugar
4. ✅ **Migración automática** de bases de datos existentes
5. ✅ **Fallback seguro** a basePrice si falta precio específico
6. ✅ **Type-safe** con TypeScript

## Próximos Pasos

1. ✅ Build en Expo
2. ⏳ Probar en dispositivo real
3. ⏳ Verificar migración en apps instaladas
4. ⏳ Monitorear logs de sincronización
5. ⏳ Validar cálculos de totales en pedidos

## Notas Técnicas

### Compatibilidad con Versiones Anteriores

La migración v3 es **no destructiva**:
- Apps existentes se actualizan automáticamente
- Datos existentes se preservan
- Si faltan precios específicos, usa `basePrice` como fallback

### Performance

- ✅ No hay impacto en performance
- ✅ Las consultas SQL son las mismas
- ✅ Solo se agrega lógica simple de selección

### Mantenimiento

Para agregar un nuevo tipo de precio en el futuro:
1. Agregar columna en `db.ts` (nueva migración v4)
2. Actualizar tipo `PriceType` en `priceUtils.ts`
3. Agregar caso en función `getProductPrice()`
4. Actualizar backend para enviar el nuevo precio

---

**Implementado por:** Manus AI  
**Fecha:** 10 de noviembre de 2025  
**Versión:** 1.0
