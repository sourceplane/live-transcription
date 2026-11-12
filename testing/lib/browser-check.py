#!/usr/bin/env python3
"""The e2e's verdict on the page in headless Chrome (browser-caption.mjs's
JSON): the page opened its socket to /api/listen, showed interim captions as
they grew and the stand-in's final lines, logged no error, and its audio
reached Nova-3's stand-in as linear16. Standard library only.

    python3 browser-check.py <browser.json> <base-url>
"""
import json
import sys
import urllib.request

d, base = json.load(open(sys.argv[1])), sys.argv[2]
SCRIPT = [
    "Hello from the live transcription test.",
    "The second burst of sound becomes the second line.",
]
problems = []
socket = base.replace("http", "ws", 1) + "/api/listen?sample_rate="
if not any(u.startswith(socket) for u in d.get("ws", [])):
    problems.append(f"the page opened no socket to /api/listen: {d.get('ws')}")
captions = d.get("captions", [])
for line in SCRIPT:
    if line not in captions:
        problems.append(f"the page never captioned {line!r}: {captions}")
if not any(c != line and line.startswith(c) for c in captions for line in SCRIPT):
    problems.append(f"the page showed no interim caption: {captions}")
if d.get("errors"):
    problems.append(f"the page logged errors: {d['errors'][:3]}")
runs = [x for x in json.load(urllib.request.urlopen(base + "/__e2e/calls")) if x["kind"] == "workers-ai.run"]
browser = runs[-1] if runs else {}
if not browser.get("bytes") or browser.get("oddChunks") or browser.get("inputs", {}).get("encoding") != "linear16":
    problems.append(f"the page's audio did not reach Nova-3 as linear16: {browser}")
for p in problems:
    print(f"  ✕ {p}", file=sys.stderr)
if problems:
    sys.exit(1)
print(
    f"   the page showed {len(captions)} captions from Chrome's microphone at {browser['inputs']['sample_rate']} Hz "
    f"({browser['bytes']} bytes in {browser['chunks']} chunks)"
)
