pragma circom 2.2.3;

template Interface() {
    signal input a;
    signal input b;
    signal input c;
    signal input x;
    signal input spare; // Deliberately unused; no unique private witness.
    signal output out;
    signal t;
    signal u;
    signal k;
    signal z;
    signal square; // Retained after removed labels: O1 witness index changes.
    t <== x;
    u <== t;
    k <== 7;
    z <== 0;
    a === b;
    c === 7;
    square <== x * x;
    out <== u * k + z + square;
}
component main {public [a,b,c]} = Interface();
