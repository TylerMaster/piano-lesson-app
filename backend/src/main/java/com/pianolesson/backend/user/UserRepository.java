package com.pianolesson.backend.user;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

// JpaRepository<User, Long> provides the standard persistence operations for
// free — save, findById, findAll, deleteById, existsById, and more — with no
// implementation required.  Spring Data JPA generates a proxy at startup.
//
// The first type parameter is the entity class; the second is the type of its
// primary key.
public interface UserRepository extends JpaRepository<User, Long> {

    // Spring Data JPA derives the SQL from the method name:
    // SELECT * FROM users WHERE email = ? LIMIT 1
    // Returns Optional.empty() when no row matches, avoiding null checks in
    // the caller.  Used during login to load the user by their email address.
    Optional<User> findByEmail(String email);

    // SELECT COUNT(*) > 0 FROM users WHERE email = ?
    // More efficient than findByEmail when you only need to know whether the
    // address is taken, e.g. during registration validation.
    boolean existsByEmail(String email);
}
