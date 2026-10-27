package org.servidor.personal.clienteservidor;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.servidor.personal.clienteservidor.config.FlywayMigrationListener;

@SpringBootApplication
public class ClienteServidorApplication {

    public static void main(String[] args) {
        SpringApplication application = new SpringApplication(ClienteServidorApplication.class);
        application.addListeners(new FlywayMigrationListener());
        application.run(args);
    }

}
