#!/usr/bin/env python3
"""Write the e2e's audio fixture: a mono 16-bit WAV of three bursts of
speech-like sound (frequency glides with a syllable-rate amplitude envelope,
so a browser's noise suppression does not take them for a steady tone),
each followed by silence — what the e2e's Workers AI stand-in segments into
three transcript lines. Standard library only.

    python3 speech-wav.py <out.wav> [sample_rate]
"""
import math
import struct
import sys
import wave

out = sys.argv[1]
rate = int(sys.argv[2]) if len(sys.argv) > 2 else 16000
BURSTS = [(1.4, 180.0), (1.6, 220.0), (1.2, 260.0)]  # (seconds, base Hz)
LEAD, GAP = 0.6, 1.2

frames = bytearray()


def silence(seconds):
    frames.extend(b"\x00\x00" * int(seconds * rate))


def burst(seconds, base):
    n = int(seconds * rate)
    phase = 0.0
    for i in range(n):
        t = i / rate
        # a pitch glide and a 4.5 Hz syllable envelope, with harmonics
        f = base * (1.0 + 0.25 * math.sin(2 * math.pi * 1.3 * t))
        phase += 2 * math.pi * f / rate
        env = 0.55 + 0.45 * math.sin(2 * math.pi * 4.5 * t)
        edge = min(1.0, t / 0.03, (seconds - t) / 0.03)
        s = (math.sin(phase) + 0.5 * math.sin(2 * phase) + 0.25 * math.sin(3 * phase)) / 1.75
        frames.extend(struct.pack("<h", int(32767 * 0.6 * env * edge * s)))


silence(LEAD)
for seconds, base in BURSTS:
    burst(seconds, base)
    silence(GAP)

with wave.open(out, "wb") as w:
    w.setnchannels(1)
    w.setsampwidth(2)
    w.setframerate(rate)
    w.writeframes(bytes(frames))
print(f"{out}: {len(frames) // 2 / rate:.2f} s at {rate} Hz, {len(BURSTS)} bursts")
