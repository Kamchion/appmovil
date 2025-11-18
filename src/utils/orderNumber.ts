import { getDatabase } from '../database/db';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Genera un número de pedido secuencial con formato A000000001
 * Busca el último número en la base de datos y lo incrementa
 */
export async function generateOrderNumber(): Promise<string> {
  try {
    const db = getDatabase();
    
    // Buscar todos los pedidos que empiezan con 'A' y tienen el formato correcto
    const orders = await db.getAllAsync<{ orderNumber: string }>(
      `SELECT orderNumber FROM pending_orders 
       WHERE orderNumber LIKE 'A%' 
       ORDER BY orderNumber DESC 
       LIMIT 1`
    );
    
    let nextNumber = 1;
    
    if (orders.length > 0 && orders[0].orderNumber) {
      // Extraer el número del formato A000000001
      const lastNumber = orders[0].orderNumber.substring(1); // Quitar la 'A'
      nextNumber = parseInt(lastNumber, 10) + 1;
    }
    
    // Formatear con ceros a la izquierda (9 dígitos)
    const formattedNumber = nextNumber.toString().padStart(9, '0');
    
    return `A${formattedNumber}`;
  } catch (error) {
    console.error('Error al generar número de pedido:', error);
    // Fallback: usar timestamp si hay error
    return `A${Date.now().toString().padStart(9, '0').slice(-9)}`;
  }
}

/**
 * Genera un número de pedido enviado con formato {agentNumber}B{8-digit}
 * Ejemplo: 6B00000001, 8B00000001
 * Busca el último número para el agente actual y lo incrementa
 */
export async function generateSentOrderNumber(): Promise<string> {
  try {
    const db = getDatabase();
    
    // Obtener número de agente del usuario logueado
    const userJson = await AsyncStorage.getItem('vendor_user');
    const user = userJson ? JSON.parse(userJson) : null;
    const agentNumber = user?.agentNumber || '0';
    
    // Buscar todos los pedidos del agente actual con formato {agentNumber}B
    const pattern = `${agentNumber}B%`;
    
    // Buscar en AMBAS tablas: pending_orders Y order_history
    const pendingOrders = await db.getAllAsync<{ orderNumber: string }>(
      `SELECT orderNumber FROM pending_orders 
       WHERE orderNumber LIKE ? 
       ORDER BY orderNumber DESC 
       LIMIT 1`,
      [pattern]
    );
    
    const historyOrders = await db.getAllAsync<{ orderNumber: string }>(
      `SELECT orderNumber FROM order_history 
       WHERE orderNumber LIKE ? 
       ORDER BY orderNumber DESC 
       LIMIT 1`,
      [pattern]
    );
    
    let nextNumber = 1;
    
    // Obtener el número más alto de ambas tablas
    const allOrders = [...pendingOrders, ...historyOrders];
    if (allOrders.length > 0) {
      const maxOrder = allOrders.reduce((max, order) => {
        const parts = order.orderNumber.split('B');
        if (parts.length === 2) {
          const num = parseInt(parts[1], 10);
          return num > max ? num : max;
        }
        return max;
      }, 0);
      
      nextNumber = maxOrder + 1;
    }
    
    // Formatear con ceros a la izquierda (8 dígitos)
    const formattedNumber = nextNumber.toString().padStart(8, '0');
    
    return `${agentNumber}B${formattedNumber}`;
  } catch (error) {
    console.error('Error al generar número de pedido enviado:', error);
    // Fallback: usar timestamp si hay error
    return `0B${Date.now().toString().padStart(8, '0').slice(-8)}`;
  }
}

/**
 * Valida que un número de pedido tenga el formato correcto A000000001
 */
export function isValidOrderNumber(orderNumber: string): boolean {
  return /^A\d{9}$/.test(orderNumber);
}

/**
 * Valida que un número de pedido enviado tenga el formato correcto {agentNumber}B{8-digit}
 * Ejemplo: 6B00000001, 8B00000001
 */
export function isValidSentOrderNumber(orderNumber: string): boolean {
  return /^\d+B\d{8}$/.test(orderNumber);
}
