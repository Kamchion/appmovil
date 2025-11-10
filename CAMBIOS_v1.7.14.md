# Cambios en Versión 1.7.14

**Fecha:** 10 de noviembre de 2024  
**Tipo:** Feature - Gestión de pedidos pendientes y mejoras de navegación

---

## 🎯 Nuevas Funcionalidades

### **1. Botón de Regreso en Catálogo con Advertencia**

**Implementación:**
- Botón de regreso (←) en la barra superior del catálogo
- Reemplaza el texto "Catálogo"
- Al presionar:
  - **Si NO hay productos en el carrito:** Regresa directamente al panel principal
  - **Si HAY productos en el carrito:** Muestra advertencia antes de salir

**Advertencia:**
```
"Tienes productos en el carrito. Si sales, se borrará todo el pedido. ¿Deseas continuar?"

Opciones:
- Cancelar (permanece en el catálogo)
- Salir y Borrar (borra el carrito y regresa al panel)
```

**Beneficio:**
- Evita pérdida accidental de pedidos en progreso
- Navegación más intuitiva

---

### **2. Botón "Guardar sin Enviar" en el Carrito**

**Ubicación:** Pantalla del carrito, entre "Enviar Pedido" y "Seguir Comprando"

**Función:**
- Guarda el pedido actual en la base de datos local
- **NO sincroniza** con el backend (permanece local)
- Limpia el carrito actual
- Permite al vendedor hacer pedidos a otros clientes

**Flujo:**
1. Vendedor agrega productos al carrito para Cliente A
2. Presiona "Guardar sin Enviar"
3. Pedido se guarda localmente como "Pendiente por enviar"
4. Carrito se limpia
5. Vendedor puede hacer pedido para Cliente B
6. Más tarde, puede continuar el pedido de Cliente A desde el historial

**Diseño del botón:**
- Fondo blanco con borde azul
- Icono de guardar (💾)
- Texto: "GUARDAR SIN ENVIAR"

---

### **3. Gestión de Pedidos Pendientes en Historial**

**Visualización:**
- Pedidos guardados localmente se muestran en el historial
- Badge: "⏳ Pendiente" (en lugar de "✓ Sincronizado")
- Ordenados por fecha de creación (más recientes primero)

**Opciones al seleccionar un pedido pendiente:**

#### **Opción 1: Continuar Pedido**
- Carga los productos del pedido pendiente al carrito
- Establece el cliente asociado
- Borra el pedido pendiente de la base de datos
- Navega al carrito
- El vendedor puede agregar más productos o modificar cantidades

#### **Opción 2: Enviar sin Seguir Comprando**
- Envía el pedido directamente al backend
- **NO** carga productos al carrito
- Borra el pedido pendiente tras envío exitoso
- Ideal para enviar pedidos guardados sin modificaciones

**Diálogo de opciones:**
```
"Pedido Pendiente
Pedido #XXXXXXXX
Cliente: [Nombre del Cliente]
Total: $XXX.XX

¿Qué deseas hacer?"

Opciones:
- Cancelar
- Continuar Pedido
- Enviar sin Seguir Comprando
```

---

## 🗄️ Estructura de Datos

### **Tabla: `pending_orders`**

Ya existente en la base de datos, ahora utilizada para:

**Campos principales:**
- `id`: Identificador único (formato: PENDING-timestamp-random)
- `clientId`: ID del cliente asociado
- `customerName`: Nombre del cliente
- `customerNote`: Notas del pedido
- `subtotal`, `tax`, `total`: Montos del pedido
- `status`: Estado ('pending')
- `synced`: 0 = pendiente local, 1 = sincronizado
- `createdAt`: Fecha de creación

### **Tabla: `pending_order_items`**

**Campos principales:**
- `id`: Identificador único
- `orderId`: Referencia al pedido pendiente
- `productId`: ID del producto
- `productName`: Nombre del producto
- `quantity`: Cantidad
- `pricePerUnit`: Precio unitario
- `subtotal`: Subtotal del item

---

## 🔧 Cambios Técnicos

### **Archivos Modificados:**

#### **1. `src/screens/CatalogScreen.tsx`**

