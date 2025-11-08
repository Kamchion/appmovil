import AsyncStorage from '@react-native-async-storage/async-storage';
import { ApiCatalogResponse, ApiUploadOrdersResponse } from '../types';

/**
 * Servicio de API para comunicación con el backend
 * Maneja autenticación y sincronización con tRPC
 */

export const API_BASE_URL = 'https://manus-store-production.up.railway.app';
const TRPC_BASE_URL = `${API_BASE_URL}/api/trpc`;

const TOKEN_KEY = 'vendor_token';

/**
 * Obtiene el token de autenticación almacenado
 */
async function getAuthToken(): Promise<string | null> {
  return await AsyncStorage.getItem(TOKEN_KEY);
}

/**
 * Guarda el token de autenticación
 */
export async function setAuthToken(token: string): Promise<void> {
  await AsyncStorage.setItem(TOKEN_KEY, token);
}

/**
 * Elimina el token de autenticación (logout)
 */
export async function clearAuthToken(): Promise<void> {
  await AsyncStorage.removeItem(TOKEN_KEY);
}

/**
 * Parsea la respuesta de tRPC que puede venir en formato batch o individual
 */
function parseTRPCResponse(data: any): any {
  console.log('📦 Raw tRPC Response:', JSON.stringify(data).substring(0, 500));
  
  // Si es un array (batch mode)
  if (Array.isArray(data)) {
    const firstItem = data[0];
    if (firstItem?.result?.data?.json) {
      console.log('✅ Parsed batch response (json)');
      return firstItem.result.data.json;
    }
    if (firstItem?.result?.data) {
      console.log('✅ Parsed batch response (data)');
      return firstItem.result.data;
    }
    console.log('⚠️ Returning raw batch array');
    return firstItem || data;
  }
  
  // Si es un objeto (non-batch mode)
  if (data?.result?.data?.json) {
    console.log('✅ Parsed object response (json)');
    return data.result.data.json;
  }
  if (data?.result?.data) {
    console.log('✅ Parsed object response (data)');
    return data.result.data;
  }
  
  console.log('⚠️ Returning raw response');
  return data;
}

/**
 * Realiza una petición tRPC query (GET)
 */
async function trpcQuery<T>(
  procedure: string,
  input?: any
): Promise<T> {
  const token = await getAuthToken();
  
  if (!token) {
    throw new Error('No hay sesión activa. Por favor inicia sesión.');
  }

  // Construir URL con batch=1 para formato consistente
  let url = `${TRPC_BASE_URL}/${procedure}?batch=1`;
  
  // Si hay input, agregarlo como query parameter
  if (input !== undefined) {
    const inputParam = encodeURIComponent(JSON.stringify({ "0": { json: input } }));
    url += `&input=${inputParam}`;
  }

  console.log('🔵 tRPC Query:', procedure);
  console.log('🔗 URL:', url.substring(0, 150) + '...');

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('❌ tRPC Error:', response.status, errorText);
    throw new Error(`Error HTTP ${response.status}: ${errorText}`);
  }

  const data = await response.json();
  return parseTRPCResponse(data);
}

/**
 * Realiza una petición tRPC mutation (POST)
 */
async function trpcMutation<T>(
  procedure: string,
  input: any
): Promise<T> {
  const token = await getAuthToken();
  
  if (!token) {
    throw new Error('No hay sesión activa. Por favor inicia sesión.');
  }

  console.log('🟢 tRPC Mutation:', procedure);

  const response = await fetch(`${TRPC_BASE_URL}/${procedure}?batch=1`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({ "0": { json: input } }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('❌ tRPC Mutation Error:', response.status, errorText);
    throw new Error(`Error HTTP ${response.status}: ${errorText}`);
  }

  const data = await response.json();
  return parseTRPCResponse(data);
}

/**
 * Inicia sesión con usuario y contraseña
 */
export async function login(
  username: string,
  password: string
): Promise<{
  success: boolean;
  token: string;
  user: {
    id: string;
    username: string;
    email: string;
    name: string;
    role: string;
  };
}> {
  console.log('🔐 Attempting login for:', username);
  
  const response = await fetch(`${TRPC_BASE_URL}/vendorAuth.login?batch=1`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ "0": { json: { username, password } } }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('❌ Login Error:', response.status, errorText);
    throw new Error(`Error de login: ${response.status}`);
  }

  const data = await response.json();
  const result = parseTRPCResponse(data);
  
  if (!result.success || !result.token) {
    throw new Error('Respuesta de login inválida');
  }

  // Guardar token
  await setAuthToken(result.token);
  console.log('✅ Login successful, token saved');

  return result;
}

