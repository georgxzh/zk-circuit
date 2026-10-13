pragma circom 2.2.3;
template InverseHint() {
    signal input x;
    signal output zero;
    signal inverse;
    inverse <-- x == 0 ? 0 : 1/x;
    zero <== 1 - x * inverse;
    x * zero === 0;
}
component main {public [x]} = InverseHint();
