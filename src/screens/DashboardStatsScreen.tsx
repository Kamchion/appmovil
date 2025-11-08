import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  SafeAreaView,
} from 'react-native';
import { getDatabase } from '../database/db';

interface Stats {
  totalClients: number;
  activeClients: number;
  currentMonthOrders: number;
  previousMonthOrders: number;
  currentMonthSales: number;
  previousMonthSales: number;
  growth: number;
}

interface Order {
  id: number;
  orderNumber: string;
  customerName: string;
  total: string;
  createdAt: string;
}

/**
 * Pantalla de Dashboard con Estadísticas
 * Réplica exacta del VendedorDashboardStats de la web
 */
export default function DashboardStatsScreen() {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<Stats>({
    totalClients: 0,
    activeClients: 0,
    currentMonthOrders: 0,
    previousMonthOrders: 0,
    currentMonthSales: 0,
    previousMonthSales: 0,
    growth: 0,
  });
  const [recentOrders, setRecentOrders] = useState<Order[]>([]);

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    try {
      const db = getDatabase();

      // Get clients stats
      const clients = await db.getAllAsync<any>(
        'SELECT * FROM clients'
      );
      const totalClients = clients.length;
      const activeClients = clients.filter((c) => c.isActive === 1).length;

      // Get orders from pending_orders table
      const orders = await db.getAllAsync<any>(
        'SELECT * FROM pending_orders ORDER BY createdAt DESC'
      );

      // Calculate current month stats
      const now = new Date();
      const currentMonth = now.getMonth();
      const currentYear = now.getFullYear();

      const currentMonthOrders = orders.filter((order: any) => {
        const orderDate = new Date(order.createdAt);
        return (
          orderDate.getMonth() === currentMonth &&
          orderDate.getFullYear() === currentYear
        );
      });

      const currentMonthSales = currentMonthOrders.reduce(
        (sum: number, order: any) => sum + parseFloat(order.total || '0'),
        0
      );

      // Calculate previous month stats
      const prevMonth = currentMonth === 0 ? 11 : currentMonth - 1;
      const prevYear = currentMonth === 0 ? currentYear - 1 : currentYear;

      const previousMonthOrders = orders.filter((order: any) => {
        const orderDate = new Date(order.createdAt);
        return (
          orderDate.getMonth() === prevMonth &&
          orderDate.getFullYear() === prevYear
        );
      });

      const previousMonthSales = previousMonthOrders.reduce(
        (sum: number, order: any) => sum + parseFloat(order.total || '0'),
        0
      );

      // Calculate growth
      const growth =
        previousMonthSales > 0
          ? ((currentMonthSales - previousMonthSales) / previousMonthSales) * 100
          : 0;

      setStats({
        totalClients,
        activeClients,
        currentMonthOrders: currentMonthOrders.length,
        previousMonthOrders: previousMonthOrders.length,
        currentMonthSales,
        previousMonthSales,
        growth,
      });

      // Get recent orders for activity section
      const recent = currentMonthOrders.slice(0, 5).map((order: any) => ({
        id: order.id,
        orderNumber: `ORD-${order.id}`,
        customerName: order.customerName || 'Cliente',
        total: order.total || '0',
        createdAt: order.createdAt,
      }));

      setRecentOrders(recent);
    } catch (error) {
      console.error('Error al cargar estadísticas:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#8b5cf6" />
        <Text style={styles.loadingText}>Cargando estadísticas...</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Dashboard</Text>
          <Text style={styles.headerSubtitle}>
            Estadísticas y métricas de rendimiento
          </Text>
        </View>

        {/* Statistics Cards */}
        <View style={styles.statsGrid}>
          {/* Total Clients */}
          <View style={[styles.statCard, styles.statCardBlue]}>
            <View style={styles.statHeader}>
              <Text style={styles.statLabel}>Total Clientes</Text>
              <Text style={styles.statIcon}>👥</Text>
            </View>
            <Text style={styles.statValue}>{stats.totalClients}</Text>
            <Text style={styles.statSubtext}>{stats.activeClients} activos</Text>
          </View>

          {/* Orders This Month */}
          <View style={[styles.statCard, styles.statCardGreen]}>
            <View style={styles.statHeader}>
              <Text style={styles.statLabel}>Pedidos del Mes</Text>
              <Text style={styles.statIcon}>🛒</Text>
            </View>
            <Text style={styles.statValue}>{stats.currentMonthOrders}</Text>
            <Text style={styles.statSubtext}>
              {stats.previousMonthOrders} el mes anterior
            </Text>
          </View>

          {/* Sales This Month */}
          <View style={[styles.statCard, styles.statCardPurple]}>
            <View style={styles.statHeader}>
              <Text style={styles.statLabel}>Ventas del Mes</Text>
              <Text style={styles.statIcon}>💰</Text>
            </View>
            <Text style={styles.statValue}>
              ${stats.currentMonthSales.toFixed(2)}
            </Text>
            <Text style={styles.statSubtext}>
              ${stats.previousMonthSales.toFixed(2)} el mes anterior
            </Text>
          </View>

          {/* Growth */}
          <View style={[styles.statCard, styles.statCardOrange]}>
            <View style={styles.statHeader}>
              <Text style={styles.statLabel}>Crecimiento</Text>
              <Text style={styles.statIcon}>📈</Text>
            </View>
            <Text
              style={[
                styles.statValue,
                stats.growth >= 0 ? styles.growthPositive : styles.growthNegative,
              ]}
            >
              {stats.growth >= 0 ? '+' : ''}
              {stats.growth.toFixed(1)}%
            </Text>
            <Text style={styles.statSubtext}>vs mes anterior</Text>
          </View>
        </View>

        {/* Recent Activity */}
        <View style={styles.activitySection}>
          <Text style={styles.sectionTitle}>Actividad Reciente</Text>
          {recentOrders.length === 0 ? (
            <View style={styles.emptyActivity}>
              <Text style={styles.emptyActivityIcon}>📋</Text>
              <Text style={styles.emptyActivityText}>
                No hay actividad reciente este mes
              </Text>
            </View>
          ) : (
            <View style={styles.activityList}>
              {recentOrders.map((order) => (
                <View key={order.id} style={styles.activityItem}>
                  <View style={styles.activityInfo}>
                    <Text style={styles.activityCustomer}>
                      {order.customerName}
                    </Text>
                    <Text style={styles.activityOrder}>
                      Pedido #{order.orderNumber}
                    </Text>
                  </View>
                  <View style={styles.activityDetails}>
                    <Text style={styles.activityTotal}>
                      ${parseFloat(order.total).toFixed(2)}
                    </Text>
                    <Text style={styles.activityDate}>
                      {new Date(order.createdAt).toLocaleDateString()}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          )}
        </View>
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
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 24,
  },
  statCard: {
    width: '48%',
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  statCardBlue: {
    borderLeftWidth: 4,
    borderLeftColor: '#3b82f6',
  },
  statCardGreen: {
    borderLeftWidth: 4,
    borderLeftColor: '#10b981',
  },
  statCardPurple: {
    borderLeftWidth: 4,
    borderLeftColor: '#8b5cf6',
  },
  statCardOrange: {
    borderLeftWidth: 4,
    borderLeftColor: '#f97316',
  },
  statHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  statLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748b',
    textTransform: 'uppercase',
  },
  statIcon: {
    fontSize: 20,
  },
  statValue: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#1e293b',
    marginBottom: 4,
  },
  statSubtext: {
    fontSize: 12,
    color: '#64748b',
  },
  growthPositive: {
    color: '#10b981',
  },
  growthNegative: {
    color: '#ef4444',
  },
  activitySection: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1e293b',
    marginBottom: 16,
  },
  emptyActivity: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyActivityIcon: {
    fontSize: 48,
    marginBottom: 12,
  },
  emptyActivityText: {
    fontSize: 16,
    color: '#64748b',
    textAlign: 'center',
  },
  activityList: {
    gap: 16,
  },
  activityItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  activityInfo: {
    flex: 1,
  },
  activityCustomer: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1e293b',
    marginBottom: 4,
  },
  activityOrder: {
    fontSize: 14,
    color: '#64748b',
  },
  activityDetails: {
    alignItems: 'flex-end',
  },
  activityTotal: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#10b981',
    marginBottom: 4,
  },
  activityDate: {
    fontSize: 12,
    color: '#64748b',
  },
});
