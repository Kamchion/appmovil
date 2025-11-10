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
} from 'react-native';
import { getDatabase } from '../database/db';
import * as Location from 'expo-location';

interface Client {
  id: string;
  name: string;
  companyName: string;
  email: string;
  phone: string;
  address: string;
  clientNumber: string;
  priceType: string;
  isActive: number;
}

/**
 * Pantalla de Clientes - Gestión completa de cartera de clientes
 * Réplica exacta del VendedorClientes de la web
 */
export default function ClientesScreen() {
  const [clients, setClients] = useState<Client[]>([]);
  const [filteredClients, setFilteredClients] = useState<Client[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [showNewClientDialog, setShowNewClientDialog] = useState(false);
  const [showEditClientDialog, setShowEditClientDialog] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [isGettingLocation, setIsGettingLocation] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
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
        'SELECT * FROM clients ORDER BY companyName ASC'
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

  const handleGetLocation = async () => {
    try {
      setIsGettingLocation(true);
      
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permiso denegado', 'Se necesita permiso de ubicación');
        setIsGettingLocation(false);
        return;
      }

      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });

      const gpsString = `${location.coords.latitude.toFixed(6)}, ${location.coords.longitude.toFixed(6)}`;
      setFormData({ ...formData, gpsLocation: gpsString });
      Alert.alert('Éxito', 'Ubicación obtenida correctamente');
    } catch (error: any) {
      Alert.alert('Error', 'No se pudo obtener la ubicación: ' + error.message);
    } finally {
      setIsGettingLocation(false);
    }
  };

  const handleCreateClient = async () => {
    if (!formData.companyName.trim()) {
      Alert.alert('Error', 'El nombre de la empresa es requerido');
      return;
    }
    if (!formData.contactPerson.trim()) {
      Alert.alert('Error', 'La persona de contacto es requerida');
      return;
    }
    if (!formData.phone.trim()) {
      Alert.alert('Error', 'El teléfono es requerido');
      return;
    }

    setIsSaving(true);

    try {
      const db = getDatabase();
      const newId = Date.now().toString();
      
      await db.runAsync(
        `INSERT INTO clients 
         (id, name, companyName, email, phone, address, city, state, clientNumber, priceType, isActive, syncedAt, needsSync)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          newId,
          formData.contactPerson,
          formData.companyName,
          formData.email || '',
          formData.phone,
          formData.address || '',
          '',
          '',
          formData.clientNumber,
          formData.priceType,
          1,
          new Date().toISOString(),
          1,
        ]
      );

      Alert.alert('Éxito', 'Cliente creado exitosamente');
      setShowNewClientDialog(false);
      resetForm();
      loadClients();
    } catch (error: any) {
      Alert.alert('Error', 'No se pudo crear el cliente: ' + error.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleEditClient = (client: Client) => {
    setEditingClient(client);
    setFormData({
      clientNumber: client.clientNumber || '',
      companyName: client.companyName || '',
      contactPerson: client.name || '',
      email: client.email || '',
      phone: client.phone || '',
      address: client.address || '',
      companyTaxId: (client as any).companyTaxId || '',
      gpsLocation: (client as any).gpsLocation || '',
      priceType: (client.priceType as any) || 'ciudad',
    });
    setShowEditClientDialog(true);
  };

  const handleUpdateClient = async () => {
    if (!formData.companyName.trim() || !formData.contactPerson.trim() || !formData.phone.trim()) {
      Alert.alert('Error', 'Los campos marcados con * son requeridos');
      return;
    }

    setIsSaving(true);

    try {
      const db = getDatabase();
      
      const now = new Date().toISOString();
      
      await db.runAsync(
        `UPDATE clients 
         SET name = ?, companyName = ?, email = ?, phone = ?, address = ?, clientNumber = ?, priceType = ?, 
             companyTaxId = ?, gpsLocation = ?, modifiedAt = ?, needsSync = 1
         WHERE id = ?`,
        [
          formData.contactPerson,
          formData.companyName,
          formData.email || '',
          formData.phone,
          formData.address || '',
          formData.clientNumber,
          formData.priceType,
          formData.companyTaxId || '',
          formData.gpsLocation || '',
          now,
          editingClient!.id,
        ]
      );

      // Intentar sincronizar inmediatamente con el servidor
      try {
        const AsyncStorage = require('@react-native-async-storage/async-storage').default;
        const { updateClientOnServer } = require('../services/api-client-update');
        
        const token = await AsyncStorage.getItem('vendor_token');
        
        if (!token) {
          console.warn('⚠️ No hay token de vendedor, se sincronizará después');
          Alert.alert(
            '⚠️ Sin Conexión',
            'Cliente guardado localmente. Los cambios se sincronizarán cuando inicies sesión.',
            [{ text: 'OK' }]
          );
        } else {
          console.log('🔄 Sincronizando cliente con servidor...');
          console.log('Token:', token.substring(0, 20) + '...');
          console.log('Client ID:', editingClient!.id);
          console.log('Updates:', {
            name: formData.contactPerson,
            companyName: formData.companyName,
            email: formData.email || '',
            phone: formData.phone,
            priceType: formData.priceType,
          });
          
          const result = await updateClientOnServer(token, editingClient!.id, {
            name: formData.contactPerson,
            companyName: formData.companyName,
            email: formData.email || '',
            phone: formData.phone,
            address: formData.address || '',
            companyTaxId: formData.companyTaxId || '',
            gpsLocation: formData.gpsLocation || '',
            priceType: formData.priceType,
          });
          
          console.log('📡 Respuesta del servidor:', result);
          
          // Marcar como sincronizado
          await db.runAsync(
            `UPDATE clients SET needsSync = 0, syncedAt = ? WHERE id = ?`,
            [now, editingClient!.id]
          );
          
          console.log('✅ Cliente sincronizado con servidor exitosamente');
        }
      } catch (syncError: any) {
        console.error('❌ Error al sincronizar con servidor:', syncError);
        console.error('Error message:', syncError.message);
        console.error('Error stack:', syncError.stack);
        
        // Mostrar advertencia al usuario sobre el error de sincronización
        Alert.alert(
          '⚠️ Advertencia',
          `Cliente guardado localmente, pero no se pudo sincronizar con el servidor.\n\nError: ${syncError.message}\n\nLos cambios se sincronizarán automáticamente en la próxima sincronización.`,
          [{ text: 'Entendido' }]
        );
      }

      Alert.alert('Éxito', 'Cliente actualizado exitosamente');
      setShowEditClientDialog(false);
      setEditingClient(null);
      resetForm();
      loadClients();
    } catch (error: any) {
      Alert.alert('Error', 'No se pudo actualizar el cliente: ' + error.message);
    } finally {
      setIsSaving(false);
    }
  };

  const resetForm = () => {
    setFormData({
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
  };

  const renderClient = ({ item }: { item: Client }) => (
    <View style={styles.clientCard}>
      <View style={styles.clientHeader}>
        <Text style={styles.clientName}>{item.companyName}</Text>
        <View style={[
          styles.priceTypeBadge,
          item.priceType === 'ciudad' && styles.priceTypeCiudad,
          item.priceType === 'interior' && styles.priceTypeInterior,
          item.priceType === 'especial' && styles.priceTypeEspecial,
        ]}>
          <Text style={styles.priceTypeText}>{item.priceType || 'ciudad'}</Text>
        </View>
      </View>

      <View style={styles.clientDetails}>
        <View style={styles.clientDetail}>
          <Text style={styles.detailIcon}>👤</Text>
          <Text style={styles.detailText}>{item.name || '-'}</Text>
        </View>
        <View style={styles.clientDetail}>
          <Text style={styles.detailIcon}>📧</Text>
          <Text style={styles.detailText} numberOfLines={1}>{item.email || '-'}</Text>
        </View>
        <View style={styles.clientDetail}>
          <Text style={styles.detailIcon}>📱</Text>
          <Text style={styles.detailText}>{item.phone || '-'}</Text>
        </View>
        <View style={styles.clientDetail}>
          <Text style={styles.detailIcon}>🏢</Text>
          <Text style={styles.detailText}>{item.clientNumber || '-'}</Text>
        </View>
      </View>

      <View style={styles.clientFooter}>
        <View style={[
          styles.statusBadge,
          item.isActive ? styles.statusActive : styles.statusInactive,
        ]}>
          <Text style={styles.statusText}>
            {item.isActive ? 'Activo' : 'Inactivo'}
          </Text>
        </View>
        <TouchableOpacity
          style={styles.editButton}
          onPress={() => handleEditClient(item)}
        >
          <Text style={styles.editButtonIcon}>✏️</Text>
          <Text style={styles.editButtonText}>Editar</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderForm = () => (
    <ScrollView style={styles.formContainer} contentContainerStyle={styles.formContent}>
      <View style={styles.formGroup}>
        <Text style={styles.label}>ID del Cliente *</Text>
        <TextInput
          style={styles.input}
          value={formData.clientNumber}
          onChangeText={(text) => setFormData({ ...formData, clientNumber: text })}
          placeholder="Ej: CLI-001"
        />
        <Text style={styles.hint}>Se genera automáticamente</Text>
      </View>

      <View style={styles.formGroup}>
        <Text style={styles.label}>Nombre de la Empresa *</Text>
        <TextInput
          style={styles.input}
          value={formData.companyName}
          onChangeText={(text) => setFormData({ ...formData, companyName: text })}
          placeholder="Ej: Distribuidora ABC"
        />
      </View>

      <View style={styles.formGroup}>
        <Text style={styles.label}>Persona de Contacto *</Text>
        <TextInput
          style={styles.input}
          value={formData.contactPerson}
          onChangeText={(text) => setFormData({ ...formData, contactPerson: text })}
          placeholder="Ej: Juan Pérez"
        />
      </View>

      <View style={styles.formGroup}>
        <Text style={styles.label}>Email</Text>
        <TextInput
          style={styles.input}
          value={formData.email}
          onChangeText={(text) => setFormData({ ...formData, email: text })}
          placeholder="Ej: contacto@empresa.com"
          keyboardType="email-address"
          autoCapitalize="none"
        />
      </View>

      <View style={styles.formGroup}>
        <Text style={styles.label}>Teléfono *</Text>
        <TextInput
          style={styles.input}
          value={formData.phone}
          onChangeText={(text) => setFormData({ ...formData, phone: text })}
          placeholder="Ej: +595 21 123456"
          keyboardType="phone-pad"
        />
      </View>

      <View style={styles.formGroup}>
        <Text style={styles.label}>Dirección</Text>
        <TextInput
          style={styles.input}
          value={formData.address}
          onChangeText={(text) => setFormData({ ...formData, address: text })}
          placeholder="Ej: Av. Principal 123"
        />
      </View>

      <View style={styles.formGroup}>
        <Text style={styles.label}>RUC</Text>
        <TextInput
          style={styles.input}
          value={formData.companyTaxId}
          onChangeText={(text) => setFormData({ ...formData, companyTaxId: text })}
          placeholder="Ej: 80012345-6"
        />
      </View>

      <View style={styles.formGroup}>
        <Text style={styles.label}>Ubicación GPS</Text>
        <View style={styles.gpsContainer}>
          <TextInput
            style={[styles.input, styles.gpsInput]}
            value={formData.gpsLocation}
            onChangeText={(text) => setFormData({ ...formData, gpsLocation: text })}
            placeholder="Latitud, Longitud"
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
        <Text style={styles.hint}>Toca el botón para obtener ubicación actual</Text>
      </View>

      <View style={styles.formGroup}>
        <Text style={styles.label}>Tipo de Precio *</Text>
        <View style={styles.priceTypeContainer}>
          {['ciudad', 'interior', 'especial'].map((type) => (
            <TouchableOpacity
              key={type}
              style={[
                styles.priceTypeButton,
                formData.priceType === type && styles.priceTypeButtonActive,
              ]}
              onPress={() => setFormData({ ...formData, priceType: type as any })}
            >
              <Text
                style={[
                  styles.priceTypeButtonText,
                  formData.priceType === type && styles.priceTypeButtonTextActive,
                ]}
              >
                {type.charAt(0).toUpperCase() + type.slice(1)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <View style={styles.formButtons}>
        <TouchableOpacity
          style={[styles.button, styles.buttonSecondary]}
          onPress={() => {
            showEditClientDialog ? setShowEditClientDialog(false) : setShowNewClientDialog(false);
            resetForm();
          }}
        >
          <Text style={styles.buttonSecondaryText}>Cancelar</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.button, styles.buttonPrimary]}
          onPress={showEditClientDialog ? handleUpdateClient : handleCreateClient}
          disabled={isSaving}
        >
          <Text style={styles.buttonPrimaryText}>
            {isSaving ? 'Guardando...' : showEditClientDialog ? 'Actualizar' : 'Crear Cliente'}
          </Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#10b981" />
        <Text style={styles.loadingText}>Cargando clientes...</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Mis Clientes</Text>
          <Text style={styles.headerSubtitle}>Gestiona tu cartera de clientes</Text>
        </View>
        <TouchableOpacity
          style={styles.addButton}
          onPress={() => setShowNewClientDialog(true)}
        >
          <Text style={styles.addButtonText}>➕ Nuevo</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.searchContainer}>
        <Text style={styles.searchIcon}>🔍</Text>
        <TextInput
          style={styles.searchInput}
          placeholder="Buscar por nombre, contacto, email o teléfono..."
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

      {filteredClients.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyIcon}>👥</Text>
          <Text style={styles.emptyText}>
            {searchQuery ? 'No se encontraron clientes' : 'No tienes clientes registrados'}
          </Text>
          {!searchQuery && (
            <TouchableOpacity
              style={styles.emptyButton}
              onPress={() => setShowNewClientDialog(true)}
            >
              <Text style={styles.emptyButtonText}>➕ Crear tu primer cliente</Text>
            </TouchableOpacity>
          )}
        </View>
      ) : (
        <FlatList
          data={filteredClients}
          renderItem={renderClient}
          keyExtractor={(item) => item.id.toString()}
          contentContainerStyle={styles.listContainer}
          numColumns={1}
        />
      )}

      {/* New Client Modal */}
      <Modal visible={showNewClientDialog} animationType="slide">
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Crear Nuevo Cliente</Text>
            <TouchableOpacity
              style={styles.closeButton}
              onPress={() => {
                setShowNewClientDialog(false);
                resetForm();
              }}
            >
              <Text style={styles.closeButtonText}>✕</Text>
            </TouchableOpacity>
          </View>
          {renderForm()}
        </SafeAreaView>
      </Modal>

      {/* Edit Client Modal */}
      <Modal visible={showEditClientDialog} animationType="slide">
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Editar Cliente</Text>
            <TouchableOpacity
              style={styles.closeButton}
              onPress={() => {
                setShowEditClientDialog(false);
                setEditingClient(null);
                resetForm();
              }}
            >
              <Text style={styles.closeButtonText}>✕</Text>
            </TouchableOpacity>
          </View>
          {renderForm()}
        </SafeAreaView>
      </Modal>
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
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1e293b',
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#64748b',
    marginTop: 4,
  },
  addButton: {
    backgroundColor: '#10b981',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
  },
  addButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    margin: 16,
    paddingHorizontal: 16,
    borderRadius: 12,
    height: 50,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
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
  listContainer: {
    padding: 16,
  },
  clientCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  clientHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  clientName: {
    flex: 1,
    fontSize: 18,
    fontWeight: '600',
    color: '#1e293b',
  },
  priceTypeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  priceTypeCiudad: {
    backgroundColor: '#dbeafe',
  },
  priceTypeInterior: {
    backgroundColor: '#d1fae5',
  },
  priceTypeEspecial: {
    backgroundColor: '#ede9fe',
  },
  priceTypeText: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  clientDetails: {
    marginBottom: 12,
  },
  clientDetail: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  detailIcon: {
    fontSize: 16,
    marginRight: 8,
    width: 20,
  },
  detailText: {
    flex: 1,
    fontSize: 14,
    color: '#64748b',
  },
  clientFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  statusActive: {
    backgroundColor: '#d1fae5',
  },
  statusInactive: {
    backgroundColor: '#fee2e2',
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
  },
  editButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#3b82f6',
  },
  editButtonIcon: {
    fontSize: 14,
    marginRight: 4,
  },
  editButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#3b82f6',
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
    marginBottom: 16,
    textAlign: 'center',
  },
  emptyButton: {
    backgroundColor: '#10b981',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  emptyButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  modalContainer: {
    flex: 1,
    backgroundColor: '#fff',
  },
  modalHeader: {
    padding: 20,
    backgroundColor: '#10b981',
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
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
    backgroundColor: '#10b981',
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
    borderColor: '#10b981',
    backgroundColor: '#d1fae5',
  },
  priceTypeButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#64748b',
  },
  priceTypeButtonTextActive: {
    color: '#10b981',
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
    backgroundColor: '#10b981',
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
});
