# Part IV — SID Sound

The SID — three voices of synthesis on a chip, and the reason C64 music is its own art form. This first half covers the register file and the sound-shaping building blocks (waveforms, ADSR, PWM/ring/sync, the filter); music players, GoatTracker integration, a game SFX engine and digi playback follow in the second half. All code is verified by reading the SID registers back in VICE (audio is silent in the headless check).

**In this part:** 4.1 · 4.2 · 4.3 · 4.4 · 4.5 · 4.6 · 4.7 · 4.8 · 4.9 4.1 · 4.2 · 4.3 · 4.4 · 4.5

## 4.1 The SID register map & your first sound

**Objectives**
- Locate the SID at $D400–$D41C and understand its three identical voice blocks plus the global filter/volume and read-only registers.
- Convert a desired pitch in Hz to the 16-bit `Fn` frequency word using the SID frequency formula.
- Write a complete, assemblable KickAssembler program that gates one sawtooth note on voice 1, stating every register value so it can be asserted.

### Where the SID lives

The 6581/8580 SID (Sound Interface Device) is memory-mapped at **$D400–$D41C (54272–54300)** — 29 eight-bit registers. The voice and filter registers are **write-only**; only the last four ($D419–$D41C) are readable. Because you cannot read a write-only register back on real hardware, any value you need to recall later must be kept in a RAM **shadow** copy. (Full bit tables: [Appendix D](appendix-d-sid-registers.md) §D.1.)

The map breaks into four regions:

| Range | Function |
|-------|----------|
| $D400–$D406 | Voice 1 (7-byte block) |
| $D407–$D40D | Voice 2 (7-byte block) |
| $D40E–$D414 | Voice 3 (7-byte block) |
| $D415–$D418 | Filter & master volume |
| $D419–$D41C | Read-only (paddles, OSC3, ENV3) |

### The per-voice block (7 registers)

Each voice uses an identical 7-byte layout; only the base address changes by +$07 per voice. For voice 1 (base $D400), per [Appendix D](appendix-d-sid-registers.md) §D.2:

| Offset | Voice 1 | Voice 2 | Voice 3 | Meaning |
|--------|---------|---------|---------|---------|
| +0 | $D400 | $D407 | $D40E | Frequency low byte |
| +1 | $D401 | $D408 | $D40F | Frequency high byte |
| +2 | $D402 | $D409 | $D410 | Pulse width low byte |
| +3 | $D403 | $D40A | $D411 | Pulse width high nibble (bits 3–0) |
| +4 | $D404 | $D40B | $D412 | Control register (waveform + gate) |
| +5 | $D405 | $D40C | $D413 | Attack / Decay |
| +6 | $D406 | $D40D | $D414 | Sustain / Release |

**Frequency (+0/+1)** is a 16-bit word `Fn`. **Pulse width (+2/+3)** is a 12-bit duty value that only matters for the pulse waveform. The **control register (+4)** selects the waveform and drives the gate:

| Bit | Mask | Name | Effect (=1) |
|-----|------|------|-------------|
| 7 | $80 | NOISE | Noise waveform |
| 6 | $40 | PULSE | Pulse waveform |
| 5 | $20 | SAWTOOTH | Sawtooth waveform |
| 4 | $10 | TRIANGLE | Triangle waveform |
| 3 | $08 | TEST | Reset & lock oscillator at zero |
| 2 | $04 | RING MOD | Ring-modulate triangle with previous voice |
| 1 | $02 | SYNC | Hard-sync to previous voice |
| 0 | $01 | GATE | 1 = start ATTACK/DECAY/SUSTAIN; 0 = start RELEASE |

So a gated sawtooth is `$20 | $01 = $21`. **Attack/Decay (+5)** packs `(attack << 4) | decay`; **Sustain/Release (+6)** packs `(sustain << 4) | release`, where sustain is a *level* 0–15 and release is a *rate* 0–15 (rate tables in [Appendix D](appendix-d-sid-registers.md) §D.4).

### Filter and master volume

The global block at $D415–$D418 ([Appendix D](appendix-d-sid-registers.md) §D.3):

- **$D415 / $D416** — 11-bit filter cutoff `FC` (3 low bits of $D415, all 8 bits of $D416).
- **$D417** — resonance in the high nibble (bits 7–4) plus per-source routing in the low bits (Filt 1=$01, Filt 2=$02, Filt 3=$04, Filt EX=$08).
- **$D418** — master volume in bits 3–0 ($0F = max), filter mode in bits 4–6 (LP=$10, BP=$20, HP=$40), and "voice 3 OFF" in bit 7 ($80).

**Volume must be non-zero for any sound at all.** Setting $D418 = $0F selects full volume with no filter mode bits (the unfiltered direct path).

### The read-only registers ($D419–$D41C)

These four are the only registers you can read back ([Appendix D](appendix-d-sid-registers.md) §D.1):

| Address | Name | Use |
|---------|------|-----|
| $D419 | POTX | Paddle / mouse pot X (0–255) |
| $D41A | POTY | Paddle / mouse pot Y (0–255) |
| $D41B | OSC3 | Live output of oscillator 3 — a free random/ramp source |
| $D41C | ENV3 | Live envelope level of voice 3 |

OSC3 ($D41B) returns the upper 8 bits of voice 3's waveform output: with the sawtooth selected it counts up like a ramp; with noise selected it is a hardware random-number generator. ENV3 ($D41C) lets you read voice 3's current envelope amplitude — handy for software modulation. Voice 3 is often the one you "sacrifice" as a modulation source via the $80 bit of $D418.

### Turning a pitch into `Fn`

The oscillator frequency word maps to an output frequency by ([Appendix D](appendix-d-sid-registers.md) §D.5):

```
Fout = (Fn * Fclk) / 16777216   Hz        (16777216 = 2^24)
```

At the datasheet's reference 1.0 MHz clock this is `Fout = Fn * 0.0596 Hz`, i.e. roughly **0.0596 Hz per step**. To go the other way for a desired pitch:

```
Fn = round(Fout * 16777216 / Fclk)
```

That resolution (~0.06 Hz/step) is fine enough for any musical scale and for smooth pitch slides. KickAssembler can compute the table at assemble time:

```asm
.var Fclk = 985248          // PAL; use 1022727 for NTSC
.const TWO24 = 16777216

.function sidFreq(hz) {
    .return round(hz * TWO24 / Fclk)
}
```

For this lesson we hard-code A4 = 440 Hz. Using the datasheet's 1.0 MHz reference scale ([Appendix D](appendix-d-sid-registers.md) §D.6), A4 = **$1CD6** (decimal 7382), so the low byte is $D6 and the high byte is $1C.

### Your first sound

The program below sets master volume, loads the A4 frequency, configures a short ADSR with full sustain, then gates a sawtooth. After the gate write the envelope rises and holds, so the note sustains forever in the infinite loop. (On hardware this plays a steady tone; in the headless verifier audio is silent, so correctness is checked by reading the SID registers back.)

Exact values written:
- **$D418 = $0F** — master volume 15, no filter mode (full volume, unfiltered).
- **$D400 = $D6** — frequency low byte of A4.
- **$D401 = $1C** — frequency high byte of A4 (together `Fn` = $1CD6 ≈ 440 Hz).
- **$D405 = $00** — Attack=$0 (2 ms), Decay=$0 (6 ms): a near-instant rise.
- **$D406 = $F0** — Sustain level $F (full), Release=$0: holds at peak while gated.
- **$D404 = $21** — SAWTOOTH ($20) + GATE ($01): selects sawtooth and starts the envelope.

```asm
//----------------------------------------------------------
// 4.1  The SID register map & your first sound
// Plays one A4 sawtooth note on voice 1, then loops forever.
//----------------------------------------------------------
            BasicUpstart2(main)         // SYS 2061 stub at $0801

*=$0801 "Basic"
                                        // (BasicUpstart2 emits the stub here)

*=$0810 "Main"

// --- SID register constants ---------------------------------
.const SID        = $d400
.const V1_FREQLO  = SID + 0             // $D400
.const V1_FREQHI  = SID + 1             // $D401
.const V1_CTRL    = SID + 4             // $D404
.const V1_ATKDCY  = SID + 5             // $D405
.const V1_SUSREL  = SID + 6             // $D406
.const SID_VOLUME = SID + $18           // $D418

// Waveform / gate masks (control register bits)
.const WF_SAW     = $20                 // bit 5: sawtooth
.const GATE       = $01                 // bit 0: gate on

// A4 = 440 Hz, datasheet 1.0 MHz reference -> Fn = $1CD6
.const A4         = $1cd6

main:
            lda #$0f                    // $D418 = $0F: volume 15, no filter
            sta SID_VOLUME

            lda #<A4                    // $D400 = $D6 (freq low)
            sta V1_FREQLO
            lda #>A4                    // $D401 = $1C (freq high)
            sta V1_FREQHI

            lda #$00                    // $D405 = $00: attack=0, decay=0
            sta V1_ATKDCY
            lda #$f0                    // $D406 = $F0: sustain=15, release=0
            sta V1_SUSREL

            lda #(WF_SAW | GATE)        // $D404 = $21: sawtooth + gate on
            sta V1_CTRL

loop:       jmp loop                    // hold the note forever (jmp *)
```

### What to expect

The envelope attacks in ~2 ms, decays in ~6 ms to the sustain level — which is full ($F), so it effectively snaps to peak and stays there because GATE remains 1. There is no release because the gate is never cleared. Reading the registers back, a verifier would find $D400=$D6, $D401=$1C, $D404=$21, $D405=$00, $D406=$F0, $D418=$0F.

**Pitfalls**
- **Volume = 0 means silence.** If $D418's low nibble is $00 you hear nothing no matter what the voices do. Set it to $0F first.
- **No waveform bit set = no sound.** The control register must have at least one of bits 4–7. Selecting two waveforms ANDs them (a trick, not a mix); selecting none silences the voice.
- **Forgetting the gate.** GATE ($01) in the control register is what starts the envelope. Without it the oscillator runs but the amplitude stays at zero.
- **Write-only registers don't read back on hardware.** Keep a RAM shadow of any voice/filter value you need to recompute; only $D419–$D41C are readable.
- **Re-gating doesn't cleanly reset the envelope (ADSR bug).** For repeated notes you need a hard restart; see [Appendix D](appendix-d-sid-registers.md) §D.7. A single one-shot note like this is unaffected.
- **Tuning differs by clock.** The $1CD6 value uses the 1.0 MHz reference; for exact PAL/NTSC tuning recompute `Fn` with the real clock via the `sidFreq` function.

**Go deeper:** MOS 6581 SID datasheet (Commodore, 10/82): https://6502.org/documents/datasheets/mos/mos_6581_sid.pdf — and the full register/bit reference in [Appendix D](appendix-d-sid-registers.md).

## 4.2 Oscillators & waveforms

**Objectives**
- Select each of the SID's four waveforms via the top nibble of the voice control register ($D404 for voice 1).
- Set a 12-bit pulse width for the pulse waveform and understand 50% duty = $0800.
- Understand combined waveforms (ANDed outputs) and why their timbre differs between 6581 and 8580.

### The oscillator and its control register

Each of SID's three voices has one oscillator. Its frequency is set by a 16-bit word `Fn` in the +0/+1 registers (voice 1: $D400 low, $D401 high), and its *shape* is chosen by the **top nibble** (bits 7–4) of the **control register** at +4 (voice 1: $D404, voice 2: $D40B, voice 3: $D412). Per [Appendix D](appendix-d-sid-registers.md) §D.2, the four waveform-select bits are:

| Bit | Mask | Waveform |
|-----|------|----------|
| 4 | $10 | TRIANGLE — soft, hollow, few harmonics |
| 5 | $20 | SAWTOOTH — bright, all harmonics |
| 6 | $40 | PULSE — buzzy; harmonic content set by the pulse width |
| 7 | $80 | NOISE — pseudo-random, for percussion/effects |

