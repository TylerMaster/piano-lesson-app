package com.pianolesson.backend.user;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

// A Java record is an immutable data carrier.  The compiler generates the
// constructor, getters (email(), password()), equals, hashCode, and toString
// automatically — no boilerplate needed for a simple request object like this.
//
// Bean Validation annotations on record components are checked by the
// validator when @Valid is placed on the controller method parameter.
// Nothing is validated here at construction time; validation is triggered
// by the framework at the HTTP boundary.
public record RegisterRequest(

    // @NotBlank rejects null, empty strings, and whitespace-only strings.
    // @Email checks that the value matches a basic email pattern.
    // Both constraints produce a 400 Bad Request before the service is called.
    @NotBlank
    @Email
    String email,

    // @Size(min = 8) enforces a minimum length of 8 characters.
    // No complexity rules are imposed yet — that decision is deferred until
    // real-user feedback identifies a need.
    @NotBlank
    @Size(min = 8)
    String password
) {}
