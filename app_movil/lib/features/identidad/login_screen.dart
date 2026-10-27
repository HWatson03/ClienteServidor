import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:admin/core/api_client.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:admin/screens/main/main_screen.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _usuarioController = TextEditingController();
  final _contrasenaController = TextEditingController();
  final _apiClient = ApiClient();
  bool _cargando = false;

  Future<void> _login() async {
    setState(() => _cargando = true);
    try {
      final response = await _apiClient.post('/api/auth/login', {
        'nombreUsuario': _usuarioController.text,
        'contrasena': _contrasenaController.text,
      });
      if (response.statusCode == 200) {
        final data = jsonDecode(response.body);
        final prefs = await SharedPreferences.getInstance();
        await prefs.setString('auth_token', data['token']);
        await prefs.setString('nombreUsuario', _usuarioController.text);
        if (mounted) {
          Navigator.pushReplacement(
            context,
            MaterialPageRoute(builder: (context) => MainScreen()),
          );
        }
      } else {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text('Error de autenticación')),
          );
        }
      }
    } finally {
      setState(() => _cargando = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Center(
        child: Container(
          width: 400,
          padding: EdgeInsets.all(32),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Text('ClienteServidor', style: Theme.of(context).textTheme.headlineLarge),
              SizedBox(height: 32),
              TextField(
                controller: _usuarioController,
                decoration: InputDecoration(labelText: 'Usuario'),
              ),
              SizedBox(height: 16),
              TextField(
                controller: _contrasenaController,
                decoration: InputDecoration(labelText: 'Contraseña'),
                obscureText: true,
              ),
              SizedBox(height: 32),
              ElevatedButton(
                onPressed: _cargando ? null : _login,
                child: Text(_cargando ? 'Cargando...' : 'Iniciar sesión'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
