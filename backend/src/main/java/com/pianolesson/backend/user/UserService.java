package com.pianolesson.backend.user;

import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

import java.util.Locale;

@Service
public class UserService {

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;

    // Spring detects the single constructor and injects both dependencies
    // automatically — no @Autowired annotation required in modern Spring.
    public UserService(UserRepository userRepository, PasswordEncoder passwordEncoder) {
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
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
}
