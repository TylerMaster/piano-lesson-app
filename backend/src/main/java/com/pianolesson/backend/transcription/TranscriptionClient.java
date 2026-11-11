package com.pianolesson.backend.transcription;

import com.fasterxml.jackson.annotation.JsonProperty;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.FileSystemResource;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.client.RestTemplate;

import java.nio.file.Path;

@Component
public class TranscriptionClient {

    private final RestTemplate restTemplate;
    private final String serviceUrl;

    public TranscriptionClient(@Value("${transcription.service.url}") String serviceUrl) {
        // RestTemplate is Spring's established synchronous HTTP client.
        // It handles multipart/form-data reliably through FormHttpMessageConverter,
        // which is included in its default converter set.
        this.restTemplate = new RestTemplate();
        this.serviceUrl = serviceUrl;
    }

    // Sends the audio file at audioPath to POST /transcribe on the Python
    // service and returns the parsed response.
    //
    // How FormHttpMessageConverter handles FileSystemResource:
    //   It calls resource.getFilename() to get "piano-voice2.wav", then writes
    //   the part header as:
    //     Content-Disposition: form-data; name="audio"; filename="piano-voice2.wav"
    //   followed by the file bytes.  FastAPI's UploadFile reads this correctly.
    public TranscriptionResponse transcribe(Path audioPath) {
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.MULTIPART_FORM_DATA);

        MultiValueMap<String, Object> body = new LinkedMultiValueMap<>();
        body.add("audio", new FileSystemResource(audioPath));

        HttpEntity<MultiValueMap<String, Object>> request = new HttpEntity<>(body, headers);

        TranscriptionResponse response = restTemplate.postForObject(
                serviceUrl + "/transcribe",
                request,
                TranscriptionResponse.class
        );

        if (response == null) {
            throw new IllegalStateException("Transcription service returned an empty response");
        }
        return response;
    }

    // Java record matching the JSON returned by the Python service:
    // {
    //   "transcript": "...",
    //   "spoken_duration_seconds": 58.5,
    //   "processing_seconds": 5.6,
    //   "model": "tiny"
    // }
    //
    // @JsonProperty maps the snake_case JSON keys to camelCase record fields.
    public record TranscriptionResponse(
            String transcript,
            @JsonProperty("spoken_duration_seconds") Double spokenDurationSeconds,
            @JsonProperty("processing_seconds") Double processingSeconds,
            String model
    ) {}
}
