import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  SafeAreaView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { fullSync, incrementalSync, checkConnection } from '../services/sync';

/**
 * Pantalla principal del Dashboard de Vendedor
 * Réplica exacta del panel web con 4 opciones principales
 * Incluye botón de sincronización manual y estado de conexión
 */
export default function DashboardHomeScreen() {
  const navigation = useNavigation<any>();
  const [isSyncing, setIsSyncing] = useState(false);
  const [isOnline, setIsOnline] = useState(false);
  const [syncMessage, setSyncMessage] = useState('');

  useEffect(() => {
    checkConnectionStatus();
    // Verificar conexión cada 30 segundos
    const interval = setInterval(checkConnectionStatus, 30000);
    return () => clearInterval(interval);
  }, []);

  const checkConnectionStatus = async () => {
    const online = await checkConnection();
    setIsOnline(online);
  };

  const handleManualSync = async () => {
    if (!isOnline) {
      Alert.alert(
        'Sin conexión',
        'No hay conexión a internet. La sincronización se realizará automáticamente cuando se restablezca la conexión.'
      );
      return;
    }

    setIsSyncing(true);
    setSyncMessage('Iniciando sincronización...');

    try {
      const result = await incrementalSync((message) => {
        setSyncMessage(message);
      });

      if (result.success) {
        Alert.alert(
          '✅ Sincronización Exitosa',
          `${result.productsUpdated} productos\n${result.clientsUpdated} clientes\n${result.ordersSynced} pedidos`,
          [{ text: 'OK' }]
        );
      } else {
        Alert.alert(
          '⚠️ Error de Sincronización',
          result.message,
          [{ text: 'OK' }]
        );
      }
    } catch (error: any) {
      Alert.alert(
        '❌ Error',
        error.message || 'Error desconocido durante la sincronización',
        [{ text: 'OK' }]
      );
    } finally {
      setIsSyncing(false);
      setSyncMessage('');
    }
  };

  const handleFullSync = async () => {
    if (!isOnline) {
      Alert.alert(
        'Sin conexión',
        'No hay conexión a internet.'
      );
      return;
    }

    Alert.alert(
      'Sincronizar Todo',
      'Esto descargará TODO el catálogo e imágenes nuevamente. Puede tardar varios minutos. ¿Continuar?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Continuar',
          onPress: async () => {
            setIsSyncing(true);
            setSyncMessage('Descargando todo el catálogo...');

            try {
              const result = await fullSync((message) => {
                setSyncMessage(message);
              });

              if (result.success) {
                Alert.alert(
                  '✅ Sincronización Completa',
                  `${result.productsUpdated} productos actualizados\n${result.ordersSynced} pedidos sincronizados`,
                  [{ text: 'OK' }]
                );
              } else {
                Alert.alert(
                  '⚠️ Error',
                  result.message,
                  [{ text: 'OK' }]
                );
              }
            } catch (error: any) {
              Alert.alert(
                '❌ Error',
                error.message || 'Error desconocido',
                [{ text: 'OK' }]
              );
            } finally {
              setIsSyncing(false);
              setSyncMessage('');
            }
          },
        },
      ]
    );
  };

  const menuItems = [
    {
      id: 'pedidos',
      title: 'Pedidos',
      icon: '🛒',
      description: 'Crear nuevos pedidos para tus clientes',
      color: '#3b82f6', // blue
      bgColor: '#dbeafe',
      screen: 'Pedidos',
    },
    {
      id: 'clientes',
      title: 'Clientes',
      icon: '👥',
      description: 'Gestionar tu cartera de clientes',
      color: '#10b981', // green
      bgColor: '#d1fae5',
      screen: 'Clientes',
    },
    {
      id: 'dashboard',
      title: 'Estadísticas',
      icon: '📊',
      description: 'Ver estadísticas y métricas',
      color: '#8b5cf6', // purple
      bgColor: '#ede9fe',
      screen: 'DashboardStats',
    },
    {
      id: 'historial',
      title: 'Historial',
      icon: '📋',
      description: 'Ver pedidos realizados este mes',
      color: '#f97316', // orange
      bgColor: '#ffedd5',
      screen: 'Historial',
    },
  ];

  return (
    <SafeAreaView style={styles.container}>
      {/* Sync Status Bar */}
      <View style={styles.statusBar}>
        <View style={styles.statusLeft}>
          <View style={[
            styles.statusDot,
            isOnline ? styles.statusDotOnline : styles.statusDotOffline,
          ]} />
          <Text style={styles.statusText}>
            {isOnline ? 'En línea' : 'Sin conexión'}
          </Text>
        </View>
        
        <TouchableOpacity
          style={[
            styles.syncButton,
            (!isOnline || isSyncing) && styles.syncButtonDisabled,
          ]}
          onPress={handleManualSync}
          disabled={!isOnline || isSyncing}
        >
          {isSyncing ? (
            <>
              <ActivityIndicator size="small" color="#fff" style={{ marginRight: 8 }} />
              <Text style={styles.syncButtonText}>Sincronizando...</Text>
            </>
          ) : (
            <>
              <Text style={styles.syncButtonIcon}>🔄</Text>
              <Text style={styles.syncButtonText}>Sincronizar</Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      {/* Sync Progress Message */}
      {isSyncing && syncMessage && (
        <View style={styles.syncMessageContainer}>
          <Text style={styles.syncMessageText}>{syncMessage}</Text>
        </View>
      )}

      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Panel de Vendedor</Text>
          <Text style={styles.headerSubtitle}>
            Selecciona una opción para comenzar
          </Text>
        </View>

        <View style={styles.grid}>
          {menuItems.map((item) => (
            <TouchableOpacity
              key={item.id}
              style={[styles.card, { borderColor: item.color }]}
              onPress={() => {
                if (item.action === 'fullsync') {
                  handleFullSync();
                } else {
                  navigation.navigate(item.screen);
                }
              }}
              activeOpacity={0.7}
            >
              <View style={[styles.iconContainer, { backgroundColor: item.bgColor }]}>
                <Text style={styles.icon}>{item.icon}</Text>
              </View>
              <Text style={styles.cardTitle}>{item.title}</Text>
              <Text style={styles.cardDescription}>{item.description}</Text>
            </TouchableOpacity>
          ))}
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
  statusBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#fff',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  statusLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 8,
  },
  statusDotOnline: {
    backgroundColor: '#10b981',
  },
  statusDotOffline: {
    backgroundColor: '#ef4444',
  },
  statusText: {
    fontSize: 14,
    color: '#64748b',
    fontWeight: '500',
  },
  syncButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2563eb',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  syncButtonDisabled: {
    backgroundColor: '#94a3b8',
    opacity: 0.6,
  },
  syncButtonIcon: {
    fontSize: 16,
    marginRight: 6,
  },
  syncButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  syncMessageContainer: {
    backgroundColor: '#dbeafe',
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#93c5fd',
  },
  syncMessageText: {
    fontSize: 12,
    color: '#1e40af',
    textAlign: 'center',
  },
  scrollContent: {
    padding: 20,
  },
  header: {
    marginBottom: 32,
    alignItems: 'center',
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
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  card: {
    width: '48%',
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    alignItems: 'center',
    borderWidth: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  iconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  icon: {
    fontSize: 40,
  },
  cardTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1e293b',
    marginBottom: 8,
    textAlign: 'center',
  },
  cardDescription: {
    fontSize: 14,
    color: '#64748b',
    textAlign: 'center',
    lineHeight: 20,
  },
});
