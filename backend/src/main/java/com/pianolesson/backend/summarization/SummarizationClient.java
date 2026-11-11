package com.pianolesson.backend.summarization;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.HttpStatusCodeException;
import org.springframework.web.client.RestTemplate;

import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Component
public class SummarizationClient {

    private static final Logger log = LoggerFactory.getLogger(SummarizationClient.class);

    // The name used for the Anthropic tool definition and in tool_choice.
    // Must match exactly in both places so Claude knows which tool to call.
    private static final String TOOL_NAME = "extract_lesson_summary";

    // Required header that identifies which version of the Anthropic API to use.
    // See: https://docs.anthropic.com/en/api/versioning
    private static final String ANTHROPIC_VERSION = "2023-06-01";

    // Upper bound on the tokens Claude may generate in a single response.
    // The tool input (structured JSON) for a lesson summary is typically well
    // under 1 000 tokens, but 4 096 gives plenty of headroom for longer lessons.
    private static final int MAX_TOKENS = 4096;

    private final RestTemplate restTemplate;
    private final ObjectMapper objectMapper;
    private final String apiUrl;
    private final String apiKey;
    private final String model;

    public SummarizationClient(
            @Value("${ai.summarization.api-url}") String apiUrl,
            @Value("${ai.summarization.api-key}") String apiKey,
            @Value("${ai.summarization.model}") String model,
            @Value("${ai.summarization.timeout-seconds}") int timeoutSeconds,
            ObjectMapper objectMapper
    ) {
        this.apiUrl = apiUrl;
        this.apiKey = apiKey;
        this.model = model;
        this.objectMapper = objectMapper;

        // SimpleClientHttpRequestFactory wraps Java's built-in HttpURLConnection.
        // We configure two timeouts:
        //   connectTimeout — how long to wait while establishing the TCP connection
        //   readTimeout    — how long to wait for the full response after connecting
        //
        // AI API calls can take many seconds, so readTimeout is configurable.
        // 30 s for the connection is generous; in practice it either connects
        // quickly or is unreachable.
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(Duration.ofSeconds(30));
        factory.setReadTimeout(Duration.ofSeconds(timeoutSeconds));
        this.restTemplate = new RestTemplate(factory);
    }

    // ── Public API ────────────────────────────────────────────────────────────

    // Sends the transcript to the Anthropic Messages API and returns a
    // validated LessonSummary.
    //
    // Throws SummarizationException if:
    //   - the HTTP call fails (network error, non-2xx response)
    //   - the API returns an error body
    //   - the response does not contain the expected tool_use block
    //   - the tool input cannot be parsed as a LessonSummary
    //   - all items returned by Claude fail evidence validation
    public LessonSummary summarize(String transcript) {
        log.info("[Summarization] Sending transcript to Anthropic API (model={})", model);

        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        headers.set("x-api-key", apiKey);
        headers.set("anthropic-version", ANTHROPIC_VERSION);

        AnthropicRequest request = buildRequest(transcript);
        HttpEntity<AnthropicRequest> entity = new HttpEntity<>(request, headers);

        AnthropicResponse response;
        try {
            response = restTemplate.postForObject(apiUrl, entity, AnthropicResponse.class);
        } catch (HttpStatusCodeException e) {
            // HttpStatusCodeException covers 4xx and 5xx responses.
            // The response body is intentionally excluded — it may contain API
            // keys echoed in error details or transcript fragments, and is not
            // safe to propagate into logs or exception messages.
            throw new SummarizationException(
                    "Anthropic API returned HTTP " + e.getStatusCode()
                            + " — check the API key, model name, and request format", e);
        } catch (Exception e) {
            throw new SummarizationException(
                    "Failed to contact Anthropic API: " + e.getMessage(), e);
        }

        if (response == null) {
            throw new SummarizationException("Anthropic API returned an empty response body");
        }

        // The Anthropic API uses HTTP 200 for all successful responses, but can
        // also return a JSON error body with "type": "error" for some failure
        // modes.  Check for this before trying to parse the content.
        if ("error".equals(response.type())) {
            AnthropicApiError err = response.error();
            String detail = (err != null) ? err.type() + ": " + err.message() : "unknown error";
            throw new SummarizationException("Anthropic API error — " + detail);
        }

        LessonSummary summary = parseAndValidate(response, transcript);
        log.info("[Summarization] Complete — corrections={}, techniques={}, practiceAssignments={}, reminders={}",
                summary.corrections().size(), summary.techniques().size(),
                summary.practiceAssignments().size(), summary.reminders().size());
        return summary;
    }

    // ── Request building ──────────────────────────────────────────────────────

