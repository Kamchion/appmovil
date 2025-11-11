import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_BASE_URL } from './api';

const TRPC_BASE_URL = `${API_BASE_URL}/api/trpc`;

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
 * Actualiza los datos de un cliente en el servidor
 */
export async function updateClientOnServer(
  token: string,
  clientId: string,
  updates: {
    name?: string;
    email?: string;
    companyName?: string;
    companyTaxId?: string;
    phone?: string;
    address?: string;
    gpsLocation?: string;
    city?: string;
    state?: string;
    zipCode?: string;
    country?: string;
    contactPerson?: string;
    priceType?: string;
  }
): Promise<{ success: boolean; message: string }> {
  try {
    console.log('[updateClientOnServer] Actualizando cliente:', clientId);
    console.log('[updateClientOnServer] Updates:', updates);

    // ✅ CORRECCIÓN: Usar el formato correcto de tRPC batch con json wrapper
    const response = await fetch(`${TRPC_BASE_URL}/sync.updateClient?batch=1`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        "0": {
          json: {
            clientId,
            updates,
          }
        }
      }),
    });

    console.log('[updateClientOnServer] Response status:', response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[updateClientOnServer] HTTP Error:', response.status, errorText);
      throw new Error(`HTTP error! status: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    console.log('[updateClientOnServer] Respuesta raw:', JSON.stringify(data).substring(0, 300));

    // Usar la función de parseo
    const result = parseTRPCResponse(data);
    console.log('[updateClientOnServer] Respuesta parseada:', result);

    return {
      success: result.success !== undefined ? result.success : true,
      message: result.message || 'Cliente actualizado exitosamente',
    };
  } catch (error: any) {
    console.error('[updateClientOnServer] Error:', error);
    console.error('[updateClientOnServer] Error message:', error.message);
    console.error('[updateClientOnServer] Error stack:', error.stack);
    throw error;
  }
}

/**
 * Crea un nuevo cliente en el servidor
 */
export async function createClientOnServer(
  token: string,
  clientData: {
    clientNumber: string;
    companyName: string;
    contactPerson: string;
    email?: string;
    phone: string;
    address?: string;
    gpsLocation?: string;
    companyTaxId?: string;
    priceType?: 'ciudad' | 'interior' | 'especial';
  }
): Promise<{ success: boolean; message: string; clientId?: string }> {
  try {
    console.log('[createClientOnServer] Creando cliente:', clientData);

    // Usar el formato correcto de tRPC batch con json wrapper
    const response = await fetch(`${TRPC_BASE_URL}/sync.createClient?batch=1`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        "0": {
          json: clientData
        }
      }),
    });

    console.log('[createClientOnServer] Response status:', response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[createClientOnServer] HTTP Error:', response.status, errorText);
      throw new Error(`HTTP error! status: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    console.log('[createClientOnServer] Respuesta raw:', JSON.stringify(data).substring(0, 300));

    // Usar la función de parseo
    const result = parseTRPCResponse(data);
    console.log('[createClientOnServer] Respuesta parseada:', result);

    return {
      success: result.success !== undefined ? result.success : true,
      message: result.message || 'Cliente creado exitosamente',
      clientId: result.clientId || result.id,
    };
  } catch (error: any) {
    console.error('[createClientOnServer] Error:', error);
    console.error('[createClientOnServer] Error message:', error.message);
    console.error('[createClientOnServer] Error stack:', error.stack);
    throw error;
  }
}
