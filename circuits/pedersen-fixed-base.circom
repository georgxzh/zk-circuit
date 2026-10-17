pragma circom 2.2.3;

include "circomlib/circuits/babyjub.circom";

// BASE must be a validated constant point in the prime-order subgroup.
// Complete Edwards addition handles zero bits, identity, and cancellation.
// The doubles below are compile-time field arithmetic, never witness hints.
template PedersenFixedBase(n, BASE) {
    signal input bits[n];
    signal output out[2];
    signal acc[n+1][2];
    signal selected[n][2];
    component adders[n];
    var x = BASE[0];
    var y = BASE[1];

    acc[0][0] <== 0;
    acc[0][1] <== 1;
    for (var j = 0; j < n; j++) {
        bits[j] * (bits[j]-1) === 0;
        selected[j][0] <== bits[j]*x;
        selected[j][1] <== 1 + bits[j]*(y-1);
        adders[j] = BabyAdd();
        adders[j].x1 <== acc[j][0];
        adders[j].y1 <== acc[j][1];
        adders[j].x2 <== selected[j][0];
        adders[j].y2 <== selected[j][1];
        acc[j+1][0] <== adders[j].xout;
        acc[j+1][1] <== adders[j].yout;

        var t = 168696*x*x*y*y;
        assert(1+t != 0);
        assert(1-t != 0);
        var nextX = 2*x*y/(1+t);
        var nextY = (y*y-168700*x*x)/(1-t);
        x = nextX;
        y = nextY;
    }
    out[0] <== acc[n][0];
    out[1] <== acc[n][1];
}
