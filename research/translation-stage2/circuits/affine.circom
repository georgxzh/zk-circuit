pragma circom 2.2.3;
template Affine() {
    signal input x;
    signal input unused;
    signal output y;
    signal t;
    t <== 3*x + 5; // O1 must retain this general affine equation.
    y <== t*t;
}
component main = Affine();
