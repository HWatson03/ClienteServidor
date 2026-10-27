import 'package:flutter/foundation.dart' show kIsWeb;

class WebConfig {
  static bool get esWeb => kIsWeb;
  static bool get permiteAnonimo => false;
  static bool get requiereLogin => true;
}
