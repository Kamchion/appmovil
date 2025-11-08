# Análisis Completo del Flujo de Pedidos - Web App

## 🔄 Flujo Completo

### **1. VendedorPedidos** (`/vendedor/pedidos`)

**Componente:** `VendedorPedidos.tsx`

**Al entrar:**
- Muestra diálogo modal de selección de cliente (`showClientDialog = true`)

**Elementos del Diálogo:**
1. **Header:** "Seleccionar Cliente"
2. **Buscador:**
   - Input con icono de búsqueda
   - Placeholder: "Buscar cliente por nombre, contacto o email..."
   - Filtra en tiempo real por: companyName, contactPerson, email

3. **Botón "Crear Nuevo Cliente":**
   - Variant: outline
   - Full width
   - Icono: Plus
   - Abre segundo diálogo para crear cliente

4. **Lista de Clientes:**
   - Cards clickeables con hover effect
   - Cada card muestra:
     - **Nombre de empresa** (font-semibold, text-lg)
     - **Contacto:** nombre de persona
     - **Dirección:** si existe
     - **Teléfono:** si existe
     - **Badge de tipo de precio:** ciudad (azul), interior (verde), especial (morado)
   - Al hacer click:
     - Guarda `selectedClientId` en localStorage
     - Redirige a `/products`

**Diálogo de Crear Cliente:**
- **Campos:**
  1. ID del Cliente (auto-generado, editable)
  2. Nombre de la Empresa * (required)
  3. Persona de Contacto * (required)
  4. Email (opcional)
  5. Teléfono * (required)
  6. Dirección (opcional)
  7. RUC (opcional)
  8. Ubicación GPS (opcional, con botón para obtener ubicación actual)
  9. Tipo de Precio * (select: ciudad/interior/especial)

- **Botones:**
  - Cancelar (outline)
  - Crear Cliente (disabled si faltan campos required)

---

### **2. Products** (`/products`)

**Componente:** `Products.tsx`

**Comportamiento:**
- Lee `selectedClientId` de localStorage
- Carga productos con precios según tipo de cliente
- Usuario agrega productos al carrito
- Botón "Ver Carrito" en header

**Características:**
- Búsqueda de productos
- Filtros por categoría
- Infinite scroll
- Productos con variantes muestran "Ver Opciones"
- Productos sin variantes muestran selector de cantidad + botón "Agregar"

---

### **3. Cart** (`/cart`)

**Componente:** `Cart.tsx`

**Layout:**
- Grid de 2 columnas en desktop (lg:grid-cols-3)
  - Columna 1-2: Lista de items
  - Columna 3: Resumen del pedido

**Items del Carrito:**
- Card por cada producto
- Muestra:
  - Imagen del producto (12x12)
  - Nombre y SKU
  - Precio unitario
  - Controles de cantidad (-, input, +)
  - Subtotal del item
  - Botón eliminar (icono basura)

**Resumen del Pedido (Sidebar):**
- Card fijo con:
  - Título: "Resumen del Pedido"
  - Subtotal
  - Impuestos (si aplica)
  - Total (destacado)
  - Textarea para notas del cliente
  - Botón "Realizar Pedido" (full width, primary)

**Funcionalidades:**
- Actualizar cantidad (con mutación)
- Eliminar item
- Agregar nota del cliente
- Checkout:
  - Toma `selectedClientId` de localStorage
  - Crea pedido con `orders.checkout`
  - Limpia `selectedClientId` después de éxito
  - Redirige a `/orders/{orderId}`

---

## 📱 Diferencias con App Móvil Actual

### **PedidosScreen (Móvil)**
❌ Diseño diferente
❌ No replica exactamente el diálogo de la web
✅ Tiene la misma funcionalidad básica

### **CatalogScreen (Móvil)**
❌ No muestra productos con precios del cliente seleccionado
❌ No maneja variantes correctamente
✅ Tiene búsqueda y filtros

### **CartScreen (Móvil)**
❌ Diseño diferente
❌ No tiene el layout de 2 columnas
❌ No muestra resumen del pedido en sidebar

### **CheckoutScreen (Móvil)**
❓ Existe pero no está integrado correctamente

---

## 🎯 Plan de Implementación

### **Fase 1: Replicar VendedorPedidos**
1. Mantener estructura de diálogo modal
2. Replicar diseño de cards de clientes
3. Replicar formulario de crear cliente
4. Asegurar que guarda `selectedClientId` en AsyncStorage

### **Fase 2: Actualizar CatalogScreen**
1. Leer `selectedClientId` de AsyncStorage
2. Cargar precios según tipo de cliente
3. Implementar manejo de variantes

### **Fase 3: Rediseñar CartScreen**
1. Layout de 2 columnas (scroll + sidebar fijo)
2. Cards de items con imagen
3. Controles de cantidad inline
4. Sidebar con resumen

### **Fase 4: Implementar Checkout**
1. Botón "Realizar Pedido" en CartScreen
2. Crear pedido con cliente seleccionado
3. Limpiar `selectedClientId` después de éxito
4. Navegar a pantalla de confirmación

---

## 🎨 Guía de Diseño

### **Colores de Badges de Tipo de Precio:**
- **Ciudad:** bg-blue-100 text-blue-800
- **Interior:** bg-green-100 text-green-800
- **Especial:** bg-purple-100 text-purple-800

### **Tipografía:**
- Títulos de empresa: font-semibold text-lg
- Subtítulos (contacto, dirección): text-sm text-gray-600
- Labels de campos: font-medium

### **Espaciado:**
- Cards de clientes: p-4, space-y-2
- Formularios: space-y-4
- Botones: gap-2 para iconos

### **Interacciones:**
- Cards clickeables: hover:bg-gray-50 hover:border-blue-500
- Botones disabled: opacity reducida
- Loading states: "Cargando...", "Creando...", etc.
