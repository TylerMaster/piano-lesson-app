package com.pianolesson.backend.user;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.server.ResponseStatusException;

import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class UserServiceTest {

    @Mock
    private UserRepository userRepository;

    @Mock
    private PasswordEncoder passwordEncoder;

    @Mock
    private JwtService jwtService;

    private UserService service;

    // A user whose stored password hash is the string "storedHash".
    // Using a fixed fake hash keeps tests simple — we stub passwordEncoder
    // rather than running a real BCrypt hash.
    private static final Long USER_ID = 1L;
    private static final String STORED_HASH = "storedHash";

    @BeforeEach
    void setUp() {
        service = new UserService(userRepository, passwordEncoder, jwtService);
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private User userWithHash(String hash) {
        return new User("user@example.com", hash);
    }

    private ChangePasswordRequest request(String current, String newPwd) {
        return new ChangePasswordRequest(current, newPwd);
    }

    // ── changePassword: user not found ────────────────────────────────────────

    @Test
    void changePassword_userNotFound_throws404() {
        when(userRepository.findById(USER_ID)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.changePassword(USER_ID, request("any", "newPass1")))
                .isInstanceOf(ResponseStatusException.class)
                .satisfies(ex -> assertThat(((ResponseStatusException) ex).getStatusCode())
                        .isEqualTo(HttpStatus.NOT_FOUND));
    }

    // ── changePassword: wrong current password ────────────────────────────────

    @Test
    void changePassword_incorrectCurrentPassword_throws400() {
        when(userRepository.findById(USER_ID)).thenReturn(Optional.of(userWithHash(STORED_HASH)));
        // Simulate wrong current password.
        when(passwordEncoder.matches("wrongPassword", STORED_HASH)).thenReturn(false);

        assertThatThrownBy(() -> service.changePassword(USER_ID, request("wrongPassword", "newPass1")))
                .isInstanceOf(ResponseStatusException.class)
                .satisfies(ex -> {
                    ResponseStatusException rse = (ResponseStatusException) ex;
                    assertThat(rse.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
                    assertThat(rse.getReason()).isEqualTo("Current password is incorrect.");
                });

        verify(userRepository, never()).save(any());
    }

    // ── changePassword: new password same as current ───────────────────────────

    @Test
    void changePassword_newPasswordIdenticalToCurrent_throws400() {
        when(userRepository.findById(USER_ID)).thenReturn(Optional.of(userWithHash(STORED_HASH)));
        // Current password check passes, new-equals-current check also passes (same input).
        when(passwordEncoder.matches(anyString(), eq(STORED_HASH))).thenReturn(true);

        assertThatThrownBy(() -> service.changePassword(USER_ID, request("samePassword", "samePassword")))
                .isInstanceOf(ResponseStatusException.class)
                .satisfies(ex -> {
                    ResponseStatusException rse = (ResponseStatusException) ex;
                    assertThat(rse.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
                    assertThat(rse.getReason()).isEqualTo("New password must be different from the current password.");
                });

        verify(userRepository, never()).save(any());
    }

    // ── changePassword: success ───────────────────────────────────────────────

    @Test
    void changePassword_validRequest_encodesAndSavesNewPassword() {
        User user = userWithHash(STORED_HASH);
        when(userRepository.findById(USER_ID)).thenReturn(Optional.of(user));
        // Current password matches; new password does not match the old hash.
        when(passwordEncoder.matches("currentPass", STORED_HASH)).thenReturn(true);
        when(passwordEncoder.matches("newPass123", STORED_HASH)).thenReturn(false);
        when(passwordEncoder.encode("newPass123")).thenReturn("newHashedValue");

        service.changePassword(USER_ID, request("currentPass", "newPass123"));

        ArgumentCaptor<User> captor = ArgumentCaptor.forClass(User.class);
        verify(userRepository).save(captor.capture());
        // The saved user must carry the newly encoded hash.
        assertThat(captor.getValue().getPasswordHash()).isEqualTo("newHashedValue");
    }
}