    private AnthropicRequest buildRequest(String transcript) {
        // The system prompt carries the instructions; the user message carries
        // only the data.  Keeping them separate makes it clearer what Claude
        // is being asked to do versus what it is being asked to do it with.
        String systemPrompt = """
                You are helping a piano student review their lesson.

                Extract structured notes from the transcript using the extract_lesson_summary tool.

                Rules:
                - Only include information directly present in the transcript.
                - Do not invent exercises, metronome settings, durations, deadlines, or musical details.
                - Do not include generic piano advice that was not specifically discussed in this lesson.
                - Do not mistake student questions or statements for teacher instructions.
                - If you cannot clearly identify who said something, omit it rather than guess.
                - Exclude casual conversation, filler phrases, and simple repetition.
                - Empty categories are valid — use them when nothing fits.

                For each item you extract:
                - content: a concise, clear statement of the information
                - evidence: an exact substring copied verbatim from the transcript that supports the content
                """;

        ToolDefinition tool = new ToolDefinition(
                TOOL_NAME,
                "Extracts structured lesson notes from a piano lesson transcript into four categories.",
                buildInputSchema()
        );

        // tool_choice forces Claude to call this specific tool rather than
        // choosing whether to call it.  This guarantees a structured output
        // rather than a free-text reply.
        return new AnthropicRequest(
                model,
                MAX_TOKENS,
                systemPrompt,
                List.of(tool),
                new ToolChoice("tool", TOOL_NAME),
                List.of(new Message("user", "TRANSCRIPT:\n" + transcript))
        );
    }

    // Builds the JSON Schema that tells Claude what shape the tool input must
    // have.  Claude uses this schema to produce the structured JSON that we
    // then deserialize into a LessonSummary.
    //
    // The schema describes: an object with four array properties (corrections,
    // techniques, practiceAssignments, reminders), each containing objects with
    // a "content" string and an "evidence" string.
    private Map<String, Object> buildInputSchema() {
        Map<String, Object> contentProp = new LinkedHashMap<>();
        contentProp.put("type", "string");
        contentProp.put("description", "A concise, clear statement of the information");

        Map<String, Object> evidenceProp = new LinkedHashMap<>();
        evidenceProp.put("type", "string");
        evidenceProp.put("description", "An exact substring copied verbatim from the transcript");

        Map<String, Object> itemProperties = new LinkedHashMap<>();
        itemProperties.put("content", contentProp);
        itemProperties.put("evidence", evidenceProp);

        Map<String, Object> itemSchema = new LinkedHashMap<>();
        itemSchema.put("type", "object");
        itemSchema.put("properties", itemProperties);
        itemSchema.put("required", List.of("content", "evidence"));

        Map<String, Object> properties = new LinkedHashMap<>();
        properties.put("corrections",         arrayOf(itemSchema, "Mistakes or weaknesses identified by the teacher"));
        properties.put("techniques",          arrayOf(itemSchema, "Musical concepts, technical skills, and explanations from the teacher"));
        properties.put("practiceAssignments", arrayOf(itemSchema, "Activities the teacher explicitly asks the student to practise"));
        properties.put("reminders",           arrayOf(itemSchema, "Important advice or instructions from the teacher"));

        Map<String, Object> schema = new LinkedHashMap<>();
        schema.put("type", "object");
        schema.put("properties", properties);
        schema.put("required", List.of("corrections", "techniques", "practiceAssignments", "reminders"));
        return schema;
    }

    private Map<String, Object> arrayOf(Map<String, Object> itemSchema, String description) {
        Map<String, Object> schema = new LinkedHashMap<>();
        schema.put("type", "array");
        schema.put("description", description);
        schema.put("items", itemSchema);
        return schema;
    }

    // ── Response parsing ──────────────────────────────────────────────────────

    private LessonSummary parseAndValidate(AnthropicResponse response, String transcript) {
        if (response.content() == null || response.content().isEmpty()) {
            throw new SummarizationException("Anthropic API returned an empty content array");
        }

        // Find the tool_use block.  Claude may return other block types alongside
        // it (e.g. a "text" block with reasoning), so we search rather than
        // assuming the first block is always the tool call.
        ContentBlock toolUseBlock = response.content().stream()
                .filter(b -> "tool_use".equals(b.type()) && TOOL_NAME.equals(b.name()))
                .findFirst()
                .orElseThrow(() -> new SummarizationException(
                        "Anthropic response did not contain a tool_use block for '" + TOOL_NAME + "'"));

        if (toolUseBlock.input() == null || toolUseBlock.input().isNull()) {
            throw new SummarizationException("Tool use block contained a null input field");
        }

        // treeToValue converts a Jackson JsonNode (a parsed JSON tree) into a
        // typed Java object.  This is how we turn the tool input JSON into a
        // LessonSummary record without needing a separate JSON string roundtrip.
        LessonSummary raw;
        try {
            raw = objectMapper.treeToValue(toolUseBlock.input(), LessonSummary.class);
        } catch (Exception e) {
            throw new SummarizationException(
                    "Failed to parse tool input as LessonSummary: " + e.getMessage(), e);
        }

        // All four category lists must be present.  Empty lists are valid;
        // null means the AI omitted a required field from its tool response,
        // which is a contract violation we must not silently treat as empty.
        if (raw.corrections()         == null) throw new SummarizationException("Tool input missing required field: corrections");
        if (raw.techniques()          == null) throw new SummarizationException("Tool input missing required field: techniques");
        if (raw.practiceAssignments() == null) throw new SummarizationException("Tool input missing required field: practiceAssignments");
        if (raw.reminders()           == null) throw new SummarizationException("Tool input missing required field: reminders");

        return validateEvidence(raw, transcript);
    }

