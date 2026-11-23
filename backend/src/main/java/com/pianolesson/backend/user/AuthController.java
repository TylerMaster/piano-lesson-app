package com.pianolesson.backend.user;

import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import java.util.Map;

@RestController
@RequestMapping("/auth")
public class AuthController {

    private final UserService userService;
    private final PasswordResetService passwordResetService;

    public AuthController(UserService userService, PasswordResetService passwordResetService) {
        this.userService = userService;
        this.passwordResetService = passwordResetService;
    }

    // ── POST /auth/register ───────────────────────────────────────────────
    // Accepts: { "email": "...", "password": "..." }
    // Returns 201 Created: { "id": 1, "email": "...", "createdAt": "..." }
    // Returns 400 Bad Request if validation fails (blank email, short password).
    @PostMapping("/register")
    public ResponseEntity<RegisterResponse> register(@Valid @RequestBody RegisterRequest request) {
        RegisterResponse response = userService.register(request);
        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }

    // ── POST /auth/login ──────────────────────────────────────────────────
    // Accepts: { "email": "...", "password": "..." }
    // Returns 200 OK: { "userId": 1, "email": "...", "token": "...", "tokenType": "Bearer" }
    // Returns 400 Bad Request if validation fails (blank fields).
    @PostMapping("/login")
    public ResponseEntity<LoginResponse> login(@Valid @RequestBody LoginRequest request) {
        LoginResponse response = userService.login(request);
        return ResponseEntity.ok(response);
    }

    // ── PUT /auth/change-password ─────────────────────────────────────────────
    // Accepts: { "currentPassword": "...", "newPassword": "..." }
    // Returns 204 No Content on success.
    // Returns 400 if currentPassword is wrong, or newPassword equals currentPassword.
    // Returns 400 if newPassword is blank or shorter than 8 characters (@Valid).
    // The authenticated user is identified from the JWT — never from the request body.
    @PutMapping("/change-password")
    public ResponseEntity<Void> changePassword(
            Authentication authentication,
            @Valid @RequestBody ChangePasswordRequest request
    ) {
        // JwtAuthenticationFilter stores the user's Long id as the principal.
        Long userId = (Long) authentication.getPrincipal();
        userService.changePassword(userId, request);
        return ResponseEntity.noContent().build();
    }

    // ── POST /auth/forgot-password ────────────────────────────────────────────
    // Accepts: { "email": "..." }
    // Always returns 200 OK with a generic message — the same response whether
    // the email is registered or not, to prevent account enumeration.
    @PostMapping("/forgot-password")
    public ResponseEntity<Map<String, String>> forgotPassword(
            @Valid @RequestBody ForgotPasswordRequest request) {
        passwordResetService.requestPasswordReset(request.email());
        return ResponseEntity.ok(Map.of("message",
                "If that email address is registered, you will receive a password reset email shortly."));
    }

    // ── POST /auth/reset-password ─────────────────────────────────────────────
    // Accepts: { "token": "...", "newPassword": "..." }
    // Returns 204 No Content on success.
    // Returns 400 Bad Request if the token is invalid, expired, or already used.
    @PostMapping("/reset-password")
    public ResponseEntity<Void> resetPassword(
            @Valid @RequestBody ResetPasswordRequest request) {
        passwordResetService.resetPassword(request.token(), request.newPassword());
        return ResponseEntity.noContent().build();
    }

    // Returns the ResponseStatusException reason as a JSON body so the mobile
    // client receives a predictable {"message": "..."} structure rather than
    // Spring Boot's /error page format, whose "message" field is controlled by
    // server.error.include-message and is not reliable across restarts/profiles.
    @ExceptionHandler(ResponseStatusException.class)
    public ResponseEntity<Map<String, String>> handleResponseStatusException(
            ResponseStatusException ex
    ) {
        String message = ex.getReason() != null ? ex.getReason() : "An error occurred.";
        return ResponseEntity.status(ex.getStatusCode()).body(Map.of("message", message));
    }
}
