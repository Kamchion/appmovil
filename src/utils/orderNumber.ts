import { getDatabase } from '../database/db';

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
 * Valida que un número de pedido tenga el formato correcto A000000001
 */
export function isValidOrderNumber(orderNumber: string): boolean {
  return /^A\d{9}$/.test(orderNumber);
}
