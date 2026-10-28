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
import java.util.Collections;

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
                        .requestMatchers("/api/auth/login").permitAll()
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
                    UsernamePasswordAuthenticationToken authentication = new UsernamePasswordAuthenticationToken(usuario.getNombreUsuario(), null, Collections.emptyList());
                    authentication.setDetails(usuario);
                    SecurityContextHolder.getContext().setAuthentication(authentication);
                } else {
                    response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
                    return;
                }
            } else if (!request.getRequestURI().startsWith("/api/auth/login")) {
                response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
                return;
            }
            filterChain.doFilter(request, response);
        }
    }
}
