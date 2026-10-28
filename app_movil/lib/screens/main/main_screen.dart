import 'package:admin/core/api_client.dart';
import 'package:admin/features/archivos/cuota_screen.dart';
import 'package:admin/features/archivos/explorador_screen.dart';
import 'package:admin/features/identidad/login_screen.dart';
import 'package:admin/features/papelera/papelera_screen.dart';
import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

class MainScreen extends StatefulWidget {
  const MainScreen({super.key});

  @override
  State<MainScreen> createState() => _MainScreenState();
}

class _MainScreenState extends State<MainScreen> {
  int _seleccion = 0;

  final _paginas = const [
    ExploradorScreen(),
    CuotaScreen(),
    PapeleraScreen(),
    _CuentaScreen(),
  ];

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: IndexedStack(index: _seleccion, children: _paginas),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _seleccion,
        onDestinationSelected: (index) => setState(() => _seleccion = index),
        destinations: const [
          NavigationDestination(
              icon: Icon(Icons.folder_open_outlined),
              selectedIcon: Icon(Icons.folder_open),
              label: 'Archivos'),
          NavigationDestination(
              icon: Icon(Icons.cloud_outlined),
              selectedIcon: Icon(Icons.cloud),
              label: 'Espacio'),
          NavigationDestination(
              icon: Icon(Icons.delete_outline),
              selectedIcon: Icon(Icons.delete),
              label: 'Papelera'),
          NavigationDestination(
              icon: Icon(Icons.person_outline),
              selectedIcon: Icon(Icons.person),
              label: 'Cuenta'),
        ],
      ),
    );
  }
}

class _CuentaScreen extends StatelessWidget {
  const _CuentaScreen();

  Future<void> _cerrarSesion(BuildContext context) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove('auth_token');
    await prefs.remove('nombreUsuario');
    if (context.mounted) {
      Navigator.of(context).pushAndRemoveUntil(
        MaterialPageRoute(builder: (_) => const LoginScreen()),
        (_) => false,
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<SharedPreferences>(
      future: SharedPreferences.getInstance(),
      builder: (context, snapshot) {
        final usuario = snapshot.data?.getString('nombreUsuario') ?? '';
        return Scaffold(
          appBar: AppBar(title: const Text('Tu cuenta')),
          body: ListView(
            padding: const EdgeInsets.all(20),
            children: [
              Card(
                elevation: 0,
                child: Padding(
                  padding: const EdgeInsets.all(22),
                  child: Column(
                    children: [
                      CircleAvatar(
                        radius: 36,
                        backgroundColor: const Color(0xFFEAEAFF),
                        child: Text(
                          usuario.isEmpty ? '?' : usuario[0].toUpperCase(),
                          style: const TextStyle(
                              color: Color(0xFF5B5CE2),
                              fontSize: 28,
                              fontWeight: FontWeight.w700),
                        ),
                      ),
                      const SizedBox(height: 14),
                      Text(usuario.isEmpty ? 'Usuario' : usuario,
                          style: Theme.of(context)
                              .textTheme
                              .titleLarge
                              ?.copyWith(fontWeight: FontWeight.w600)),
                      const SizedBox(height: 5),
                      Text('Sesión activa',
                          style: TextStyle(color: Colors.blueGrey.shade500)),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 16),
              Card(
                elevation: 0,
                child: ListTile(
                  leading:
                      const Icon(Icons.dns_outlined, color: Color(0xFF5B5CE2)),
                  title: const Text('Servidor'),
                  subtitle: Text(ApiClient.baseUrl),
                ),
              ),
              const SizedBox(height: 20),
              OutlinedButton.icon(
                onPressed: () => _cerrarSesion(context),
                icon: const Icon(Icons.logout_rounded),
                label: const Text('Cerrar sesión'),
                style: OutlinedButton.styleFrom(
                  foregroundColor: const Color(0xFFB33B47),
                  minimumSize: const Size.fromHeight(52),
                  side: const BorderSide(color: Color(0xFFE9BFC3)),
                  shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(16)),
                ),
              ),
            ],
          ),
        );
      },
    );
  }
}
