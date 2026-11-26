package org.servidor.personal.clienteservidor.identidad.infraestructura;

import org.servidor.personal.clienteservidor.identidad.aplicacion.TokenService;
import org.servidor.personal.clienteservidor.identidad.dominio.Usuario;
import lombok.RequiredArgsConstructor;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.web.filter.OncePerRequestFilter;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.List;

@Configuration
@EnableWebSecurity
@RequiredArgsConstructor
public class SecurityConfig {

    private final TokenService tokenService;

    @Bean
    public PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }

    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
        http.csrf(csrf -> csrf.disable())
                .cors(cors -> {})
                .sessionManagement(sm -> sm.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .authorizeHttpRequests(auth -> auth
                        .requestMatchers("/", "/vue", "/vue/**", "/auth/**", "/usuarios", "/cliente", "/profile",
                                "/fexcoin-vivo", "/fexcoin-vivo/**", "/evaluar", "/evaluar/**").permitAll()
                        .requestMatchers("/api/auth/login").permitAll()
                        .requestMatchers("/api/auth/solicitudes").permitAll()
                        .requestMatchers("/api/auth/admin/**").hasAuthority("ADMIN")
                        .requestMatchers("/api/auth/registro").denyAll()
                        .anyRequest().authenticated())
                .addFilterBefore(new TokenFilter(tokenService), UsernamePasswordAuthenticationFilter.class);
        return http.build();
    }

    static class TokenFilter extends OncePerRequestFilter {
        private final TokenService tokenService;
        TokenFilter(TokenService tokenService) {
            this.tokenService = tokenService;
        }
        @Override
        protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain filterChain) throws ServletException, IOException {
            String auth = request.getHeader("Authorization");
            if (auth != null && auth.startsWith("Bearer ")) {
                String token = auth.substring(7);
                var usuarioOpt = tokenService.validarToken(token);
                if (usuarioOpt.isPresent()) {
                    Usuario usuario = usuarioOpt.get();
                    UsernamePasswordAuthenticationToken authentication = new UsernamePasswordAuthenticationToken(usuario.getNombreUsuario(), null, List.of(() -> usuario.getRol()));
                    authentication.setDetails(usuario);
                    SecurityContextHolder.getContext().setAuthentication(authentication);
                } else {
                    response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
                    return;
                }
            } else if (!esRutaPublica(request.getRequestURI())
                    && !request.getRequestURI().startsWith("/api/auth/login")
                    && !request.getRequestURI().startsWith("/api/auth/solicitudes")) {
                response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
                return;
            }
            filterChain.doFilter(request, response);
        }

        private boolean esRutaPublica(String ruta) {
            return ruta.equals("/") || ruta.equals("/vue") || ruta.startsWith("/vue/")
                    || ruta.startsWith("/auth/") || ruta.equals("/usuarios") || ruta.equals("/cliente")
                    || ruta.equals("/profile") || ruta.equals("/fexcoin-vivo") || ruta.startsWith("/fexcoin-vivo/")
                    || ruta.equals("/evaluar") || ruta.startsWith("/evaluar/");
        }
    }
}
