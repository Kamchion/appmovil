#!/usr/bin/env python3
from PIL import Image
import os

# Ruta de la imagen original
input_image = 'assets/ik-logo.png'

# Abrir la imagen original
img = Image.open(input_image)

# Tamaños necesarios para Expo/React Native
sizes = {
    'icon.png': 1024,  # Ícono principal (1024x1024)
    'adaptive-icon.png': 1024,  # Ícono adaptativo Android (1024x1024)
    'splash-icon.png': 1024,  # Ícono para splash screen
}

# Generar cada tamaño
for filename, size in sizes.items():
    # Redimensionar manteniendo la calidad
    resized = img.resize((size, size), Image.Resampling.LANCZOS)
    
    # Guardar
    output_path = f'assets/{filename}'
    resized.save(output_path, 'PNG', quality=95)
    print(f'✓ Generado: {output_path} ({size}x{size})')

print('\n✅ Todos los íconos generados exitosamente')
