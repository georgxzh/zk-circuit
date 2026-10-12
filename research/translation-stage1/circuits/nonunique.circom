pragma circom 2.2.3;

template Nonunique() {
    signal input a;
    signal input t;
    t * a === 0;
}
component main {public [a]} = Nonunique();
