#!/usr/bin/env python3
"""Generate VICE screenshots of a lesson's runnable programs and embed them in
the Markdown, so readers see what each example produces.

For every COMPLETE runnable ```asm block in a lesson page it assembles the code,
runs it headless in VICE (tools/vice_run.py), saves a PNG under docs/img/, and —
with --embed — inserts an image right after the code block.

  shoot_examples.py docs/part-2-interrupts.md --list          # show the blocks
  shoot_examples.py docs/part-2-interrupts.md --only 3        # shoot block #3 only
  shoot_examples.py docs/part-2-interrupts.md --embed         # shoot all + embed

Idempotent: a block that already has an image right after it is skipped unless
--force. Image files are named <md-stem>-NN.png.
"""
import argparse
import json
import os
import re
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
KICKASS = os.path.join(HERE, "kickass")
VRUN = os.path.join(HERE, "vice_run.py")

FENCE = re.compile(r"```asm\n(.*?)\n```", re.S)
SEE = re.compile(r"(?:On screen you should see|What you should see|you should see)\b[:\s]*(.+?)(?:\n\n|\Z)",
                 re.S | re.I)
HEAD = re.compile(r"^#{2,3}\s+(.+)$", re.M)


def is_complete(code):
    return ("BasicUpstart2" in code) or ("*=$0801" in code or "* = $0801" in code)


def _clean(s):
    s = re.sub(r"\*\*|`", "", s)
    s = re.sub(r"\s+", " ", s).strip()
    m = re.match(r"(.+?[.!])(?:\s|$)", s)   # keep just the first sentence
    if m:
        s = m.group(1)
    s = s.strip(" .")
    if s:
        s = s[0].upper() + s[1:]
    return s[:120]


def caption_for(text, block_start, block_end):
    # prefer a "you should see" sentence just after the code...
    m = SEE.search(text[block_end: block_end + 800])
    if m:
        return _clean(m.group(1))
    # ...else just before it (many lessons describe the result first)
    before = text[max(0, block_start - 800): block_start]
    ms = list(SEE.finditer(before))
    if ms:
        return _clean(ms[-1].group(1))
    heads = [h for h in HEAD.finditer(text) if h.start() < block_end]
    if heads:
        return "Output of the example in " + heads[-1].group(1).strip()
    return "VICE screenshot of this example"


def find_blocks(text):
    out = []
    for m in FENCE.finditer(text):
        out.append({"code": m.group(1), "start": m.start(), "end": m.end(),
                    "complete": is_complete(m.group(1))})
    return out


def already_has_image(text, block_end):
    tail = text[block_end: block_end + 200].lstrip("\n")
    return tail.startswith("![") or tail.startswith("> ![")


def shoot(code, out_png):
    with tempfile.NamedTemporaryFile("w", suffix=".asm", delete=False) as f:
        f.write(code)
        asm = f.name
    try:
        r = subprocess.run([sys.executable, VRUN, "run", asm,
                            "--screenshot", out_png],
                           capture_output=True, text=True, timeout=120)
    finally:
        os.unlink(asm)
    jam = False
    for line in (r.stdout + r.stderr).splitlines():
        if line.startswith("JSON "):
            try:
                jam = json.loads(line[5:]).get("jam", False)
            except Exception:
                pass
    ok = os.path.exists(out_png) and os.path.getsize(out_png) > 0
    return ok, jam


def main(argv=None):
    p = argparse.ArgumentParser(description="Screenshot a lesson's runnable examples and embed them.")
    p.add_argument("markdown")
    p.add_argument("--imgdir", default=os.path.join(ROOT, "docs", "img"))
    p.add_argument("--embed", action="store_true", help="insert image tags after each program")
    p.add_argument("--only", type=int, help="only process the Nth complete block (1-based)")
    p.add_argument("--list", action="store_true", help="list complete blocks and exit")
    p.add_argument("--force", action="store_true", help="re-shoot / re-embed even if an image exists")
    a = p.parse_args(argv)

    text = open(a.markdown).read()
    stem = os.path.splitext(os.path.basename(a.markdown))[0]
    os.makedirs(a.imgdir, exist_ok=True)
    rel_imgdir = os.path.relpath(a.imgdir, os.path.dirname(os.path.abspath(a.markdown)))

    complete = [b for b in find_blocks(text) if b["complete"]]
    if a.list:
        for i, b in enumerate(complete, 1):
            print(f"#{i}  has_img={already_has_image(text, b['end'])}  "
                  f"cap={caption_for(text, b['start'], b['end'])[:70]!r}")
        return 0

    # process highest offset first so earlier insert offsets stay valid
    targets = list(enumerate(complete, 1))
    if a.only:
        targets = [t for t in targets if t[0] == a.only]
    manifest = []
    for idx, b in sorted(targets, key=lambda t: -t[1]["start"]):
        png = os.path.join(a.imgdir, f"{stem}-{idx:02d}.png")
        relpng = f"{rel_imgdir}/{stem}-{idx:02d}.png".replace("\\", "/")
        if a.embed and already_has_image(text, b["end"]) and not a.force:
            manifest.append((idx, "skip(has image)", relpng))
            continue
        ok, jam = shoot(b["code"], png)
        status = ("jam!" if jam else "ok") if ok else "FAILED"
        manifest.append((idx, status, relpng))
        if a.embed and ok:
            cap = caption_for(text, b["start"], b["end"])
            img_md = f"\n\n![{cap}]({relpng})\n"
            text = text[: b["end"]] + img_md + text[b["end"]:]

    if a.embed:
        open(a.markdown, "w").write(text)

    for idx, status, relpng in sorted(manifest):
        print(f"#{idx:2}  {status:16} {relpng}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