/**
 * Descarga el catálogo completo de productos
 */
export async function getCatalog(
  lastSyncTimestamp?: string
): Promise<ApiCatalogResponse> {
  const token = await getAuthToken();
  
  if (!token) {
    throw new Error('No hay sesión activa');
  }

  console.log('🔄 Descargando catálogo...');
  
  const response = await fetch(`${TRPC_BASE_URL}/sync.getCatalog?batch=1`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('❌ Error getCatalog:', response.status, errorText);
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  const data = await response.json();
  console.log('📦 Response length:', JSON.stringify(data).length);
  console.log('📦 Response preview:', JSON.stringify(data).substring(0, 200));
  
  // Parsear respuesta tRPC batch
  if (Array.isArray(data) && data[0]?.result?.data?.json) {
    const result = data[0].result.data.json;
    console.log('✅ Catálogo descargado:', result.products?.length || 0, 'productos');
    
    // Asegurar que tenga todos los campos requeridos
    return {
      success: result.success !== undefined ? result.success : true,
      timestamp: result.timestamp || new Date().toISOString(),
      products: result.products || [],
      totalProducts: result.totalProducts || result.products?.length || 0,
    };
  }
  
  console.error('❌ Formato de respuesta inesperado:', data);
  throw new Error('Formato de respuesta inesperado');
}

/**
 * Sube pedidos pendientes al servidor
 */
export async function uploadPendingOrders(
  orders: Array<{
    clientId?: string;
    customerNote?: string;
    items: Array<{
      productId: string;
      quantity: number;
      pricePerUnit: string;
    }>;
    createdAtOffline: string;
  }>
): Promise<ApiUploadOrdersResponse> {
  return await trpcMutation<ApiUploadOrdersResponse>(
    'sync.uploadOrders',
    { orders }
  );
}

/**
 * Obtiene cambios incrementales del catálogo
 */
export async function getChanges(
  lastSyncTimestamp: string
): Promise<ApiCatalogResponse> {
  return await trpcQuery<ApiCatalogResponse>(
    'sync.getChanges',
    { lastSyncTimestamp }
  );
}

/**
 * Verifica el estado de sincronización
 */
export async function getSyncStatus(): Promise<{
  success: boolean;
  timestamp: string;
  user: {
    id: string;
    name: string;
    email: string;
    role: string;
  };
  catalog: {
    totalProducts: number;
    lastUpdate: string;
  };
  pendingOrders: number;
}> {
  return await trpcQuery('sync.getStatus');
}

/**
 * Obtiene clientes asignados al vendedor
 */
export async function getAssignedClients(): Promise<{
  success: boolean;
  clients: Array<{
    id: string;
    name: string;
    email?: string;
    role?: string;
    companyName?: string;
    companyTaxId?: string;
    phone?: string;
    address?: string;
    gpsLocation?: string;
    city?: string;
    state?: string;
    zipCode?: string;
    country?: string;
    isActive?: boolean;
    username?: string;
    contactPerson?: string;
    status?: string;
    agentNumber?: string;
    clientNumber?: string;
    priceType?: string;
    assignedVendorId?: string;
    createdAt?: string;
    lastSignedIn?: string;
  }>;
}> {
  const token = await getAuthToken();
  
  if (!token) {
    throw new Error('No hay sesión activa');
  }

  console.log('👥 Descargando clientes asignados al vendedor...');
  
  const response = await fetch(`${TRPC_BASE_URL}/sync.getAssignedClients?batch=1`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('❌ Error getAssignedClients:', response.status, errorText);
    throw new Error(`HTTP error al obtener clientes asignados! status: ${response.status}`);
  }

  const data = await response.json();
  console.log('📦 Clients response preview:', JSON.stringify(data).substring(0, 200));
  
  // Parsear respuesta tRPC batch
  if (Array.isArray(data) && data[0]?.result?.data?.json) {
    const result = data[0].result.data.json;
    console.log('✅ Clientes descargados:', result.clients?.length || 0);
    
    // Asegurar que tenga todos los campos requeridos
    return {
      success: result.success !== undefined ? result.success : true,
      clients: result.clients || [],
    };
  }
  
  console.error('❌ Formato de respuesta inesperado:', data);
  throw new Error('Formato de respuesta inesperado');
}
