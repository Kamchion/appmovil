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

interface Client {
  id: number;
  name: string;
  companyName: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  clientNumber: string;
  priceType: string;
  isActive: number;
}

/**
 * Pantalla de Pedidos - Selección de cliente y creación de nuevos clientes
 * Réplica exacta del VendedorPedidos de la web
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
        client.name?.toLowerCase().includes(query) ||
        client.email?.toLowerCase().includes(query) ||
        client.phone?.toLowerCase().includes(query)
    );
    setFilteredClients(filtered);
  };

  const handleSelectClient = async (client: Client) => {
    try {
      console.log('👤 Cliente seleccionado:', client.id, client.companyName);
      
      // Guardar cliente seleccionado
      await AsyncStorage.setItem('selectedClientId', client.id.toString());
      await AsyncStorage.setItem('selectedClientData', JSON.stringify(client));
      
      // Cerrar diálogo primero
      setShowClientDialog(false);
      
      // Navegar al catálogo después de un pequeño delay
      setTimeout(() => {
        navigation.navigate('CatalogTabs', { 
          clientId: client.id,
          clientName: client.companyName || client.name
        });
      }, 100);
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
    } catch (error: any) {
      Alert.alert('Error', 'No se pudo obtener la ubicación: ' + error.message);
    } finally {
      setIsGettingLocation(false);
    }
  };

  const handleCreateClient = async () => {
    // Validar campos requeridos
    if (!newClientData.companyName.trim()) {
      Alert.alert('Error', 'El nombre de la empresa es requerido');
      return;
    }
    if (!newClientData.contactPerson.trim()) {
      Alert.alert('Error', 'La persona de contacto es requerida');
      return;
    }
    if (!newClientData.phone.trim()) {
      Alert.alert('Error', 'El teléfono es requerido');
      return;
    }

    setIsCreating(true);

    try {
      // TODO: Llamar a la API para crear el cliente en el servidor
      // Por ahora, guardarlo localmente
      const db = getDatabase();
      const newId = Date.now();
      
      await db.runAsync(
        `INSERT INTO clients 
         (id, name, companyName, email, phone, address, city, state, clientNumber, priceType, isActive, syncedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          newId,
          newClientData.contactPerson,
          newClientData.companyName,
          newClientData.email || null,
          newClientData.phone,
          newClientData.address || null,
          null, // city
          null, // state
          newClientData.clientNumber,
          newClientData.priceType,
          1, // isActive
          new Date().toISOString(),
        ]
      );

      Alert.alert(
        'Éxito',
        'Cliente creado exitosamente. Se sincronizará con el servidor cuando haya conexión.',
        [
          {
            text: 'OK',
            onPress: () => {
              setShowNewClientDialog(false);
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
              loadClients();
            },
          },
        ]
      );
    } catch (error: any) {
      Alert.alert('Error', 'No se pudo crear el cliente: ' + error.message);
    } finally {
      setIsCreating(false);
    }
  };

  const renderClient = ({ item }: { item: Client }) => (
    <TouchableOpacity
      style={styles.clientCard}
      onPress={() => handleSelectClient(item)}
    >
      <View style={styles.clientIcon}>
        <Text style={styles.clientIconText}>👤</Text>
      </View>
      <View style={styles.clientInfo}>
        <Text style={styles.clientName}>
          {item.companyName || item.name || 'Sin nombre'}
        </Text>
        {item.name && item.companyName && (
          <Text style={styles.clientContact}>Contacto: {item.name}</Text>
        )}
        {item.address && (
          <Text style={styles.clientDetail}>📍 {item.address}</Text>
        )}
        {item.phone && (
          <Text style={styles.clientDetail}>📱 {item.phone}</Text>
        )}
        <View style={styles.priceTypeBadge}>
          <Text style={styles.priceTypeText}>
            {item.priceType || 'ciudad'}
          </Text>
        </View>
      </View>
      <Text style={styles.arrow}>›</Text>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container}>
      {/* Client Selection Dialog */}
      <Modal
        visible={showClientDialog}
        animationType="slide"
        transparent={false}
      >
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Seleccionar Cliente</Text>
            <Text style={styles.modalSubtitle}>
              Elige un cliente para crear su pedido
            </Text>
            <TouchableOpacity
              style={styles.closeButton}
              onPress={() => {
                setShowClientDialog(false);
                navigation.goBack();
              }}
            >
              <Text style={styles.closeButtonText}>✕</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.searchContainer}>
            <Text style={styles.searchIcon}>🔍</Text>
            <TextInput
              style={styles.searchInput}
              placeholder="Buscar por nombre, empresa, email..."
              value={searchQuery}
              onChangeText={setSearchQuery}
              autoCapitalize="none"
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery('')}>
                <Text style={styles.clearButton}>✕</Text>
              </TouchableOpacity>
            )}
          </View>

          <TouchableOpacity
            style={styles.newClientButton}
            onPress={() => setShowNewClientDialog(true)}
          >
            <Text style={styles.newClientButtonIcon}>➕</Text>
            <Text style={styles.newClientButtonText}>Crear Nuevo Cliente</Text>
          </TouchableOpacity>

          {loading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#3b82f6" />
              <Text style={styles.loadingText}>Cargando clientes...</Text>
            </View>
          ) : filteredClients.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyIcon}>👥</Text>
              <Text style={styles.emptyText}>
                {searchQuery
                  ? 'No se encontraron clientes'
                  : 'No tienes clientes asignados'}
              </Text>
              <Text style={styles.emptySubtext}>
                {searchQuery
                  ? 'Intenta con otro término de búsqueda'
                  : 'Crea un nuevo cliente o sincroniza para obtener tu lista'}
              </Text>
            </View>
          ) : (
            <FlatList
              data={filteredClients}
              renderItem={renderClient}
              keyExtractor={(item) => item.id.toString()}
              contentContainerStyle={styles.listContainer}
            />
          )}
        </SafeAreaView>
      </Modal>

      {/* New Client Dialog */}
      <Modal
        visible={showNewClientDialog}
        animationType="slide"
        transparent={false}
      >
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Crear Nuevo Cliente</Text>
            <TouchableOpacity
              style={styles.closeButton}
              onPress={() => setShowNewClientDialog(false)}
            >
              <Text style={styles.closeButtonText}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.formContainer} contentContainerStyle={styles.formContent}>
            {/* ID del Cliente */}
            <View style={styles.formGroup}>
              <Text style={styles.label}>ID del Cliente *</Text>
              <TextInput
                style={styles.input}
                value={newClientData.clientNumber}
                onChangeText={(text) => setNewClientData({ ...newClientData, clientNumber: text })}
                placeholder="Ej: CLI-001"
              />
              <Text style={styles.hint}>Se genera automáticamente, pero puedes modificarlo</Text>
            </View>

            {/* Nombre de la Empresa */}
            <View style={styles.formGroup}>
              <Text style={styles.label}>Nombre de la Empresa *</Text>
              <TextInput
                style={styles.input}
                value={newClientData.companyName}
                onChangeText={(text) => setNewClientData({ ...newClientData, companyName: text })}
                placeholder="Ej: Distribuidora ABC"
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
                />
                <TouchableOpacity
                  style={styles.gpsButton}
                  onPress={handleGetLocation}
                  disabled={isGettingLocation}
                >
                  <Text style={styles.gpsButtonText}>
                    {isGettingLocation ? '...' : '📍'}
                  </Text>
                </TouchableOpacity>
              </View>
              <Text style={styles.hint}>Toca el botón para obtener la ubicación actual</Text>
            </View>

            {/* Tipo de Precio */}
            <View style={styles.formGroup}>
              <Text style={styles.label}>Tipo de Precio *</Text>
              <View style={styles.priceTypeContainer}>
                {['ciudad', 'interior', 'especial'].map((type) => (
                  <TouchableOpacity
                    key={type}
                    style={[
                      styles.priceTypeButton,
                      newClientData.priceType === type && styles.priceTypeButtonActive,
                    ]}
                    onPress={() => setNewClientData({ ...newClientData, priceType: type as any })}
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
                style={[styles.button, styles.buttonSecondary]}
                onPress={() => setShowNewClientDialog(false)}
              >
                <Text style={styles.buttonSecondaryText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.button, styles.buttonPrimary]}
                onPress={handleCreateClient}
                disabled={isCreating}
              >
                <Text style={styles.buttonPrimaryText}>
                  {isCreating ? 'Creando...' : 'Crear Cliente'}
                </Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </SafeAreaView>
      </Modal>

      <View style={styles.infoContainer}>
        <Text style={styles.infoText}>
          Selecciona un cliente para comenzar a crear su pedido
        </Text>
        <TouchableOpacity
          style={styles.selectButton}
          onPress={() => setShowClientDialog(true)}
        >
          <Text style={styles.selectButtonText}>Seleccionar Cliente</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  modalContainer: {
    flex: 1,
    backgroundColor: '#fff',
  },
  modalHeader: {
    padding: 20,
    backgroundColor: '#3b82f6',
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 8,
  },
  modalSubtitle: {
    fontSize: 14,
    color: '#e0e7ff',
  },
  closeButton: {
    position: 'absolute',
    top: 20,
    right: 20,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeButtonText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f1f5f9',
    margin: 16,
    paddingHorizontal: 16,
    borderRadius: 12,
    height: 50,
  },
  searchIcon: {
    fontSize: 18,
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: '#1e293b',
  },
  clearButton: {
    fontSize: 18,
    color: '#64748b',
    padding: 4,
  },
  newClientButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginBottom: 16,
    padding: 16,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#3b82f6',
    borderStyle: 'dashed',
  },
  newClientButtonIcon: {
    fontSize: 20,
    marginRight: 8,
  },
  newClientButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#3b82f6',
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
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1e293b',
    marginBottom: 8,
    textAlign: 'center',
  },
  emptySubtext: {
    fontSize: 14,
    color: '#64748b',
    textAlign: 'center',
  },
  listContainer: {
    padding: 16,
  },
  clientCard: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  clientIcon: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#dbeafe',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  clientIconText: {
    fontSize: 24,
  },
  clientInfo: {
    flex: 1,
  },
  clientName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1e293b',
    marginBottom: 4,
  },
  clientContact: {
    fontSize: 14,
    color: '#64748b',
    marginBottom: 4,
  },
  clientDetail: {
    fontSize: 12,
    color: '#64748b',
    marginBottom: 2,
  },
  priceTypeBadge: {
    backgroundColor: '#dbeafe',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    alignSelf: 'flex-start',
    marginTop: 4,
  },
  priceTypeText: {
    fontSize: 11,
    color: '#3b82f6',
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  arrow: {
    fontSize: 24,
    color: '#cbd5e1',
  },
  formContainer: {
    flex: 1,
  },
  formContent: {
    padding: 20,
  },
  formGroup: {
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1e293b',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#f1f5f9',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: '#1e293b',
  },
  hint: {
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
    width: 50,
    backgroundColor: '#3b82f6',
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
    padding: 12,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#e2e8f0',
    alignItems: 'center',
  },
  priceTypeButtonActive: {
    borderColor: '#3b82f6',
    backgroundColor: '#dbeafe',
  },
  priceTypeButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#64748b',
  },
  priceTypeButtonTextActive: {
    color: '#3b82f6',
  },
  formButtons: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 20,
    marginBottom: 40,
  },
  button: {
    flex: 1,
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  buttonPrimary: {
    backgroundColor: '#3b82f6',
  },
  buttonPrimaryText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  buttonSecondary: {
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: '#e2e8f0',
  },
  buttonSecondaryText: {
    color: '#64748b',
    fontSize: 16,
    fontWeight: '600',
  },
  infoContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  infoText: {
    fontSize: 16,
    color: '#64748b',
    textAlign: 'center',
    marginBottom: 24,
  },
  selectButton: {
    backgroundColor: '#3b82f6',
    paddingHorizontal: 32,
    paddingVertical: 16,
    borderRadius: 12,
  },
  selectButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
