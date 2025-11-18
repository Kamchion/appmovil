import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Share,
  Alert,
} from 'react-native';
import logger, { LogEntry } from '../services/logger';

export default function LogViewerScreen() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [autoScroll, setAutoScroll] = useState(true);
  const [filter, setFilter] = useState<'all' | 'error' | 'warn' | 'info' | 'log'>('all');
  const scrollViewRef = useRef<ScrollView>(null);

  useEffect(() => {
    // Cargar logs iniciales
    setLogs(logger.getLogs());

    // Suscribirse a actualizaciones
    const unsubscribe = logger.subscribe((newLogs) => {
      setLogs(newLogs);
      if (autoScroll) {
        setTimeout(() => {
          scrollViewRef.current?.scrollToEnd({ animated: true });
        }, 100);
      }
    });

    return unsubscribe;
  }, [autoScroll]);

  const handleClearLogs = () => {
    Alert.alert(
      'Limpiar Logs',
      '¿Estás seguro de que deseas eliminar todos los logs?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Limpiar',
          style: 'destructive',
          onPress: () => logger.clearLogs(),
        },
      ]
    );
  };

  const handleExportLogs = async () => {
    try {
      const text = logger.exportLogsAsText();
      await Share.share({
        message: text,
        title: 'Logs de IMPORKAM',
      });
    } catch (error) {
      Alert.alert('Error', 'No se pudieron exportar los logs');
    }
  };

  const getLogColor = (level: LogEntry['level']) => {
    switch (level) {
      case 'error':
        return '#EF4444';
      case 'warn':
        return '#F59E0B';
      case 'info':
        return '#3B82F6';
      default:
        return '#6B7280';
    }
  };

  const getLogIcon = (level: LogEntry['level']) => {
    switch (level) {
      case 'error':
        return '❌';
      case 'warn':
        return '⚠️';
      case 'info':
        return 'ℹ️';
      default:
        return '📝';
    }
  };

  const filteredLogs = filter === 'all' 
    ? logs 
    : logs.filter(log => log.level === filter);

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Logs del Sistema</Text>
        <Text style={styles.subtitle}>{filteredLogs.length} mensajes</Text>
      </View>

      {/* Filtros */}
      <ScrollView horizontal style={styles.filterContainer} showsHorizontalScrollIndicator={false}>
        <TouchableOpacity
          style={[styles.filterButton, filter === 'all' && styles.filterButtonActive]}
          onPress={() => setFilter('all')}
        >
          <Text style={[styles.filterText, filter === 'all' && styles.filterTextActive]}>
            Todos ({logs.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.filterButton, filter === 'error' && styles.filterButtonActive]}
          onPress={() => setFilter('error')}
        >
          <Text style={[styles.filterText, filter === 'error' && styles.filterTextActive]}>
            ❌ Errores ({logs.filter(l => l.level === 'error').length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.filterButton, filter === 'warn' && styles.filterButtonActive]}
          onPress={() => setFilter('warn')}
        >
          <Text style={[styles.filterText, filter === 'warn' && styles.filterTextActive]}>
            ⚠️ Advertencias ({logs.filter(l => l.level === 'warn').length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.filterButton, filter === 'info' && styles.filterButtonActive]}
          onPress={() => setFilter('info')}
        >
          <Text style={[styles.filterText, filter === 'info' && styles.filterTextActive]}>
            ℹ️ Info ({logs.filter(l => l.level === 'info').length})
          </Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Controles */}
      <View style={styles.controls}>
        <TouchableOpacity
          style={[styles.controlButton, autoScroll && styles.controlButtonActive]}
          onPress={() => setAutoScroll(!autoScroll)}
        >
          <Text style={styles.controlButtonText}>
            {autoScroll ? '⏸️ Pausar' : '▶️ Auto-scroll'}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.controlButton} onPress={handleExportLogs}>
          <Text style={styles.controlButtonText}>📤 Exportar</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.controlButton} onPress={handleClearLogs}>
          <Text style={styles.controlButtonText}>🗑️ Limpiar</Text>
        </TouchableOpacity>
      </View>

      {/* Lista de logs */}
      <ScrollView
        ref={scrollViewRef}
        style={styles.logsContainer}
        contentContainerStyle={styles.logsContent}
      >
        {filteredLogs.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>No hay logs para mostrar</Text>
          </View>
        ) : (
          filteredLogs.map((log) => (
            <View key={log.id} style={styles.logEntry}>
              <View style={styles.logHeader}>
                <Text style={styles.logIcon}>{getLogIcon(log.level)}</Text>
                <Text style={styles.logTime}>
                  {new Date(log.timestamp).toLocaleTimeString()}
                </Text>
                <View style={[styles.logBadge, { backgroundColor: getLogColor(log.level) }]}>
                  <Text style={styles.logBadgeText}>{log.level.toUpperCase()}</Text>
                </View>
              </View>
              <Text style={styles.logMessage}>{log.message}</Text>
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F172A',
  },
  header: {
    backgroundColor: '#1E293B',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#F1F5F9',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: '#94A3B8',
  },
  filterContainer: {
    backgroundColor: '#1E293B',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  filterButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#334155',
    marginRight: 8,
  },
  filterButtonActive: {
    backgroundColor: '#2563EB',
  },
  filterText: {
    color: '#94A3B8',
    fontSize: 14,
    fontWeight: '500',
  },
  filterTextActive: {
    color: '#FFFFFF',
  },
  controls: {
    flexDirection: 'row',
    backgroundColor: '#1E293B',
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  controlButton: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: '#334155',
    marginHorizontal: 4,
    alignItems: 'center',
  },
  controlButtonActive: {
    backgroundColor: '#2563EB',
  },
  controlButtonText: {
    color: '#F1F5F9',
    fontSize: 12,
    fontWeight: '600',
  },
  logsContainer: {
    flex: 1,
  },
  logsContent: {
    padding: 12,
  },
  logEntry: {
    backgroundColor: '#1E293B',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    borderLeftWidth: 3,
    borderLeftColor: '#334155',
  },
  logHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  logIcon: {
    fontSize: 16,
    marginRight: 8,
  },
  logTime: {
    fontSize: 12,
    color: '#94A3B8',
    marginRight: 8,
  },
  logBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  logBadgeText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  logMessage: {
    fontSize: 13,
    color: '#E2E8F0',
    fontFamily: 'monospace',
    lineHeight: 18,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    fontSize: 16,
    color: '#64748B',
  },
});
