# Part IV — SID Sound

The SID — three voices of synthesis on a chip, and the reason C64 music is its own art form. This first half covers the register file and the sound-shaping building blocks (waveforms, ADSR, PWM/ring/sync, the filter); music players, GoatTracker integration, a game SFX engine and digi playback follow in the second half. All code is verified by reading the SID registers back in VICE (audio is silent in the headless check).

**In this part (A):** 4.1 · 4.2 · 4.3 · 4.4 · 4.5

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


---

*Part IV-B (players, GoatTracker, game SFX, digi) is in progress.*