The **GATE** bit (bit 0, $01) starts the envelope's attack phase when set and starts release when cleared. So you usually OR a waveform mask with $01 to produce an audible note:

- triangle + gate = $11
- sawtooth + gate = $21
- pulse + gate = $41
- noise + gate = $81

Remember (Appendix D §D.2): the voice/control registers are **write-only**. If you need to re-read what you wrote, keep a RAM shadow. Also, **master volume at $D418 must be non-zero** or there is no sound at all — set its low nibble (VOL0–VOL3) to $0F for full volume.

### Frequency word

The oscillator frequency follows the formula from Appendix D §D.5:

```
Fout = (Fn * Fclk) / 16777216   Hz
```

For A4 = 440 Hz on the datasheet's 1.0 MHz reference clock, `Fn` = $1CD6 (Appendix D §D.6). We write the low byte to $D400 and the high byte to $D401.

### Pulse width — a 12-bit value

The pulse waveform is the only one whose timbre you control directly, through the **12-bit pulse width** `PWn` (Appendix D §D.2):

- $D402 — low byte (bits 7–0)
- $D403 — **high nibble only** (bits 3–0); bits 7–4 are unused

So the value is `PWn = (($D403 & $0F) << 8) | $D402`. The duty cycle is `PWout = PWn / 40.95 %`:

- $000 = 0% (constant DC — silent/clicks only)
- **$800 = 50% (a symmetric square wave)**
- $FFF ≈ 99.98%

For a 50% square wave write **$D402 = $00** and **$D403 = $08** (together making $800). Sweeping `PWn` over time gives the classic PWM "phasing" sound with no audible stepping, because 12 bits is fine-grained. Pulse width is ignored unless the pulse waveform is selected.

### Combined waveforms

Setting more than one waveform bit does **not** mix the waveforms — Appendix D §D.2 states the outputs are **logically ANDed**, a documented hardware trick that yields gritty, harmonically rich timbres (e.g. $D404 = $51 = triangle+pulse+gate). Two important caveats:

- The resulting spectra **differ between the 6581 and 8580** chips (Appendix D §D.7), so a tune relying on combined timbres is effectively tuned to one chip model.
- If **NOISE is combined** with another waveform, the noise generator can **lock up** and go silent until you reset it with the TEST bit ($08) or a chip reset. Avoid $80 with other waveform bits.

Selecting *no* waveform bits silences the voice.

### A complete, runnable pulse-wave program

This plays voice 1 as a 50% pulse wave at A4. It is assertable by reading back the SID register shadows / the exact bytes written below.

```asm
// 4.2 — Pulse wave at A4, 50% duty, full sustain
*=$0801
BasicUpstart2(start)

*=$0810
start:
        // --- Master volume: VOL = $0F, no filter routing ---
        lda #$0F
        sta $D418            // $D418 = $0F  (full volume)

        // --- Voice 1 frequency = A4 = $1CD6 (Appendix D §D.6) ---
        lda #$D6
        sta $D400            // $D400 = $D6  (Fn low)
        lda #$1C
        sta $D401            // $D401 = $1C  (Fn high)

        // --- Pulse width = $800 -> 50% duty (square) ---
        lda #$00
        sta $D402            // $D402 = $00  (PW low)
        lda #$08
        sta $D403            // $D403 = $08  (PW high nibble -> PWn = $800)

        // --- Envelope: attack=$0, decay=$0 / sustain=$F, release=$0 ---
        lda #$00
        sta $D405            // $D405 = $00  (attack/decay)
        lda #$F0
        sta $D406            // $D406 = $F0  (sustain=15, release=0)

        // --- Control: PULSE ($40) + GATE ($01) = $41 ---
        lda #$41
        sta $D404            // $D404 = $41  (pulse waveform, gate on)

loop:   jmp loop             // hold the note (envelope sits at sustain)
```

**Register values to assert** after this program runs:

| Register | Value | Meaning |
|----------|-------|---------|
| $D400 | $D6 | Fn low (A4) |
| $D401 | $1C | Fn high (A4) |
| $D402 | $00 | pulse width low |
| $D403 | $08 | pulse width high nibble → PWn = $800 (50%) |
| $D404 | $41 | pulse waveform + gate |
| $D405 | $00 | attack 0 / decay 0 |
| $D406 | $F0 | sustain 15 / release 0 |
| $D418 | $0F | master volume 15 |

To hear the other waveforms, change only $D404: triangle = $11, sawtooth = $21, noise = $81. (For triangle/sawtooth/noise the pulse-width registers have no effect, but writing them is harmless.) A combined triangle+pulse would be $51.

**Pitfalls**
- Forgetting $D418: with master volume = 0 the chip is silent even though every voice register is correct.
- Treating $D403 as a full byte: only its **low nibble** is significant; the duty cycle is the 12-bit value `(($D403 & $0F) << 8) | $D402`.
- Combining NOISE ($80) with another waveform bit — the noise oscillator can lock up and stay silent until TEST ($08) or reset.
- Assuming you can read $D404/$D402 back: voice registers are **write-only**; keep a RAM shadow if you need the value later.
- Expecting identical combined-waveform timbre on every machine — combined-waveform and filter behaviour differ between 6581 and 8580 (Appendix D §D.7).
- Selecting zero waveform bits (e.g. writing $01 alone) gates the envelope but produces no tone.

**Go deeper:** MOS 6581 SID datasheet — register descriptions and waveform/pulse-width details: https://6502.org/documents/datasheets/mos/mos_6581_sid.pdf — and [Appendix D](appendix-d-sid-registers.md).

## 4.3 ADSR envelopes & the hard-restart

**Objectives**
- Read and write the SID envelope registers $D405 (Attack/Decay) and $D406 (Sustain/Release) with confidence about which nibble does what.
- Understand how the GATE bit (control bit 0) drives the Attack -> Decay -> Sustain -> Release state machine.
- Know the 6581/8580 "ADSR bug" and implement the **hard-restart** that every serious player uses to make notes attack consistently.

### The envelope generator

Each SID voice has one envelope generator that scales the oscillator's amplitude over time. The shape is the classic four-stage **ADSR**, but SID packs the four parameters into just two write-only registers per voice. For voice 1 (add +$07 for voice 2, +$0E for voice 3):

- **$D405 (Attack / Decay)** — `value = (attack << 4) | decay`. The **high nibble** is the Attack rate (0-15); the **low nibble** is the Decay rate (0-15).
- **$D406 (Sustain / Release)** — `value = (sustain << 4) | release`. The **high nibble** is the Sustain *LEVEL* (0-15, linear; 0 = silence, 15 = peak — this is NOT a rate), and the **low nibble** is the Release rate (0-15).

The 16 rate steps map to fixed times (see [Appendix D §D.4](appendix-d-sid-registers.md)). Decay and Release share the same table and are exactly 3x the corresponding Attack time. A few useful points: rate $0 = 2 ms attack / 6 ms decay-release; $9 = 250 ms / 750 ms; $F = 8 s / 24 s.

### How GATE drives the stages

Bit 0 of the control register ($D404 for voice 1) is the **GATE**:

- **GATE 0 -> 1**: start **Attack** (rise 0 -> peak at the Attack rate), then **Decay** (fall peak -> Sustain level at the Decay rate), then **hold at Sustain** for as long as GATE stays 1.
- **GATE 1 -> 0**: start **Release** (fall from the current level -> 0 at the Release rate).

So a note's amplitude envelope is entirely controlled by *when* you flip the gate, independent of frequency or waveform selection. You select a waveform AND set the gate in the same write, e.g. `$D404 = $21` is sawtooth ($20) + gate ($01).

### The 6581/8580 ADSR bug

Here is the catch that bites everyone. Per [Appendix D §D.7](appendix-d-sid-registers.md): re-gating a voice does **not** reliably reset the envelope counter to zero. If you gate a new note while the previous envelope is still decaying or releasing, the envelope generator can be left in a stale or "stuck" state (the so-called ADSR bug / delay bug). The audible result is notes with inconsistent volume and ragged timing — sometimes a note barely sounds, sometimes its attack is wrong.

### The hard-restart fix

Every SID player works around this with a **hard restart**. The idea: a couple of frames *before* the new note, force the envelope down to a known zero state, then gate the real note.

1. **Restart frame(s)** (typically 2 frames before the note): clear GATE (so the envelope releases) and load a *fast* ADSR so it drains to zero quickly. A very common choice is `$D405 = $00` (attack $0, decay $0) and `$D406 = $F0` (sustain $F, release $0). With release rate $0 the envelope is pulled to zero in ~6 ms, well within one frame. (Some players additionally set the **TEST** bit, control bit 3 / $08, to lock the oscillator at zero during the restart; clearing it on the note frame.)
2. **Note frame**: write the real ADSR values, set the new frequency/waveform, and set GATE = 1.

This guarantees the envelope starts from zero every time, so attacks are uniform.

### Runnable example: raster-IRQ note retrigger with hard-restart

This program reuses the raster-IRQ recipe from Part II 2.3 (take over the IRQ vector at $0314/$0315, mask the CIA, enable raster IRQ via $D01A). A frame counter retriggers note A4 ($D400/$D401 = $1CD6, see [Appendix D §D.6](appendix-d-sid-registers.md)) every 50 frames. Two frames before each note it runs the hard restart; on the note frame it loads the real ADSR and gates a sawtooth.

Key SID values you can assert by reading back the shadow / writes:
- Master volume **$D418 = $0F** (max; sound is impossible with volume 0).
- Real envelope on the note frame: **$D405 = $19** (attack $1 = 8 ms, decay $9 = 750 ms) and **$D406 = $C8** (sustain level $C, release $8 = 300 ms).
- Hard-restart envelope: **$D405 = $00**, **$D406 = $F0**.
- Frequency: **$D400 = $D6**, **$D401 = $1C** (A4).
- Control on note frame: **$D404 = $21** (sawtooth + gate). On the restart frame: **$D404 = $20** (sawtooth, gate cleared).

```asm
            BasicUpstart2(main)

            *=$0810 "Main"        // BasicUpstart2 lands us here via SYS

// ---- SID register constants -------------------------------------------
.const SID      = $d400
.const FREQ_LO  = SID+0            // $D400
.const FREQ_HI  = SID+1            // $D401
.const CTRL     = SID+4            // $D404 control: waveform + gate
.const ATKDEC   = SID+5            // $D405 attack(hi)/decay(lo)
.const SUSREL   = SID+6            // $D406 sustain(hi)/release(lo)
.const VOLUME   = $d418            // $D418 mode/master volume

// ---- Note / envelope values (stated in prose, asserted on read-back) --
.const NOTE_LO   = $d6            // A4 = Fn $1CD6  (Appendix D §D.6)
.const NOTE_HI   = $1c
.const SAW       = $20            // sawtooth waveform select
.const GATE      = $01            // gate bit
.const REAL_AD   = $19            // attack $1 (8ms) / decay $9 (750ms)
.const REAL_SR   = $c8            // sustain $C / release $8 (300ms)
.const HR_AD     = $00            // hard-restart: fast attack/decay
.const HR_SR     = $f0            // hard-restart: sustain $F / release $0

.const PERIOD    = 50            // frames between notes (~1s on PAL)

// ---- zero-page work ----------------------------------------------------
.const frame = $fb               // frame counter within a period

main:
            sei

            // --- one-time SID setup ---
            lda #$0f
            sta VOLUME            // $D418 = $0F  (max volume)
            lda #NOTE_LO
            sta FREQ_LO           // $D400 = $D6
            lda #NOTE_HI
            sta FREQ_HI           // $D401 = $1C
            lda #REAL_AD
            sta ATKDEC            // $D405 = $19
            lda #REAL_SR
            sta SUSREL            // $D406 = $C8
            lda #SAW              // sawtooth selected, gate still 0
            sta CTRL              // $D404 = $20

            lda #0
            sta frame

            // --- install raster IRQ (Part II 2.3 recipe) ---
            lda #<irq
            sta $0314
            lda #>irq
            sta $0315

            lda #$7f
            sta $dc0d             // disable CIA timer IRQs
            lda $dc0d             // ack any pending CIA IRQ

            lda #$01
            sta $d01a             // enable raster interrupts

            lda #$00
            sta $d012             // trigger at raster line 0
            lda $d011
            and #$7f
            sta $d011             // clear raster-line MSB (lines 0-255)

            cli

loop:       jmp *                // everything happens in the IRQ

// ---- raster IRQ: one tick per frame -----------------------------------
irq:
            lda frame
            cmp #(PERIOD-2)
            beq hardRestart      // 2 frames before the note: drain envelope
            cmp #PERIOD
            beq playNote         // note frame: real ADSR + gate on
            jmp tick

hardRestart:
            lda #SAW             // keep waveform, clear GATE -> release
            sta CTRL             // $D404 = $20
            lda #HR_AD
            sta ATKDEC           // $D405 = $00
            lda #HR_SR
            sta SUSREL           // $D406 = $F0
            jmp tick

playNote:
            lda #REAL_AD
            sta ATKDEC           // $D405 = $19
            lda #REAL_SR
            sta SUSREL           // $D406 = $C8
            lda #(SAW | GATE)
            sta CTRL             // $D404 = $21 (sawtooth + gate)
            lda #0
            sta frame            // restart the period
            jmp ack

tick:
            inc frame

ack:
            lda #$01
            sta $d019            // acknowledge the raster IRQ
            jmp $ea31            // chain to KERNAL IRQ handler
```

