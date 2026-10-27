package org.servidor.personal.clienteservidor.config;

import org.flywaydb.core.Flyway;
import org.springframework.boot.context.event.ApplicationEnvironmentPreparedEvent;
import org.springframework.context.ApplicationListener;
import org.springframework.core.env.Environment;

/** Runs Flyway before the Spring context creates Hibernate's EntityManagerFactory. */
public final class FlywayMigrationListener implements ApplicationListener<ApplicationEnvironmentPreparedEvent> {

    @Override
    public void onApplicationEvent(ApplicationEnvironmentPreparedEvent event) {
        Environment environment = event.getEnvironment();
        if (!environment.getProperty("spring.flyway.enabled", Boolean.class, true)) {
            return;
        }

        String url = environment.getRequiredProperty("spring.datasource.url");
        String username = environment.getRequiredProperty("spring.datasource.username");
        String password = environment.getProperty("spring.datasource.password", "");
        String[] locations = environment.getProperty(
                "spring.flyway.locations", "classpath:db/migration").split(",");

        Flyway.configure()
                .dataSource(url, username, password)
                .locations(locations)
                .load()
                .migrate();
    }
}
