pragma circom 2.2.3;

// Smallest useful translation: remove one private alias, retain one equation.
template Alias() {
    signal input a;
    signal t;
    t <== a;
    t * t === a;
}
component main {public [a]} = Alias();
