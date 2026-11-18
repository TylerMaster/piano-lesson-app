package com.pianolesson.backend.user;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;

@Configuration
public class UserConfig {

    // The return type is the PasswordEncoder interface, not the concrete
    // BCryptPasswordEncoder class.  Any code that depends on this bean
    // (e.g. UserService) declares PasswordEncoder in its constructor, so
    // the hashing algorithm can be swapped later without touching those classes.
    @Bean
    public PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }
}
