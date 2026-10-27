ClienteServidor - Linux

Requisitos:
- Linux x64
- GTK 3
- Conexión al servidor backend

Configuración:
- Usar usuario y contraseña (sin biometría)
- Servidor: http://IP_SERVIDOR:8080

Compilación:
flutter config --enable-linux-desktop
flutter build linux --release

Ejecutable:
build/linux/x64/release/bundle/admin

Dependencias (Ubuntu/Debian):
sudo apt install libgtk-3-dev libsecret-1-dev libjsoncpp-dev

