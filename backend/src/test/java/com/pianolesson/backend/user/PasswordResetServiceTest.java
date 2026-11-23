package com.pianolesson.backend.user;

import com.pianolesson.backend.email.EmailException;
import com.pianolesson.backend.email.EmailService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.server.ResponseStatusException;

import java.time.Duration;
import java.time.Instant;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class PasswordResetServiceTest {

    @Mock private UserRepository userRepository;
    @Mock private PasswordResetTokenRepository tokenRepository;
    @Mock private PasswordEncoder passwordEncoder;
    @Mock private EmailService emailService;

    private PasswordResetService service;

    private static final User TEST_USER = new User("user@example.com", "storedHash");

    @BeforeEach
    void setUp() {
        service = new PasswordResetService(
                userRepository, tokenRepository, passwordEncoder, emailService);
    }

    // ── requestPasswordReset: known email ────────────────────────────────────

    @Test
    void requestPasswordReset_knownEmail_deletesOldTokensSavesNewAndSendsEmail() {
        when(userRepository.findByEmail("user@example.com"))
                .thenReturn(Optional.of(TEST_USER));

        service.requestPasswordReset("user@example.com");

        // Old unused tokens for this user must be cleared first.
        verify(tokenRepository).deleteUnusedByUser(TEST_USER);

        // A new token must be persisted with a 64-char SHA-256 hash and an
        // expiry approximately 30 minutes from now.
        ArgumentCaptor<PasswordResetToken> tokenCaptor =
                ArgumentCaptor.forClass(PasswordResetToken.class);
        verify(tokenRepository).save(tokenCaptor.capture());
        PasswordResetToken saved = tokenCaptor.getValue();
        assertThat(saved.getTokenHash()).hasSize(64);
        assertThat(saved.getExpiresAt()).isAfter(Instant.now());
        assertThat(saved.getExpiresAt()).isBefore(Instant.now().plus(Duration.ofMinutes(31)));

        // The email must be addressed to the user.  Subject and body are not
        // asserted here — their content is cosmetic and subject to change.
        verify(emailService).send(eq("user@example.com"), anyString(), anyString());
    }

    // ── requestPasswordReset: unknown email ──────────────────────────────────

    @Test
    void requestPasswordReset_unknownEmail_returnsWithoutSendingEmail() {
        when(userRepository.findByEmail(anyString())).thenReturn(Optional.empty());

        // Must not throw — the caller receives the same response as the found case.
        service.requestPasswordReset("nobody@example.com");

        verify(emailService, never()).send(anyString(), anyString(), anyString());
        verify(tokenRepository, never()).save(any());
    }

    // ── requestPasswordReset: invalidates previous tokens ───────────────────

    @Test
    void requestPasswordReset_always_deletesExistingUnusedTokensBeforeIssuingNew() {
        when(userRepository.findByEmail("user@example.com"))
                .thenReturn(Optional.of(TEST_USER));

        service.requestPasswordReset("user@example.com");

        // deleteUnusedByUser must be called before save so the old tokens are
        // gone before the new one is written.
        var inOrder = org.mockito.Mockito.inOrder(tokenRepository);
        inOrder.verify(tokenRepository).deleteUnusedByUser(TEST_USER);
        inOrder.verify(tokenRepository).save(any());
    }

    // ── requestPasswordReset: email delivery failure ─────────────────────────

    @Test
    void requestPasswordReset_emailDeliveryFails_doesNotPropagateException() {
        when(userRepository.findByEmail("user@example.com"))
                .thenReturn(Optional.of(TEST_USER));
        doThrow(new EmailException("Delivery failed"))
                .when(emailService).send(anyString(), anyString(), anyString());

        // Must not throw — the caller receives the same 200 response regardless of delivery outcome.
        assertThatCode(() -> service.requestPasswordReset("user@example.com"))
                .doesNotThrowAnyException();

        // The token must still have been saved even though the email was not delivered.
        verify(tokenRepository).save(any(PasswordResetToken.class));
    }

    // ── resetPassword: invalid token ─────────────────────────────────────────

    @Test
    void resetPassword_tokenNotFound_throws400() {
        when(tokenRepository.findByTokenHashForUpdate(anyString()))
                .thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.resetPassword("no-such-token", "newPass1"))
                .isInstanceOf(ResponseStatusException.class)
                .satisfies(ex -> {
                    ResponseStatusException rse = (ResponseStatusException) ex;
                    assertThat(rse.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
                    assertThat(rse.getReason())
                            .isEqualTo("Invalid or expired password reset token.");
                });

        verify(userRepository, never()).save(any());
    }

    // ── resetPassword: expired token ─────────────────────────────────────────

    @Test
    void resetPassword_expiredToken_throws400() {
        String rawToken = "test-raw-token";
        String hash = service.sha256Hex(rawToken);
        PasswordResetToken expired = new PasswordResetToken(
                TEST_USER, hash, Instant.now().minus(Duration.ofMinutes(1)));

        when(tokenRepository.findByTokenHashForUpdate(hash))
                .thenReturn(Optional.of(expired));

        assertThatThrownBy(() -> service.resetPassword(rawToken, "newPass1"))
                .isInstanceOf(ResponseStatusException.class)
                .satisfies(ex -> assertThat(((ResponseStatusException) ex).getStatusCode())
                        .isEqualTo(HttpStatus.BAD_REQUEST));

        verify(userRepository, never()).save(any());
    }

    // ── resetPassword: already-used token ────────────────────────────────────

    @Test
    void resetPassword_alreadyUsedToken_throws400() {
        String rawToken = "test-raw-token";
        String hash = service.sha256Hex(rawToken);
        PasswordResetToken used = new PasswordResetToken(
                TEST_USER, hash, Instant.now().plus(Duration.ofMinutes(29)));
        used.markUsed();

        when(tokenRepository.findByTokenHashForUpdate(hash))
                .thenReturn(Optional.of(used));

        assertThatThrownBy(() -> service.resetPassword(rawToken, "newPass1"))
                .isInstanceOf(ResponseStatusException.class)
                .satisfies(ex -> assertThat(((ResponseStatusException) ex).getStatusCode())
                        .isEqualTo(HttpStatus.BAD_REQUEST));

        verify(userRepository, never()).save(any());
    }

    // ── resetPassword: success ───────────────────────────────────────────────

    @Test
    void resetPassword_validToken_encodesPasswordMarksTokenUsedAndSavesUser() {
        String rawToken = "test-raw-token";
        String hash = service.sha256Hex(rawToken);
        PasswordResetToken token = new PasswordResetToken(
                TEST_USER, hash, Instant.now().plus(Duration.ofMinutes(29)));

        when(tokenRepository.findByTokenHashForUpdate(hash))
                .thenReturn(Optional.of(token));
        when(passwordEncoder.encode("newPass123")).thenReturn("newHashedValue");

        service.resetPassword(rawToken, "newPass123");

        // Token must be marked as used.
        ArgumentCaptor<PasswordResetToken> tokenCaptor =
                ArgumentCaptor.forClass(PasswordResetToken.class);
        verify(tokenRepository).save(tokenCaptor.capture());
        assertThat(tokenCaptor.getValue().getUsedAt()).isNotNull();

        // User's password hash must be updated to the encoded value.
        ArgumentCaptor<User> userCaptor = ArgumentCaptor.forClass(User.class);
        verify(userRepository).save(userCaptor.capture());
        assertThat(userCaptor.getValue().getPasswordHash()).isEqualTo("newHashedValue");
    }

    // ── resetPassword: token reuse ───────────────────────────────────────────

    @Test
    void resetPassword_tokenUsedTwice_secondAttemptThrows400() {
        String rawToken = "test-raw-token";
        String hash = service.sha256Hex(rawToken);
        PasswordResetToken token = new PasswordResetToken(
                TEST_USER, hash, Instant.now().plus(Duration.ofMinutes(29)));

        when(tokenRepository.findByTokenHashForUpdate(hash))
                .thenReturn(Optional.of(token));
        when(passwordEncoder.encode(anyString())).thenReturn("hashed");

        // First use succeeds.
        service.resetPassword(rawToken, "newPass123");

        // The in-memory token now has usedAt set.  Simulate the DB reflecting that.
        // The same token object is returned on the second lookup.
        assertThatThrownBy(() -> service.resetPassword(rawToken, "anotherPass"))
                .isInstanceOf(ResponseStatusException.class)
                .satisfies(ex -> assertThat(((ResponseStatusException) ex).getStatusCode())
                        .isEqualTo(HttpStatus.BAD_REQUEST));
    }
}
