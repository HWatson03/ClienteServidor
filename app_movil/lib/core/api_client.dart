import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';
import 'package:flutter/foundation.dart' show kIsWeb;

class ApiClient {
  static String get baseUrl {
    if (kIsWeb) {
      const String base =
          String.fromEnvironment('API_BASE_URL', defaultValue: '');
      if (base.isNotEmpty) return base;
      return Uri.base.origin;
    }
    return const String.fromEnvironment('API_BASE_URL',
        defaultValue: 'http://localhost:8080');
  }

  Future<String?> getToken() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getString('auth_token');
  }

  Future<Map<String, String>> headers() async {
    final token = await getToken();
    return {
      'Content-Type': 'application/json',
      if (token != null) 'Authorization': 'Bearer $token',
    };
  }

  Future<http.Response> post(String path, Map<String, dynamic> body) async {
    final response = await http.post(
      Uri.parse('$baseUrl$path'),
      headers: await headers(),
      body: jsonEncode(body),
    );
    return response;
  }

  Future<http.Response> get(String path) async {
    final response = await http.get(
      Uri.parse('$baseUrl$path'),
      headers: await headers(),
    );
    return response;
  }

  Future<http.Response> delete(String path) async {
    return http.delete(
      Uri.parse('$baseUrl$path'),
      headers: await headers(),
    );
  }
}
