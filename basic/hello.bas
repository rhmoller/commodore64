10 rem === hello, c64 - basic v2 demo ===
20 poke 53280,0 : poke 53281,6 : rem border black, screen blue ($d020/$d021)
30 print "{clr}{down}{wht}    hello from basic v2!"
40 print "{down}counting with a for/next loop:"
50 for i=0 to 9
60 :  print "  line";i
70 next i
80 print "{down}press a key to end..."
90 get k$ : if k$="" then 90
100 print "{down}bye!" : end
