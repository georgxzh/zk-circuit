pragma circom 2.2.3;
template Unsat() {
    signal input a;
    a === 0;
    a === 1;
}
component main {public [a]} = Unsat();
