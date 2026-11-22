package com.pianolesson.backend.user;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;

import java.time.Instant;

// @Entity tells Hibernate this class maps to a database table.
// @Table(name = "users") names the table explicitly — "user" is a reserved
// word in PostgreSQL, so using the plural form avoids quoting issues.
@Entity
@Table(name = "users")
public class User {

    // @Id marks the primary key.
    // @GeneratedValue(IDENTITY) delegates id assignment to the database
    // (BIGSERIAL in PostgreSQL).  The application never sets this value.
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    // unique = true adds a UNIQUE constraint at the database level, so two
    // accounts cannot share the same address even under concurrent inserts.
    // length = 255 matches the VARCHAR(255) column type.
    @Column(nullable = false, unique = true, length = 255)
    private String email;

    // The column stores a bcrypt/argon2 hash, never a plaintext password.
    // name = "password_hash" maps the camelCase field to a snake_case column,
    // consistent with the rest of the schema.
    // passwordHash has no public getter by design: JPA needs field access for
    // persistence but nothing outside this package should read the hash
    // directly — authentication logic will live in a dedicated service.
    @Column(name = "password_hash", nullable = false, length = 255)
    private String passwordHash;

    // Instant is a UTC timestamp with nanosecond precision.  It maps to
    // TIMESTAMP WITH TIME ZONE in PostgreSQL, the same type used by Lesson.
    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    // @Enumerated(STRING) stores the enum name as a VARCHAR ("STUDENT", "ADMIN")
    // rather than its ordinal number (0, 1).  String storage is safer: adding
    // new roles or reordering them won't corrupt existing rows — the same
    // reasoning as TranscriptStatus and SummaryStatus on the Lesson entity.
    // Defaults to STUDENT so that every account created through public
    // registration gets the least-privileged role automatically.
    @Enumerated(EnumType.STRING)
    @Column(name = "role", nullable = false)
    private UserRole role = UserRole.STUDENT;

    // JPA requires a no-argument constructor to reconstruct entities from
    // database rows.  Protected prevents direct use in application code.
    protected User() {}

    public User(String email, String passwordHash) {
        this.email = email;
        this.passwordHash = passwordHash;
    }

    // @PrePersist runs automatically just before Hibernate executes the first
    // INSERT for this entity.  This is the right place to set createdAt: it
    // keeps the responsibility inside the entity, requires no caller action,
    // and cannot be overwritten by a later save() call.
    @PrePersist
    private void onCreate() {
        this.createdAt = Instant.now();
    }

    // ── Getters ──────────────────────────────────────────────────────────────

    public Long getId() { return id; }

    public String getEmail() { return email; }

    // passwordHash is intentionally omitted from API response DTOs.
    // The getter is package-private so only classes in this package
    // (e.g. a future UserService) can access the hash value.
    String getPasswordHash() { return passwordHash; }

    public Instant getCreatedAt() { return createdAt; }

    public UserRole getRole() { return role; }
}
