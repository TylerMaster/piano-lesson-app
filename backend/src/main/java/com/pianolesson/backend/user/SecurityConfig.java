package com.pianolesson.backend.user;

import jakarta.servlet.http.HttpServletResponse;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;

// @EnableWebSecurity activates Spring Security's web security support and
// disables the auto-configured defaults (the generated password printed to the
// console, the default login page, etc.) so this configuration is authoritative.
@Configuration
@EnableWebSecurity
public class SecurityConfig {

    // The filter is constructed here rather than via @Component so that Spring
    // Boot does not auto-register it as an independent servlet filter.  Spring
    // Security registers it in the chain via addFilterBefore; a second
    // registration from @Component would cause it to run twice per request.


    @Bean
    public SecurityFilterChain securityFilterChain(
            HttpSecurity http,
	    JwtService jwtService
    ) throws Exception {

	JwtAuthenticationFilter jwtAuthFilter =
        new JwtAuthenticationFilter(jwtService);


        http
            // CSRF protection is unnecessary for a stateless API: it defends
            // against attacks that rely on the browser automatically sending
            // session cookies, which this API does not use.
            .csrf(csrf -> csrf.disable())

            // Never create or use an HTTP session.  Each request must carry its
            // own JWT; the server holds no session state between requests.
            .sessionManagement(session -> session
                .sessionCreationPolicy(SessionCreationPolicy.STATELESS))

            // Form login and HTTP Basic are both browser-oriented mechanisms
            // that are irrelevant for a mobile API.  Disabling them removes
            // the redirect responses they would otherwise produce.
            .formLogin(form -> form.disable())
            .httpBasic(basic -> basic.disable())

            .authorizeHttpRequests(auth -> auth
                // Registration and login must be reachable without a token.
                .requestMatchers(HttpMethod.POST, "/auth/register", "/auth/login").permitAll()
                // Spring Boot forwards to /error on response.sendError() — e.g. when
                // ResponseStatusException is thrown.  Without this, the error dispatch
                // runs without a SecurityContext (JwtAuthenticationFilter skips error
                // dispatches) and anyRequest().authenticated() returns 401 instead of
                // the intended status code.
                .requestMatchers("/error").permitAll()
                // Everything else requires a valid JWT.
                .anyRequest().authenticated()
            )

            // Replace Spring Security's default redirect-to-login behaviour with
            // a plain 401 response.  A mobile client has no use for a redirect
            // to a login page; it needs a status code it can act on.
            .exceptionHandling(ex -> ex
                .authenticationEntryPoint((request, response, authException) ->
                    response.sendError(HttpServletResponse.SC_UNAUTHORIZED))
            )

            // The JWT filter must run before Spring Security's own username/
            // password filter so that the SecurityContext is populated before
            // any access decisions are made.
            .addFilterBefore(jwtAuthFilter, UsernamePasswordAuthenticationFilter.class);

        return http.build();
    }
}
