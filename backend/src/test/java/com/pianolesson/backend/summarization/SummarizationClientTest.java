package com.pianolesson.backend.summarization;

import org.junit.jupiter.api.Test;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

// Tests for the two package-private static helpers in SummarizationClient.
// No HTTP calls are made — all tested methods operate on local data only.
class SummarizationClientTest {

    // ── evidenceFoundInTranscript: case-insensitive matching ──────────────────

    @Test
    void evidenceFoundInTranscript_exactMatch() {
        assertThat(SummarizationClient.evidenceFoundInTranscript(
                "you are rushing through the passage.", "rushing through the passage")).isTrue();
    }

    @Test
    void evidenceFoundInTranscript_transcriptCapitalised_evidenceLower() {
        // Whisper often capitalises the first word of a sentence segment.
        // Claude may copy the phrase in lower case — this must still match.
        assertThat(SummarizationClient.evidenceFoundInTranscript(
                "You are rushing through the passage.", "you are rushing")).isTrue();
    }

    @Test
    void evidenceFoundInTranscript_evidenceCapitalised_transcriptLower() {
        assertThat(SummarizationClient.evidenceFoundInTranscript(
                "you are rushing through the passage.", "You Are Rushing")).isTrue();
    }

    @Test
    void evidenceFoundInTranscript_mixedCase() {
        assertThat(SummarizationClient.evidenceFoundInTranscript(
                "Keep your LEFT hand steady.", "left hand steady")).isTrue();
    }

    @Test
    void evidenceFoundInTranscript_absentEvidence() {
        assertThat(SummarizationClient.evidenceFoundInTranscript(
                "You are rushing through the passage.", "going too fast")).isFalse();
    }

    @Test
    void evidenceFoundInTranscript_requiresContiguousSubstring() {
        // "rushing passage" is not contiguous — there are words in between.
        assertThat(SummarizationClient.evidenceFoundInTranscript(
                "You are rushing through the passage.", "rushing passage")).isFalse();
    }

    @Test
    void evidenceFoundInTranscript_singleCharacterMatch() {
        assertThat(SummarizationClient.evidenceFoundInTranscript("A", "a")).isTrue();
        assertThat(SummarizationClient.evidenceFoundInTranscript("a", "B")).isFalse();
    }

    // ── buildInputSchema: additionalProperties: false ─────────────────────────

    @Test
    @SuppressWarnings("unchecked")
    void buildInputSchema_itemSchemaForbidsAdditionalProperties() {
        Map<String, Object> schema = SummarizationClient.buildInputSchema();

        // The top-level schema has a "properties" map; each value is an array
        // schema whose "items" key holds the shared item schema.
        Map<String, Object> properties = (Map<String, Object>) schema.get("properties");
        assertThat(properties).containsKeys("corrections", "techniques", "practiceAssignments", "reminders");

        // All four categories share the same item schema object — checking one
        // is sufficient to verify that additionalProperties was set.
        Map<String, Object> correctionsArray = (Map<String, Object>) properties.get("corrections");
        Map<String, Object> itemSchema = (Map<String, Object>) correctionsArray.get("items");

        assertThat(itemSchema.get("additionalProperties"))
                .as("item schema must forbid additional properties")
                .isEqualTo(false);
    }

    @Test
    @SuppressWarnings("unchecked")
    void buildInputSchema_topLevelRequiresAllFourCategories() {
        Map<String, Object> schema = SummarizationClient.buildInputSchema();

        assertThat(schema.get("required"))
                .asList()
                .containsExactlyInAnyOrder("corrections", "techniques", "practiceAssignments", "reminders");
    }

    @Test
    @SuppressWarnings("unchecked")
    void buildInputSchema_itemSchemaRequiresContentAndEvidence() {
        Map<String, Object> schema = SummarizationClient.buildInputSchema();

        Map<String, Object> properties = (Map<String, Object>) schema.get("properties");
        Map<String, Object> correctionsArray = (Map<String, Object>) properties.get("corrections");
        Map<String, Object> itemSchema = (Map<String, Object>) correctionsArray.get("items");

        assertThat(itemSchema.get("required"))
                .asList()
                .containsExactlyInAnyOrder("content", "evidence");
    }
}
