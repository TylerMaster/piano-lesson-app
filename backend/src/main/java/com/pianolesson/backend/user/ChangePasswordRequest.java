package com.pianolesson.backend.user;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record ChangePasswordRequest(

    @NotBlank
    String currentPassword,

    // Mirrors the minimum length rule from RegisterRequest.
    @NotBlank
    @Size(min = 8)
    String newPassword
) {}
