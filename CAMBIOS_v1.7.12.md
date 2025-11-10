# Cambios en Versión 1.7.12

**Fecha:** 10 de noviembre de 2024  
**Tipo:** Bug Fix - Corrección de imágenes deformadas y logs de diagnóstico

---

## 🐛 Problemas Corregidos

### 1. **Imágenes Deformadas en Catálogo**

**Problema:**
- Las imágenes de productos se mostraban estiradas/deformadas
- No mantenían sus proporciones originales
- Las baterías se veían alargadas verticalmente

**Causa:**
- Conflicto entre `resizeMode="cover"` y `aspectRatio: 1`
- `cover` estira la imagen para llenar el espacio, cortando partes o deformándola

**Solución:**
```typescript
// ❌ ANTES (línea 342-344)
<Image
  source={{ uri: imagePath }}
  style={[styles.productImage, { aspectRatio: 1 }]}
  resizeMode="cover"  // Estiraba la imagen
/>

// ✅ DESPUÉS
<Image
  source={{ uri: imagePath }}
  style={styles.productImage}  // Ya tiene aspectRatio: 1 en estilos
  resizeMode="contain"  // Mantiene proporciones
/>
```

**Resultado:**
- ✅ Imágenes cuadradas sin deformación
- ✅ Proporciones originales mantenidas
- ✅ Imagen completa visible dentro del marco

---

### 2. **Logs de Diagnóstico para Productos Faltantes**

**Implementación:**
- Agregados logs detallados para diagnosticar productos SPRAY faltantes
- Muestra todos los productos SPRAY en la base de datos
- Indica razones de filtrado (campos faltantes, sin precios, etc.)

**Logs agregados:**
```typescript
// 🔍 DEBUG: Verificar productos SPRAY
const sprayProducts = await db.getAllAsync<Product>(
  `SELECT sku, name, parentSku, isActive, hideInCatalog, basePrice, priceCity, priceInterior, priceSpecial 
   FROM products 
   WHERE name LIKE '%SPRAY%' OR sku LIKE '%SPRAY%'`
);

if (sprayProducts.length > 0) {
  console.log(`\n🔍 DEBUG: Productos SPRAY en BD (${sprayProducts.length}):`);
  sprayProducts.forEach(p => {
    console.log(`  - ${p.name} (${p.sku})`);
    console.log(`    parentSku: ${p.parentSku || 'NULL'}`);
    console.log(`    isActive: ${p.isActive}, hideInCatalog: ${p.hideInCatalog}`);
    console.log(`    Precios: base=${p.basePrice}, city=${p.priceCity}, interior=${p.priceInterior}, special=${p.priceSpecial}`);
  });
}
```

**Alertas específicas:**
```typescript
// 🔍 DEBUG: Alertar si es un producto SPRAY
if (p.name?.includes('SPRAY') || p.sku?.includes('SPRAY')) {
  console.error('❌ SPRAY FILTRADO - Razón:', !hasBasicFields ? 'Campos básicos faltantes' : 'Sin precios válidos');
}
```

---

## 🔧 Cambios en Backend (Repositorio: manus-store)

### **Commit:** `71eea97`

**Implementación de lógica de `hideInCatalog` en endpoints de sincronización**

**Problema identificado:**
- La app web usa `getProducts()` que SÍ tiene la lógica correcta de visibilidad
- La app móvil usa `getCatalog()` y `getChanges()` que NO tenían esta lógica
- Resultado: productos padre con variantes no aparecían en la app móvil

**Solución implementada en `/server/sync-router.ts`:**

