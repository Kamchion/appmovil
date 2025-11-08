# 📱 IMPORKAM Vendedores - App Móvil

Aplicación móvil para vendedores de IMPORKAM desarrollada con React Native y Expo.

## 🎯 Características

- ✅ **Autenticación de vendedores** con JWT
- ✅ **Sincronización con backend** vía tRPC
- ✅ **Funcionamiento offline** con SQLite
- ✅ **Gestión de pedidos** completa
- ✅ **Catálogo de productos** con imágenes
- ✅ **Gestión de clientes** asignados
- ✅ **Dashboard con estadísticas**
- ✅ **Historial de pedidos**

## 🚀 Tecnologías

- **React Native** - Framework móvil
- **Expo** - Plataforma de desarrollo
- **TypeScript** - Lenguaje tipado
- **SQLite** - Base de datos local
- **AsyncStorage** - Almacenamiento de tokens
- **tRPC** - Comunicación con backend
- **React Navigation** - Navegación entre pantallas

## 📦 Instalación

### Prerrequisitos

- Node.js 18+
- npm o yarn
- Expo CLI
- Android Studio (para emulador Android)
- Cuenta de Expo

### Pasos

1. **Clonar el repositorio**
```bash
git clone https://github.com/Kamchion/appmovil.git
cd appmovil
```

2. **Instalar dependencias**
```bash
npm install
```

3. **Iniciar en modo desarrollo**
```bash
npx expo start
```

4. **Compilar APK de producción**
```bash
eas build --platform android --profile production
```

## 🔧 Configuración

### Backend URL

El backend está configurado en `src/services/api.ts`:

```typescript
export const API_BASE_URL = 'https://manus-store-production.up.railway.app';
```

### Credenciales de Prueba

- **Usuario:** `omar`
- **Contraseña:** `123456`

## 📱 Estructura del Proyecto

```
appmovil/
├── src/
│   ├── screens/          # Pantallas de la app
│   │   ├── LoginScreen.tsx
│   │   ├── DashboardHomeScreen.tsx
│   │   ├── PedidosScreen.tsx
│   │   ├── ClientesScreen.tsx
│   │   ├── DashboardStatsScreen.tsx
│   │   ├── HistorialScreen.tsx
│   │   ├── CatalogScreen.tsx
│   │   ├── ProductDetailScreen.tsx
│   │   ├── CartScreen.tsx
│   │   ├── CheckoutScreen.tsx
│   │   └── OrdersScreen.tsx
│   ├── services/         # Servicios
│   │   ├── api.ts        # Comunicación con backend
│   │   ├── sync.ts       # Sincronización de datos
│   │   ├── cart.ts       # Gestión de carrito
│   │   └── imageCache.ts # Caché de imágenes
│   ├── database/         # Base de datos SQLite
│   │   └── db.ts
│   └── types/            # Tipos TypeScript
│       └── index.ts
├── assets/               # Recursos (iconos, imágenes)
├── App.tsx              # Componente principal
├── app.json             # Configuración de Expo
├── eas.json             # Configuración de EAS Build
├── package.json         # Dependencias
└── tsconfig.json        # Configuración TypeScript
```

## 🔄 Sincronización

La app sincroniza automáticamente:

1. **Catálogo de productos** - Todos los productos activos con imágenes
2. **Clientes asignados** - Lista de clientes del vendedor
3. **Pedidos pendientes** - Envío de pedidos creados offline

### Endpoints Utilizados

```typescript
// Login
POST /api/trpc/vendorAuth.login?batch=1

// Catálogo
GET /api/trpc/sync.getCatalog?batch=1

// Clientes
GET /api/trpc/sync.getClients?batch=1

// Subir pedidos
POST /api/trpc/sync.uploadOrders?batch=1
```

## 📊 Base de Datos Local

### Tablas

- **products** - 25 columnas (id, name, sku, price, images, etc.)
- **clients** - 24 columnas (id, name, email, company, etc.)
- **orders** - Pedidos creados
- **order_items** - Items de pedidos

## 🎨 Pantallas

### 1. Login
- Autenticación con usuario y contraseña
- Almacenamiento seguro de token JWT

### 2. Dashboard
- Vista general de estadísticas
- Acceso rápido a funciones principales
- Botón de sincronización

### 3. Pedidos
- Crear nuevos pedidos
- Seleccionar cliente
- Agregar productos al carrito
- Guardar pedidos offline

### 4. Clientes
- Lista de clientes asignados
- Información detallada de cada cliente
- Búsqueda y filtros

### 5. Catálogo
- Lista completa de productos
- Imágenes y detalles
- Búsqueda por nombre o SKU

### 6. Historial
- Pedidos enviados
- Estado de sincronización
- Detalles de cada pedido

## 🔐 Seguridad

- ✅ Tokens JWT almacenados de forma segura
- ✅ Comunicación HTTPS con backend
- ✅ Validación de datos en cliente y servidor
- ✅ Manejo de errores robusto

## 📝 Versiones

### v1.3.0 (Actual)
- ✅ Corrección de sincronización con backend tRPC
- ✅ Simplificación de lógica de API
- ✅ Formato batch correcto para tRPC
- ✅ Logs detallados para debugging
- ✅ Descarga de 51 productos completos

### v1.2.1
- ❌ Problemas de sincronización
- ❌ Formato incorrecto de tRPC

### v1.2.0
- Primera versión funcional básica

## 🐛 Resolución de Problemas

### La sincronización falla

1. Verificar conexión a internet
2. Cerrar sesión y volver a iniciar sesión
3. Verificar que el backend esté funcionando
4. Revisar logs con `adb logcat`

### No se muestran imágenes

1. Verificar URLs de Cloudflare R2
2. Limpiar caché de imágenes
3. Verificar permisos de red

### La app se cierra

1. Limpiar datos de la app
2. Reinstalar la app
3. Verificar memoria disponible

## 📞 Soporte

Para problemas o preguntas, revisar:
- Logs de la app con ADB
- Documentación en `/ARQUITECTURA.md`
- Manual de usuario en `/MANUAL_USUARIO.md`

## 🚀 Compilación

### APK de Producción

```bash
# Configurar EAS CLI
npm install -g eas-cli
eas login

# Compilar APK
eas build --platform android --profile production

# Descargar APK
# El link se mostrará al finalizar la compilación
```

### APK de Desarrollo

```bash
eas build --platform android --profile development
```

## 📄 Licencia

Propiedad de IMPORKAM - Todos los derechos reservados

## 👥 Equipo

Desarrollado para IMPORKAM por el equipo de desarrollo móvil.

---

**Última actualización:** 7 de Noviembre, 2025
**Versión:** 1.3.0
**Estado:** ✅ Funcional
