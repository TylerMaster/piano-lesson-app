package com.pianolesson.backend.summarization;

// Thrown by SummarizationClient when the Anthropic API call fails or the
// response cannot be turned into a valid LessonSummary.
//
// Using a named exception (rather than RuntimeException or IllegalStateException)
// lets the service layer catch it specifically and mark the lesson FAILED
// without accidentally swallowing unrelated exceptions.
public class SummarizationException extends RuntimeException {

    public SummarizationException(String message) {
        super(message);
    }

    public SummarizationException(String message, Throwable cause) {
        super(message, cause);
    }
}
