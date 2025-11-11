import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  Modal,
  ActivityIndicator,
  Alert,
  SafeAreaView,
  ScrollView,
  Platform,
} from 'react-native';
import { getDatabase } from '../database/db';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';

interface Client {
  id: string;
  name: string;
  companyName: string;
  contactPerson: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  clientNumber: string;
  priceType: 'ciudad' | 'interior' | 'especial';
  isActive: number;
}

/**
 * Pantalla de Pedidos - Selección de cliente y creación de nuevos clientes
 * Réplica EXACTA del VendedorPedidos de la web
 */
export default function PedidosScreen({ navigation }: any) {
  const [clients, setClients] = useState<Client[]>([]);
  const [filteredClients, setFilteredClients] = useState<Client[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [showClientDialog, setShowClientDialog] = useState(true);
  const [showNewClientDialog, setShowNewClientDialog] = useState(false);
  const [isGettingLocation, setIsGettingLocation] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  // Form state for new client
  const [newClientData, setNewClientData] = useState({
    clientNumber: `CLI-${Date.now().toString().slice(-6)}`,
    companyName: '',
    contactPerson: '',
    email: '',
    phone: '',
    address: '',
    companyTaxId: '',
    gpsLocation: '',
    priceType: 'ciudad' as 'ciudad' | 'interior' | 'especial',
  });

  useEffect(() => {
    loadClients();
  }, []);

  useEffect(() => {
    filterClients();
  }, [searchQuery, clients]);

  const loadClients = async () => {
    try {
      const db = getDatabase();
      const result = await db.getAllAsync<Client>(
        'SELECT * FROM clients WHERE isActive = 1 ORDER BY companyName ASC'
      );
      setClients(result);
      setFilteredClients(result);
    } catch (error) {
      console.error('Error al cargar clientes:', error);
      Alert.alert('Error', 'No se pudieron cargar los clientes');
    } finally {
      setLoading(false);
    }
  };

  const filterClients = () => {
    if (!searchQuery.trim()) {
      setFilteredClients(clients);
      return;
    }

    const query = searchQuery.toLowerCase();
    const filtered = clients.filter(
      (client) =>
        client.companyName?.toLowerCase().includes(query) ||
        client.contactPerson?.toLowerCase().includes(query) ||
        client.email?.toLowerCase().includes(query) ||
        client.phone?.toLowerCase().includes(query)
    );
    setFilteredClients(filtered);
  };

  const handleSelectClient = async (client: Client) => {
    try {
      console.log('👤 Cliente seleccionado:', client.id, client.companyName);
      
      // Guardar cliente seleccionado en AsyncStorage
      await AsyncStorage.setItem('selectedClientId', client.id);
      await AsyncStorage.setItem('selectedClientData', JSON.stringify(client));
      
      // Cerrar diálogo
      setShowClientDialog(false);
      
      // Navegar al catálogo directamente sin pop-up
      navigation.navigate('CatalogTabs');
    } catch (error) {
      console.error('❌ Error al seleccionar cliente:', error);
      Alert.alert('Error', 'No se pudo seleccionar el cliente');
    }
  };

  const handleGetLocation = async () => {
    try {
      setIsGettingLocation(true);
      
      // Solicitar permisos
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permiso denegado', 'Se necesita permiso de ubicación para obtener las coordenadas GPS');
        setIsGettingLocation(false);
        return;
      }

      // Obtener ubicación actual
      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });

      const gpsString = `${location.coords.latitude.toFixed(6)}, ${location.coords.longitude.toFixed(6)}`;
      setNewClientData({ ...newClientData, gpsLocation: gpsString });
      Alert.alert('Éxito', 'Ubicación obtenida correctamente');
    } catch (error) {
      console.error('Error al obtener ubicación:', error);
      Alert.alert('Error', 'No se pudo obtener la ubicación');
    } finally {
      setIsGettingLocation(false);
    }
  };

  const handleCreateClient = async () => {
    // Validar campos requeridos
    if (!newClientData.companyName || !newClientData.contactPerson || !newClientData.phone) {
      Alert.alert('Campos requeridos', 'Por favor completa todos los campos marcados con *');
      return;
    }

    setIsCreating(true);

    try {
      const db = getDatabase();
      const newId = Date.now().toString();
      
      await db.runAsync(
        `INSERT INTO clients 
         (id, name, companyName, email, phone, address, city, state, clientNumber, priceType, isActive, syncedAt, needsSync)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          newId,
          newClientData.contactPerson,
          newClientData.companyName,
          newClientData.email || '',
          newClientData.phone,
          newClientData.address || '',
          '',
          '',
          newClientData.clientNumber,
          newClientData.priceType,
          1,
          new Date().toISOString(),
          1,
        ]
      );

      Alert.alert('Éxito', 'Cliente creado exitosamente');
      
      // Resetear formulario
      setNewClientData({
        clientNumber: `CLI-${Date.now().toString().slice(-6)}`,
        companyName: '',
        contactPerson: '',
        email: '',
        phone: '',
        address: '',
        companyTaxId: '',
        gpsLocation: '',
        priceType: 'ciudad',
      });
      
      setShowNewClientDialog(false);
      loadClients(); // Recargar lista de clientes
    } catch (error) {
      console.error('Error al crear cliente:', error);
      Alert.alert('Error', 'No se pudo crear el cliente');
    } finally {
      setIsCreating(false);
    }
  };

  const renderClientCard = ({ item }: { item: Client }) => {
    // Determinar color del badge según tipo de precio (igual que web)
    const getBadgeStyle = (priceType: string) => {
      switch (priceType) {
        case 'ciudad':
          return styles.badgeCiudad;
        case 'interior':
          return styles.badgeInterior;
        case 'especial':
          return styles.badgeEspecial;
        default:
          return styles.badgeCiudad;
      }
    };

    return (
      <TouchableOpacity
        style={styles.clientCard}
        onPress={() => handleSelectClient(item)}
        activeOpacity={0.7}
      >
        <View style={styles.clientCardContent}>
          <View style={styles.clientInfo}>
            <Text style={styles.companyName}>{item.companyName}</Text>
            <Text style={styles.clientDetail}>
              <Text style={styles.clientLabel}>Contacto:</Text> {item.contactPerson || item.name}
            </Text>
            {item.address && (
              <Text style={styles.clientDetail}>
                <Text style={styles.clientLabel}>Dirección:</Text> {item.address}
              </Text>
            )}
            {item.phone && (
              <Text style={styles.clientDetailSecondary}>
                <Text style={styles.clientLabel}>Teléfono:</Text> {item.phone}
              </Text>
            )}
          </View>
          <View style={[styles.badge, getBadgeStyle(item.priceType)]}>
            <Text style={styles.badgeText}>
              {item.priceType || 'ciudad'}
            </Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Client Selection Modal */}
      <Modal
        visible={showClientDialog}
        animationType="slide"
        transparent={false}
        onRequestClose={() => {
          setShowClientDialog(false);
          navigation.goBack();
        }}
      >
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Seleccionar Cliente</Text>
            <TouchableOpacity
              onPress={() => {
                setShowClientDialog(false);
                navigation.goBack();
              }}
              style={styles.closeButton}
            >
              <Ionicons name="close" size={28} color="#64748b" />
            </TouchableOpacity>
          </View>

          <View style={styles.modalContent}>
            {/* Search Bar */}
            <View style={styles.searchContainer}>
              <Ionicons name="search" size={20} color="#94a3b8" style={styles.searchIcon} />
              <TextInput
                style={styles.searchInput}
                placeholder="Buscar cliente por nombre, contacto o email..."
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholderTextColor="#94a3b8"
              />
            </View>

            {/* Create New Client Button */}
            <TouchableOpacity
              style={styles.createButton}
              onPress={() => setShowNewClientDialog(true)}
            >
              <Ionicons name="add-circle-outline" size={20} color="#2563eb" />
              <Text style={styles.createButtonText}>Crear Nuevo Cliente</Text>
            </TouchableOpacity>

            {/* Client List */}
            {loading ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#2563eb" />
                <Text style={styles.loadingText}>Cargando clientes...</Text>
              </View>
            ) : filteredClients.length === 0 ? (
              <View style={styles.emptyContainer}>
                <Ionicons name="people-outline" size={64} color="#cbd5e1" />
                <Text style={styles.emptyText}>No se encontraron clientes</Text>
              </View>
            ) : (
              <FlatList
                data={filteredClients}
                renderItem={renderClientCard}
                keyExtractor={(item) => item.id.toString()}
                contentContainerStyle={styles.clientList}
                showsVerticalScrollIndicator={false}
              />
            )}
          </View>
        </SafeAreaView>
      </Modal>

      {/* New Client Modal */}
      <Modal
        visible={showNewClientDialog}
        animationType="slide"
        transparent={false}
        onRequestClose={() => setShowNewClientDialog(false)}
      >
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Crear Nuevo Cliente</Text>
            <TouchableOpacity
              onPress={() => setShowNewClientDialog(false)}
              style={styles.closeButton}
            >
              <Ionicons name="close" size={28} color="#64748b" />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.formContainer} showsVerticalScrollIndicator={false}>
            {/* ID del Cliente */}
            <View style={styles.formGroup}>
              <Text style={styles.label}>ID del Cliente *</Text>
              <TextInput
                style={styles.input}
                value={newClientData.clientNumber}
                onChangeText={(text) => setNewClientData({ ...newClientData, clientNumber: text })}
                placeholder="Ej: CLI-001"
                placeholderTextColor="#94a3b8"
              />
              <Text style={styles.helperText}>Se genera automáticamente, pero puedes modificarlo</Text>
            </View>

            {/* Nombre de la Empresa */}
            <View style={styles.formGroup}>
              <Text style={styles.label}>Nombre de la Empresa *</Text>
              <TextInput
                style={styles.input}
                value={newClientData.companyName}
                onChangeText={(text) => setNewClientData({ ...newClientData, companyName: text })}
                placeholder="Ej: Distribuidora ABC"
                placeholderTextColor="#94a3b8"
              />
            </View>

            {/* Persona de Contacto */}
            <View style={styles.formGroup}>
              <Text style={styles.label}>Persona de Contacto *</Text>
              <TextInput
                style={styles.input}
                value={newClientData.contactPerson}
                onChangeText={(text) => setNewClientData({ ...newClientData, contactPerson: text })}
                placeholder="Ej: Juan Pérez"
                placeholderTextColor="#94a3b8"
              />
            </View>

            {/* Email */}
            <View style={styles.formGroup}>
              <Text style={styles.label}>Email</Text>
              <TextInput
                style={styles.input}
                value={newClientData.email}
                onChangeText={(text) => setNewClientData({ ...newClientData, email: text })}
                placeholder="Ej: contacto@empresa.com"
                placeholderTextColor="#94a3b8"
                keyboardType="email-address"
                autoCapitalize="none"
              />
            </View>

            {/* Teléfono */}
            <View style={styles.formGroup}>
              <Text style={styles.label}>Teléfono *</Text>
              <TextInput
                style={styles.input}
                value={newClientData.phone}
                onChangeText={(text) => setNewClientData({ ...newClientData, phone: text })}
                placeholder="Ej: +595 21 123456"
                placeholderTextColor="#94a3b8"
                keyboardType="phone-pad"
              />
            </View>

            {/* Dirección */}
            <View style={styles.formGroup}>
              <Text style={styles.label}>Dirección</Text>
              <TextInput
                style={styles.input}
                value={newClientData.address}
                onChangeText={(text) => setNewClientData({ ...newClientData, address: text })}
                placeholder="Ej: Av. Principal 123, Asunción"
                placeholderTextColor="#94a3b8"
              />
            </View>

            {/* RUC */}
            <View style={styles.formGroup}>
              <Text style={styles.label}>RUC</Text>
              <TextInput
                style={styles.input}
                value={newClientData.companyTaxId}
                onChangeText={(text) => setNewClientData({ ...newClientData, companyTaxId: text })}
                placeholder="Ej: 80012345-6"
                placeholderTextColor="#94a3b8"
              />
            </View>

            {/* Ubicación GPS */}
            <View style={styles.formGroup}>
              <Text style={styles.label}>Ubicación GPS</Text>
              <View style={styles.gpsContainer}>
                <TextInput
                  style={[styles.input, styles.gpsInput]}
                  value={newClientData.gpsLocation}
                  onChangeText={(text) => setNewClientData({ ...newClientData, gpsLocation: text })}
                  placeholder="Ej: -25.263740, -57.575926"
                  placeholderTextColor="#94a3b8"
                />
                <TouchableOpacity
                  style={styles.gpsButton}
                  onPress={handleGetLocation}
                  disabled={isGettingLocation}
                >
                  <Text style={styles.gpsButtonText}>
                    {isGettingLocation ? '⏳' : '📍'}
                  </Text>
                </TouchableOpacity>
              </View>
              <Text style={styles.helperText}>Haz clic en el botón para obtener la ubicación actual</Text>
            </View>

            {/* Tipo de Precio */}
            <View style={styles.formGroup}>
              <Text style={styles.label}>Tipo de Precio *</Text>
              <View style={styles.priceTypeContainer}>
                {(['ciudad', 'interior', 'especial'] as const).map((type) => (
                  <TouchableOpacity
                    key={type}
                    style={[
                      styles.priceTypeButton,
                      newClientData.priceType === type && styles.priceTypeButtonActive,
                    ]}
                    onPress={() => setNewClientData({ ...newClientData, priceType: type })}
                  >
                    <Text
                      style={[
                        styles.priceTypeButtonText,
                        newClientData.priceType === type && styles.priceTypeButtonTextActive,
                      ]}
                    >
                      {type.charAt(0).toUpperCase() + type.slice(1)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Buttons */}
            <View style={styles.formButtons}>
              <TouchableOpacity
                style={[styles.button, styles.buttonOutline]}
                onPress={() => setShowNewClientDialog(false)}
              >
                <Text style={styles.buttonOutlineText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.button,
                  styles.buttonPrimary,
                  (!newClientData.companyName || !newClientData.contactPerson || !newClientData.phone || isCreating) &&
                    styles.buttonDisabled,
                ]}
                onPress={handleCreateClient}
                disabled={!newClientData.companyName || !newClientData.contactPerson || !newClientData.phone || isCreating}
              >
                <Text style={styles.buttonPrimaryText}>
                  {isCreating ? 'Creando...' : 'Crear Cliente'}
                </Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  modalContainer: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#1e293b',
  },
  closeButton: {
    padding: 4,
  },
  modalContent: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f1f5f9',
    borderRadius: 8,
    paddingHorizontal: 12,
    marginBottom: 16,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    height: 48,
    fontSize: 15,
    color: '#1e293b',
  },
  createButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 8,
    paddingVertical: 14,
    marginBottom: 16,
  },
  createButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#2563eb',
    marginLeft: 8,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#64748b',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 48,
  },
  emptyText: {
    marginTop: 16,
    fontSize: 16,
    color: '#64748b',
  },
  clientList: {
    paddingBottom: 20,
  },
  clientCard: {
    backgroundColor: '#ffffff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginBottom: 8,
    overflow: 'hidden',
  },
  clientCardContent: {
    flexDirection: 'row',
    padding: 16,
  },
  clientInfo: {
    flex: 1,
  },
  companyName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1e293b',
    marginBottom: 8,
  },
  clientDetail: {
    fontSize: 14,
    color: '#475569',
    marginTop: 4,
  },
  clientDetailSecondary: {
    fontSize: 14,
    color: '#64748b',
    marginTop: 4,
  },
  clientLabel: {
    fontWeight: '500',
  },
  badge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    alignSelf: 'flex-start',
  },
  badgeCiudad: {
    backgroundColor: '#dbeafe',
  },
  badgeInterior: {
    backgroundColor: '#dcfce7',
  },
  badgeEspecial: {
    backgroundColor: '#f3e8ff',
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  formContainer: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  formGroup: {
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    color: '#1e293b',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 15,
    color: '#1e293b',
  },
  helperText: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 4,
  },
  gpsContainer: {
    flexDirection: 'row',
    gap: 8,
  },
  gpsInput: {
    flex: 1,
  },
  gpsButton: {
    width: 48,
    height: 48,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  gpsButtonText: {
    fontSize: 20,
  },
  priceTypeContainer: {
    flexDirection: 'row',
    gap: 8,
  },
  priceTypeButton: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 8,
    alignItems: 'center',
  },
  priceTypeButtonActive: {
    backgroundColor: '#2563eb',
    borderColor: '#2563eb',
  },
  priceTypeButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#64748b',
  },
  priceTypeButtonTextActive: {
    color: '#ffffff',
  },
  formButtons: {
    flexDirection: 'row',
    gap: 12,
    paddingTop: 8,
    paddingBottom: 32,
  },
  button: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  buttonOutline: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  buttonOutlineText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#64748b',
  },
  buttonPrimary: {
    backgroundColor: '#2563eb',
  },
  buttonPrimaryText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
});
