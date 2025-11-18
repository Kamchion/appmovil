import React, { useState, useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Text, TouchableOpacity, Alert, View, Modal, BackHandler, StyleSheet } from 'react-native';

// Screens
import LoginScreen from './src/screens/LoginScreen';
import DashboardHomeScreen from './src/screens/DashboardHomeScreen';
import PedidosScreen from './src/screens/PedidosScreen';
import ClientesScreen from './src/screens/ClientesScreen';
import DashboardStatsScreen from './src/screens/DashboardStatsScreen';
// import HistorialScreen from './src/screens/HistorialScreen'; // Reemplazado por OrdersScreen
import CatalogScreen from './src/screens/CatalogScreen';
import ProductDetailScreen from './src/screens/ProductDetailScreen';
import CartScreen from './src/screens/CartScreen';
import CheckoutScreen from './src/screens/CheckoutScreen';
import OrdersScreen from './src/screens/OrdersScreen';
import OrderDetailScreen from './src/screens/OrderDetailScreen';
import LogViewerScreen from './src/screens/LogViewerScreen';

// Services
import logger from './src/services/logger';
import { setupAutoSync } from './src/services/sync';
import { initImageCache } from './src/services/imageCache';
import { initDatabase, resetDatabase } from './src/database/db';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

// Tab Navigator eliminado - navegación directa al catálogo

