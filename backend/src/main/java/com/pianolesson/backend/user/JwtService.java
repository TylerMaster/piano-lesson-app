package com.pianolesson.backend.user;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.io.Decoders;
import io.jsonwebtoken.security.Keys;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import javax.crypto.SecretKey;
import java.util.Date;

@Service
public class JwtService {

    private final SecretKey signingKey;
    private final long expirationMs;

    // @Value on constructor parameters is how Spring injects configuration
    // values into constructor-injected beans.  The secret is decoded once
    // at startup and held as a SecretKey — the raw Base64 string is never
    // stored as a field, so it cannot be accidentally logged or serialised.
    public JwtService(
            @Value("${jwt.secret}") String base64Secret,
            @Value("${jwt.expiration-ms}") long expirationMs
    ) {
        this.signingKey = Keys.hmacShaKeyFor(Decoders.BASE64.decode(base64Secret));
        this.expirationMs = expirationMs;
    }

    // Builds and signs a JWT whose subject is the user's database ID.
    // Using the numeric ID rather than the email keeps tokens stable even if
    // the user later changes their email address.
    public String generateToken(Long userId) {
        long now = System.currentTimeMillis();
        return Jwts.builder()
                .subject(String.valueOf(userId))
                .issuedAt(new Date(now))
                .expiration(new Date(now + expirationMs))
                .signWith(signingKey)   // JJWT infers HS256 from the SecretKey type
                .compact();
    }

    // Verifies the signature and parses the claims in one step.
    // Throws a JwtException subclass (ExpiredJwtException, MalformedJwtException,
    // SignatureException, etc.) if the token is invalid.  The caller — a future
    // security filter — is responsible for catching and handling those cases.
    public Claims parseToken(String token) {
        return Jwts.parser()
                .verifyWith(signingKey)
                .build()
                .parseSignedClaims(token)
                .getPayload();
    }

    // Convenience method: extracts the subject claim and converts it back to Long.
    public Long extractUserId(String token) {
        return Long.valueOf(parseToken(token).getSubject());
    }
}
