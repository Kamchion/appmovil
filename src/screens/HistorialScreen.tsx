import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  SafeAreaView,
} from 'react-native';
import { getDatabase } from '../database/db';

interface Order {
  id: number;
  orderNumber: string;
  customerName: string;
  customerContact: string;
  total: string;
  status: string;
  createdAt: string;
}

interface Stats {
  totalOrders: number;
  totalSales: number;
  completedOrders: number;
  pendingOrders: number;
}

/**
 * Pantalla de Historial de Pedidos
 * Réplica exacta del VendedorHistorial de la web
 */
export default function HistorialScreen({ navigation }: any) {
  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState<Order[]>([]);
  const [stats, setStats] = useState<Stats>({
    totalOrders: 0,
    totalSales: 0,
    completedOrders: 0,
    pendingOrders: 0,
  });

  useEffect(() => {
    loadOrders();
  }, []);

  const loadOrders = async () => {
    try {
      const db = getDatabase();

      // Get all orders from pending_orders table
      const allOrders = await db.getAllAsync<any>(
        'SELECT * FROM pending_orders ORDER BY createdAt DESC'
      );

      // Filter orders from current month
      const now = new Date();
      const currentMonth = now.getMonth();
      const currentYear = now.getFullYear();

      const currentMonthOrders = allOrders.filter((order: any) => {
        const orderDate = new Date(order.createdAt);
        return (
          orderDate.getMonth() === currentMonth &&
          orderDate.getFullYear() === currentYear
        );
      });

      // Map to Order interface
      const mappedOrders: Order[] = currentMonthOrders.map((order: any) => ({
        id: order.id,
        orderNumber: `ORD-${order.id}`,
        customerName: order.customerName || 'Cliente',
        customerContact: order.customerContact || '',
        total: order.total || '0',
        status: order.synced ? 'completed' : 'pending',
        createdAt: order.createdAt,
      }));

      // Calculate stats
      const totalOrders = mappedOrders.length;
      const totalSales = mappedOrders.reduce(
        (sum, order) => sum + parseFloat(order.total),
        0
      );
      const completedOrders = mappedOrders.filter(
        (order) => order.status === 'completed'
      ).length;
      const pendingOrders = mappedOrders.filter(
        (order) => order.status === 'pending'
      ).length;

      setOrders(mappedOrders);
      setStats({
        totalOrders,
        totalSales,
        completedOrders,
        pendingOrders,
      });
    } catch (error) {
      console.error('Error al cargar pedidos:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('es-ES', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString('es-ES', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const renderOrder = ({ item }: { item: Order }) => {
    const isCompleted = item.status === 'completed';

    return (
      <View style={styles.orderCard}>
        <View style={styles.orderHeader}>
          <Text style={styles.orderNumber}>{item.orderNumber}</Text>
          <View
            style={[
              styles.statusBadge,
              isCompleted ? styles.statusCompleted : styles.statusPending,
            ]}
          >
            <Text style={styles.statusText}>
              {isCompleted ? 'Enviado' : 'Pendiente'}
            </Text>
          </View>
        </View>

        <View style={styles.orderDetails}>
          <View style={styles.orderRow}>
            <Text style={styles.orderIcon}>📅</Text>
            <Text style={styles.orderLabel}>Fecha:</Text>
            <Text style={styles.orderValue}>{formatDate(item.createdAt)}</Text>
          </View>

          <View style={styles.orderRow}>
            <Text style={styles.orderIcon}>🕐</Text>
            <Text style={styles.orderLabel}>Hora:</Text>
            <Text style={styles.orderValue}>{formatTime(item.createdAt)}</Text>
          </View>

          <View style={styles.orderRow}>
            <Text style={styles.orderIcon}>👤</Text>
            <Text style={styles.orderLabel}>Cliente:</Text>
            <Text style={styles.orderValue} numberOfLines={1}>
              {item.customerName}
            </Text>
          </View>

          {item.customerContact && (
            <View style={styles.orderRow}>
              <Text style={styles.orderIcon}>📱</Text>
              <Text style={styles.orderLabel}>Contacto:</Text>
              <Text style={styles.orderValue}>{item.customerContact}</Text>
            </View>
          )}

          <View style={styles.orderRow}>
            <Text style={styles.orderIcon}>💰</Text>
            <Text style={styles.orderLabel}>Total:</Text>
            <Text style={styles.orderTotal}>
              ${parseFloat(item.total).toFixed(2)}
            </Text>
          </View>
        </View>

        <TouchableOpacity
          style={styles.viewButton}
          onPress={() => {
            // TODO: Navigate to order detail screen
            console.log('Ver pedido:', item.id);
          }}
        >
          <Text style={styles.viewButtonIcon}>👁️</Text>
          <Text style={styles.viewButtonText}>Ver Detalles</Text>
        </TouchableOpacity>
      </View>
    );
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#f97316" />
        <Text style={styles.loadingText}>Cargando historial...</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Historial de Pedidos</Text>
          <Text style={styles.headerSubtitle}>Pedidos realizados este mes</Text>
        </View>

        {/* Summary Cards */}
        <View style={styles.summaryGrid}>
          <View style={[styles.summaryCard, styles.summaryCardBlue]}>
            <Text style={styles.summaryIcon}>📦</Text>
            <Text style={styles.summaryLabel}>Total Pedidos</Text>
            <Text style={styles.summaryValue}>{stats.totalOrders}</Text>
          </View>

          <View style={[styles.summaryCard, styles.summaryCardGreen]}>
            <Text style={styles.summaryIcon}>💰</Text>
            <Text style={styles.summaryLabel}>Ventas Totales</Text>
            <Text style={styles.summaryValue}>
              ${stats.totalSales.toFixed(2)}
            </Text>
          </View>

          <View style={[styles.summaryCard, styles.summaryCardSuccess]}>
            <Text style={styles.summaryIcon}>✅</Text>
            <Text style={styles.summaryLabel}>Enviados</Text>
            <Text style={styles.summaryValue}>{stats.completedOrders}</Text>
          </View>

          <View style={[styles.summaryCard, styles.summaryCardOrange]}>
            <Text style={styles.summaryIcon}>⏳</Text>
            <Text style={styles.summaryLabel}>Pendientes</Text>
            <Text style={styles.summaryValue}>{stats.pendingOrders}</Text>
          </View>
        </View>

        {/* Orders List */}
        {orders.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyIcon}>📋</Text>
            <Text style={styles.emptyText}>No hay pedidos este mes</Text>
            <Text style={styles.emptySubtext}>
              Los pedidos que crees aparecerán aquí
            </Text>
          </View>
        ) : (
          <FlatList
            data={orders}
            renderItem={renderOrder}
            keyExtractor={(item) => item.id.toString()}
            scrollEnabled={false}
            contentContainerStyle={styles.ordersList}
          />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#64748b',
  },
  scrollContent: {
    padding: 20,
  },
  header: {
    marginBottom: 24,
  },
  headerTitle: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#1e293b',
    marginBottom: 8,
  },
  headerSubtitle: {
    fontSize: 16,
    color: '#64748b',
  },
  summaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 24,
  },
  summaryCard: {
    width: '48%',
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  summaryCardBlue: {
    borderTopWidth: 4,
    borderTopColor: '#3b82f6',
  },
  summaryCardGreen: {
    borderTopWidth: 4,
    borderTopColor: '#10b981',
  },
  summaryCardSuccess: {
    borderTopWidth: 4,
    borderTopColor: '#22c55e',
  },
  summaryCardOrange: {
    borderTopWidth: 4,
    borderTopColor: '#f97316',
  },
  summaryIcon: {
    fontSize: 32,
    marginBottom: 8,
  },
  summaryLabel: {
    fontSize: 12,
    color: '#64748b',
    marginBottom: 4,
    textAlign: 'center',
  },
  summaryValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1e293b',
  },
  ordersList: {
    gap: 16,
  },
  orderCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  orderHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  orderNumber: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1e293b',
    fontFamily: 'monospace',
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  statusCompleted: {
    backgroundColor: '#d1fae5',
  },
  statusPending: {
    backgroundColor: '#ffedd5',
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
  },
  orderDetails: {
    gap: 12,
    marginBottom: 16,
  },
  orderRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  orderIcon: {
    fontSize: 16,
    marginRight: 8,
    width: 24,
  },
  orderLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#64748b',
    marginRight: 8,
    width: 70,
  },
  orderValue: {
    flex: 1,
    fontSize: 14,
    color: '#1e293b',
  },
  orderTotal: {
    flex: 1,
    fontSize: 18,
    fontWeight: 'bold',
    color: '#10b981',
  },
  viewButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#3b82f6',
    paddingVertical: 12,
    borderRadius: 8,
  },
  viewButtonIcon: {
    fontSize: 16,
    marginRight: 8,
  },
  viewButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  emptyContainer: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 40,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  emptyText: {
    fontSize: 20,
    fontWeight: '600',
    color: '#1e293b',
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#64748b',
    textAlign: 'center',
  },
});