```typescript
// Filtrar productos basándose en lógica de visibilidad:
// - Productos simples (sin variantes): mostrar si hideInCatalog = false
// - Productos padre (con variantes): mostrar si al menos una variante tiene hideInCatalog = false
// - Variantes: NO mostrar directamente (solo a través del padre)

for (const product of allProducts) {
  // Saltar productos que son variantes (tienen parentSku)
  if (product.parentSku) {
    continue;
  }
  
  // Verificar si este producto tiene variantes (es un padre)
  const variants = await db.select().from(products)
    .where(and(
      eq(products.parentSku, product.sku),
      eq(products.isActive, true)
    ));
  
  if (variants.length > 0) {
    // Es un producto padre - mostrar si al menos una variante es visible
    const hasVisibleVariant = variants.some(v => !v.hideInCatalog);
    if (hasVisibleVariant) {
      visibleProducts.push(product);
    }
  } else {
    // Es un producto simple (sin variantes) - mostrar si no está oculto
    if (!product.hideInCatalog) {
      visibleProducts.push(product);
    }
  }
}
```

**Endpoints modificados:**
1. `getCatalog` - Primera sincronización completa
2. `getChanges` - Sincronización incremental

---

## 📝 Archivos Modificados

### App Móvil (appmovil)
- `src/screens/CatalogScreen.tsx`
  - Corregido `resizeMode` de "cover" a "contain"
  - Agregados logs de diagnóstico para productos SPRAY
  - Mejorada información en logs de productos filtrados

- `app.json`
  - Versión: `1.7.11` → `1.7.12`
  - versionCode: `171` → `172`

### Backend (manus-store)
- `server/sync-router.ts`
  - Implementada lógica de `hideInCatalog` en `getCatalog`
  - Implementada lógica de `hideInCatalog` en `getChanges`

---

## 🧪 Pruebas Recomendadas

1. **Verificar imágenes cuadradas:**
   - Abrir catálogo
   - Verificar que todas las imágenes sean cuadradas
   - Verificar que no haya deformación

2. **Verificar productos con variantes:**
   - Sincronizar catálogo completo
   - Buscar "PINTURA SPRAY" en el catálogo
   - Verificar que aparezca el producto padre
   - Hacer clic en "Ver opciones"
   - Verificar que se muestren todas las variantes

3. **Revisar logs de diagnóstico:**
   - Abrir consola de desarrollo
   - Sincronizar catálogo
   - Buscar logs "🔍 DEBUG: Productos SPRAY en BD"
   - Verificar información detallada de productos SPRAY

---

## 📊 Impacto

**Positivo:**
- ✅ Imágenes se muestran correctamente sin deformación
- ✅ Productos padre con variantes ahora aparecen en el catálogo
- ✅ Logs detallados para diagnosticar problemas futuros
- ✅ Consistencia entre app web y app móvil

**Consideraciones:**
- ⚠️ Requiere sincronización completa para ver productos padre faltantes
- ⚠️ Backend debe estar actualizado (commit 71eea97) antes de usar la app

---

## 🔄 Próximos Pasos

1. **Desplegar backend actualizado** (commit 71eea97)
2. **Compilar app móvil v1.7.12**
3. **Probar sincronización completa**
4. **Verificar que PINTURA SPRAY aparezca**
5. **Remover logs de diagnóstico** si todo funciona correctamente

---

## 📌 Notas Técnicas

**Lógica de Visibilidad de Productos:**

| Tipo de Producto | Condición | Acción |
|------------------|-----------|--------|
| Variante (tiene `parentSku`) | Cualquiera | ❌ NO mostrar directamente |
| Producto simple (sin variantes) | `hideInCatalog = false` | ✅ Mostrar |
| Producto simple (sin variantes) | `hideInCatalog = true` | ❌ NO mostrar |
| Producto padre (con variantes) | Al menos 1 variante con `hideInCatalog = false` | ✅ Mostrar |
| Producto padre (con variantes) | Todas las variantes con `hideInCatalog = true` | ❌ NO mostrar |

**Esta lógica ahora es consistente entre:**
- ✅ App Web (`getProducts()`)
- ✅ App Móvil (`getCatalog()` y `getChanges()`)
