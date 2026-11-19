package com.pianolesson.backend.user;

import io.jsonwebtoken.JwtException;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.Collections;

// @Component makes this filter a Spring-managed bean so the security
// configuration can inject and register it in the filter chain.
@Component
public class JwtAuthenticationFilter extends OncePerRequestFilter {

    private final JwtService jwtService;

    public JwtAuthenticationFilter(JwtService jwtService) {
        this.jwtService = jwtService;
    }

    @Override
    protected void doFilterInternal(
            HttpServletRequest request,
            HttpServletResponse response,
            FilterChain filterChain
    ) throws ServletException, IOException {

        String authHeader = request.getHeader("Authorization");

        // Requests without a Bearer token are passed through untouched.
        // The security configuration decides whether the endpoint requires
        // authentication — this filter only populates the SecurityContext
        // when a valid token is present.
        if (authHeader == null || !authHeader.startsWith("Bearer ")) {
            filterChain.doFilter(request, response);
            return;
        }

        // "Bearer " is 7 characters.
        String token = authHeader.substring(7);

        try {
            // extractUserId validates the signature and expiry via parseToken
            // internally, then converts the subject claim to Long.
            Long userId = jwtService.extractUserId(token);

            // The three-argument constructor marks the token as authenticated.
            // The two-argument constructor would leave authenticated = false,
            // which Spring Security treats as an anonymous request.
            UsernamePasswordAuthenticationToken authentication =
                    new UsernamePasswordAuthenticationToken(userId, null, Collections.emptyList());

            SecurityContextHolder.getContext().setAuthentication(authentication);

        } catch (JwtException e) {
            // An expired, tampered, or malformed token is not a server error.
            // Clear any partially set context and let the request continue —
            // the security configuration will reject it with 401 if the
            // endpoint requires authentication.
            SecurityContextHolder.clearContext();
        }

        filterChain.doFilter(request, response);
    }
}
