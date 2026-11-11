"""
Piano Lesson Transcription Service

Processes uploaded audio through two stages before returning a transcript:

  1. Demucs (htdemucs) vocal separation — isolates the teacher's voice from
     piano audio so that Whisper only sees speech, not instrument noise.
  2. Whisper transcription — transcribes the isolated vocals in English.

The original uploaded file and the intermediate vocals WAV are both kept in
temporary locations and deleted after each request, whether or not it succeeds.
The lesson recording saved by Spring Boot is never touched.

Usage:
    WHISPER_MODEL=small uvicorn main:app --host 0.0.0.0 --port 8000
"""

import os
import tempfile
import time
from pathlib import Path

import torch
import whisper
from demucs.api import Separator
from demucs.audio import save_audio
from fastapi import FastAPI, File, HTTPException, UploadFile

# ---------------------------------------------------------------------------
# CPU thread limit
#
# Benchmarking on this machine showed 4 threads is the sweet spot for PyTorch
# CPU inference — more threads add contention without improving throughput.
# Set this before loading any model so it applies to both Demucs and Whisper.
# ---------------------------------------------------------------------------

torch.set_num_threads(4)

# ---------------------------------------------------------------------------
# Model loading
#
# Both models are loaded once at startup and reused across all requests.
# Loading is slow (expect ~5–15s each on first run), but inference amortises
# that cost across many requests.
# ---------------------------------------------------------------------------

MODEL_NAME = os.environ.get("WHISPER_MODEL", "small")

print("Loading Demucs htdemucs model...")
_separator = Separator("htdemucs", device="cpu", progress=False)
print("Demucs model ready.")

print(f"Loading Whisper model '{MODEL_NAME}'...")
_whisper_model = whisper.load_model(MODEL_NAME)
print(f"Whisper model '{MODEL_NAME}' ready.")

# ---------------------------------------------------------------------------
# Application
# ---------------------------------------------------------------------------

app = FastAPI(title="Piano Lesson Transcription Service")


@app.get("/health")
def health():
    """Quick liveness check — confirms the service is up."""
    return {"status": "ok", "model": MODEL_NAME}


@app.post("/transcribe")
async def transcribe(audio: UploadFile = File(...)):
    """
    Accept an audio file and return a Whisper transcription.

    Processing pipeline:
      1. Write the upload to a named temp file (preserving the file extension
         so ffmpeg can identify the container format).
      2. Run Demucs htdemucs to separate the audio into stems; extract vocals.
      3. Save the vocals tensor to a temp WAV in a TemporaryDirectory.
      4. Run Whisper on the vocals WAV (English, fp16=False for CPU).
      5. Delete all temp files in a finally block regardless of outcome.

    The response schema is unchanged from the original Whisper-only service,
    so Spring Boot requires no modifications.

    Response fields:
      transcript              — full transcribed text, whitespace trimmed
      spoken_duration_seconds — timestamp of the last detected spoken word
      processing_seconds      — wall-clock time for the full Demucs + Whisper pipeline
      model                   — which Whisper model was used
    """

    extension = os.path.splitext(audio.filename or "")[1] or ".bin"

    # Write upload to a named temp file.  delete=False so we control the
    # lifetime — Demucs needs a file path, not a byte stream.
    with tempfile.NamedTemporaryFile(delete=False, suffix=extension) as tmp:
        tmp.write(await audio.read())
        upload_path = tmp.name

    try:
        t_start = time.perf_counter()

        # ── Stage 1: Demucs vocal separation ─────────────────────────────
        # separate_audio_file returns (original_wav, {stem_name: tensor}).
        # The model runs at 44100 Hz; htdemucs produces four stems
        # (drums, bass, other, vocals) in a single forward pass.
        # We keep only the vocals tensor and discard the rest.
        try:
            _, stems = _separator.separate_audio_file(Path(upload_path))
        except Exception as exc:
            raise HTTPException(
                status_code=500,
                detail=f"Demucs separation failed: {exc}",
            )

        # ── Stage 2: Whisper transcription ───────────────────────────────
        # Save the vocals tensor to a temp WAV, transcribe it, then let
        # TemporaryDirectory clean up the WAV automatically on exit.
        with tempfile.TemporaryDirectory() as tmpdir:
            vocals_path = Path(tmpdir) / "vocals.wav"
            save_audio(stems["vocals"], vocals_path, _separator._model.samplerate)

            try:
                result = _whisper_model.transcribe(
                    str(vocals_path),
                    language="en",
                    fp16=False,
                )
            except Exception as exc:
                raise HTTPException(
                    status_code=500,
                    detail=f"Whisper transcription failed: {exc}",
                )

        processing_seconds = round(time.perf_counter() - t_start, 1)

        segments = result.get("segments", [])
        spoken_end = round(segments[-1]["end"], 1) if segments else 0.0

        return {
            "transcript": result["text"].strip(),
            "spoken_duration_seconds": spoken_end,
            "processing_seconds": processing_seconds,
            "model": MODEL_NAME,
        }

    finally:
        # Always remove the upload temp file, even when an exception is raised.
        os.unlink(upload_path)
