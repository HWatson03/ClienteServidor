# Repository Guidelines

## Project Structure & Module Organization

This is a monorepo. The Spring Boot backend is in `backend/`: production code is under `backend/src/main/java/org/servidor/personal/clienteservidor`, resources under `backend/src/main/resources`, and tests under `backend/src/test/java`. Keep backend classes in the existing base package so Spring component scanning can discover them. The Maven Wrapper and its `.mvn/` configuration are also in `backend/`. `app_movil/` is reserved for the Flutter/Dart client.

## Build, Test, and Development Commands

- `cd backend && ./mvnw test` compiles the backend and runs its test suite.
- `cd backend && ./mvnw package` builds the runnable backend artifact and runs tests.
- `cd backend && ./mvnw spring-boot:run` starts the backend locally.
- `cd backend && ./mvnw clean` removes generated files under `backend/target/`.

Use the backend wrapper rather than relying on a locally installed Maven version. The backend uses Spring Data JPA, Spring Security, Spring MVC, and PostgreSQL at runtime; verify related configuration when changing persistence or HTTP behavior.

## Coding Style & Naming Conventions

Use standard Java conventions: four spaces for indentation, one public top-level type per file, `UpperCamelCase` for classes and records, and `lowerCamelCase` for methods and fields. Use descriptive names and keep classes in package paths matching their declarations. Follow existing Spring patterns for controllers, services, repositories, and configuration. No formatter or lint plugin is configured in `backend/pom.xml`; keep diffs clean and consistent with neighboring code.

## Testing Guidelines

Backend tests use JUnit through Spring Boot's test dependencies. Name test classes `*Test` and place them in the matching package under `backend/src/test/java`. Run `cd backend && ./mvnw test` before submitting backend changes. Add focused tests for changed behavior; use Spring context or web/security test support when the behavior depends on application wiring.

## Commit & Pull Request Guidelines

Write commit subjects in Spanish, using concise imperative phrasing, for example `Agregar búsqueda de clientes`. Pull requests should describe the behavior changed, note relevant configuration or data effects, link related issues when applicable, and include test results. Add screenshots only when a change affects a user-facing interface.

## Security & Configuration Tips

Keep credentials and machine-specific settings out of source control. Put safe defaults in `backend/src/main/resources/application.properties` and provide secrets through environment variables or local-only configuration. Review authentication and authorization behavior whenever changing controllers or security configuration.
