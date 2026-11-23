package com.pianolesson.backend.email;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestTemplate;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsString;
import static org.springframework.test.web.client.ExpectedCount.once;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.jsonPath;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

class EmailServiceTest {

    // Construct EmailService with placeholder values so the RestTemplate is
    // built, but no real HTTP call is ever made in these tests.
    private final EmailService emailService = new EmailService(
            "https://api.resend.com/emails",
            "test-key-not-real",
            "Piano Lesson Companion <onboarding@resend.dev>"
    );

    @Test
    void buildRequest_setsFromAddressFromConfig() {
        EmailService.ResendRequest req = emailService.buildRequest(
                "student@example.com", "Subject", "<p>Body</p>");

        assertThat(req.from()).isEqualTo("Piano Lesson Companion <onboarding@resend.dev>");
    }

    @Test
    void buildRequest_wrapsRecipientInList() {
        EmailService.ResendRequest req = emailService.buildRequest(
                "student@example.com", "Subject", "<p>Body</p>");

        assertThat(req.to()).isEqualTo(List.of("student@example.com"));
    }

    // ── send(): HTTP contract ─────────────────────────────────────────────────

    // MockRestServiceServer intercepts the RestTemplate's HTTP call and verifies
    // what was sent before returning a canned response.  No real network request
    // is made.  server.verify() at the end confirms the expected call happened
    // exactly once.
    @Test
    void send_postsCorrectUrlAuthHeaderContentTypeAndJsonBody() {
        RestTemplate restTemplate = new RestTemplate();
        MockRestServiceServer server = MockRestServiceServer.createServer(restTemplate);

        EmailService service = new EmailService(
                "https://api.resend.com/emails",
                "re_test_key_abc",
                "Piano Lesson Companion <onboarding@resend.dev>",
                restTemplate
        );

        server.expect(once(), requestTo("https://api.resend.com/emails"))
                .andExpect(method(HttpMethod.POST))
                .andExpect(header("Authorization", "Bearer re_test_key_abc"))
                .andExpect(header("Content-Type", containsString("application/json")))
                .andExpect(jsonPath("$.from").value("Piano Lesson Companion <onboarding@resend.dev>"))
                .andExpect(jsonPath("$.to[0]").value("student@example.com"))
                .andExpect(jsonPath("$.subject").value("Welcome to Piano Lesson Companion"))
                .andExpect(jsonPath("$.html").value("<p>Your account is ready.</p>"))
                .andRespond(withSuccess("{\"id\":\"abc123\"}", MediaType.APPLICATION_JSON));

        service.send("student@example.com", "Welcome to Piano Lesson Companion",
                "<p>Your account is ready.</p>");

        server.verify();
    }

    @Test
    void buildRequest_passesSubjectAndHtmlBodyThrough() {
        EmailService.ResendRequest req = emailService.buildRequest(
                "student@example.com",
                "Reset your password",
                "<p>Click <a href=\"https://example.com\">here</a>.</p>");

        assertThat(req.subject()).isEqualTo("Reset your password");
        assertThat(req.htmlBody()).isEqualTo(
                "<p>Click <a href=\"https://example.com\">here</a>.</p>");
    }
}
