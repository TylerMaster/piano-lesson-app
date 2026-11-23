package com.pianolesson.backend.user;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record ResetPasswordRequest(

    @NotBlank
    String token,

    // Mirrors the minimum length rule from RegisterRequest and ChangePasswordRequest.
    @NotBlank
    @Size(min = 8)
    String newPassword
) {}