**Función `handleGoBack` agregada:**
```typescript
const handleGoBack = () => {
  if (cartCount.lines > 0) {
    Alert.alert(
      'Advertencia',
      'Tienes productos en el carrito. Si sales, se borrará todo el pedido. ¿Deseas continuar?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Salir y Borrar',
          style: 'destructive',
          onPress: async () => {
            const db = getDatabase();
            await db.runAsync('DELETE FROM cart');
            navigation.navigate('Home');
          },
        },
      ]
    );
  } else {
    navigation.navigate('Home');
  }
};
```

**Cambios en UI:**
- Reemplazado `<Text>Catálogo</Text>` por botón de regreso
- Agregado estilo `topBarBackButton`

---

#### **2. `src/screens/CartScreen.tsx`**

**Función `handleSaveWithoutSending` agregada:**
```typescript
const handleSaveWithoutSending = async () => {
  // Validaciones
  if (cart.length === 0) return;
  if (!selectedClient) return;

  // Guardar pedido pendiente
  const orderId = `PENDING-${Date.now()}-${random}`;
  await db.runAsync(
    `INSERT INTO pending_orders (...) VALUES (...)`,
    [orderId, clientId, ...]
  );

  // Guardar items
  for (const item of cart) {
    await db.runAsync(
      `INSERT INTO pending_order_items (...) VALUES (...)`,
      [itemId, orderId, ...]
    );
  }

  // Limpiar carrito
  await clearCart();
  
  // Regresar al panel
  navigation.reset({ index: 0, routes: [{ name: 'DashboardHome' }] });
};
```

**Cambios en UI:**
- Agregado botón "Guardar sin Enviar" entre "Enviar Pedido" y "Seguir Comprando"
- Estilos: `saveButton`, `saveButtonText`

---

#### **3. `src/screens/OrdersScreen.tsx`**

**Función `handleOrderPress` modificada:**
```typescript
const handleOrderPress = () => {
  if (!item.synced) {
    // Mostrar opciones para pedidos pendientes
    Alert.alert(
      'Pedido Pendiente',
      `...`,
      [
        { text: 'Cancelar' },
        { text: 'Continuar Pedido', onPress: loadToCart },
        { text: 'Enviar sin Seguir Comprando', onPress: sendDirectly },
      ]
    );
  } else {
    // Mostrar detalle para pedidos sincronizados
    navigation.navigate('OrderDetail', { orderId: item.id });
  }
};
```

**Lógica "Continuar Pedido":**
1. Obtener items del pedido pendiente
2. Limpiar carrito actual
3. Agregar items al carrito
4. Establecer cliente seleccionado
5. Borrar pedido pendiente
6. Navegar al carrito

**Lógica "Enviar sin Seguir Comprando":**
1. Obtener items del pedido pendiente
2. Construir objeto cart para API
3. Llamar `createOrderOnline()`
4. Borrar pedido pendiente
5. Mostrar confirmación

---

## 📊 Flujos de Usuario

### **Flujo 1: Guardar Pedido para Continuar Más Tarde**

```
1. Vendedor agrega productos al carrito (Cliente A)
2. Presiona "Guardar sin Enviar"
3. Pedido se guarda localmente
4. Carrito se limpia
5. Vendedor puede hacer pedido para Cliente B
6. Luego, desde Historial:
   - Selecciona pedido pendiente de Cliente A
   - Presiona "Continuar Pedido"
   - Carrito se carga con productos de Cliente A
   - Puede agregar más productos
   - Presiona "Enviar Pedido"
```

### **Flujo 2: Enviar Pedido Guardado sin Modificaciones**

```
1. Vendedor tiene pedidos guardados en Historial
2. Selecciona pedido pendiente
3. Presiona "Enviar sin Seguir Comprando"
4. Pedido se envía directamente al backend
5. Pedido se elimina de pendientes
6. Confirmación de envío exitoso
```

### **Flujo 3: Salir del Catálogo con Carrito Lleno**

```
1. Vendedor está en el catálogo con productos en el carrito
2. Presiona botón de regreso (←)
3. Aparece advertencia:
   "Tienes productos en el carrito. Si sales, se borrará todo el pedido."
4. Opciones:
   a) Cancelar → Permanece en el catálogo
   b) Salir y Borrar → Carrito se borra, regresa al panel
```

