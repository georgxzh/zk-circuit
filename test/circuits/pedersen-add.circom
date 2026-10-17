pragma circom 2.2.3;
include "circomlib/circuits/babyjub.circom";

// Test harness only: exercise the complete law on arbitrary curve points.
template CheckedAdd() {
    signal input P[2];
    signal input Q[2];
    signal output out[2];
    component checks[2];
    checks[0] = BabyCheck();
    checks[0].x <== P[0];
    checks[0].y <== P[1];
    checks[1] = BabyCheck();
    checks[1].x <== Q[0];
    checks[1].y <== Q[1];
    component sum = BabyAdd();
    sum.x1 <== P[0];
    sum.y1 <== P[1];
    sum.x2 <== Q[0];
    sum.y2 <== Q[1];
    out[0] <== sum.xout;
    out[1] <== sum.yout;
}
component main = CheckedAdd();
