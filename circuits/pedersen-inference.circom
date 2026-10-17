pragma circom 2.2.3;

include "bounded-linear.circom";
include "pedersen-fixed-base.circom";
include "circomlib/circuits/comparators.circom";

template PedersenInference() {
    signal input commitmentX;
    signal input commitmentY;
    signal input label;
    signal input u[4];
    signal input r;
    signal m;

    component classifier = BoundedLinear();
    classifier.label <== label;
    for (var i = 0; i < 4; i++) {
        classifier.u[i] <== u[i];
    }
    m <== u[0] + 16*u[1] + 256*u[2] + 4096*u[3];

    component messageBits = Num2Bits(16);
    messageBits.in <== m;
    component scalarBits = Num2Bits(251);
    scalarBits.in <== r;
    // Bit length alone admits noncanonical scalars. 2^252 < p, so the
    // comparator's bounded inputs cannot wrap around the coordinate field.
    component scalarBound = LessThan(251);
    scalarBound.in[0] <== r;
    scalarBound.in[1] <== 2736030358979909402780800718157159386076813972158567259200215660948447373041;
    scalarBound.out === 1;

    // EC1's independently derived, validated subgroup generators.
    component messageMul = PedersenFixedBase(16, [
        21089013549194393211874720674055170159445812616009128982996121284857556192122,
        8085084879007459477957026571536023198155314110624155763203615539184186768701
    ]);
    component blinderMul = PedersenFixedBase(251, [
        14614171143892128058782894939452631060604662806361338235072785597557507408782,
        2719192117269298910472409734859557291435370725041396522964648820540827509338
    ]);
    for (var j = 0; j < 16; j++) messageMul.bits[j] <== messageBits.out[j];
    for (var j = 0; j < 251; j++) blinderMul.bits[j] <== scalarBits.out[j];

    component sum = BabyAdd();
    sum.x1 <== messageMul.out[0];
    sum.y1 <== messageMul.out[1];
    sum.x2 <== blinderMul.out[0];
    sum.y2 <== blinderMul.out[1];
    commitmentX === sum.xout;
    commitmentY === sum.yout;
}

component main {public [commitmentX, commitmentY, label]} = PedersenInference();