---

## ✅ Beneficios

### **Para Vendedores:**
1. **Multitarea:** Pueden manejar pedidos de múltiples clientes simultáneamente
2. **Flexibilidad:** Guardar pedidos parciales y continuarlos más tarde
3. **Sin pérdidas:** Advertencia al salir evita borrado accidental
4. **Eficiencia:** Enviar pedidos guardados sin recargarlos al carrito

### **Para el Negocio:**
1. **Menos errores:** Advertencias previenen pérdida de datos
2. **Mejor UX:** Flujo más intuitivo y profesional
3. **Productividad:** Vendedores pueden atender más clientes
4. **Datos locales:** Pedidos guardados no requieren conexión

---

## 🧪 Pruebas Recomendadas

### **1. Botón de Regreso en Catálogo**
- [ ] Presionar regreso con carrito vacío → Debe regresar directamente
- [ ] Presionar regreso con productos → Debe mostrar advertencia
- [ ] Cancelar advertencia → Debe permanecer en catálogo
- [ ] Confirmar "Salir y Borrar" → Debe borrar carrito y regresar

### **2. Guardar sin Enviar**
- [ ] Agregar productos al carrito
- [ ] Presionar "Guardar sin Enviar"
- [ ] Verificar que pedido aparece en Historial como "Pendiente"
- [ ] Verificar que carrito se limpió
- [ ] Verificar que cliente se deseleccionó

### **3. Continuar Pedido**
- [ ] Seleccionar pedido pendiente en Historial
- [ ] Presionar "Continuar Pedido"
- [ ] Verificar que productos se cargaron al carrito
- [ ] Verificar que cliente se seleccionó automáticamente
- [ ] Agregar más productos
- [ ] Enviar pedido completo

### **4. Enviar sin Seguir Comprando**
- [ ] Seleccionar pedido pendiente en Historial
- [ ] Presionar "Enviar sin Seguir Comprando"
- [ ] Verificar que pedido se envió al backend
- [ ] Verificar que pedido se eliminó de pendientes
- [ ] Verificar que carrito permanece vacío

### **5. Múltiples Pedidos Pendientes**
- [ ] Crear pedido para Cliente A y guardar
- [ ] Crear pedido para Cliente B y guardar
- [ ] Crear pedido para Cliente C y guardar
- [ ] Verificar que todos aparecen en Historial
- [ ] Continuar pedido de Cliente B
- [ ] Verificar que solo se cargó pedido de Cliente B

---

## 📝 Archivos Modificados

- `src/screens/CatalogScreen.tsx`
  - Agregado botón de regreso con advertencia
  - Función `handleGoBack`
  - Estilo `topBarBackButton`

- `src/screens/CartScreen.tsx`
  - Agregado botón "Guardar sin Enviar"
  - Función `handleSaveWithoutSending`
  - Estilos `saveButton`, `saveButtonText`

- `src/screens/OrdersScreen.tsx`
  - Modificado `handleOrderPress` para pedidos pendientes
  - Lógica "Continuar Pedido"
  - Lógica "Enviar sin Seguir Comprando"

- `app.json`
  - Versión: `1.7.13` → `1.7.14`
  - versionCode: `173` → `174`

---

## 📌 Notas Importantes

1. **Pedidos pendientes son LOCALES:**
   - No se sincronizan automáticamente con el backend
   - Solo se envían cuando el usuario lo solicita explícitamente

2. **Límite de pedidos pendientes:**
   - No hay límite técnico
   - Recomendado: Enviar pedidos regularmente para evitar acumulación

3. **Pérdida de datos:**
   - Si se desinstala la app, pedidos pendientes se pierden
   - Recomendado: Enviar pedidos antes de desinstalar

4. **Compatibilidad:**
   - Funciona offline (guardado local)
   - Requiere conexión solo para "Enviar sin Seguir Comprando"

---

## 🔄 Historial de Versiones Relacionadas

- **v1.7.11:** Diseño responsivo para tablets
- **v1.7.12:** Corrección de imágenes deformadas y logs de diagnóstico
- **v1.7.13:** Mejora de usabilidad del botón de carrito
- **v1.7.14:** Gestión de pedidos pendientes y mejoras de navegación ← ACTUAL
