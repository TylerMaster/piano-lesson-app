package com.pianolesson.backend.user;

import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Optional;

public interface PasswordResetTokenRepository extends JpaRepository<PasswordResetToken, Long> {

    // Acquires a row-level write lock (SELECT … FOR UPDATE) before returning
    // the token.  This prevents two concurrent requests that carry the same
    // raw token from both passing the "not yet used" check: the second request
    // blocks until the first transaction commits, by which point usedAt is set.
    // Must be called inside an active @Transactional.
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT t FROM PasswordResetToken t WHERE t.tokenHash = :tokenHash")
    Optional<PasswordResetToken> findByTokenHashForUpdate(@Param("tokenHash") String tokenHash);

    // Deletes all unused tokens for the given user so only the most recently
    // issued token is ever valid.  Called before issuing a new token.
    @Modifying
    @Query("DELETE FROM PasswordResetToken t WHERE t.user = :user AND t.usedAt IS NULL")
    void deleteUnusedByUser(@Param("user") User user);
}
