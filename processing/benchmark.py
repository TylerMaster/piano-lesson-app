"""
Whisper model benchmark

Runs "tiny" and "small" against the existing piano-voice-test recording and
prints load time, transcription time, and the resulting transcript for each.

Run from the processing/ directory with the venv active:
    python benchmark.py

The audio file used is the original (non-Demucs) recording from the existing
experiment, so the results are directly comparable to those experiments.
"""

import gc
import time

import whisper

AUDIO_PATH = "../../piano-master/piano-voice-test/piano-voice2.wav"
MODELS = ["tiny", "small"]

for model_name in MODELS:
    print(f"\n{'=' * 50}")
    print(f"Model: whisper {model_name}")
    print("=" * 50)

    # Load the model and time how long it takes.
    t0 = time.perf_counter()
    model = whisper.load_model(model_name)
    load_time = time.perf_counter() - t0
    print(f"Load time:            {load_time:.1f}s")

    # Transcribe and time it.
    t1 = time.perf_counter()
    result = model.transcribe(AUDIO_PATH, language="en")
    run_time = time.perf_counter() - t1
    print(f"Transcription time:   {run_time:.1f}s")

    segments = result.get("segments", [])
    spoken_end = segments[-1]["end"] if segments else 0.0
    print(f"Spoken duration:      {spoken_end:.1f}s")
    print(f"Transcript:\n  {result['text'].strip()}")

    # Release the model and ask the garbage collector to free its memory
    # before loading the next one.
    del model
    gc.collect()

print("\nDone.")
