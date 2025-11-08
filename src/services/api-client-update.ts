import { TRPC_BASE_URL } from './api';

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

    const response = await fetch(`${TRPC_BASE_URL}/sync.updateClient`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        clientId,
        updates,
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    console.log('[updateClientOnServer] Respuesta:', data);

    if (Array.isArray(data) && data[0]?.result?.data?.json) {
      const result = data[0].result.data.json;
      return {
        success: result.success || true,
        message: result.message || 'Cliente actualizado',
      };
    }

    return {
      success: true,
      message: 'Cliente actualizado',
    };
  } catch (error) {
    console.error('[updateClientOnServer] Error:', error);
    throw error;
  }
}
