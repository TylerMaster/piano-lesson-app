package com.pianolesson.backend;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableAsync;

// @SpringBootApplication is a convenience annotation that combines three things:
//   @Configuration      — this class can define beans
//   @EnableAutoConfiguration — Spring Boot reads your classpath and properties
//                             and automatically configures what it finds
//                             (e.g., sees postgresql driver → configures DataSource)
//   @ComponentScan      — scan this package and sub-packages for @Component,
//                         @Service, @Repository, @Controller etc.
//
// @EnableAsync tells Spring to look for methods annotated with @Async and run
// them in a background thread rather than the caller's thread.  Without this
// annotation, @Async has no effect.  We use it for transcription so that an
// audio upload returns immediately while Whisper runs in the background.
@SpringBootApplication
@EnableAsync
public class BackendApplication {

    public static void main(String[] args) {
        SpringApplication.run(BackendApplication.class, args);
    }
}
