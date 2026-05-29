# Appendix D — SID Register Reference ($D400–$D41C)

The 6581/8580 SID (Sound Interface Device) is mapped at **$D400–$D41C (54272–54300)**. It exposes 29 eight-bit registers: voice/filter registers are **write-only**, the last four ($D419–$D41C) are **read-only**. Writing a write-only register does not let you read it back, so software must keep its own RAM shadow of any value it needs to re-read. SID is driven by the ø2 system clock: **1,022,727 Hz on NTSC, 985,248 Hz on PAL** (the datasheet quotes a nominal 1.0 MHz reference for all timing tables below).

## D.1 Register Map Overview

| Range | Function |
|-------|----------|
| $D400–$D406 (54272–54278) | Voice 1 |
| $D407–$D40D (54279–54285) | Voice 2 |
| $D40E–$D414 (54286–54292) | Voice 3 |
| $D415–$D418 (54293–54296) | Filter & master volume |
| $D419–$D41C (54297–54300) | Read-only (paddles, OSC3, ENV3) |

Each of the three voices uses an identical 7-byte block; only the base address changes (+$07 per voice).

## D.2 Per-Voice Register Block

| Offset | Voice 1 | Voice 2 | Voice 3 | Name | Type |
|--------|---------|---------|---------|------|------|
| +0 | $D400 (54272) | $D407 (54279) | $D40E (54286) | Frequency low byte | W |
| +1 | $D401 (54273) | $D408 (54280) | $D40F (54287) | Frequency high byte | W |
| +2 | $D402 (54274) | $D409 (54281) | $D410 (54288) | Pulse width low byte | W |
| +3 | $D403 (54275) | $D40A (54282) | $D411 (54289) | Pulse width high nibble (bits 3–0) | W |
| +4 | $D404 (54276) | $D40B (54283) | $D412 (54290) | Control register | W |
| +5 | $D405 (54277) | $D40C (54284) | $D413 (54291) | Attack / Decay | W |
| +6 | $D406 (54278) | $D40D (54285) | $D414 (54292) | Sustain / Release | W |

