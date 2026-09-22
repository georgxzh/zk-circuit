pragma circom 2.2.3;

include "bounded-linear.circom";
include "circomlib/circuits/poseidon.circom";

template Inference() {
    // Declaration order is checked against R1CS wire indices by the tests.
    signal input commitment;
    signal input label;
    signal input u[4];
    signal input salt;

    component classifier = BoundedLinear();
    component hash = Poseidon(6);
    classifier.label <== label;
    hash.inputs[0] <== 1; // Registered version-1 model/encoding domain tag.
    for (var i = 0; i < 4; i++) {
        // One private vector is constrained into both computation paths.
        classifier.u[i] <== u[i];
        hash.inputs[i + 1] <== u[i];
    }
    hash.inputs[5] <== salt;
    commitment === hash.out;
}

// Exactly two public inputs, with no public output signals or score disclosure.
component main {public [commitment, label]} = Inference();
