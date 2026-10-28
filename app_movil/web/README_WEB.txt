ClienteServidor - Web

Requisitos:
- Navegador moderno
- Conexión al servidor backend con HTTPS

Configuración:
- Requiere login (sin acceso anónimo)
- Sin biometría
- Sin subida en segundo plano al cerrar pestaña

Compilación:
flutter build web --release

Despliegue:
Subir build/web/ al servidor web

Uso:
- Compilar con API_BASE_URL si backend en otro origen: flutter build web --dart-define=API_BASE_URL=https://tu-servidor
- Configurar CORS en backend para origen del sitio
- Usar HTTPS para evitar contenido mixto