The envelope therefore cycles: at frame 48 the gate drops and a fast-release ADSR drains the voice to zero ($D405=$00, $D406=$F0); at frame 50 the real ADSR is reloaded ($D405=$19, $D406=$C8) and the gate is set ($D404=$21), giving a clean, consistent attack every time.

**Pitfalls**
- $D406's high nibble is a *level*, not a rate — confusing it with a rate is the classic ADSR mistake.
- Sustain $0 means the note decays to silence and holds there; you will hear only the attack/decay "pluck".
- SID voice registers are **write-only** — you cannot read back $D404/$D405/$D406. Keep a RAM shadow if your code needs the current value.
- Skipping the hard restart gives notes with random volume/timing because of the ADSR bug — it is not optional in a real player.
- Hard-restarting too late (same frame as the note) leaves no time for the envelope to drain; do it 1-2 frames early.
- Volume $D418 = 0 produces no sound at all, regardless of the envelope.
- Setting the TEST bit ($08) during a restart locks the oscillator at zero — remember to clear it on the note frame or the voice stays silent.

**Go deeper**: MOS 6581 SID datasheet, envelope rates (Table 2) and Appendix B envelope examples — https://6502.org/documents/datasheets/mos/mos_6581_sid.pdf — and [Appendix D](appendix-d-sid-registers.md) (§D.2 envelope registers, §D.4 rate table, §D.7 ADSR/hard-restart caveat).

## 4.4 PWM, Ring Modulation & Hard Sync

**Objectives**

- Use the SID control register's waveform and modulation bits ($D404 etc.) to shape timbre, not just pitch.
- Implement classic pulse-width modulation (PWM) by sweeping the 12-bit pulse width $D402/$D403 once per frame.
- Understand how ring modulation (bit 2, $04) and hard sync (bit 1, $02) borrow the *previous* voice's oscillator as a modulation source.

So far you have set a frequency, picked one waveform, and let the ADSR run. The three tricks in this lesson all live in the **control register (+4 of each voice, $D404 / $D40B / $D412)** plus the **pulse-width registers (+2 / +3)**. They are what makes a SID lead sound "alive" instead of like a plain beep. See the control-register bit table in [Appendix D](appendix-d-sid-registers.md) §D.2.

### Pulse width and PWM

The pulse waveform is selected by control bit 6 ($40). Its duty cycle comes from the 12-bit value `PWn`: bits 3-0 of the high byte ($D403) plus the full low byte ($D402). Per [Appendix D](appendix-d-sid-registers.md), `PWout = (PWn / 40.95) %`, so $000 is a thin DC sliver, $800 is a perfect 50% square, and $FFF is ~99.98%. Bits 7-4 of $D403 are unused.

A *static* pulse value gives a fixed tone colour. The trick is to **modulate** the width: nudge `PWn` by a few units every frame so the duty cycle slowly oscillates. That continuous timbre shift is the fat, chorus-like PWM lead heard in countless C64 tunes. The 12-bit resolution is fine enough that the sweep has no audible stepping.

Because $D402/$D403 are write-only, you keep the current width in a 16-bit RAM shadow (`pw`), increment or decrement it each frame, and write the low byte and the low nibble of the high byte back to SID.

### Ring modulation (bit 2, $04)

With **TRIANGLE selected** ($10) and **RING MOD set** ($04), this voice's triangle output is ring-modulated by the *previous* oscillator instead of running freely. The pairing wraps around (Appendix D §D.2):

- Voice 1 ← Oscillator 3
- Voice 2 ← Oscillator 1
- Voice 3 ← Oscillator 2

So for a ring-mod tone on voice 1 you set voice 1 to triangle+ring ($D404 = $15) and you must give **voice 3 a non-zero frequency** ($D40E/$D40F) — its frequency alone is the modulator; no other voice-3 parameter matters, and you usually leave voice 3 ungated/silent. The result is the inharmonic, metallic, bell-like spectrum that ring mod is famous for. Sweeping either frequency creates clangorous gong sounds.

### Hard sync (bit 1, $02)

With **SYNC set** ($02), this oscillator's phase is hard-reset every time the *previous* oscillator completes a cycle. The same wrap-around pairing applies (voice 1 ← osc 3, etc.), and again the source oscillator just needs a non-zero frequency. For a synced sawtooth lead on voice 1 you would write $D404 = $23 (sawtooth $20 + sync $02 + gate $01) and set voice 3's frequency as the sync master. Detuning the two frequencies relative to each other gives the harsh, tearing, "ripping" lead sound. Sync and ring can both be combined with the gate bit ($01) like any other waveform.

### A complete PWM program

The program below plays a single gated pulse note on **voice 1** and sweeps its pulse width every frame from a raster IRQ (the IRQ takeover follows the pattern from Part II 2.3). Concrete, assertable register state:

- $D400/$D401 = $D6/$1C — frequency `Fn = $1CD6` (A4, 440 Hz, from Appendix D §D.6).
- $D404 = **$41** — PULSE ($40) + GATE ($01). This is the value that selects the modulated waveform and starts the envelope.
- $D405 = $00, $D406 = $F0 — attack 0, decay 0, sustain level 15, release 0 (a flat held tone so the note stays at full level for the whole demo).
- $D418 = **$0F** — filter off, master volume 15 (sound requires non-zero volume).
- $D402 / $D403 change over time. The shadow `pw` starts at $0400 and counts up to $0C00, then reverses, so $D402 (low byte) cycles continuously and $D403 (high nibble) ramps $4 → $C → $4. At any captured frame the low byte and high nibble of the live SID write equal the current `pw`.

```asm
//============================================================
// 4.4 PWM lead — sweep the 12-bit pulse width every frame
// KickAssembler v5.x
//============================================================
            BasicUpstart2(main)

            *=$0801 "Basic"        // (BasicUpstart2 emits the SYS stub here)

            *=$0810 "Main"

// --- SID register constants (see Appendix D §D.2) -----------
.const SID      = $d400
.const V1_FLO   = SID+0            // $D400 frequency low
.const V1_FHI   = SID+1            // $D401 frequency high
.const V1_PWLO  = SID+2            // $D402 pulse width low
.const V1_PWHI  = SID+3            // $D403 pulse width high nibble
.const V1_CTRL  = SID+4            // $D404 control register
.const V1_AD    = SID+5            // $D405 attack/decay
.const V1_SR    = SID+6            // $D406 sustain/release
.const SID_VOL  = $d418            // $D418 mode/volume

// Pulse-width sweep bounds (12-bit, $000..$FFF)
.const PW_MIN   = $0400
.const PW_MAX   = $0c00
.const PW_STEP  = $0010            // +/- per frame

main:
            sei

            // --- Program voice 1: A4 pulse note -------------
            lda #$d6
            sta V1_FLO            // $D400 = $D6  } Fn = $1CD6 (A4)
            lda #$1c
            sta V1_FHI            // $D401 = $1C  }

            lda #<PW_MIN
            sta pw               // shadow low
            sta V1_PWLO          // $D402 = $00
            lda #>PW_MIN
            sta pw+1             // shadow high
            sta V1_PWHI          // $D403 = $04

            lda #$00
            sta V1_AD            // $D405 = $00  (attack 0, decay 0)
            lda #$f0
            sta V1_SR            // $D406 = $F0  (sustain 15, release 0)

            lda #$0f
            sta SID_VOL          // $D418 = $0F  (volume 15)

            lda #$41
            sta V1_CTRL          // $D404 = $41  (PULSE + GATE) -> note starts

            // --- Take over the IRQ (cf. Part II 2.3) --------
            lda #$7f
            sta $dc0d            // disable CIA timer IRQs
            lda $dc0d            // ack any pending CIA IRQ

            lda #$01
            sta $d01a            // enable raster IRQ
            lda #$00
            sta $d012            // trigger on raster line 0
            lda $d011
            and #$7f
            sta $d011            // clear raster bit 8 (line < 256)

            lda #<irq
            sta $0314
            lda #>irq
            sta $0315            // vector $0314/$0315 -> irq

            asl $d019            // ack any pending raster IRQ
            cli

loop:       jmp loop             // everything happens in the IRQ

//------------------------------------------------------------
// Raster IRQ: bounce the pulse width once per frame
//------------------------------------------------------------
irq:
            // direction flag: 0 = up, 1 = down
            lda dir
            bne pwDown

pwUp:
            clc
            lda pw
            adc #<PW_STEP
            sta pw
            lda pw+1
            adc #>PW_STEP
            sta pw+1
            // if pw >= PW_MAX, switch to down
            lda pw+1
            cmp #>PW_MAX
            bcc writePW
            lda #$01
            sta dir
            jmp writePW

pwDown:
            sec
            lda pw
            sbc #<PW_STEP
            sta pw
            lda pw+1
            sbc #>PW_STEP
            sta pw+1
            // if pw <= PW_MIN, switch to up
            lda pw+1
            cmp #>PW_MIN
            bcs writePW
            lda #$00
            sta dir

writePW:
            lda pw
            sta V1_PWLO          // $D402 = current width low
            lda pw+1
            and #$0f             // only bits 3-0 are valid in $D403
            sta V1_PWHI          // $D403 = current width high nibble

            asl $d019            // ack raster IRQ
            jmp $ea31            // chain to KERNAL IRQ handler

//------------------------------------------------------------
// RAM shadows / state
//------------------------------------------------------------
pw:         .word $0000          // 16-bit current pulse width
dir:        .byte $00            // sweep direction
```

### How the headless check sees it

Audio is silent under verification, so the program is judged by the SID registers it wrote. After `main` runs you can assert the static setup: $D400=$D6, $D401=$1C, $D404=$41, $D405=$00, $D406=$F0, $D418=$0F. After letting the IRQ run for several frames, $D402 and $D403 hold different values than their initial $00/$04 — proof the width is sweeping. Because $D403 is masked with $0F, its high nibble is always zero, exactly as the 12-bit spec in [Appendix D](appendix-d-sid-registers.md) §D.2 requires.

To turn this into a ring-mod demo instead: change $D404 to $15 (TRIANGLE+RING+GATE) and give voice 3 a frequency (e.g. $D40E/$D40F = $1125 for C4) — drop the pulse-width sweep, since ring mod ignores pulse width. For hard sync, use $D404 = $23 (SAWTOOTH+SYNC+GATE) with a voice-3 frequency as the master.

