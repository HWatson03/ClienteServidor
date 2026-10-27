import 'package:flutter/material.dart';
import 'package:admin/features/identidad/login_screen.dart';
import 'package:admin/screens/main/main_screen.dart';
import 'package:admin/features/transferencias/cargas_screen.dart';

class AppRoutes {
  static const String login = '/login';
  static const String home = '/home';
  static const String cargas = '/cargas';
  
  static Map<String, WidgetBuilder> routes = {
    login: (context) => LoginScreen(),
    home: (context) => MainScreen(),
    cargas: (context) => CargasScreen(),
  };
}
