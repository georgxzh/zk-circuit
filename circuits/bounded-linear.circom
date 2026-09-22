pragma circom 2.2.3;

include "circomlib/circuits/bitify.circom";

// Version-1 integer relation; label is tied to Inference's public claim.
// The input uses offset binary: u[i] = x[i] + 8, with x[i] in [-8,7].
template BoundedLinear() {
    signal input label;
    signal input u[4];
    signal score;
    signal shiftedScore;

    component inputBits[4];
    for (var i = 0; i < 4; i++) {
        inputBits[i] = Num2Bits(4);
        inputBits[i].in <== u[i];
    }

    // The input ranges imply the tight integer score interval [-83,67].
    score <== 3*(u[0]-8) - 2*(u[1]-8) + (u[2]-8) + 4*(u[3]-8) - 5;
    shiftedScore <== score + 128;

    component scoreBits = Num2Bits(8);
    scoreBits.in <== shiftedScore;
    // shiftedScore is in [45,195]. Its high bit is 1 exactly when score >= 0.
    label === scoreBits.out[7];
    label * (label - 1) === 0;
}
