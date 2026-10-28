package org.servidor.personal.clienteservidor;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.servidor.personal.clienteservidor.config.FlywayMigrationListener;

@SpringBootApplication
@EnableScheduling
public class ClienteServidorApplication {

    public static void main(String[] args) {
        SpringApplication application = new SpringApplication(ClienteServidorApplication.class);
        application.addListeners(new FlywayMigrationListener());
        application.run(args);
    }

}
