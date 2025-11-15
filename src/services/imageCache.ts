import * as FileSystem from 'expo-file-system/legacy';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Servicio de caché de imágenes
 * Descarga y almacena imágenes localmente para uso offline
 */

// Verificar que documentDirectory esté disponible
if (!FileSystem.documentDirectory) {
  console.error('❌ FileSystem.documentDirectory es undefined');
  throw new Error('FileSystem.documentDirectory no está disponible');
}

const IMAGE_CACHE_DIR = `${FileSystem.documentDirectory}images/`;
const CACHE_INDEX_KEY = 'image_cache_index';

interface CacheIndex {
  [imageUrl: string]: {
    localPath: string;
    cachedAt: string;
  };
}

/**
 * Inicializa el directorio de caché de imágenes
 */
export async function initImageCache(): Promise<void> {
  const dirInfo = await FileSystem.getInfoAsync(IMAGE_CACHE_DIR);
  
  if (!dirInfo.exists) {
    await FileSystem.makeDirectoryAsync(IMAGE_CACHE_DIR, { intermediates: true });
    console.log('✅ Directorio de caché de imágenes creado');
  }
}

/**
 * Obtiene el índice de imágenes cacheadas
 */
async function getCacheIndex(): Promise<CacheIndex> {
  try {
    const indexJson = await AsyncStorage.getItem(CACHE_INDEX_KEY);
    return indexJson ? JSON.parse(indexJson) : {};
  } catch (error) {
    console.error('Error al leer índice de caché:', error);
    return {};
  }
}

/**
 * Guarda el índice de imágenes cacheadas
 */
async function saveCacheIndex(index: CacheIndex): Promise<void> {
  try {
    await AsyncStorage.setItem(CACHE_INDEX_KEY, JSON.stringify(index));
  } catch (error) {
    console.error('Error al guardar índice de caché:', error);
  }
}

/**
 * Genera un nombre de archivo único basado en la URL
 */
function getFileNameFromUrl(url: string): string {
  const hash = url.split('').reduce((a, b) => {
    a = ((a << 5) - a) + b.charCodeAt(0);
    return a & a;
  }, 0);
  
  const extension = url.split('.').pop()?.split('?')[0] || 'jpg';
  return `${Math.abs(hash)}.${extension}`;
}

/**
 * Descarga y cachea una imagen
 */
export async function cacheImage(imageUrl: string): Promise<string | null> {
  if (!imageUrl) return null;

  try {
    // Verificar si ya está cacheada
    const index = await getCacheIndex();
    if (index[imageUrl]) {
      const fileInfo = await FileSystem.getInfoAsync(index[imageUrl].localPath);
      if (fileInfo.exists) {
        console.log(`💾 Imagen ya cacheada: ${index[imageUrl].localPath}`);
        return index[imageUrl].localPath;
      }
    }

    // Descargar imagen
    const fileName = getFileNameFromUrl(imageUrl);
    const localPath = `${IMAGE_CACHE_DIR}${fileName}`;

    console.log(`📥 Descargando imagen: ${imageUrl}`);
    console.log(`💾 Guardando en: ${localPath}`);

    const downloadResult = await FileSystem.downloadAsync(imageUrl, localPath);

    console.log(`📄 Estado de descarga: ${downloadResult.status}`);

    if (downloadResult.status === 200) {
      // Verificar que el archivo se creó
      const fileInfo = await FileSystem.getInfoAsync(localPath);
      console.log(`📁 Archivo creado: ${fileInfo.exists}, Tamaño: ${'size' in fileInfo ? fileInfo.size : 'N/A'}`);

      // Actualizar índice
      index[imageUrl] = {
        localPath,
        cachedAt: new Date().toISOString(),
      };
      await saveCacheIndex(index);

      console.log(`✅ Imagen cacheada exitosamente: ${fileName}`);
      return localPath;
    } else {
      console.warn(`⚠️ Error HTTP al descargar imagen: ${downloadResult.status}`);
    }

    return null;
  } catch (error) {
    console.error('❌ Error al cachear imagen:', error);
    console.error('🔍 Detalles del error:', JSON.stringify(error, null, 2));
    console.error('📍 URL de imagen:', imageUrl);
    console.error('📁 Directorio de caché:', IMAGE_CACHE_DIR);
    return null;
  }
}