**Pitfalls**

- $D402/$D403 only matter when the PULSE bit ($40) is set; on a triangle/saw/noise voice they do nothing.
- $D403 is a **nibble**: always mask the high byte with `#$0f` before storing, or bits 7-4 (unused) carry garbage and your width math drifts.
- All voice/filter registers are **write-only**. You cannot read $D402 back to advance the sweep; keep a RAM shadow (`pw`) and modulate that.
- Ring mod requires the **triangle** waveform selected *and* a non-zero frequency on the modulator (the previous voice's oscillator); with $00 frequency you get silence/no effect. Sync likewise needs a non-zero source oscillator.
- The modulation source is always the **previous** voice and wraps (voice 1 ← osc 3). It is the oscillator's *frequency* that matters; you do not gate or hear the source voice.
- Selecting two waveform bits at once ANDs them (a trick), and selecting none silences the voice; don't accidentally clear $40 while writing the sync/ring bits.

**Go deeper** — MOS 6581 SID datasheet (control-register and waveform/sync/ring descriptions): https://6502.org/documents/datasheets/mos/mos_6581_sid.pdf and [Appendix D](appendix-d-sid-registers.md).

## 4.5 The filter

**Objectives**
- Understand SID's single multimode filter, shared by all three voices and the external input.
- Set the 11-bit cutoff ($D415/$D416) and the resonance/routing byte ($D417), then pick a mode in $D418.
- Build a complete program that plays a sawtooth through a low-pass filter and sweeps the cutoff from an IRQ.

### One filter for the whole chip

A common surprise: SID does **not** have a filter per voice. It has exactly **one** analog multimode filter. Each voice (and the external audio input on pin 26) can be individually *routed into* that filter or sent straight to the output, but every routed signal passes through the same cutoff/resonance/mode settings. You cannot give voice 1 a low-pass and voice 2 a high-pass at the same time — they share one filter.

Wiring up the filter is a three-step recipe:

1. **Set the cutoff frequency** in $D415/$D416.
2. **Route the voices you want filtered** by setting their bits in the low nibble of $D417 (this byte's high nibble is resonance).
3. **Select a filter mode** (LP/BP/HP) and the master volume in $D418.

A voice whose bit is *not* set in $D417 bypasses the filter entirely, regardless of what mode $D418 selects.

### Cutoff: 11 bits across two registers ($D415 / $D416)

The cutoff/centre frequency is an 11-bit value `FC` ($000–$7FF). It is split awkwardly:

- **$D415** (cutoff LOW): only **bits 2–0** are used (`FC2–FC0`); bits 7–3 are ignored.
- **$D416** (cutoff HIGH): all 8 bits (`FC10–FC3`).

So `FC = ($D416 << 3) | ($D415 & 7)`. The cutoff rises roughly linearly with `FC`, spanning about **30 Hz to 12 kHz** (~9 octaves). Because the 8 high bits dominate, most programs simply write $D416 and leave $D415 at $00 — that already gives you 256 steps across the whole range, which is plenty for a sweep. The exact cutoff-vs-`FC` curve differs sharply between the 6581 and 8580 (Appendix D.7), so treat cutoff numbers as approximate, not absolute Hz.

### Resonance and routing ($D417)

This one byte packs two unrelated things:

| Bits | Mask | Meaning |
|------|------|---------|
| 7–4 | $F0 | Resonance 0–15 (0 = none, 15 = max peak at cutoff) |
| 3 | $08 | Filt EX — route external input |
| 2 | $04 | Filt 3 — route voice 3 |
| 1 | $02 | Filt 2 — route voice 2 |
| 0 | $01 | Filt 1 — route voice 1 |

Resonance boosts frequencies right around the cutoff, giving the classic "wah"/"sweep" emphasis. To route **voice 1** through the filter with resonance level 8, you write `(8 << 4) | $01 = $81` to $D417.

### Mode and master volume ($D418)

| Bit | Mask | Meaning |
|-----|------|---------|
| 7 | $80 | 3 OFF — disconnect voice 3 from the direct output |
| 6 | $40 | HP — high-pass enable (12 dB/oct) |
| 5 | $20 | BP — band-pass enable (6 dB/oct) |
| 4 | $10 | LP — low-pass enable (12 dB/oct) |
| 3–0 | $0F | Master volume 0–15 |

The mode bits are **additive**: setting LP+HP together ($50) gives a notch (band-reject) response. Master volume must be **non-zero** or there is no sound at all. A low-pass at full volume is therefore `$10 | $0F = $1F` in $D418. (A low-pass at half volume would be `$10 | $07 = $17`.)

Note the asymmetry: `3 OFF` (bit 7) only removes voice 3 from the *direct* path. If voice 3's bit is also set in $D417, it still reaches the output through the filter.

### Worked example: sawtooth through a low-pass

The program below plays a sustained sawtooth on voice 1 and routes it through the low-pass filter. The concrete register writes, all assertable by reading back the shadow values the code wrote, are:

- **$D404 = $21** — voice 1 control: sawtooth ($20) + gate ($01).
- **$D417 = $81** — resonance 8 (high nibble) + Filt 1 (bit 0) routing voice 1 into the filter.
- **$D415 = $00** — cutoff low bits unused, left at zero.
- **$D416 = $40** — cutoff high byte, so `FC = $40 << 3 = $200` (about the middle of the range before the sweep starts).
- **$D418 = $1F** — low-pass mode (bit 4) + master volume 15.

```asm
// 4.5 - sawtooth through the SID low-pass filter (static cutoff)
*=$0801
BasicUpstart2(start)

*=$0810

.const SID    = $d400
.const FREQLO = SID+0       // $d400 voice1 frequency low
.const FREQHI = SID+1       // $d401 voice1 frequency high
.const CTRL   = SID+4       // $d404 voice1 control
.const AD     = SID+5       // $d405 voice1 attack/decay
.const SR     = SID+6       // $d406 voice1 sustain/release
.const FCLO   = SID+21      // $d415 cutoff low (bits 2-0)
.const FCHI   = SID+22      // $d416 cutoff high (bits 10-3)
.const RESRT  = SID+23      // $d417 resonance + routing
.const MODVOL = SID+24      // $d418 mode + master volume

start:
        // --- voice 1: A4 = 440 Hz, Fn = $1cd6 (Appendix D.6) ---
        lda #$d6
        sta FREQLO
        lda #$1c
        sta FREQHI

        // ADSR: attack $0, decay $0, sustain $f (full), release $0
        lda #$00
        sta AD              // $d405 = $00
        lda #$f0
        sta SR              // $d406 = $f0

        // --- filter setup ---
        lda #$00
        sta FCLO            // $d415 = $00 (low cutoff bits unused)
        lda #$40
        sta FCHI            // $d416 = $40  -> FC = $200

        lda #$81
        sta RESRT           // $d417 = $81  (resonance 8 + Filt 1)

        lda #$1f
        sta MODVOL          // $d418 = $1f  (low-pass + volume 15)

        // --- start the note: sawtooth + gate ---
        lda #$21
        sta CTRL            // $d404 = $21  (sawtooth + gate)

loop:   jmp *               // hold the note forever
```

### Sweeping the cutoff from an IRQ

A static cutoff is dull. The musical payoff of the filter is *movement* — a slow cutoff sweep is the signature C64 "filter sweep" sound. We take over the IRQ exactly as in Part II 2.3 (mask out CIA timer IRQs, point $0314/$0315 at our handler, enable the raster IRQ) and, once per frame, walk the cutoff high byte $D416 up and down between two limits. We keep a RAM shadow of the cutoff because $D416 is write-only and cannot be read back.

In this version the filter setup uses the same routing and mode bytes — **$D417 = $81**, **$D418 = $1F**, **$D415 = $00** — but **$D416** is no longer fixed; the handler animates it between $08 and $78, so any read-back asserts on the shadow byte `cutoff` plus the constant registers.

```asm
// 4.5 - sawtooth with an IRQ-driven low-pass cutoff sweep
*=$0801
BasicUpstart2(start)

*=$0900

.const SID    = $d400
.const FREQLO = SID+0
.const FREQHI = SID+1
.const CTRL   = SID+4
.const AD     = SID+5
.const SR     = SID+6
.const FCLO   = SID+21       // $d415
.const FCHI   = SID+22       // $d416
.const RESRT  = SID+23       // $d417
.const MODVOL = SID+24       // $d418

.const CUTMIN = $08          // sweep low limit  (FC = $40)
.const CUTMAX = $78          // sweep high limit (FC = $3c0)

start:
        sei

        // voice 1: A4 = 440 Hz, Fn = $1cd6
        lda #$d6
        sta FREQLO
        lda #$1c
        sta FREQHI

        lda #$00
        sta AD               // $d405 = $00
        lda #$f0
        sta SR               // $d406 = $f0 (full sustain)

        // filter: low-pass, voice 1 routed, resonance 8
        lda #$00
        sta FCLO             // $d415 = $00
        lda #CUTMIN
        sta FCHI             // $d416 starts at $08
        sta cutoff           // shadow copy of the cutoff high byte
        lda #$81
        sta RESRT            // $d417 = $81
        lda #$1f
        sta MODVOL           // $d418 = $1f

        // gate the note: sawtooth + gate
        lda #$21
        sta CTRL             // $d404 = $21

        // --- take over the IRQ (Part II 2.3 pattern) ---
        lda #$7f
        sta $dc0d            // disable CIA #1 interrupts
        lda $dc0d            // ack any pending CIA IRQ

        lda #<irq
        sta $0314
        lda #>irq
        sta $0315

        lda #$01
        sta $d01a            // enable raster IRQ
        lda #$00
        sta $d012            // trigger on raster line 0
        lda $d011
        and #$7f             // clear high bit of raster compare
        sta $d011

        asl $d019            // ack any pending raster IRQ
        cli

loop:   jmp *

// ---------------------------------------------------------------
irq:
        asl $d019            // ack the raster IRQ

        // move the cutoff one step in the current direction
        lda dir
        bne up

        // sweeping down
        dec cutoff
        lda cutoff
        cmp #CUTMIN
        bne store
        lda #$01
        sta dir              // hit bottom -> reverse to up
        jmp store

up:
        inc cutoff
        lda cutoff
        cmp #CUTMAX
        bne store
        lda #$00
        sta dir              // hit top -> reverse to down

store:
        lda cutoff
        sta FCHI             // write the swept cutoff to $d416

        jmp $ea31            // chain to the KERNAL IRQ handler

// ---------------------------------------------------------------
cutoff: .byte CUTMIN         // RAM shadow of $d416 (write-only)
dir:    .byte $01            // 0 = sweeping down, 1 = sweeping up
```

As the cutoff climbs, more of the sawtooth's harmonics pass through and the tone brightens; as it falls, the sound darkens. The resonance (high nibble of $D417) emphasises whatever band the cutoff is currently sitting on, which is what makes the sweep "sing".

**Pitfalls**
- **One filter, shared.** All routed voices get the same cutoff, resonance and mode. You can't have two different filter modes simultaneously.
- **A voice must be routed.** Selecting LP/BP/HP in $D418 does nothing to a voice whose bit is clear in $D417 — that voice bypasses the filter.
- **Volume must be non-zero.** With the low nibble of $D418 at 0 there is no output at all, filtered or not.
- **$D415 only uses bits 2–0.** The other 5 bits are ignored; the coarse cutoff lives in $D416.
- **Filter registers are write-only.** Keep a RAM shadow of any cutoff/resonance value you intend to modify incrementally (as the sweep does with `cutoff`).
- **Mode bits are additive.** LP+HP ($50) makes a notch, not a louder low-pass; set exactly the bit(s) you mean.
- **6581 vs 8580.** Cutoff calibration and resonance strength differ markedly between chip revisions, so the same `FC` sounds different on different machines.

**Go deeper:** MOS 6581 SID datasheet (https://6502.org/documents/datasheets/mos/mos_6581_sid.pdf) and [Appendix D](appendix-d-sid-registers.md).

## 4.6 Anatomy of a music player

**Objectives**

- Understand the universal two-call shape of a C64 music player: a one-shot **INIT** and a once-per-frame **PLAY**, and why PLAY is driven from the raster IRQ.
- Learn the standard data model — order-list of **patterns**, patterns made of **rows** (note / instrument / effect), and **instruments** that supply waveform + ADSR over time.
- Internalise two discipline rules: keep all SID writes inside the IRQ, keep game logic in the main loop, and use **shadow registers** for any state you must read back.
- Build and run a minimal-but-real one-voice player that steps through a note table every N frames and loops a short melody.

### Why every player has exactly two entry points

Whether it is a 200-byte demo routine or a full GoatTracker replayer, a C64 music player exposes the same two routines, and almost always at fixed addresses:

- **`init`** — called **once**, before the music starts. It clears SID, selects which subtune to play, and resets all the player's RAM counters (current order position, current row, tick counter, per-voice state). It writes nothing time-critical; it just establishes a known starting state.
- **`play`** — called **exactly once per frame** (every video frame, 50 Hz on PAL / 60 Hz on NTSC). One call advances the song by one **tick**. On most ticks it does almost nothing; on a tick that lands on a new row it loads that row's note/instrument/effect and writes the relevant SID registers.

The cadence of `play` *is* the tempo. Because it is called once per frame, "one tick = one frame" is the natural time unit, and a player measures note length in ticks (e.g. "6 ticks per row" = a row every 6 frames).

### Why PLAY runs in the raster IRQ

`play` must be called at a steady 50/60 Hz with no jitter, or the music wobbles. The reliable way to get a once-per-frame heartbeat is a **raster interrupt** (Part II 2.3): the VIC raises an IRQ when the beam reaches a chosen scanline, your handler runs `play`, acknowledges the IRQ, and returns. This decouples the music from whatever the main program is doing — the melody keeps perfect time even while the main loop is busy.

The two hard rules that follow from this:

1. **All SID writes belong in the IRQ (in `play`).** If the main loop also poked SID, the two would race and you would get torn writes — half of a frequency word from one, half from the other.
2. **Game logic stays in the main loop.** The IRQ should be short and predictable. The main loop reads input, moves sprites, decides *what* should happen; `play` only emits sound for the current tick.

### Shadow registers

The SID voice and filter registers are **write-only** (Appendix D §intro): writing `$D404` does not let you read it back. So if your code needs to know "what waveform bits are currently set" — for example to set GATE without disturbing the waveform selection — you must keep a copy in RAM, called a **shadow register**. The player updates the shadow, then copies the shadow to SID. Real replayers shadow the whole voice block per voice; our minimal player shadows just the voice-1 control byte so it can re-gate cleanly.

### The data model: patterns, order-list, instruments

A tracker tune is built from three layers, from the bottom up:

- **Instrument** — defines *timbre over time*: the waveform to use, the ADSR envelope, and any per-frame pulse-width or filter program. One instrument can be reused by many notes.
- **Pattern** — a fixed-length table of **rows**. Each row, per voice, holds up to three things: a **note** (which pitch, or "no change" / "key-off"), an **instrument** number, and an **effect** (slide, vibrato, volume, tempo change...). The pattern is the actual sequence of musical events.
- **Order-list (song)** — a list of pattern numbers giving the playback order, e.g. `[0,1,1,2,1,1,3]`, usually ending in a loop point. This lets you reuse a chorus pattern many times without duplicating its data.

`play`'s job each tick is therefore: count ticks; when a row boundary is reached, look up the current order entry → pattern → row, read note/instrument/effect, apply the instrument's waveform+ADSR, write the note frequency, and gate the voice. Effects are then re-applied every tick (vibrato and slides need per-frame updates).

### A minimal real player

The program below is a complete, runnable player for **one voice**. To stay assertable it collapses the data model: the "order-list/pattern/rows" become a single flat `noteTable` of pitches, the "instrument" is a fixed waveform + ADSR, and "ticks per row" is a frame divider `STEP`. It is still structured exactly like a real player — a one-shot `init`, a once-per-frame `play` driven by the raster IRQ, and a shadow register for the control byte.

Stable register values you can assert at any time after `init` (these never change while the tune plays):

- **Master volume `$D418` = `$0F`** (volume 15, no filter routed).
- **Attack/Decay `$D405` = `$09`** — attack `$0` (2 ms), decay `$9` (750 ms peak→sustain). This is the instrument's ADSR and is written once in `init`.
- **Sustain/Release `$D406` = `$F4`** — sustain level `$F` (15/15, full), release `$4` (114 ms).
- **Control register `$D404`**: waveform is **sawtooth (`$20`)** the entire time. GATE (bit 0) is the only changing bit — `$21` (sawtooth+gate) on a new-note frame, briefly `$20` (gate cleared) on the frame the note is re-triggered. So `$D404 & $20` is always set, and `$D404 & $80/$40/$10` (noise/pulse/triangle) are always clear.

Registers that **do** change over time:

- **Frequency `$D400`/`$D401`** — rewritten to the next table entry every `STEP` frames; cycles through the melody.
- **`$D404` bit 0 (GATE)** toggles per note to re-trigger the envelope.

```asm
//============================================================
// 4.6  Minimal one-voice music player (KickAssembler v5.x)
//      init once; play once per frame from a raster IRQ.
//      Sawtooth, fixed ADSR, melody loops every few seconds.
//============================================================
.const SID      = $d400
.const FREQ_LO  = SID+0      // $D400
.const FREQ_HI  = SID+1      // $D401
.const CTRL     = SID+4      // $D404  waveform + gate
.const AD       = SID+5      // $D405  attack/decay
.const SR       = SID+6      // $D406  sustain/release
.const VOLUME   = SID+$18    // $D418

.const RASTERLINE = $80      // any visible line; stable per-frame tick
.const STEP       = 12       // frames per note (≈0.24 s @ PAL)
.const SAW        = $20      // sawtooth waveform bit
.const GATE       = $01      // gate bit
.const noteCount  = 8        // entries in the note table

BasicUpstart2(main)          // owns $0801; SYS into main

*=$0810
main:
        jsr init
        cli                  // allow IRQs
loop:   jmp loop             // game logic would live here

//------------------------------------------------------------
// init: called ONCE. Clear SID, set instrument, install IRQ.
//------------------------------------------------------------
init:
        sei
        // --- clear all 25 SID registers to a known state ---
        lda #0
        ldx #$18
!clr:   sta SID,x
        dex
        bpl !clr-

        // --- instrument: ADSR (written once, stays stable) ---
        lda #$09             // attack $0 (2ms), decay $9
        sta AD               // $D405 = $09
        lda #$f4             // sustain $F (full), release $4
        sta SR               // $D406 = $F4

        // --- master volume (stable) ---
        lda #$0f
        sta VOLUME           // $D418 = $0F

        // --- shadow the control byte: sawtooth, gate off ---
        lda #SAW
        sta ctrlShadow
        sta CTRL             // $D404 = $20

        // --- reset player state ---
        lda #0
        sta noteIndex
        lda #1               // force a note on the very first play
        sta frameCount

        // --- raster IRQ setup (Part II 2.3 recipe) ---
        lda #<irq
        sta $0314
        lda #>irq
        sta $0315
        lda #$7f             // disable CIA timer IRQs
        sta $dc0d
        lda $dc0d            // ack any pending CIA IRQ
        lda #$01             // enable raster IRQ source
        sta $d01a
        lda #RASTERLINE
        sta $d012
        lda $d011            // clear bit 7 (raster line high bit = 0)
        and #$7f
        sta $d011
        asl $d019            // ack any pending raster IRQ
        rts

//------------------------------------------------------------
// irq: raster handler. Runs once per frame, calls play.
//------------------------------------------------------------
irq:
        asl $d019            // acknowledge raster IRQ
        jsr play
        jmp $ea31            // chain to KERNAL IRQ handler

//------------------------------------------------------------
// play: ONE tick. Most frames: re-gate housekeeping only.
//       Every STEP frames: load next note, re-trigger voice.
//------------------------------------------------------------
play:
        dec frameCount
        bne playDone         // not a new-note frame yet

        // --- new-note frame: reload divider ---
        lda #STEP
        sta frameCount

        // --- gate OFF first (re-trigger the envelope) ---
        lda ctrlShadow
        and #(255-GATE)      // clear gate bit -> $20
        sta CTRL             // $D404 = $20 (saw, gate low)

        // --- fetch this note's 16-bit frequency ---
        ldx noteIndex
        lda noteTableLo,x
        sta FREQ_LO          // $D400 (changes per step)
        lda noteTableHi,x
        sta FREQ_HI          // $D401 (changes per step)

        // --- gate ON: start attack/decay/sustain ---
        lda ctrlShadow
        ora #GATE            // set gate -> $21
        sta CTRL             // $D404 = $21 (saw + gate)

        // --- advance to next note, wrap at end of table ---
        inx
        cpx #noteCount
        bne saveIdx
        ldx #0
saveIdx:
        stx noteIndex
playDone:
        rts

//------------------------------------------------------------
// Player state (RAM shadows / counters)
//------------------------------------------------------------
ctrlShadow: .byte 0          // RAM copy of write-only $D404
noteIndex:  .byte 0          // current position in noteTable
frameCount: .byte 0          // frames left until next note

//------------------------------------------------------------
// "Song" data: a flat note table (the collapsed pattern).
// Fn values from Appendix D §D.6 (1.0MHz reference, octave 4/5).
//------------------------------------------------------------
// Fn values as a KickAssembler list so we can split lo/hi bytes.
//        C4     E4     G4     C5     E5     C5     G4     E4
.var notesFn = List().add($1125,$159a,$19b1,$224b,$2b34,$224b,$19b1,$159a)
noteTableLo:
        .fill noteCount, <notesFn.get(i)
noteTableHi:
        .fill noteCount, >notesFn.get(i)
```

#### Walking through it

- **`init` runs once.** It zeroes SID, programs the instrument (`$D405=$09`, `$D406=$F4`), sets volume (`$D418=$0F`), seeds the shadow control byte to sawtooth, and installs the raster IRQ exactly per the Part II 2.3 recipe (`$0314/$0315` vector, disable CIA via `$DC0D`, enable raster via `$D01A`, select line via `$D012`, ack via `$D019`).
- **`play` runs once per frame** from `irq`. It is a textbook tick: decrement the frame divider; on most frames it returns immediately (cheap). Every `STEP` frames it does the "new row" work — clear gate, write the new frequency, set gate, advance the index with wraparound.
- **Shadow register in action:** `play` never reads `$D404`; it reads `ctrlShadow`, masks the gate bit, and writes the result back to SID. That keeps the sawtooth selection intact across re-gates without ever reading a write-only register.
- The main loop is empty here, but the design is the point: you could put sprite movement, input handling, and scrolling there and the music timing would not change, because the beat lives in the IRQ.

### Scaling this up to a real player

To grow this stand-in into a full replayer you add layers without changing the shape:

- Replace `noteTable` with a **pattern** structure (rows of note+instrument+effect) and add an **order-list** that `play` walks to choose the current pattern.
- Replace the fixed ADSR with an **instrument table** indexed by the row's instrument number; on a new note, copy that instrument's waveform/ADSR (and start its pulse/filter program).
- Add an **effects step** that runs every tick (not just on row boundaries) for vibrato, slides, and arpeggio.
- Add a **hard restart** (Appendix D §D.7): a couple of ticks before a new note, force a fast release (`$D405=$00`, `$D406=$Fx`, GATE=0) so the envelope drains to a known zero before re-gating — otherwise the ADSR delay bug gives inconsistent note volumes. A real GoatTracker export does this for you; the integration is simply `jsr music_init` once and `jsr music_play` from the IRQ, exactly where we call `init`/`play` above. (GoatTracker is not installed in this environment, so the example uses the assemblable stand-in instead of a real `.sid`/`.bin` export.)

**Pitfalls**

- **Calling `play` more or less than once per frame.** Two calls per frame doubles the tempo; a missed frame stutters. Drive it from a single, stable raster line and keep the handler short.
- **Writing SID from the main loop *and* the IRQ.** They race and tear multi-byte writes (frequency, pulse). Funnel every SID write through `play`.
- **Reading back a write-only register.** `$D400–$D414` and `$D418` cannot be read; mirror anything you need to re-read in a shadow byte.
- **Volume left at zero.** `$D418`'s low nibble must be non-zero or there is no sound at all, regardless of correct ADSR and waveform.
- **Selecting no waveform (or noise + another).** A control byte with all waveform bits clear is silent; combining NOISE with another waveform can lock the noise generator (Appendix D §D.2).
- **Skipping the hard restart in a bigger player.** Re-gating without draining the envelope triggers the ADSR delay bug and uneven note attacks (Appendix D §D.7).
- **Not acknowledging the raster IRQ (`asl $d019`)** — the handler re-fires immediately and the machine appears to hang.

**Go deeper:** MOS 6581 SID datasheet (register map, envelope rates, frequency formula) — https://6502.org/documents/datasheets/mos/mos_6581_sid.pdf — and Codebase64 "SID — Sound & Music" (replayer structure, hard restart) — https://codebase64.c64.org/doku.php?id=base:sid_programming. Full register reference: [Appendix D](appendix-d-sid-registers.md).

## 4.7 Composing with GoatTracker & integrating the export

**Objectives**
- Understand what GoatTracker 2 is and where it sits in a C64 music workflow.
- Learn the standard *player export contract*: a base address with three conventional entry points (init at base+0, play at base+3, optional stop).
- Integrate an exported player into a KickAssembler project with `.import binary`, `jsr music_init` at startup, and `jsr music_play` from a raster IRQ.
- Build and run a complete program using a drop-in stand-in player that honours the same contract, with assertable SID register values.

### What GoatTracker 2 is

GoatTracker 2 is the de-facto cross-platform tracker for composing SID music. It runs on Linux, macOS and Windows, emulates **both** the 6581 and 8580 (so you can hear the chip-dependent filter and combined-waveform differences from [Appendix D](appendix-d-sid-registers.md) §D.7 before committing), and lets you build a song from *instruments*, *patterns*, *tables* (wave/pulse/filter program tables) and an *orderlist* per voice. It exports two things you care about:

1. A standalone **`.sid` file** (a PSID/RSID container, for playing in SID players or contributing to the High Voltage SID Collection).
2. A **relocatable player + song data** (binary, or assembly source) that you link into your own program. This is what a demo or game actually ships.

> **Honesty note:** GoatTracker is **not installed in this environment**, so this lesson cannot ship a real exported tune. Everything below shows the exact integration code you would use, and then wires it to a minimal **inline stand-in player** that exposes the identical `music_init` / `music_play` contract so the example assembles and runs and can be verified by reading SID registers. The two clearly marked lines (the `.import` and the base address) are the only things you swap to use a real export.

### The integration contract

By long-standing convention (GoatTracker, and most C64 players follow it), a *relocated* player binary is a single blob loaded at a chosen **base address** with a fixed jump table at the very start:

| Offset from base | Entry | When you call it | A register |
|---|---|---|---|
| base + 0 | **init** | once, at startup | subtune number (0 = first) |
| base + 3 | **play** | once per frame, from your IRQ | — |
| base + 6 | **stop** (sometimes present) | to silence the tune | — |

Those `+0 / +3 / +6` offsets exist because the player begins with three `JMP` instructions (each 3 bytes). You call the *addresses*, not the internal routines, so the player can be relocated freely.

GoatTracker's relocator (`gt2reloc`) asks you for the load/base address and emits the data already assembled to live there. You then either:

- **Link the binary**: drop it at that fixed address with `.import binary`, and define `music_init = base` / `music_play = base + 3`, or
- **Include the exported assembly source** and call its published labels.

### Importing the binary in KickAssembler

The canonical pattern places the player at a known base (here `$1000`) and imports the relocated binary there:

```asm
// ---- REAL GOATTRACKER EXPORT WOULD LOOK LIKE THIS ----
.const music_base = $1000
* = music_base "Music"
        .import binary "music.bin"      // <-- relocated to $1000 by gt2reloc

.const music_init = music_base + 0      // call once, subtune in A
.const music_play = music_base + 3      // call once per frame
.const music_stop = music_base + 6      // if your export provides it
```

That is the whole linkage: the `.import binary` line and the base-address constant are the *only* GoatTracker-specific pieces. The startup and IRQ code never change.

> **.sid header offset detail.** If all you have is the `.sid` file (not a relocated binary), you cannot `.import` it directly into your code path — a PSID file begins with a header (the data offset is stored as a 16-bit big-endian word at byte offset **$06** of the file; classic PSIDv2 headers are **$7C** bytes, so the C64 load image starts there, and the next two bytes are the C64 load address). The header also carries the init and play addresses (big-endian words at offsets **$0A** and **$0C**). For embedding in your own program, always export the **relocatable player**, not the `.sid`; reserve `.sid` for SID players and HVSC submissions.

### Complete runnable program (stand-in player)

This program is the real integration skeleton. The `* = $1000 "Music"` segment is where the `.import binary "music.bin"` line would go for a real tune; instead it contains a tiny table-driven player (the idea from 4.6) that exposes `music_init` at base+0 and `music_play` at base+3. It plays a 4-note arpeggio (C4, E4, G4, C5) on voice 1 with a triangle waveform.

```asm
// 4.7 - GoatTracker integration pattern (stand-in player)
BasicUpstart2(start)

* = $0810 "Main"

start:
        sei
        lda #$7f
        sta $dc0d           // disable CIA-1 timer IRQs
        lda $dc0d           // ack any pending CIA IRQ

        lda #<irq
        sta $0314
        lda #>irq
        sta $0315

        lda #$01
        sta $d01a           // enable raster IRQ source
        lda #$00
        sta $d012           // compare on raster line 0
        lda $d011
        and #$7f            // clear high bit of raster compare
        sta $d011

        lda #$00            // subtune 0
        jsr music_init      // CONTRACT: init, subtune number in A

        cli
loop:   jmp loop

irq:
        lda #$01
        sta $d019           // ack raster IRQ
        jsr music_play      // CONTRACT: play once per frame
        jmp $ea31           // chain to KERNAL IRQ handler

// ============================================================
//  STAND-IN PLAYER  -- replace this whole segment with:
//      * = $1000 "Music"
//      .import binary "music.bin"
//  (a real GoatTracker relocated export at $1000)
//
//  Same contract: music_init = base+0, music_play = base+3
// ============================================================
* = $1000 "Music"
music_init:                 // base+0  (a JMP table, like real players)
        jmp init_impl
music_play:                 // base+3
        jmp play_impl

init_impl:
        lda #$0f
        sta $d418           // master volume = 15, no filter mode
        lda #$00
        sta $d405           // V1 attack=0, decay=0
        lda #$f9
        sta $d406           // V1 sustain=15, release=9
        lda #$00
        sta tick
        sta idx
        rts

play_impl:
        dec tick
        bpl done
        lda #$0b            // ~12 frames between notes
        sta tick

        ldx idx
        lda freqlo,x
        sta $d400
        lda freqhi,x
        sta $d401

        lda #$10            // triangle, GATE off (release previous)
        sta $d404
        lda #$11            // triangle + GATE on (start new note)
        sta $d404

        inx
        cpx #$04
        bne nowrap
        ldx #$00
nowrap: stx idx
done:   rts

tick:   .byte 0
idx:    .byte 0
// C4, E4, G4, C5 (1 MHz reference values, Appendix D §D.6)
freqlo: .byte $25,$9a,$b1,$4b
freqhi: .byte $11,$15,$19,$22
```

This assembles cleanly with KickAssembler v5.x and runs to an infinite loop driven by the raster IRQ.

### What to assert (register read-back)

Audio is silent under headless verification, so the program is checked by reading SID registers (recall from [Appendix D](appendix-d-sid-registers.md) that voice registers are write-only on real hardware, but an emulator exposes the last written value). After `music_init` runs, these are **stable** for the life of the program:

- **$D418 = $0F** — master volume 15, no filter mode bits set. Must be non-zero for any sound.
- **$D405 = $00** — voice 1 attack=0, decay=0.
- **$D406 = $F9** — voice 1 sustain=15, release=9.

These **change over time** (per the note tick, every ~12 frames):

- **$D404** (voice 1 control): cycles between **$10** (triangle, gate off) and settles at **$11** (triangle + gate on, bit 0 set) after each note trigger. A stable mid-note sample reads **$11**.
- **$D400 / $D401** (voice 1 frequency lo/hi): step through the arpeggio pairs `$1125, $159A, $19B1, $224B` — i.e. C4, E4, G4, C5.

A safe assertion strategy: let several frames elapse, then check the stable trio ($D418/$D405/$D406) exactly, and check that $D401 holds one of `{$11,$15,$19,$22}` and $D404 has bit 0 (gate) set.

### Workflow recap

1. Compose in GoatTracker 2 (instruments, patterns, orderlist); audition on 6581 *and* 8580.
2. Save the `.sng`; export a `.sid` for players/HVSC.
3. Run the packer/relocator (`gt2reloc`) to produce a binary relocated to your chosen base.
4. `.import binary` it at that base; define `music_init = base`, `music_play = base + 3`.
5. `jsr music_init` once (subtune in A); `jsr music_play` once per frame in the raster IRQ.

**Pitfalls**
- **Wrong base address.** A relocated binary is *position-dependent*. If you `.import` it somewhere other than the address it was relocated to, all its internal pointers break and it crashes or plays garbage. The `.import` base and the relocator's base must match exactly.
- **Calling play more than once per frame** (or from both the IRQ and main loop) doubles the tempo and corrupts effect timing. Call it exactly once per frame, from one place.
- **Skipping `music_init`** (or passing a non-existent subtune in A) leaves the player's RAM state uninitialised — silence or noise. Always init before the first `play`, with A set to a valid subtune.
- **Trying to `.import` a `.sid` file into your code path.** The PSID header (data offset at file byte $06; classic header $7C bytes) means the raw bytes are not a loadable C64 image at offset 0. Export the relocatable player for embedding; reserve `.sid` for SID players.
- **Chip mismatch.** A tune voiced for the 6581 can sound wrong on an 8580 (and vice-versa) because filter cutoff, resonance and combined-waveform timbres differ ([Appendix D](appendix-d-sid-registers.md) §D.7). Compose for the target machine, or detect the model at runtime.
- **Forgetting the IRQ housekeeping** ($DC0D mask, $D01A enable, $D019 ack) — the player's `play` then never fires or fires erratically.

**Go deeper:** GoatTracker 2 (https://sourceforge.net/projects/goattracker2/) and the High Voltage SID Collection (https://www.hvsc.c64.org/); register details in [Appendix D](appendix-d-sid-registers.md).

## 4.8 A game sound-effects engine

**Objectives**
- Build a tiny, table-driven SFX engine that plays on one dedicated SID voice (voice 3) while music keeps voices 1–2.
- Represent each effect as a short per-frame script of SID writes, advanced one step per raster IRQ, and learn how an effect is triggered and how it ends.
- Add a priority scheme so a new, lower-priority effect cannot cut off a higher-priority effect that is still playing.

### Why a separate voice and a per-frame engine

A game already burns one raster IRQ per frame to run the music player. Sound effects want the same heartbeat: most arcade SFX are just a parameter (usually pitch) changing a little every frame for a handful of frames. So the natural design is:

- **Voice allocation.** Reserve **voice 3** ($D40E–$D414) for SFX and let the music driver own **voices 1 and 2**. The two never fight over the same registers, so they can run from the same IRQ without coordination. (If a tune genuinely needs all three voices you instead "duck" voice 3 — pause the music's use of it while an effect plays — but a dedicated voice is the simplest correct design and what we build here.)
- **One update call per frame.** A routine `sfxUpdate` is called once from the raster IRQ. If an effect is active it reads the next step of that effect's script and writes the bytes to voice 3.
- **Effects as data, not code.** Each effect is a table. A "laser" is a falling pitch over ~8 frames; an "explosion" is noise with a slow release; a "pickup" is a quick rising blip. New effects are new tables, not new code paths.

### What lives in a script

Keep the per-frame record tiny and fixed-width so indexing is a single add. In this lesson each frame entry is **3 bytes**:

```
[ control , freqLo , freqHi ]
```

- **control** goes to the voice-3 control register $D412. Per [Appendix D](appendix-d-sid-registers.md) §D.2 the bits are NOISE $80, PULSE $40, SAWTOOTH $20, TRIANGLE $10, TEST $08, RINGMOD $04, SYNC $02, GATE $01. We use **$21 = SAWTOOTH ($20) + GATE ($01)** for the laser. Sawtooth is a good default for sweeps because, unlike PULSE, it needs no pulse-width setup to be audible (a PULSE wave with pulse width $000 is silent DC).
- **freqLo/freqHi** go to $D40E/$D40F. Per §D.5 `Fout = Fn * Fclk / 2^24`; we sweep the high byte downward so the pitch falls — the classic descending "laser/pew" gesture.

A sentinel byte **$FF** marks the end of the script. When `sfxUpdate` reads it, it gates the voice off (writes control with GATE clear so the envelope enters RELEASE, §D.2 bit 0) and marks the engine idle.

### Triggering and priority

Triggering an effect is two writes plus a guard:

1. Compare the **requested priority** against the priority of the effect currently playing.
2. If the request is `>=` the active priority (or nothing is playing — idle priority is 0), accept it: store the script pointer, reset the frame counter to 0, and flag the first frame so the ADSR is programmed before the gate goes high.
3. Otherwise reject it and leave the running effect alone.

This is the whole "a quiet pickup must not interrupt a still-playing explosion" rule. Priorities here: `PRI_NONE=0`, `PRI_LASER=1`, `PRI_EXPL=2`. Because the comparison is `>=`, an equal-priority retrigger *does* restart (which is usually what you want — rapid repeated lasers should restart, not stack).

### Stable vs changing registers (what to assert)

Because SID voice registers are **write-only** (Appendix D intro), headless verification reads the engine's intent through the registers it leaves set. For this program, after the engine has fired the laser at least once:

- **$D418 (master volume/mode) = $0F** — set once at startup and never touched again (stable).
- **$D413 (voice 3 Attack/Decay) = $0A** — attack nibble 0 (≈2 ms, §D.4), decay nibble $A (≈1.5 s). Programmed on the effect's first frame, then stable.
- **$D414 (voice 3 Sustain/Release) = $00** — sustain level 0, release rate 0 (percussive: no hold, fast tail). Stable once set.
- **$D412 (voice 3 control)** is **$21** (SAWTOOTH + GATE) for every active sweep frame, then **$10** (TRIANGLE, GATE off) when the script ends and the voice goes idle. These are the *intended* control writes, but note that $D412 is **not** a stable register to assert headless: the laser plays only ~8 frames out of every 128-frame cycle, so a register read lands on $21, $10, or an idle-phase value depending on timing. Assert the genuinely-stable registers ($D418/$D413/$D414); treat $D412 as a moving value like the frequency.
- **$D40E / $D40F (voice 3 frequency)** **change every frame** as the sweep descends — these are the deliberately moving values and must not be asserted as constant.

### The complete program

This is a self-contained, assemblable KickAssembler v5.x program. It needs no input: a frame counter auto-fires the laser on voice 3 every 128 frames straight from the raster IRQ. Music would normally run in the same IRQ on voices 1–2; here voices 1–2 are simply left idle so the SFX engine is easy to observe.

```asm
        .const SID      = $D400
        .const V3_FREQ  = SID + $0E     // $D40E voice-3 freq lo
        .const V3_FREQH = SID + $0F     // $D40F voice-3 freq hi
        .const V3_CTRL  = SID + $12     // $D412 voice-3 control
        .const V3_AD    = SID + $13     // $D413 voice-3 attack/decay
        .const V3_SR    = SID + $14     // $D414 voice-3 sustain/release
        .const VOLUME   = SID + $18     // $D418 master volume / mode

        .const RASTER   = $D012
        .const VICCTRL  = $D011
        .const VICIRQ   = $D019
        .const VICMASK  = $D01A
        .const CIAICR   = $DC0D
        .const IRQVEC   = $0314

        .const PRI_NONE  = 0
        .const PRI_LASER = 1
        .const PRI_EXPL  = 2

        .const FRAME_END = $ff          // sentinel ending a script

        BasicUpstart2(main)

        *=$0810
main:
        sei
        lda #$0f
        sta VOLUME                  // $D418 = $0F : master volume max (stable)

        lda #PRI_NONE
        sta sfxActivePri            // engine idle
        lda #$00
        sta tick
        sta tick+1

        // ---- raster IRQ wiring (Part II 2.3 recipe) ----
        lda #<irq
        sta IRQVEC
        lda #>irq
        sta IRQVEC+1
        lda #$7f
        sta CIAICR                  // disable all CIA timer IRQs
        lda CIAICR                  // ack pending CIA IRQ
        lda VICCTRL
        and #$7f
        sta VICCTRL                 // raster compare bit 8 = 0
        lda #$80
        sta RASTER                  // fire at raster line $80
        lda #$01
        sta VICMASK                 // enable raster IRQ source
        lda VICIRQ
        sta VICIRQ                  // ack any pending VIC IRQ
        cli
loop:   jmp loop                    // foreground does nothing

//------------------------------------------------------------
irq:
        lda VICIRQ
        sta VICIRQ                  // ack raster IRQ ($D019)
        jsr autoTrigger
        jsr sfxUpdate
        jmp $ea81                   // restore regs + RTI (no kernal raster work)

//------------------------------------------------------------
// autoTrigger: every 128 frames, request the laser effect.
autoTrigger:
        inc tick
        bne acDone
        inc tick+1
acDone:
        lda tick
        and #$7f
        bne acRts                   // not a multiple of 128 -> skip
        lda #PRI_LASER
        ldx #<laserScript
        ldy #>laserScript
        jsr sfxRequest
acRts:
        rts

//------------------------------------------------------------
// sfxRequest: A = priority, X/Y = script ptr lo/hi.
// Accept only if requested priority >= currently active priority.
sfxRequest:
        cmp sfxActivePri
        bcc srReject                // new < active -> keep current effect
        sta sfxActivePri
        stx scriptPtr
        sty scriptPtr+1
        lda #$00
        sta sfxFrame                // restart the script
        lda #$01
        sta sfxFresh                // program ADSR on first frame
srReject:
        rts

//------------------------------------------------------------
// sfxUpdate: advance the active effect by one frame.
sfxUpdate:
        lda sfxActivePri
        cmp #PRI_NONE
        beq suRts                   // nothing playing

        ldy sfxFrame                // byte offset into script (3 bytes/frame)
        lda (scriptPtr),y
        cmp #FRAME_END
        beq suEnd

        sta tmpCtrl                 // stash control byte for after ADSR
        iny
        lda (scriptPtr),y
        sta V3_FREQ                 // $D40E (changes per frame)
        iny
        lda (scriptPtr),y
        sta V3_FREQH                // $D40F (changes per frame)
        iny
        sty sfxFrame                // advance to next 3-byte entry

        lda sfxFresh
        beq suNoFresh
        lda #$00
        sta sfxFresh
        lda #$0a
        sta V3_AD                   // $D413 = $0A : attack 0, decay $A (stable)
        lda #$00
        sta V3_SR                   // $D414 = $00 : sustain 0, release 0 (stable)
suNoFresh:
        lda tmpCtrl
        sta V3_CTRL                 // $D412 = $21 while sweeping (SAWTOOTH+GATE)
        rts

suEnd:
        lda #$10
        sta V3_CTRL                 // $D412 = $10 : TRIANGLE, GATE off -> RELEASE
        lda #PRI_NONE
        sta sfxActivePri            // mark engine idle
suRts:
        rts

//------------------------------------------------------------
// laser: sawtooth, gate on, pitch sweeps down via the freq high byte.
laserScript:
        .byte $21, $00, $30
        .byte $21, $00, $2c
        .byte $21, $00, $28
        .byte $21, $00, $24
        .byte $21, $00, $20
        .byte $21, $00, $1c
        .byte $21, $00, $18
        .byte $21, $00, $14
        .byte FRAME_END

sfxActivePri: .byte 0
sfxFrame:     .byte 0
sfxFresh:     .byte 0
scriptPtr:    .byte 0,0
tmpCtrl:      .byte 0
tick:         .byte 0,0
```

### Adding more effects (explosion, pickup)

The engine is generic; new effects are just new tables and a one-line `sfxRequest` call at a higher or lower priority. Sketches:

```asm
// explosion: NOISE ($80) + GATE ($01) = $81, slow tail.
// Give it PRI_EXPL so it survives an overlapping laser request.
// (Use a slower release in the first-frame ADSR if you want a long tail;
//  here we keep the same engine, so adjust V3_SR for that effect class.)
explScript:
        .byte $81, $00, $20
        .byte $81, $00, $20
        .byte $81, $00, $20
        .byte $81, $00, $20
        .byte FRAME_END

// pickup: rising sawtooth blip, low priority (PRI_LASER or lower).
pickupScript:
        .byte $21, $00, $14
        .byte $21, $00, $1c
        .byte $21, $00, $26
        .byte $21, $00, $34
        .byte FRAME_END
```

To fire the explosion instead of the laser, request `#PRI_EXPL` with `explScript`; once it is playing, an incoming `#PRI_LASER` request is rejected until the explosion's $FF frame marks the engine idle.

> Note on a real tracker: a music driver such as a GoatTracker export would be `jsr`'d once per frame from this same IRQ, before `sfxUpdate`, and would only touch voices 1–2. GoatTracker is not installed in this environment, so the program above uses no music driver and leaves voices 1–2 silent; the integration point is simply "call your player's per-frame routine here, then call `sfxUpdate`."

**Pitfalls**
- **Voice collision.** If your music driver ever writes voice 3, the SFX engine and the music will stomp on each other's $D40E–$D414 writes. Keep the split strict, or implement explicit ducking.
- **Write-only registers.** You cannot read voice 3's frequency/control back from SID (Appendix D intro). The engine keeps its own RAM state (`sfxActivePri`, `sfxFrame`, `scriptPtr`); never assume you can re-read SID to recover where an effect was.
- **Silent waveforms.** PULSE ($40) with pulse width $000 produces inaudible DC, and selecting *no* waveform bit silences the voice (§D.2). Use SAWTOOTH/TRIANGLE/NOISE for parameter-free effects, or set $D410/$D411 first if you want PULSE.
- **NOISE lock-up.** Combining NOISE with another waveform, or leaving a noise voice mis-gated, can "lock" the noise generator silent until a TEST-bit pulse or RESET (§D.2, §D.7). For explosion effects use NOISE alone ($80, not $90/$A0).
- **Re-gating quirk / hard restart.** Rapid retriggers can hit the ADSR delay bug (§D.7): the envelope may not reset cleanly. For consistent attacks on a busy SFX channel, do a one-frame hard restart (write a fast release such as $00/$F0 with GATE=0) on the frame before re-gating.
- **Priority comparison direction.** `bcc` after `cmp sfxActivePri` rejects requests *below* the active priority. Get the branch sense wrong and a footstep will cut off your boss explosion.
- **Frame stride must match entry size.** Entries are 3 bytes; `sfxUpdate` advances `Y` by 3. If you grow an entry (e.g. add a per-frame ADSR byte), update the stride or the engine will read garbage.

**Go deeper:** MOS 6581 SID datasheet (control-register bits, ADSR rates, frequency formula): https://6502.org/documents/datasheets/mos/mos_6581_sid.pdf — and [Appendix D](appendix-d-sid-registers.md).

## 4.9 Digi (sample) playback — an overview

**Objectives**
- Understand why the 4-bit master-volume nibble of `$D418` can be (ab)used to play digitized PCM samples ("volume-register digi").
- Build a complete, runnable program that streams a sample table to `$D418`'s low nibble at a steady multi-kHz rate, timed by CIA Timer A.
- Know the cost (CPU-bound, ties up the machine), the 8580 caveat, and that better digi methods exist.

### The idea: volume is in the signal path

Look at `$D418` in [Appendix D §D.3](appendix-d-sid-registers.md): bits 3–0 are the **master volume** `VOL3–VOL0`, and "Volume must be non-zero for any sound at all." That volume nibble sits in the *output path* of the SID's analog mixer — it multiplies whatever the voices produce before it reaches the audio pin.

On the 6581 there is a side effect that the designers did not intend: **every write to the volume nibble produces a small DC step (an audible click) at the output**, independent of any oscillator. So if you silence the three voices and then write a stream of 4-bit values to `$D418` *fast enough*, the sequence of clicks fuses into an audible waveform. You are effectively running a crude 4-bit DAC: the digital sample value goes straight to `$D418` bits 0–3, and the analog DC offset of each write reconstructs the waveform.

This is the **classic volume-register digi**. It needs no oscillator at all — the voices can be left silent. The "sound" comes entirely from the rate and amplitude of the volume writes.

### The cost: you must feed it constantly

PCM is unforgiving about timing. To reproduce a waveform you must write a new 4-bit sample at a **fixed, high rate** — a few kHz at minimum for recognizable speech, 8–16 kHz for decent quality. At, say, 8 kHz on a ~1 MHz machine you get only ~125 cycles between samples, and the inner loop (fetch sample, mask to 4 bits, store to `$D418`, advance pointer, test for end) eats most of them.

Consequences:
- **The CPU is pinned.** A tight volume-digi loop leaves almost no time for game logic, so games trigger digis sparingly (a sampled drum hit, a short voice clip) and usually stop the music/screen DMA during playback.
- **Jitter is audible.** The sample period must be rock-steady, which is why digi loops are driven by a hardware timer (CIA Timer A, or a fixed raster cadence) rather than by counting instructions in a path that branches.
- **Badlines steal cycles.** The VIC-II's badline DMA can stall the CPU for ~40+ cycles on certain rows. Serious digi routines blank the screen (`$D011` bit 4 = 0) during playback so the timing stays uniform.

### The 8580 caveat

[Appendix D §D.7](appendix-d-sid-registers.md) spells it out: the later **8580** redesigned the mixer and largely removed the DC offset, so plain `$D418` writes are *nearly inaudible* on an 8580. To make volume-register digis play on an 8580 you need a trick that re-introduces a path for the offset — the common one is to keep one voice producing a steady DC level (for example select a waveform and set the **TEST** bit, `$08`, in that voice's control register, or set the pulse waveform with a fixed pulse width so the voice output is a constant the volume nibble can scale). Code written for the 6581 that skips this trick will sound silent on an 8580.

Because of all this, better techniques exist that don't abuse the volume register: **pulse-width digis** (modulate a voice's 12-bit `PW` per sample) and **combined-waveform digis**, which are louder and work on both chips. They are beyond this overview; the volume-register method is taught first because it is the simplest to understand and the historically dominant one.

### A complete CIA-timed digi player

The program below silences all three voices, sets master volume so the output path is live, and uses **CIA #1 Timer A** to fire an IRQ at a fixed sample rate. Each interrupt writes the next 4-bit sample to `$D418`'s low nibble and advances the pointer, looping the sample table forever.

We let `BasicUpstart2` own `$0801` and start code at `*=$0810`, per the course convention.

```asm
//============================================================
// 4.9  Volume-register digi — CIA Timer A driven 4-bit PCM
//      All voices silent; samples streamed to $D418 low nibble.
//============================================================
            BasicUpstart2(main)
            *=$0810

// --- CIA #1 registers ---
.const CIA1_TA_LO = $DC04        // Timer A low byte
.const CIA1_TA_HI = $DC05        // Timer A high byte
.const CIA1_ICR   = $DC0D        // interrupt control/status
.const CIA1_CRA   = $DC0E        // control register A

// --- Sample period (PAL phi2 ~= 985248 Hz) ---
// period = phi2 / sampleRate.  ~7813 cycles -> ~126 Hz here is
// deliberately slow so it is easy to read; a real digi uses a
// far smaller period (e.g. 123 -> ~8 kHz). We keep the table
// looping so $D418's low nibble is provably changing.
.const PERIOD     = 7813         // tweak for a faster rate
.const SAMPLE_LEN = 32           // length of the looping sample table

main:
            sei

            // --- silence the SID voices, set master volume live ---
            ldx #$18             // $D400..$D417 = 0
            lda #$00
!clr:       sta $D400,x
            dex
            bpl !clr-
            lda #$0F             // $D418 = volume 15, no filter mode
            sta $D418            // (low nibble will be overwritten by digi)

            // --- 8580 helper: give voice 3 a DC level via TEST bit ---
            // Harmless on a 6581; needed for 8580 audibility.
            lda #$08             // TEST bit set, no waveform/gate
            sta $D412            // voice 3 control register

            // --- point the digi engine at the sample table ---
            lda #<sampleData
            sta sampPtr+0
            lda #>sampleData
            sta sampPtr+1
            lda #$00
            sta sampIdx

            // --- install IRQ vector ---
            lda #<digiIrq
            sta $0314
            lda #>digiIrq
            sta $0315

            // --- silence CIA's default timer IRQ, then reprogram ---
            lda #$7F
            sta CIA1_ICR         // disable all CIA1 IRQ sources
            lda CIA1_ICR         // ack/clear any pending

            // load Timer A with the sample period
            lda #<PERIOD
            sta CIA1_TA_LO
            lda #>PERIOD
            sta CIA1_TA_HI

            // start Timer A in continuous mode (reload on underflow)
            lda #%00010001       // bit0=start, bit3=0 continuous
            sta CIA1_CRA

            lda #$81             // enable Timer A interrupt
            sta CIA1_ICR

            cli
loop:       jmp loop             // everything happens in the IRQ

//------------------------------------------------------------
// CIA Timer A IRQ: write one 4-bit sample to $D418 low nibble
//------------------------------------------------------------
digiIrq:
            // (registers already saved by the KERNAL on the
            //  hardware vector path; $0314 entry preserves A/X/Y
            //  via the KERNAL's stub before reaching us)
            lda CIA1_ICR         // ACK CIA: reading ICR clears it

            ldy sampIdx
sampPtr:    lda sampleData,y     // self-modified base -> read sample
            and #$0F             // keep only the 4-bit sample value
            ora #$00             // (room to OR in filter-mode bits)
            sta $D418            // <-- the digi write

            inc sampIdx
            lda sampIdx
            cmp #SAMPLE_LEN
            bne !done+
            lda #$00
            sta sampIdx          // loop the sample forever
!done:
            jmp $EA31            // KERNAL IRQ exit (restore + RTI)

//------------------------------------------------------------
// State
//------------------------------------------------------------
sampIdx:    .byte 0

//------------------------------------------------------------
// Sample data: a triangle ramp 0..15..0 in the low nibble.
// In a real project this is where a tracker/sample export
// (e.g. a GoatTracker or .raw export) would be included with
// .import binary; the inline table below is an assemblable
// stand-in so the example verifies without external tools.
//------------------------------------------------------------
sampleData:
            .fill 16, i          // 0,1,2,...,15
            .fill 16, 15 - i     // 15,14,...,0
```

> **GoatTracker note:** GoatTracker is not part of this environment, so this lesson does not run it. In a real pipeline you would record/convert a sample to 4-bit unsigned PCM and pull it in with KickAssembler's `.import binary "voice.raw"`, then point `sampPtr`/`SAMPLE_LEN` at it. The inline `.fill` table above is a self-contained stand-in so the program assembles and verifies on its own.

### What the registers do (for the headless check)

Audio is **silent in headless verification**, so we assert on register values read back from the SID:

- **`$D418` — master volume / digi output.** After setup it is `$0F`, but it is the register the program *deliberately overwrites every IRQ*. Its **low nibble cycles 0→15→0** as the triangle table is streamed; the high nibble (filter-mode bits) stays 0. So `$D418` is the one register that **changes over time** — that is the digi in action.
- **Voices 1 and 2 silent.** `$D400`–`$D40D` were cleared to `$00` and never touched again — frequency, pulse width, control (waveform+gate), and ADSR (`$D405/$D406` etc.) all read back as `0`. Gate bit (bit 0 of each control register) is 0, so no envelope runs.
- **Voice 3 control `$D412` = `$08`** — only the **TEST** bit set (no waveform, gate = 0). This is the 8580 DC-offset helper; it is a **stable** value and never changes.
- **Filter registers `$D415`–`$D417` = `0`** — no filter routing, no resonance.
- **CIA Timer A** (`$DC04/$DC05`) is loaded with `PERIOD` and runs continuously; `$DC0E` (CRA) low bits show the timer started; `$DC0D` was set to `$81` to enable the Timer A interrupt.

So: stable assertions are voices 1/2 zeroed, `$D412 = $08`, filter regs zeroed; the time-varying assertion is the **low nibble of `$D418`** stepping through the triangle table while the high nibble stays 0.

**Pitfalls**
- **Forgetting volume is in the path on 8580.** On a 6581 the bare `$D418` writes click audibly; on an 8580 you must hold a DC level on a voice (TEST bit, or a fixed pulse) or the digi is inaudible. The program includes the `$D412 = $08` helper for this reason.
- **Inconsistent timing.** Driving the loop by instruction counting through branches introduces jitter and pitch wobble. Use a hardware timer (CIA Timer A here) or a fixed raster cadence, and blank the screen (`$D011` bit 4 = 0) to remove badline jitter during playback.
- **Not masking the sample.** Sample bytes can carry junk in the high nibble; always `AND #$0F` before storing, or you will accidentally flip the filter-mode bits (`$10/$20/$40/$80`) and change the output routing.
- **Not acknowledging the CIA IRQ.** You must read `$DC0D` in the handler; if you don't, the interrupt never clears and the machine wedges. (Note: this digi loop uses the **CIA** timer, not the raster `$D019` ack from the Part II 2.3 raster recipe — acknowledge the source you actually enabled.)
- **CPU starvation.** A real-rate digi (multi-kHz) leaves almost no cycles for anything else; expect to pause music and game logic for the duration.
- **Re-enabling the default CIA timer.** The KERNAL's normal `$DC0D` jiffy IRQ is replaced here; if you restore it later, reprogram Timer A and the `$0314/$0315` vector back.

**Go deeper:** MOS 6581 SID datasheet (https://6502.org/documents/datasheets/mos/mos_6581_sid.pdf) and Codebase64's SID programming index (https://codebase64.c64.org/doku.php?id=base:sid_programming) for digi techniques; register details in [Appendix D](appendix-d-sid-registers.md) (§D.3 for `$D418`, §D.7 for the 6581-vs-8580 digi caveat and the TEST bit).

---

*Next: Part V — BASIC V2 (coming next)*
