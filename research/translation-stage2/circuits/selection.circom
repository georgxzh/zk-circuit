pragma circom 2.2.3;
include "circomlib/circuits/comparators.circom";
template Selection() {
    signal input x;
    signal input y;
    signal input choose;
    signal output selected;
    signal output less;
    component xb = Num2Bits(8);
    component yb = Num2Bits(8);
    component lt = LessThan(8);
    xb.in <== x;
    yb.in <== y;
    lt.in[0] <== x;
    lt.in[1] <== y;
    less <== lt.out;
    choose * (choose - 1) === 0;
    selected <== x + choose * (y - x);
}
component main = Selection();
