*=$0801
    :BasicUpstart2(start)

.const CHROUT = $ffd2
.const BORDER = $d020
.const SCREEN = $d021

start:
    lda #$00
    sta BORDER
    sta SCREEN

    lda #$01
    sta $0286
    ldx #$00
print:
    lda message,x
    beq done
    jsr CHROUT
    inx
    bne print
done:
    rts

    .encoding "petscii_mixed"
message:
    .text "hello c64"
    .byte $0d, $00

