ClienteServidor - Windows

Requisitos:
- Windows 10/11
- Conexión al servidor backend

Configuración:
- Usar usuario y contraseña (sin biometría)
- Servidor: http://IP_SERVIDOR:8080

Compilación en Windows:
flutter config --enable-windows-desktop
flutter build windows --release

Ejecutable:
build\windows\x64\runner\Release\admin.exe
