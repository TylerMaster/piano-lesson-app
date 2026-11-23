package com.pianolesson.backend.user;

import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.util.Locale;

@Service
public class UserService {

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtService jwtService;

    public UserService(UserRepository userRepository, PasswordEncoder passwordEncoder, JwtService jwtService) {
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
        this.jwtService = jwtService;
    }

    public RegisterResponse register(RegisterRequest request) {
        // Normalize before the uniqueness check so that "User@Example.COM"
        // and "user@example.com" are treated as the same address.
        // Locale.ROOT avoids locale-specific case folding (e.g. Turkish dotless i).
        String email = request.email().trim().toLowerCase(Locale.ROOT);

        if (userRepository.existsByEmail(email)) {
            throw new IllegalStateException("Email address is already registered: " + email);
        }

        String passwordHash = passwordEncoder.encode(request.password());

        User user = new User(email, passwordHash);
        User saved = userRepository.save(user);

        // Return only the safe subset of user data — the entity itself stays
        // inside the service layer and is never passed to the caller.
        return new RegisterResponse(saved.getId(), saved.getEmail(), saved.getCreatedAt());
    }

    public LoginResponse login(LoginRequest request) {
        String email = request.email().trim().toLowerCase(Locale.ROOT);

        // A single generic message for both the "not found" and "wrong password"
        // cases prevents an attacker from using the error response to enumerate
        // which email addresses are registered.
        User user = userRepository.findByEmail(email)
                .orElseThrow(() -> new IllegalArgumentException("Invalid email or password."));

        if (!passwordEncoder.matches(request.password(), user.getPasswordHash())) {
            throw new IllegalArgumentException("Invalid email or password.");
        }

        String token = jwtService.generateToken(user.getId());
        return new LoginResponse(user.getId(), user.getEmail(), token, "Bearer");
    }

    public void changePassword(Long userId, ChangePasswordRequest request) {
        // userId comes from the verified JWT, never from the request body.
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "User not found."));

        if (!passwordEncoder.matches(request.currentPassword(), user.getPasswordHash())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Current password is incorrect.");
        }

        // Prevent a no-op change that might mislead the user into thinking their
        // password was updated when nothing actually changed.
        if (passwordEncoder.matches(request.newPassword(), user.getPasswordHash())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "New password must be different from the current password.");
        }

        user.setPasswordHash(passwordEncoder.encode(request.newPassword()));
        userRepository.save(user);
    }
}
