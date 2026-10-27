import 'package:local_auth/local_auth.dart';

class BiometriaService {
  final LocalAuthentication auth = LocalAuthentication();
  
  Future<bool> estaDisponible() async {
    try {
      final disponible = await auth.canCheckBiometrics;
      final dispositivos = await auth.getAvailableBiometrics();
      return disponible && dispositivos.isNotEmpty;
    } catch (e) {
      return false;
    }
  }
  
  Future<bool> autenticar() async {
    try {
      return await auth.authenticate(
        localizedReason: 'Autenticación biométrica',
        options: const AuthenticationOptions(
          stickyAuth: true,
          biometricOnly: false,
        ),
      );
    } catch (e) {
      return false;
    }
  }
}