export default function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [loading, setLoading] = useState(true);
  const [menuVisible, setMenuVisible] = useState(false);
  const navigationRef = React.useRef<any>(null);

  useEffect(() => {
    initializeApp();
  }, []);

  const initializeApp = async () => {
    try {
      console.log('🚀 Inicializando aplicación...');
      
      // Inicializar base de datos SQLite
      await initDatabase();
      console.log('✅ Base de datos inicializada');
      
      // Verificar autenticación
      const token = await AsyncStorage.getItem('vendor_token');
      setIsLoggedIn(!!token);

      // Inicializar caché de imágenes
      await initImageCache();

      // Configurar sincronización automática
      const unsubscribe = setupAutoSync((result) => {
        console.log('Auto-sync completed:', result);
      });

      return () => {
        unsubscribe();
      };
    } catch (error) {
      console.error('Error initializing app:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleLoginSuccess = () => {
    setIsLoggedIn(true);
  };

  const handleLogout = async () => {
    Alert.alert(
      'Cerrar Sesión',
      '¿Estás seguro de que deseas salir?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Salir',
          style: 'destructive',
          onPress: async () => {
            await AsyncStorage.removeItem('vendor_token');
            await AsyncStorage.removeItem('vendor_user');
            setIsLoggedIn(false);
          },
        },
      ]
    );
  };

  const handleReset = async () => {
    Alert.alert(
      '⚠️ Reset de Datos',
      'Esto eliminará TODOS los datos locales (productos, clientes, pedidos pendientes) y los descargará nuevamente del servidor.\n\n¿Estás seguro?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: async () => {
            try {
              Alert.alert('Procesando...', 'Eliminando datos locales...');
              await resetDatabase();
              Alert.alert(
                '✅ Reset Completado',
                'La base de datos ha sido limpiada. Por favor, usa el botón de sincronización para descargar los datos nuevamente.',
                [{ text: 'OK' }]
              );
            } catch (error: any) {
              Alert.alert(
                '❌ Error',
                'No se pudo resetear la base de datos: ' + error.message,
                [{ text: 'OK' }]
              );
            }
          },
        },
      ]
    );
  };

  const showOptionsMenu = () => {
    setMenuVisible(true);
  };

  const handleSyncAll = async () => {
    setMenuVisible(false);
    Alert.alert(
      'Sincronizar Todo',
      'Esto descargará toda la base de datos, fotos y pedidos nuevamente. ¿Continuar?',
      [
        {
          text: 'Cancelar',
          style: 'cancel',
        },
        {
          text: 'Sincronizar',
          onPress: async () => {
            try {
              const { fullSync } = await import('./src/services/sync');
              const result = await fullSync(() => {});
              if (result.success) {
                Alert.alert('Éxito', 'Sincronización completa exitosa');
              } else {
                Alert.alert('Error', result.message);
              }
            } catch (error: any) {
              Alert.alert('Error', error.message || 'Error al sincronizar');
            }
          },
        },
      ]
    );
  };

  const handleDeleteAll = async () => {
    setMenuVisible(false);
    Alert.alert(
      'Confirmar',
      '¿Está seguro que desea borrar todos los datos locales? Esta acción no se puede deshacer.',
      [
        {
          text: 'Cancelar',
          style: 'cancel',
        },
        {
          text: 'Borrar Todo',
          style: 'destructive',
          onPress: async () => {
            try {
              // Importar AsyncStorage y FileSystem
              const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
              const FileSystem = (await import('expo-file-system/legacy')).default;
              
              // 1. Borrar todos los datos de la base de datos
              const { getDatabase } = await import('./src/database/db');
              const db = getDatabase();
              await db.execAsync('DELETE FROM pending_orders');
              await db.execAsync('DELETE FROM pending_order_items');
              await db.execAsync('DELETE FROM order_history');
              await db.execAsync('DELETE FROM order_history_items');
              await db.execAsync('DELETE FROM products');
              await db.execAsync('DELETE FROM clients');
              
              // 2. Borrar todas las imágenes descargadas
              const imageDir = `${FileSystem.documentDirectory}product_images/`;
              const dirInfo = await FileSystem.getInfoAsync(imageDir);
              if (dirInfo.exists) {
                await FileSystem.deleteAsync(imageDir, { idempotent: true });
                console.log('✅ Directorio de imágenes eliminado');
              }
              
              // 3. Borrar timestamps de sincronización (para que la próxima sincronización descargue todo)
              await AsyncStorage.removeItem('last_sync_timestamp');
              
              // 4. Borrar otros datos de sesión (carrito, cliente seleccionado, etc.)
              await AsyncStorage.removeItem('@cart');
              await AsyncStorage.removeItem('selectedClientId');
              await AsyncStorage.removeItem('selectedClientData');
              await AsyncStorage.removeItem('editingOrderId');
              
              console.log('✅ Todos los datos han sido eliminados, incluyendo imágenes y timestamps de sincronización');
              Alert.alert('Éxito', 'Todos los datos han sido eliminados. La app está como recién instalada.');
            } catch (error) {
              console.error('Error al borrar datos:', error);
              Alert.alert('Error', 'No se pudieron borrar los datos');
            }
          },
        },
      ]
    );
  };

  const handleExitApp = () => {
    setMenuVisible(false);
    Alert.alert(
      'Salir',
      '¿Desea salir de la aplicación?',
      [
        {
          text: 'Cancelar',
          style: 'cancel',
        },
        {
          text: 'Salir',
          onPress: async () => {
            // Hacer logout completo
            await AsyncStorage.removeItem('vendor_token');
            await AsyncStorage.removeItem('vendor_user');
            setIsLoggedIn(false);
            // Cerrar la app
            BackHandler.exitApp();
          },
        },
      ]
    );
  };

  if (loading) {
    return null; // O un splash screen
  }

  return (
    <>
      <StatusBar style="auto" />
      
      {/* Modal de menú */}
      <Modal
        visible={menuVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setMenuVisible(false)}
      >
        <TouchableOpacity 
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setMenuVisible(false)}
        >
          <View style={styles.menuModal}>
            <TouchableOpacity 
              style={styles.menuButton}
              onPress={handleSyncAll}
            >
              <Text style={styles.menuButtonText}>Sincronizar Todo</Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={styles.menuButton}
              onPress={() => {
                setMenuVisible(false);
                // Navegar a logs usando la referencia de navegación
                setTimeout(() => {
                  navigationRef.current?.navigate('LogViewer');
                }, 100);
              }}
            >
              <Text style={styles.menuButtonText}>📋 Ver Logs</Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={[styles.menuButton, styles.deleteButton]}
              onPress={handleDeleteAll}
            >
              <Text style={styles.menuButtonText}>Borrar Todo</Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={styles.menuButton}
              onPress={handleExitApp}
            >
              <Text style={styles.menuButtonText}>Salir de la App</Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={[styles.menuButton, styles.cancelButton]}
              onPress={() => setMenuVisible(false)}
            >
              <Text style={styles.menuButtonText}>Cancelar</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
      
      <NavigationContainer ref={navigationRef}>
        <Stack.Navigator
          screenOptions={{
            headerStyle: {
              backgroundColor: '#2563eb',
            },
            headerTintColor: '#fff',
            headerTitleStyle: {
              fontWeight: 'bold',
            },
          }}
        >
          {!isLoggedIn ? (
            <Stack.Screen
              name="Login"
              options={{ headerShown: false }}
            >
              {(props) => (
                <LoginScreen {...props} onLoginSuccess={handleLoginSuccess} />
              )}
            </Stack.Screen>
          ) : (
            <>
              {/* Dashboard Home - Pantalla Principal */}
              <Stack.Screen
                name="DashboardHome"
                component={DashboardHomeScreen}
                options={{
                  title: 'IMPORKAM - Vendedores',
                  headerRight: () => (
                    <TouchableOpacity
                      onPress={showOptionsMenu}
                      style={{ marginRight: 16, padding: 4 }}
                    >
                      <Text style={{ color: '#fff', fontSize: 24 }}>⋮</Text>
                    </TouchableOpacity>
                  ),
                }}
              />

              {/* Pedidos */}
              <Stack.Screen
                name="Pedidos"
                component={PedidosScreen}
                options={{ 
                  title: 'Pedidos',
                  headerStyle: { backgroundColor: '#3b82f6' },
                }}
              />

              {/* Clientes */}
              <Stack.Screen
                name="Clientes"
                component={ClientesScreen}
                options={{ 
                  title: 'Mis Clientes',
                  headerStyle: { backgroundColor: '#10b981' },
                }}
              />

              {/* Dashboard Stats */}
              <Stack.Screen
                name="DashboardStats"
                component={DashboardStatsScreen}
                options={{ 
                  title: 'Dashboard',
                  headerStyle: { backgroundColor: '#8b5cf6' },
                }}
              />

              {/* Historial - Ahora usa OrdersScreen */}
              <Stack.Screen
                name="Historial"
                component={OrdersScreen}
                options={{ 
                  title: 'Historial de Pedidos',
                  headerStyle: { backgroundColor: '#f97316' },
                }}
              />

              {/* Catálogo */}
              <Stack.Screen
                name="CatalogTabs"
                component={CatalogScreen}
                options={{ 
                  headerShown: false,
                }}
              />

              {/* Product Detail */}
              <Stack.Screen
                name="ProductDetail"
                component={ProductDetailScreen}
                options={{ title: 'Detalle del Producto' }}
              />

              {/* Cart */}
              <Stack.Screen
                name="Cart"
                component={CartScreen}
                options={{ title: 'Mi Carrito' }}
              />

              {/* Checkout */}
              <Stack.Screen
                name="Checkout"
                component={CheckoutScreen}
                options={{ title: 'Crear Pedido' }}
              />

              {/* Order Detail */}
              <Stack.Screen
                name="OrderDetail"
                component={OrderDetailScreen}
                options={{ title: 'Detalles del Pedido' }}
              />

              {/* Log Viewer */}
              <Stack.Screen
                name="LogViewer"
                component={LogViewerScreen}
                options={{ 
                  title: 'Logs del Sistema',
                  headerStyle: { backgroundColor: '#0F172A' },
                  headerTintColor: '#F1F5F9',
                }}
              />
            </>
          )}
        </Stack.Navigator>
      </NavigationContainer>
    </>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  menuModal: {
    backgroundColor: '#fff',
    borderRadius: 12,
    width: '80%',
    maxWidth: 320,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 8,
  },
  menuButton: {
    backgroundColor: '#3b82f6',
    padding: 16,
    borderRadius: 8,
    marginBottom: 12,
    alignItems: 'center',
  },
  deleteButton: {
    backgroundColor: '#ef4444',
  },
  cancelButton: {
    backgroundColor: '#64748b',
    marginBottom: 0,
  },
  menuButtonText: {
    fontSize: 16,
    color: '#fff',
    fontWeight: '600',
  },
});
