pragma circom 2.2.3;
template Publics() {
    signal input a;
    signal output out[2];
    signal t;
    t <== a;
    out[0] <== 7;
    out[1] <== t;
    a * (a - 1) === 0;
    a * (a - 1) === 0; // Retain duplicate residual multiplicity.
}
component main {public [a]} = Publics();
