/**
 * Servicio de captura de logs en tiempo real
 * Intercepta console.log, console.error, console.warn
 */

export interface LogEntry {
  id: string;
  timestamp: string;
  level: 'log' | 'error' | 'warn' | 'info';
  message: string;
}

class Logger {
  private logs: LogEntry[] = [];
  private maxLogs = 500; // Máximo de logs en memoria
  private listeners: Set<(logs: LogEntry[]) => void> = new Set();
  private originalConsole = {
    log: console.log,
    error: console.error,
    warn: console.warn,
    info: console.info,
  };

  constructor() {
    this.interceptConsole();
  }

  /**
   * Intercepta los métodos de console
   */
  private interceptConsole() {
    const self = this;

    console.log = function (...args: any[]) {
      self.addLog('log', args);
      self.originalConsole.log.apply(console, args);
    };

    console.error = function (...args: any[]) {
      self.addLog('error', args);
      self.originalConsole.error.apply(console, args);
    };

    console.warn = function (...args: any[]) {
      self.addLog('warn', args);
      self.originalConsole.warn.apply(console, args);
    };

    console.info = function (...args: any[]) {
      self.addLog('info', args);
      self.originalConsole.info.apply(console, args);
    };
  }

  /**
   * Agrega un log a la lista
   */
  private addLog(level: LogEntry['level'], args: any[]) {
    const message = args
      .map((arg) => {
        if (typeof arg === 'object') {
          try {
            return JSON.stringify(arg, null, 2);
          } catch {
            return String(arg);
          }
        }
        return String(arg);
      })
      .join(' ');

    const entry: LogEntry = {
      id: Date.now().toString() + Math.random(),
      timestamp: new Date().toISOString(),
      level,
      message,
    };

    this.logs.push(entry);

    // Limitar el número de logs en memoria
    if (this.logs.length > this.maxLogs) {
      this.logs.shift();
    }

    // Notificar a los listeners
    this.notifyListeners();
  }

  /**
   * Obtiene todos los logs
   */
  getLogs(): LogEntry[] {
    return [...this.logs];
  }

  /**
   * Limpia todos los logs
   */
  clearLogs() {
    this.logs = [];
    this.notifyListeners();
  }

  /**
   * Suscribe un listener para recibir actualizaciones
   */
  subscribe(callback: (logs: LogEntry[]) => void) {
    this.listeners.add(callback);
    return () => {
      this.listeners.delete(callback);
    };
  }

  /**
   * Notifica a todos los listeners
   */
  private notifyListeners() {
    const logs = this.getLogs();
    this.listeners.forEach((callback) => callback(logs));
  }

  /**
   * Exporta logs como texto
   */
  exportLogsAsText(): string {
    return this.logs
      .map((log) => {
        const time = new Date(log.timestamp).toLocaleTimeString();
        const level = log.level.toUpperCase().padEnd(5);
        return `[${time}] ${level} ${log.message}`;
      })
      .join('\n');
  }
}

// Singleton
const logger = new Logger();

export default logger;
