import { TRPC_BASE_URL } from './api';

/**
 * Obtiene el historial de pedidos del vendedor
 */
export async function getOrders(token: string, limit: number = 100): Promise<any> {
  try {
    console.log('[getOrders] Obteniendo pedidos del vendedor...');
    
    const response = await fetch(`${TRPC_BASE_URL}/sync.getOrders?batch=1&input=${encodeURIComponent(JSON.stringify({ "0": { "json": { "limit": limit } } }))}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    console.log('[getOrders] Respuesta del servidor:', JSON.stringify(data).substring(0, 200));

    if (Array.isArray(data) && data[0]?.result?.data?.json) {
      const result = data[0].result.data.json;
      console.log(`✅ Pedidos obtenidos: ${result.orders?.length || 0}`);
      return {
        success: result.success || true,
        orders: result.orders || [],
      };
    }

    console.warn('⚠️ Formato de respuesta inesperado:', data);
    return {
      success: false,
      orders: [],
    };
  } catch (error: any) {
    const errorMessage = error.message || error.toString() || 'Error desconocido';
    console.error('❌ Error en getOrders:', {
      message: errorMessage,
      type: error.constructor?.name,
      stack: error.stack?.substring(0, 200)
    });
    throw new Error(`Error al obtener pedidos: ${errorMessage}`);
  }
}
