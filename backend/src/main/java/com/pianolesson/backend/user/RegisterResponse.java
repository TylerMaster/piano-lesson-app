package com.pianolesson.backend.user;

import java.time.Instant;

// The only user data the registration endpoint ever returns.
// No password, no password hash — the User entity never leaves the service layer.
public record RegisterResponse(
    Long id,
    String email,
    Instant createdAt
) {}
