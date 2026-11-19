package com.pianolesson.backend.user;

import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/auth")
public class AuthController {

    private final UserService userService;

    public AuthController(UserService userService) {
        this.userService = userService;
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
}
