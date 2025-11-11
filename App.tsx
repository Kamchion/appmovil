import React, { useState, useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Text, TouchableOpacity, Alert, View } from 'react-native';

// Screens
import LoginScreen from './src/screens/LoginScreen';
import DashboardHomeScreen from './src/screens/DashboardHomeScreen';
import PedidosScreen from './src/screens/PedidosScreen';
import ClientesScreen from './src/screens/ClientesScreen';
import DashboardStatsScreen from './src/screens/DashboardStatsScreen';
import HistorialScreen from './src/screens/HistorialScreen';
import CatalogScreen from './src/screens/CatalogScreen';
import ProductDetailScreen from './src/screens/ProductDetailScreen';
import CartScreen from './src/screens/CartScreen';
import CheckoutScreen from './src/screens/CheckoutScreen';
import OrdersScreen from './src/screens/OrdersScreen';
import OrderDetailScreen from './src/screens/OrderDetailScreen';

// Services
import { setupAutoSync } from './src/services/sync';
import { initImageCache } from './src/services/imageCache';
import { initDatabase, resetDatabase } from './src/database/db';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

// Tab Navigator eliminado - navegación directa al catálogo

export default function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [loading, setLoading] = useState(true);

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
    Alert.alert(
      'Opciones',
      'Selecciona una opción',
      [
        {
          text: 'Reset de Datos',
          onPress: handleReset,
        },
        {
          text: 'Cerrar Sesión',
          onPress: handleLogout,
          style: 'destructive',
        },
        {
          text: 'Cancelar',
          style: 'cancel',
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
      <NavigationContainer>
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

              {/* Historial */}
              <Stack.Screen
                name="Historial"
                component={HistorialScreen}
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
            </>
          )}
        </Stack.Navigator>
      </NavigationContainer>
    </>
  );
}
