pragma circom 2.2.3;
template Square() {
    signal input x;
    signal alias;
    signal output y;
    alias <== x;
    y <== alias * alias;
}
template Batch() {
    signal input x[8];
    signal output y[8];
    component squares[8];
    for (var i = 0; i < 8; i++) {
        squares[i] = Square();
        squares[i].x <== x[i];
        y[i] <== squares[i].y;
    }
}
component main = Batch();
