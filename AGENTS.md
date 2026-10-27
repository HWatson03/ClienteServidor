# Repository Guidelines

## Project Structure & Module Organization

This repository is a single-module Spring Boot application built with Maven and Java 21. Production code lives under `src/main/java/org/servidor/personal/clienteservidor`; runtime configuration and other resources belong in `src/main/resources`. Tests mirror the production package tree under `src/test/java`. Keep new classes in the existing base package so Spring component scanning can discover them. Maven Wrapper scripts (`./mvnw` and `mvnw.cmd`) are checked in for consistent builds.

## Build, Test, and Development Commands

- `./mvnw test` compiles the project and runs the test suite.
- `./mvnw package` builds the runnable application artifact and runs tests.
- `./mvnw spring-boot:run` starts the application locally.
- `./mvnw clean` removes generated files under `target/`.

Use the wrapper rather than relying on a locally installed Maven version. The application uses Spring Data JPA, Spring Security, Spring MVC, and SQLite at runtime; verify related configuration when changing persistence or HTTP behavior.

## Coding Style & Naming Conventions

Use standard Java conventions: four spaces for indentation, one public top-level type per file, `UpperCamelCase` for classes and records, and `lowerCamelCase` for methods and fields. Use descriptive names and keep classes in package paths matching their declarations. Follow existing Spring patterns for controllers, services, repositories, and configuration. No formatter or lint plugin is configured in `pom.xml`; keep diffs clean and consistent with neighboring code.

## Testing Guidelines

Tests use JUnit through Spring Boot's test dependencies. Name test classes `*Test` and place them in the matching package under `src/test/java`. Run `./mvnw test` before submitting changes. Add focused tests for changed behavior; use Spring context or web/security test support when the behavior depends on application wiring.

## Commit & Pull Request Guidelines

Git history is not available in this checkout, so no repository-specific commit convention could be confirmed. Write concise imperative commit subjects, for example `Add customer lookup endpoint`. Pull requests should describe the behavior changed, note relevant configuration or data effects, link related issues when applicable, and include test results. Add screenshots only when a change affects a user-facing interface.

## Security & Configuration Tips

Keep credentials and machine-specific settings out of source control. Put safe defaults in `src/main/resources/application.properties` and provide secrets through environment variables or local-only configuration. Review authentication and authorization behavior whenever changing controllers or security configuration.