### Frequency (+0 / +1) — 16-bit `Fn`
The two bytes form a 16-bit oscillator frequency word `Fn` ($0000–$FFFF). See [D.5](#d5-frequency-calculation) for the conversion to Hz and §D.6 for note values.

### Pulse Width (+2 / +3) — 12-bit `PWn`
Bits 3–0 of the high byte plus the full low byte form a 12-bit duty-cycle value `PWn` ($000–$FFF). Bits 7–4 of the high byte are unused.

```
PWout = (PWn / 40.95) %
```
$000 = constant DC (0%), $800 = 50% (square wave), $FFF ≈ 99.98%. Only affects the **pulse** waveform, and only when the pulse waveform is selected. The 12-bit resolution lets the width be swept smoothly (PWM) with no audible stepping.

### Control Register (+4)

| Bit | Mask | Name | Effect when set (=1) |
|-----|------|------|----------------------|
| 7 | $80 | NOISE | Select noise waveform (pseudo-random) |
| 6 | $40 | PULSE | Select pulse waveform (duty from PW registers) |
| 5 | $20 | SAWTOOTH | Select sawtooth waveform |
| 4 | $10 | TRIANGLE | Select triangle waveform |
| 3 | $08 | TEST | Reset & lock oscillator at zero; resets noise, holds pulse output at DC. Clear to release. |
| 2 | $04 | RING MOD | Ring-modulate this oscillator's triangle output with the previous voice's oscillator |
| 1 | $02 | SYNC | Hard-sync this oscillator's frequency to the previous voice's oscillator |
| 0 | $01 | GATE | 1 = start ATTACK/DECAY/SUSTAIN; 0 = start RELEASE |

Notes:
- **Waveforms are not additive.** Selecting two or more simultaneously logically ANDs their outputs (a documented trick, not a mix). Selecting none silences the voice. If NOISE is combined with another waveform, the noise generator can "lock up" and stay silent until reset via the TEST bit or a chip RESET.
- **GATE** drives the envelope. The ADSR can be re-gated/released at any time to build complex amplitude shapes in software (see hard-restart caveat, §D.7).
- **SYNC / RING MOD source pairing** (per the datasheet, each voice modulates against the *previous* oscillator, wrapping around): Voice 1 ← Oscillator 3, Voice 2 ← Oscillator 1, Voice 3 ← Oscillator 2. For RING MOD the **triangle** waveform must be selected and the source oscillator must be at a non-zero frequency; for SYNC the source oscillator must be non-zero. No other parameter of the source voice matters.

### Attack / Decay (+5)

| Bits | Field | Selects |
|------|-------|---------|
| 7–4 (high nibble) | ATTACK  | 1 of 16 attack rates (see §D.4) |
| 3–0 (low nibble)  | DECAY   | 1 of 16 decay rates (see §D.4) |

`value = (attack << 4) | decay`. Attack is the time to rise 0→peak after GATE=1; Decay is the time to fall peak→sustain level.

### Sustain / Release (+6)

| Bits | Field | Selects |
|------|-------|---------|
| 7–4 (high nibble) | SUSTAIN | Sustain *level* 0–15 (linear, 0 = silence, 15 = peak). Not a rate. |
| 3–0 (low nibble)  | RELEASE | 1 of 16 release rates (see §D.4) |

`value = (sustain << 4) | release`. A sustain value of N holds the envelope at N/15 of peak for as long as GATE stays 1. Release begins when GATE→0, falling from the current level to zero at the selected rate.

## D.3 Filter & Volume Registers

| Address | Name | Bits used |
|---------|------|-----------|
| $D415 (54293) | Filter cutoff LOW  | bits 2–0 (FC2–FC0); bits 7–3 unused |
| $D416 (54294) | Filter cutoff HIGH | bits 7–0 (FC10–FC3) |
| $D417 (54295) | Resonance / routing | see below |
| $D418 (54296) | Mode / master volume | see below |

### Cutoff ($D415/$D416) — 11-bit `FC`
The 3 low bits of $D415 plus all 8 bits of $D416 form an 11-bit cutoff value `FC` ($000–$7FF) that linearly controls the filter cutoff/centre frequency. Approximate range ≈ 30 Hz–12 kHz with the standard 2200 pF integrating capacitors (`FCmax ≈ 2.6E-5 / C`, range ~9 octaves below max). The actual cutoff curve differs markedly between 6581 and 8580 (§D.7).

### Resonance / Routing ($D417)

| Bit | Mask | Name | Meaning |
|-----|------|------|---------|
| 7–4 | $F0 | RES3–RES0 | Resonance 0–15 (linear; 0 = none, 15 = max peaking at cutoff) |
| 3 | $08 | Filt EX | Route external input (pin 26) through filter |
| 2 | $04 | Filt 3 | Route voice 3 through filter |
| 1 | $02 | Filt 2 | Route voice 2 through filter |
| 0 | $01 | Filt 1 | Route voice 1 through filter |

A routed voice (bit=1) is processed by the filter; a non-routed voice (bit=0) goes straight to the output unfiltered.

### Mode / Volume ($D418)

| Bit | Mask | Name | Meaning |
|-----|------|------|---------|
| 7 | $80 | 3 OFF | Disconnect voice 3 from the audio output (for use as modulation source) |
| 6 | $40 | HP | High-pass output enable (12 dB/oct) |
| 5 | $20 | BP | Band-pass output enable (6 dB/oct) |
| 4 | $10 | LP | Low-pass output enable (12 dB/oct) |
| 3–0 | $0F | VOL3–VOL0 | Master volume 0–15 |

Filter mode bits are **additive** — combining LP+HP yields a notch (band-reject) response. **Volume must be non-zero for any sound at all**; this register is also the basis of digi/sample playback (volume-register trick — see §D.7). Note "3 OFF" only affects the *direct* path; if voice 3 is also routed through the filter (Filt 3=1) it can still be heard.

## D.4 ADSR Rate Tables (Table 2, 6581 datasheet)

Times below are for a **1.0 MHz ø2 clock**. For another clock, multiply by `1 MHz / ø2`:
- NTSC (1,022,727 Hz): multiply by **0.978** (rates are ~2.2% faster)
- PAL (985,248 Hz): multiply by **1.015** (rates are ~1.5% slower)

The 16 decay rates and 16 release rates are **identical**.

| Value (dec / hex) | ATTACK (0→peak) | DECAY / RELEASE (peak→0) |
|-------------------|-----------------|--------------------------|
| 0  ($0) | 2 ms    | 6 ms    |
| 1  ($1) | 8 ms    | 24 ms   |
| 2  ($2) | 16 ms   | 48 ms   |
| 3  ($3) | 24 ms   | 72 ms   |
| 4  ($4) | 38 ms   | 114 ms  |
| 5  ($5) | 56 ms   | 168 ms  |
| 6  ($6) | 68 ms   | 204 ms  |
| 7  ($7) | 80 ms   | 240 ms  |
| 8  ($8) | 100 ms  | 300 ms  |
| 9  ($9) | 250 ms  | 750 ms  |
| 10 ($A) | 500 ms  | 1.5 s   |
| 11 ($B) | 800 ms  | 2.4 s   |
| 12 ($C) | 1 s     | 3 s     |
| 13 ($D) | 3 s     | 9 s     |
| 14 ($E) | 5 s     | 15 s    |
| 15 ($F) | 8 s     | 24 s    |

Decay/Release rates are exactly 3× the corresponding attack rate at each step. The figures are per-cycle times (the time the cycle would take to traverse the full amplitude range).

## D.5 Frequency Calculation

```
Fout = (Fn * Fclk) / 16777216   Hz        (16777216 = 2^24)
```
where `Fn` is the 16-bit value in the frequency registers and `Fclk` is the ø2 clock. For the datasheet's reference 1.0 MHz clock this simplifies to:

```
Fout = Fn * 0.0596   Hz                    (~0.0596 Hz per step)
```

Inverting, to play a desired pitch:
```
Fn = round(Fout * 16777216 / Fclk)
```
Per-step resolution at the real machine clocks: **≈ 0.0610 Hz/step (NTSC)**, **≈ 0.0587 Hz/step (PAL)**. The resolution is fine enough for any tuning scale and for smooth pitch slides (portamento) with no audible steps.

### KickAssembler — build a one-octave frequency table
```asm
.var Fclk = 985248          // PAL; use 1022727 for NTSC
.const TWO24 = 16777216

.function sidFreq(hz) {
    .return round(hz * TWO24 / Fclk)
}

// Octave 4 (A4 = 440 Hz, equal temperament), stored lo,hi
freqTable:
.for (var n = 0; n < 12; n++) {
    .var hz = 440 * pow(2, (n - 9) / 12.0)   // C4..B4
    .var fn = sidFreq(hz)
    .byte <fn, >fn
}
```

## D.6 Equal-Tempered Note Values (datasheet Appendix A, A4 = 440 Hz, 1.0 MHz clock)

Representative `Fn` values (decimal / hex). These assume the datasheet's 1.0 MHz reference clock; recompute with §D.5 for exact PAL/NTSC tuning.

| Note | Fn (dec) | Fn (hex) | Note | Fn (dec) | Fn (hex) |
|------|----------|----------|------|----------|----------|
| C4  | 4389  | $1125 | C5  | 8779  | $224B |
| C#4 | 4650  | $122A | C#5 | 9301  | $2455 |
| D4  | 4927  | $133F | D5  | 9854  | $267E |
| D#4 | 5220  | $1464 | D#5 | 10440 | $28C8 |
| E4  | 5530  | $159A | E5  | 11060 | $2B34 |
| F4  | 5859  | $16E3 | F5  | 11718 | $2DC6 |
| F#4 | 6207  | $183F | F#5 | 12415 | $307F |
| G4  | 6577  | $19B1 | G5  | 13153 | $3361 |
| G#4 | 6968  | $1B38 | G#5 | 13935 | $366F |
| A4  | 7382  | $1CD6 | A5  | 14764 | $39AC |
| A#4 | 7821  | $1E8D | A#5 | 15642 | $3D1A |
| B4  | 8286  | $205E | B5  | 16572 | $40BC |

Lower octaves: halve the value (right-shift) per octave down; higher octaves: double per octave up.

## D.7 6581 vs 8580 and Caveats

**6581 vs 8580**

| Aspect | 6581 (original NMOS) | 8580 (later HMOS-II) |
|--------|---------------------|----------------------|
| Process / Vdd | NMOS, +12 V Vdd | HMOS-II, +9 V Vdd |
| Filter caps (CAP1/2) | 470 pF (C64C/recommended 2200 pF in datasheet) | 22 nF |
| Filter character | Cutoff curve varies between chips, strong distortion, "fatter" resonance | More predictable/linear cutoff, cleaner, weaker resonance |
| Combined waveforms | Distinctive, chip-dependent | Different (often "thinner") spectra |
| Volume-register digi (4-bit samples) | Loud audible click on every $D418 write — basis of classic digi playback | "Fixed": writes are nearly inaudible; needs a hardware mod to reproduce digis |
| DC offset | Large (causes the click) | Minimal |

Because filter cutoff, resonance and combined-waveform timbres differ audibly, tunes are often tuned to a specific SID model; detect the model at runtime if filter accuracy matters.

**ADSR / hard-restart caveat.** The 6581/8580 envelope generator has a known quirk: re-gating a voice does **not** reliably reset the envelope to zero, and the envelope counter can be left in a stale or "stuck" state (the so-called ADSR bug / delay bug) when a new note is gated while the previous envelope is still decaying or releasing. The standard fix is a **hard restart**: a few frames before the new note, force a fast release and clear the gate (commonly write a low ADSR such as $00/$F0 and GATE=0), then on the note frame set the real ADSR and GATE=1. This drains the envelope to a known zero state so every note attacks consistently. Players that skip this get inconsistent note volumes and timing.

**TEST bit.** Setting TEST (bit 3) locks the oscillator (and resets noise) at zero; it is used both to unlock a "locked" noise channel and to phase-align oscillators for advanced waveform tricks. Clear it to let the oscillator run.

## Sources

- MOS 6581 SID datasheet (Commodore, 10/82): https://6502.org/documents/datasheets/mos/mos_6581_sid.pdf (original link http://archive.6502.org/datasheets/mos_6581_sid.pdf) — register map (Table 1), register descriptions, envelope rates (Table 2), frequency formula, equal-tempered scale (Appendix A), envelope examples (Appendix B).
- C64-Wiki, "SID": https://www.c64-wiki.com/wiki/SID — register addresses, 6581 vs 8580 differences, volume-register digi note.
- Codebase64, "SID — Sound & Music" index: https://codebase64.c64.org/doku.php?id=base:sid_programming — hard-restart and SID-model references.
