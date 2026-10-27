import 'dart:io' show Platform;
import 'package:flutter/foundation.dart' show kIsWeb;

class PlataformaConfig {
  static bool get usaBiometria => !kIsWeb && Platform.isAndroid;
  static bool get usaUsuarioContrasena => true;
  
  static String get descripcionAuth {
    if (usaBiometria) return 'Usuario, contraseña y biometría opcional';
    return 'Usuario y contraseña';
  }
}