/**
 * Obtiene la ruta local de una imagen cacheada
 * Si no está cacheada, retorna la URL original
 */
export async function getCachedImagePath(imageUrl: string | null): Promise<string | null> {
  if (!imageUrl) return null;

  try {
    const index = await getCacheIndex();
    
    // Si está en el índice, confiar en que existe
    // No verificar con getInfoAsync para evitar errores en offline
    if (index[imageUrl] && index[imageUrl].localPath) {
      return index[imageUrl].localPath;
    }

    // Si no está cacheada, retornar URL original
    return imageUrl;
  } catch (error) {
    console.error('Error al obtener imagen cacheada:', error);
    // En caso de error, retornar URL original como fallback
    return imageUrl;
  }
}

/**
 * Cachea múltiples imágenes en lote
 */
export async function cacheMultipleImages(
  imageUrls: string[],
  onProgress?: (current: number, total: number) => void
): Promise<{ success: number; failed: number }> {
  let success = 0;
  let failed = 0;

  console.log(`📦 Iniciando descarga de ${imageUrls.length} imágenes...`);

  for (let i = 0; i < imageUrls.length; i++) {
    const url = imageUrls[i];
    onProgress?.(i + 1, imageUrls.length);

    const result = await cacheImage(url);
    if (result) {
      success++;
    } else {
      failed++;
    }
  }

  console.log(`✅ Descarga completada: ${success} exitosas, ${failed} fallidas`);
  console.log(`💾 Directorio de caché: ${IMAGE_CACHE_DIR}`);

  return { success, failed };
}

/**
 * Limpia el caché de imágenes
 */
export async function clearImageCache(): Promise<void> {
  try {
    const dirInfo = await FileSystem.getInfoAsync(IMAGE_CACHE_DIR);
    
    if (dirInfo.exists) {
      await FileSystem.deleteAsync(IMAGE_CACHE_DIR, { idempotent: true });
      await FileSystem.makeDirectoryAsync(IMAGE_CACHE_DIR, { intermediates: true });
    }

    await AsyncStorage.removeItem(CACHE_INDEX_KEY);
    console.log('✅ Caché de imágenes limpiado');
  } catch (error) {
    console.error('Error al limpiar caché:', error);
  }
}

/**
 * Lista todas las imágenes cacheadas
 */
export async function listCachedImages(): Promise<{ url: string; localPath: string; exists: boolean; size?: number }[]> {
  try {
    const index = await getCacheIndex();
    const results = [];

    for (const [url, entry] of Object.entries(index)) {
      const fileInfo = await FileSystem.getInfoAsync(entry.localPath);
      results.push({
        url,
        localPath: entry.localPath,
        exists: fileInfo.exists,
        size: fileInfo.exists && 'size' in fileInfo ? fileInfo.size : undefined,
      });
    }

    return results;
  } catch (error) {
    console.error('Error al listar imágenes cacheadas:', error);
    return [];
  }
}

/**
 * Obtiene el tamaño del caché de imágenes
 */
export async function getCacheSize(): Promise<number> {
  try {
    const index = await getCacheIndex();
    let totalSize = 0;

    for (const entry of Object.values(index)) {
      const fileInfo = await FileSystem.getInfoAsync(entry.localPath);
      if (fileInfo.exists && 'size' in fileInfo) {
        totalSize += fileInfo.size;
      }
    }

    return totalSize;
  } catch (error) {
    console.error('Error al calcular tamaño de caché:', error);
    return 0;
  }
}
