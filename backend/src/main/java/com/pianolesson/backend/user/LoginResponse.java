package com.pianolesson.backend.user;

public record LoginResponse(
    Long userId,
    String email,
    String token,
    String tokenType
) {}
