import 'dart:async';
import 'dart:convert';

import 'package:admin/core/api_client.dart';
import 'package:admin/screens/main/main_screen.dart';
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _formKey = GlobalKey<FormState>();
  final _usuarioController = TextEditingController();
  final _contrasenaController = TextEditingController();
  final _apiClient = ApiClient();
  bool _cargando = false;
  bool _mostrarContrasena = false;
  String? _error;

  Future<void> _login() async {
    if (!_formKey.currentState!.validate()) return;
    FocusScope.of(context).unfocus();
    setState(() {
      _cargando = true;
      _error = null;
    });
    try {
      final usuario = _usuarioController.text.trim();
      final response = await _apiClient.post('/api/auth/login', {
        'nombreUsuario': usuario,
        'contrasena': _contrasenaController.text,
      }).timeout(const Duration(seconds: 15));
      if (response.statusCode == 200) {
        final data = jsonDecode(response.body);
        final token = data is Map<String, dynamic> ? data['token'] : null;
        if (token is! String || token.isEmpty) {
          throw const FormatException('Respuesta de login inválida');
        }
        final prefs = await SharedPreferences.getInstance();
        await prefs.setString('auth_token', token);
        await prefs.setString('nombreUsuario', usuario);
        if (mounted) {
          Navigator.pushReplacement(
            context,
            MaterialPageRoute(builder: (_) => const MainScreen()),
          );
        }
      } else if (response.statusCode == 400 || response.statusCode == 401) {
        _mostrarError('Usuario o contraseña incorrectos.');
      } else if (response.statusCode >= 500) {
        _mostrarError(
            'El servidor tuvo un problema. Inténtalo de nuevo en un momento.');
      } else {
        _mostrarError(
            'No se pudo iniciar sesión (HTTP ${response.statusCode}).');
      }
    } on http.ClientException {
      _mostrarError(
          'No se pudo conectar con tu portátil. Revisa que el servidor esté encendido y ambos estén en la misma Wi‑Fi.');
    } on TimeoutException {
      _mostrarError(
          'El servidor tardó demasiado en responder. Comprueba la conexión e inténtalo otra vez.');
    } on FormatException {
      _mostrarError(
          'La respuesta del servidor no se entendió. Comprueba que esté actualizado.');
    } catch (_) {
      _mostrarError('Ocurrió un error al iniciar sesión. Inténtalo de nuevo.');
    } finally {
      if (mounted) setState(() => _cargando = false);
    }
  }

  void _mostrarError(String mensaje) {
    if (mounted) setState(() => _error = mensaje);
  }

  @override
  void dispose() {
    _usuarioController.dispose();
    _contrasenaController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 440),
              child: Card(
                elevation: 0,
                color: Colors.white,
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(28),
                  side: const BorderSide(color: Color(0xFFE9EAF1)),
                ),
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(28, 36, 28, 30),
                  child: Form(
                    key: _formKey,
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        Center(
                          child: Container(
                            width: 72,
                            height: 72,
                            decoration: BoxDecoration(
                              gradient: const LinearGradient(
                                colors: [Color(0xFF7677F4), Color(0xFF5657D8)],
                                begin: Alignment.topLeft,
                                end: Alignment.bottomRight,
                              ),
                              borderRadius: BorderRadius.circular(23),
                            ),
                            child: const Icon(Icons.cloud_done_rounded,
                                color: Colors.white, size: 38),
                          ),
                        ),
                        const SizedBox(height: 24),
                        Text(
                          'Qué bueno verte',
                          textAlign: TextAlign.center,
                          style: Theme.of(context)
                              .textTheme
                              .headlineSmall
                              ?.copyWith(fontWeight: FontWeight.w700),
                        ),
                        const SizedBox(height: 8),
                        Text(
                          'Inicia sesión para acceder a tus archivos',
                          textAlign: TextAlign.center,
                          style: TextStyle(
                              color: Colors.blueGrey.shade500, height: 1.5),
                        ),
                        const SizedBox(height: 30),
                        TextFormField(
                          controller: _usuarioController,
                          textInputAction: TextInputAction.next,
                          autocorrect: false,
                          decoration: const InputDecoration(
                            labelText: 'Usuario',
                            prefixIcon: Icon(Icons.person_outline_rounded),
                          ),
                          validator: (value) =>
                              value == null || value.trim().isEmpty
                                  ? 'Escribe tu usuario'
                                  : null,
                        ),
                        const SizedBox(height: 16),
                        TextFormField(
                          controller: _contrasenaController,
                          obscureText: !_mostrarContrasena,
                          textInputAction: TextInputAction.done,
                          onFieldSubmitted: (_) => _cargando ? null : _login(),
                          decoration: InputDecoration(
                            labelText: 'Contraseña',
                            prefixIcon: const Icon(Icons.lock_outline_rounded),
                            suffixIcon: IconButton(
                              tooltip: _mostrarContrasena
                                  ? 'Ocultar contraseña'
                                  : 'Mostrar contraseña',
                              onPressed: () => setState(() =>
                                  _mostrarContrasena = !_mostrarContrasena),
                              icon: Icon(_mostrarContrasena
                                  ? Icons.visibility_off_outlined
                                  : Icons.visibility_outlined),
                            ),
                          ),
                          validator: (value) => value == null || value.isEmpty
                              ? 'Escribe tu contraseña'
                              : null,
                        ),
                        if (_error != null) ...[
                          const SizedBox(height: 16),
                          Container(
                            padding: const EdgeInsets.all(14),
                            decoration: BoxDecoration(
                              color: const Color(0xFFFFF1F0),
                              borderRadius: BorderRadius.circular(14),
                            ),
                            child: Row(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                const Icon(Icons.info_outline_rounded,
                                    color: Color(0xFFC13F48), size: 20),
                                const SizedBox(width: 10),
                                Expanded(
                                    child: Text(_error!,
                                        style: const TextStyle(
                                            color: Color(0xFF9D3038),
                                            height: 1.4))),
                              ],
                            ),
                          ),
                        ],
                        const SizedBox(height: 24),
                        SizedBox(
                          height: 54,
                          child: FilledButton(
                            onPressed: _cargando ? null : _login,
                            style: FilledButton.styleFrom(
                              backgroundColor: const Color(0xFF5B5CE2),
                              shape: RoundedRectangleBorder(
                                  borderRadius: BorderRadius.circular(16)),
                            ),
                            child: _cargando
                                ? const SizedBox(
                                    width: 22,
                                    height: 22,
                                    child: CircularProgressIndicator(
                                        strokeWidth: 2, color: Colors.white))
                                : const Text('Iniciar sesión',
                                    style: TextStyle(
                                        fontWeight: FontWeight.w600,
                                        fontSize: 16)),
                          ),
                        ),
                        const SizedBox(height: 20),
                        Text(
                          'Tus archivos, siempre a mano.',
                          textAlign: TextAlign.center,
                          style: TextStyle(
                              color: Colors.blueGrey.shade400, fontSize: 12),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
