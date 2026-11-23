package com.pianolesson.backend.user;

import com.pianolesson.backend.email.EmailException;
import com.pianolesson.backend.email.EmailService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Duration;
import java.time.Instant;
import java.util.HexFormat;
import java.util.Locale;

@Service
public class PasswordResetService {

    private static final Logger log = LoggerFactory.getLogger(PasswordResetService.class);

    // 32 random bytes → 256 bits of entropy, hex-encoded to 64 characters.
    private static final int TOKEN_BYTES = 32;
    private static final Duration TOKEN_EXPIRY = Duration.ofMinutes(30);

    private final UserRepository userRepository;
    private final PasswordResetTokenRepository tokenRepository;
    private final PasswordEncoder passwordEncoder;
    private final EmailService emailService;

    public PasswordResetService(
            UserRepository userRepository,
            PasswordResetTokenRepository tokenRepository,
            PasswordEncoder passwordEncoder,
            EmailService emailService
    ) {
        this.userRepository = userRepository;
        this.tokenRepository = tokenRepository;
        this.passwordEncoder = passwordEncoder;
        this.emailService = emailService;
    }

    // Generates a reset token for the account registered to this email and
    // delivers it by email.  Returns silently when the email is not registered —
    // the caller receives an identical response either way, preventing account
    // enumeration attacks.
    @Transactional
    public void requestPasswordReset(String email) {
        String normalizedEmail = email.trim().toLowerCase(Locale.ROOT);

        userRepository.findByEmail(normalizedEmail).ifPresent(user -> {
            // Remove any previous unused tokens so only the new token is valid.
            tokenRepository.deleteUnusedByUser(user);

            // Generate the raw token using a CSPRNG.  The raw token is used only
            // inside this lambda — it is emailed and then goes out of scope.
            // It is never stored, assigned to a field, or written to any log.
            byte[] rawBytes = new byte[TOKEN_BYTES];
            new SecureRandom().nextBytes(rawBytes);
            String rawToken = HexFormat.of().formatHex(rawBytes);

            tokenRepository.save(new PasswordResetToken(
                    user,
                    sha256Hex(rawToken),
                    Instant.now().plus(TOKEN_EXPIRY)
            ));

            try {
                emailService.send(
                        user.getEmail(),
                        "Reset your Piano Lesson Companion password",
                        buildResetEmailBody(rawToken)
                );
                log.info("[PasswordReset] Reset token issued for userId={}", user.getId());
            } catch (EmailException e) {
                // Swallow delivery failures so the caller gets the same response
                // regardless of whether the email address is registered.
                // The token is still saved — the user can request again.
                log.warn("[PasswordReset] Email delivery failed for userId={}; token saved but not delivered",
                        user.getId());
            }
        });
    }

    // Validates the raw token, marks it used, and updates the user's password
    // atomically.  The pessimistic write lock on the token row ensures that
    // two concurrent requests carrying the same token cannot both succeed: the
    // second sees usedAt != null once the first transaction commits.
    @Transactional
    public void resetPassword(String rawToken, String newPassword) {
        String tokenHash = sha256Hex(rawToken.trim());

        PasswordResetToken token = tokenRepository.findByTokenHashForUpdate(tokenHash)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.BAD_REQUEST, "Invalid or expired password reset token."));

        // All failure cases use the same message to avoid leaking token state.
        if (token.getUsedAt() != null || Instant.now().isAfter(token.getExpiresAt())) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST, "Invalid or expired password reset token.");
        }

        token.markUsed();
        tokenRepository.save(token);

        User user = token.getUser();
        user.setPasswordHash(passwordEncoder.encode(newPassword));
        userRepository.save(user);

        log.info("[PasswordReset] Password reset completed for userId={}", user.getId());
    }

    // Package-private so PasswordResetServiceTest can compute expected hashes
    // without duplicating the algorithm.
    String sha256Hex(String input) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hash = digest.digest(input.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(hash);
        } catch (NoSuchAlgorithmException e) {
            // SHA-256 is mandated by the Java SE specification — this cannot happen.
            throw new IllegalStateException("SHA-256 not available", e);
        }
    }

    private String buildResetEmailBody(String rawToken) {
        return "<p>You requested a password reset for your Piano Lesson Companion account.</p>"
                + "<p>Your reset code is:</p>"
                + "<p style=\"font-family: monospace; font-size: 18px; letter-spacing: 2px;"
                + " background: #f4f4f4; padding: 12px; border-radius: 6px;\">"
                + rawToken + "</p>"
                + "<p>Copy this code into the app. It expires in 30&nbsp;minutes.</p>"
                + "<p>If you did not request a password reset, you can ignore this email.</p>";
    }
}
