pragma circom 2.2.3;

include "bounded-linear.circom";

// Test harness uses the production template unchanged; it is never a proving target.
component main {public [label]} = BoundedLinear();
