# Reference Documents (local copies)

Offline copies of primary-source documents, so the library is useful without a
network connection. These are historical Commodore documents preserved by the
Internet Archive.

## Contents

| File | What it is | Source |
|------|------------|--------|
| [`c64-programmers-reference-guide.pdf`](c64-programmers-reference-guide.pdf) | **Commodore 64 Programmer's Reference Guide** (1982/83) — the official manual: BASIC V2, the KERNAL, memory map, VIC-II, SID, I/O. 518 pages, **text-searchable** (OCR layer). | [archive.org/details/c64-programmer-ref](https://archive.org/details/c64-programmer-ref) |
| [`c64-programmers-reference-guide.txt`](c64-programmers-reference-guide.txt) | The same guide as **plain OCR text** (~800 KB) — handy for `grep`-ing for a routine address or register. | same item |

## Notes

- The Internet Archive item also offers a higher-resolution image-only PDF
  (~173 MB) and an EPUB; we pulled the **text PDF** (~45 MB) because it's smaller
  and searchable. To grab the others:
  ```sh
  # image-only scan
  curl -L -o prg-images.pdf \
    https://archive.org/download/c64-programmer-ref/Image092417194545.merged.pdf
  # epub
  curl -L -o prg.epub \
    https://archive.org/download/c64-programmer-ref/Image092417194545.merged.epub
  ```
- The OCR text has the usual scan artifacts (mangled hex, broken table columns).
  For anything address-precise, cross-check against the PDF page or
  [Mapping the C64](https://www.zimmers.net/anonftp/pub/cbm/c64/manuals/mapping-c64.txt).
- These are Commodore's original documentation, redistributed for preservation
  and personal/educational use.
