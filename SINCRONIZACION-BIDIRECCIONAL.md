# ✅ Sincronización Bidireccional de Clientes Implementada

## 🎯 Funcionalidad

La sincronización de clientes ahora es **bidireccional**:

1. **Web → App**: Descarga clientes asignados al vendedor
2. **App → Web**: Sube cambios de clientes editados en la app

---

## 🔧 Cambios Implementados

### Backend (manus-store)

#### 1. Nuevo Endpoint: `sync.updateClient`

**Archivo:** `server/sync-router.ts`

**Función:** Actualizar datos de un cliente desde la app móvil

**Campos actualizables:**
- name
- email
- companyName
- companyTaxId
- phone
- address
- gpsLocation
- city
- state
- zipCode
- country
- contactPerson
- priceType

**Seguridad:**
- Verifica que el usuario sea vendedor
- Verifica que el cliente pertenece al vendedor (por agentNumber)

**Commit:** `528d056`

---

### App Móvil (vendedor-app)

#### 1. Base de Datos Local

**Archivo:** `src/database/db.ts`

**Nuevos campos en tabla `clients`:**
- `modifiedAt TEXT` - Timestamp de última modificación local
- `needsSync INTEGER DEFAULT 0` - Flag para indicar si necesita sincronizarse

#### 2. Función de Actualización

**Archivo:** `src/services/api-client-update.ts`

**Función:** `updateClientOnServer(token, clientId, updates)`

Envía los cambios de un cliente al servidor.

#### 3. Sincronización Automática

**Archivo:** `src/services/sync.ts`

**Modificación en `syncCatalog()`:**

1. **Antes de descargar clientes:**
   - Busca clientes con `needsSync = 1`
   - Sube cambios al servidor
   - Marca como sincronizados (`needsSync = 0`)

2. **Después:**
   - Descarga clientes del servidor
   - Actualiza base de datos local

#### 4. Edición de Clientes

**Archivo:** `src/screens/ClientesScreen.tsx`

**Modificación:**
- Al guardar cambios de un cliente, marca `needsSync = 1`
- Establece `modifiedAt` con timestamp actual

**Commit:** `3ddd603`

---

## 📊 Flujo de Sincronización

### Escenario 1: Vendedor edita cliente en la app

```
1. Usuario edita cliente en ClientesScreen
2. Se guarda en DB local con needsSync = 1
3. Usuario presiona "Sincronizar"
4. syncCatalog() detecta cliente con needsSync = 1
5. Sube cambios al servidor con updateClient
6. Servidor actualiza cliente en base de datos web
7. Marca needsSync = 0 en app
```

### Escenario 2: Admin edita cliente en la web

```
1. Admin edita cliente en panel web
2. Cambios se guardan en base de datos
3. Vendedor presiona "Sincronizar" en app
4. syncCatalog() descarga clientes actualizados
5. Sobrescribe datos locales con datos del servidor
```

---

## 🔄 Resolución de Conflictos

**Estrategia:** Last Write Wins (Última escritura gana)

- Si hay cambios locales pendientes, se suben primero
- Luego se descargan datos del servidor
- Los datos del servidor sobrescriben los locales

**Nota:** En futuras versiones se puede implementar merge inteligente o detección de conflictos.

---

## 🧪 Cómo Probar

### Prueba 1: App → Web

1. Abrir app móvil
2. Ir a "Clientes"
3. Editar un cliente (cambiar teléfono, dirección, etc.)
4. Guardar cambios
5. Presionar "Sincronizar"
6. Verificar en panel web que los cambios se reflejaron

### Prueba 2: Web → App

1. Abrir panel web
2. Editar un cliente asignado al vendedor
3. Guardar cambios
4. Abrir app móvil
5. Presionar "Sincronizar"
6. Verificar que los cambios se descargaron

---

## ✅ Resumen de Commits

### Backend
- `528d056` - Add updateClient endpoint para sincronización bidireccional

### App Móvil
- `3ddd603` - Add sincronización bidireccional de clientes
  - Nuevos campos en DB: modifiedAt, needsSync
  - Nueva función: updateClientOnServer()
  - Modificado: syncCatalog() para subir cambios
  - Modificado: ClientesScreen para marcar needsSync

---

## 📝 Campos Sincronizados

| Campo | App → Web | Web → App |
|-------|-----------|-----------|
| name | ✅ | ✅ |
| email | ✅ | ✅ |
| companyName | ✅ | ✅ |
| companyTaxId | ✅ | ✅ |
| phone | ✅ | ✅ |
| address | ✅ | ✅ |
| gpsLocation | ✅ | ✅ |
| city | ✅ | ✅ |
| state | ✅ | ✅ |
| zipCode | ✅ | ✅ |
| country | ✅ | ✅ |
| contactPerson | ✅ | ✅ |
| priceType | ✅ | ✅ |
| clientNumber | ❌ | ✅ |
| agentNumber | ❌ | ✅ |

**Nota:** clientNumber y agentNumber solo se sincronizan de Web → App (no se pueden editar en la app).

---

## 🚀 Deploy Pendiente

Para que funcione completamente:

1. **Backend:** Deploy en Railway (commit `528d056`)
2. **App:** Compilar APK v1.6.0 (commit `3ddd603`)

---

## 🎯 Próximas Mejoras

1. Sincronización incremental (solo campos modificados)
2. Detección de conflictos
3. Merge inteligente de cambios
4. Historial de cambios
5. Sincronización en tiempo real (WebSockets)

---

**Fecha:** 2025-11-08  
**Versión:** 1.6.0  
**Estado:** ✅ Implementado, pendiente de deploy y pruebas