    // ── Evidence validation ───────────────────────────────────────────────────

    // Keeps only items whose evidence is a verbatim substring of the transcript.
    //
    // If Claude returned any items but all of them failed, we throw rather than
    // silently returning an empty summary — that would hide a systematic problem
    // with the AI response (e.g. it hallucinated evidence strings entirely).
    //
    // If Claude legitimately returned all empty categories, totalRaw is 0 and
    // we return the empty summary without throwing.
    private LessonSummary validateEvidence(LessonSummary raw, String transcript) {
        List<SummaryItem> corrections       = filterValid(raw.corrections(),         transcript);
        List<SummaryItem> techniques        = filterValid(raw.techniques(),          transcript);
        List<SummaryItem> practiceItems     = filterValid(raw.practiceAssignments(), transcript);
        List<SummaryItem> reminders         = filterValid(raw.reminders(),           transcript);

        int totalRaw   = size(raw.corrections()) + size(raw.techniques())
                       + size(raw.practiceAssignments()) + size(raw.reminders());
        int totalValid = corrections.size() + techniques.size()
                       + practiceItems.size() + reminders.size();
        int rejected   = totalRaw - totalValid;

        if (rejected > 0) {
            log.warn("[Summarization] {} item(s) rejected: evidence string not found verbatim in transcript",
                    rejected);
        }

        if (totalRaw > 0 && totalValid == 0) {
            throw new SummarizationException(
                    "All " + totalRaw + " items returned by the AI failed evidence validation — "
                    + "none contained a verbatim excerpt of the transcript");
        }

        return new LessonSummary(corrections, techniques, practiceItems, reminders);
    }

    private List<SummaryItem> filterValid(List<SummaryItem> items, String transcript) {
        if (items == null) return List.of();
        return items.stream()
                .filter(item -> isValidItem(item, transcript))
                .toList();
    }

    private boolean isValidItem(SummaryItem item, String transcript) {
        if (item == null) return false;
        if (item.content()  == null || item.content().isBlank())  return false;
        if (item.evidence() == null || item.evidence().isBlank()) return false;
        return transcript.contains(item.evidence());
    }

    private int size(List<?> list) {
        return list == null ? 0 : list.size();
    }

    // ── Inner request POJOs ───────────────────────────────────────────────────
    //
    // These records represent the JSON body sent to the Anthropic API.
    // They are private because nothing outside this class needs to know about
    // the Anthropic request format.
    //
    // @JsonProperty("snake_case") maps camelCase Java field names to the
    // snake_case names the Anthropic API expects.

    private record AnthropicRequest(
            String model,
            @JsonProperty("max_tokens") int maxTokens,
            String system,
            List<ToolDefinition> tools,
            @JsonProperty("tool_choice") ToolChoice toolChoice,
            List<Message> messages
    ) {}

    private record ToolDefinition(
            String name,
            String description,
            @JsonProperty("input_schema") Map<String, Object> inputSchema
    ) {}

    private record ToolChoice(String type, String name) {}

    private record Message(String role, String content) {}

    // ── Inner response POJOs ──────────────────────────────────────────────────
    //
    // These records represent the JSON body returned by the Anthropic API.
    // @JsonIgnoreProperties(ignoreUnknown = true) tells Jackson to silently
    // skip any fields in the JSON that don't have a matching record component
    // (e.g. "id", "role", "usage", "model").  Without this, Jackson would
    // throw an error for every unknown field.

    @JsonIgnoreProperties(ignoreUnknown = true)
    private record AnthropicResponse(
            String type,
            List<ContentBlock> content,
            AnthropicApiError error
    ) {}

    @JsonIgnoreProperties(ignoreUnknown = true)
    private record ContentBlock(
            String type,
            String name,
            JsonNode input
    ) {}

    // Maps the nested "error" object inside an Anthropic error response body:
    // { "type": "error", "error": { "type": "authentication_error", "message": "..." } }
    @JsonIgnoreProperties(ignoreUnknown = true)
    private record AnthropicApiError(
            String type,
            String message
    ) {}
}
