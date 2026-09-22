pragma circom 2.2.3;

include "circomlib/circuits/poseidon.circom";

// Test-only hash harness supplies valid hash intermediates for adversarial R1CS
// assignments whose inputs would be refused by the full witness generator.
component main = Poseidon(6);
