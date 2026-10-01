"""Measure a supplied track and emit the same shape grid.mjs produces, plus accent points.

    python analyze.py track.wav > grid.json

Needs: pip install numpy librosa
Accents are moments of sudden energy (drum hits, stabs) where a visual should land.
"""
import json
import sys

import librosa
import numpy as np


def main(path: str) -> None:
    samples, rate = librosa.load(path, sr=22050, mono=True)
    envelope = librosa.onset.onset_strength(y=samples, sr=rate)

    tempo, beat_idx = librosa.beat.beat_track(onset_envelope=envelope, sr=rate)
    beats = librosa.frames_to_time(beat_idx, sr=rate)

    # Accents: envelope peaks that clear a rolling average by a margin.
    peak_idx = librosa.util.peak_pick(envelope, pre_max=4, post_max=4, pre_avg=6, post_avg=8, delta=0.4, wait=8)
    accents = librosa.frames_to_time(peak_idx, sr=rate)

    meter = 4
    json.dump({
        "bpm": round(float(np.atleast_1d(tempo)[0]), 2),
        "meter": meter,
        "offset": round(float(beats[0]), 4) if len(beats) else 0.0,
        "seconds": round(len(samples) / rate, 3),
        "beats": [round(float(b), 4) for b in beats],
        "bars": [round(float(b), 4) for b in beats[::meter]],
        "phrases": [round(float(b), 4) for b in beats[:: meter * 4]],
        "accents": [round(float(a), 4) for a in accents],
    }, sys.stdout, indent=1)


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    main(sys.argv[1])
