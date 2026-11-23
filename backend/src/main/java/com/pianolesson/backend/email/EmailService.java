package com.pianolesson.backend.email;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.HttpStatusCodeException;
import org.springframework.web.client.RestTemplate;

import java.time.Duration;
import java.util.List;

@Component
public class EmailService {

    private static final Logger log = LoggerFactory.getLogger(EmailService.class);

    private final RestTemplate restTemplate;
    private final String apiUrl;
    private final String apiKey;
    private final String fromAddress;

    @Autowired
    public EmailService(
            @Value("${resend.api-url}") String apiUrl,
            @Value("${resend.api-key}") String apiKey,
            @Value("${resend.from-address}") String fromAddress
    ) {
        this.apiUrl = apiUrl;
        this.apiKey = apiKey;
        this.fromAddress = fromAddress;

        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(Duration.ofSeconds(10));
        factory.setReadTimeout(Duration.ofSeconds(30));
        this.restTemplate = new RestTemplate(factory);
    }

    // Package-private: allows EmailServiceTest to supply a RestTemplate backed by
    // MockRestServiceServer.  Production code always uses the @Value constructor.
    EmailService(String apiUrl, String apiKey, String fromAddress, RestTemplate restTemplate) {
        this.apiUrl = apiUrl;
        this.apiKey = apiKey;
        this.fromAddress = fromAddress;
        this.restTemplate = restTemplate;
    }

    // Sends a transactional email via the Resend API.
    //
    // Throws EmailException if the API returns a non-2xx response or if the
    // HTTP call fails entirely (network error, timeout).
    public void send(String to, String subject, String htmlBody) {
        log.info("[Email] Sending email to={} subject=\"{}\"", to, subject);

        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        headers.set("Authorization", "Bearer " + apiKey);

        ResendRequest request = buildRequest(to, subject, htmlBody);
        HttpEntity<ResendRequest> entity = new HttpEntity<>(request, headers);

        try {
            restTemplate.postForObject(apiUrl, entity, ResendResponse.class);
        } catch (HttpStatusCodeException e) {
            // Response body intentionally excluded — may contain API key fragments
            // or other details that should not appear in logs or exception messages.
            throw new EmailException(
                    "Resend API returned HTTP " + e.getStatusCode()
                            + " — check the API key and request format", e);
        } catch (Exception e) {
            throw new EmailException("Failed to contact Resend API", e);
        }

        log.info("[Email] Sent successfully to={}", to);
    }

    // Package-private so EmailServiceTest can verify the request shape without
    // making a real HTTP call.
    ResendRequest buildRequest(String to, String subject, String htmlBody) {
        return new ResendRequest(fromAddress, List.of(to), subject, htmlBody);
    }

    // ── Inner request / response POJOs ────────────────────────────────────────

    record ResendRequest(
            String from,
            List<String> to,
            String subject,
            @JsonProperty("html") String htmlBody
    ) {}

    @JsonIgnoreProperties(ignoreUnknown = true)
    private record ResendResponse(String id) {}
}
