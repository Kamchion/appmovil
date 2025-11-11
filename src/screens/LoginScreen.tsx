import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Image,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_BASE_URL } from '../services/api';
import { initDatabase } from '../database/db';

const TOKEN_KEY = 'vendor_token';
const USER_KEY = 'vendor_user';
const CREDENTIALS_KEY = 'vendor_credentials';

interface LoginScreenProps {
  onLoginSuccess: () => void;
}

export default function LoginScreen({ onLoginSuccess }: LoginScreenProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  /**
   * Intenta hacer login online con el servidor
   */
  const loginOnline = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/trpc/vendorAuth.login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          json: {
            username,
            password,
          },
        }),
      });

      const data = await response.json();

      if (data.error) {
        throw new Error(data.error.json?.message || 'Error al iniciar sesión');
      }

      if (!data.result?.data?.json?.success) {
        throw new Error(data.result?.data?.json?.message || 'Error al iniciar sesión');
      }

      const { token, user } = data.result.data.json;

      // Guardar token y datos del usuario
      await AsyncStorage.setItem(TOKEN_KEY, token);
      await AsyncStorage.setItem(USER_KEY, JSON.stringify(user));

      // Guardar credenciales para login offline
      await AsyncStorage.setItem(
        CREDENTIALS_KEY,
        JSON.stringify({ username, password })
      );

      return { success: true, user };
    } catch (error: any) {
      throw new Error(error.message || 'Error de conexión');
    }
  };

  /**
   * Intenta hacer login offline con credenciales guardadas
   */
  const loginOffline = async () => {
    try {
      const savedCredentials = await AsyncStorage.getItem(CREDENTIALS_KEY);
      
      if (!savedCredentials) {
        throw new Error('No hay credenciales guardadas. Necesita conexión para el primer login.');
      }

      const { username: savedUsername, password: savedPassword } = JSON.parse(savedCredentials);

      if (username !== savedUsername || password !== savedPassword) {
        throw new Error('Usuario o contraseña incorrectos');
      }

      // Obtener datos del usuario guardados
      const savedUser = await AsyncStorage.getItem(USER_KEY);
      if (!savedUser) {
        throw new Error('No hay datos del usuario. Necesita conexión.');
      }

      const user = JSON.parse(savedUser);

      return { success: true, user, offline: true };
    } catch (error: any) {
      throw new Error(error.message || 'Error en login offline');
    }
  };

  /**
   * Maneja el proceso de login
   */
  const handleLogin = async () => {
    if (!username.trim() || !password.trim()) {
      Alert.alert('Error', 'Por favor ingrese usuario y contraseña');
      return;
    }

    setLoading(true);

    try {
      // Inicializar base de datos
      await initDatabase();

      // Intentar login online primero
      try {
        const result = await loginOnline();
        // Login exitoso - ir directamente al panel sin mensaje
        onLoginSuccess();
      } catch (onlineError: any) {
        // Si falla online, intentar offline solo si hay credenciales guardadas
        console.log('Login online falló:', onlineError.message);
        
        try {
          const result = await loginOffline();
          // Login offline exitoso - ir directamente al panel sin mensaje
          onLoginSuccess();
        } catch (offlineError: any) {
          // Si ambos fallan, mostrar el error del login online (más útil)
          throw new Error(`Error de login: ${onlineError.message}`);
        }
      }
    } catch (error: any) {
      Alert.alert('Error', error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      {/* Logo en la parte superior */}
      <View style={styles.logoContainer}>
        <Image
          source={require('../../assets/icon.png')}
          style={styles.logo}
          resizeMode="contain"
        />
      </View>

      {/* Campos de login en la parte inferior */}
      <View style={styles.card}>
        <TextInput
          style={styles.input}
          placeholder="Usuario o Email"
          value={username}
          onChangeText={setUsername}
          autoCapitalize="none"
          editable={!loading}
        />

        <TextInput
          style={styles.input}
          placeholder="Contraseña"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          editable={!loading}
        />

        <TouchableOpacity
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={handleLogin}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Iniciar Sesión</Text>
          )}
        </TouchableOpacity>

        <Text style={styles.info}>
          Esta app funciona offline. Tus pedidos se sincronizarán automáticamente cuando tengas conexión.
          {'\n\n'}💡 Después del primer login, podrás acceder sin conexión.
        </Text>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#2563eb', // Fondo azul IMPORKAM
    justifyContent: 'space-between',
  },
  logoContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 60,
  },
  logo: {
    width: '75%',
    height: undefined,
    aspectRatio: 1,
  },
  card: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    padding: 32,
    paddingBottom: 40,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 8,
  },
  input: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 8,
    padding: 16,
    fontSize: 16,
    marginBottom: 16,
    color: '#1e293b',
  },
  button: {
    backgroundColor: '#2563eb',
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
    marginBottom: 16,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  info: {
    fontSize: 12,
    color: '#64748b',
    textAlign: 'center',
    lineHeight: 18,
  },
});
