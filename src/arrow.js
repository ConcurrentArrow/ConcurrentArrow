import Progress from "./progress.js";

export default class Arrow {
    constructor(type) {
        Arrow.numarrows++;
        this.type = type;
    }

    call(x, p, k, h) {
        throw new Error("Call undefined");
    }

    equals(that) {
        throw new Error("Equals undefined");
    }

    isAsync() {
        return false;
    }

    run(x, k = () => {}, h = err => { throw err; }) {
        /*
        if (!(this.type.arg instanceof TopType)) {
            throw new Error("Cannot run an arrow that takes arguments");
        }
        */

        let p = new Progress(true);
        let hk = err => { p.cancel(); h(err); };
        this.call(x, p, k, hk);
        return p;
    }

    // Combinator constructors

    noemit() {
        return Arrow.noemit(this);
    }

    seq(/* ...arrows */) {
        return Arrow.seq([this].concat(Array.copy(arguments)));
    }

    any(/* ...arrows */) {
        return Arrow.any([this].concat(Array.copy(arguments)));
    }

    all(/* ...arrows */) {
        return Arrow.all([this].concat(Array.copy(arguments)));
    }

    try(success, failure) {
        return Arrow.try(this, success, failure);
    }

    handle(handler) {
        return Arrow.handle(handler, this);
    }

    // Convenience API
    lift() {
        return this;
    }

    wait(duration) {
        return this.seq(Arrow.delay(duration));
    }

    after(duration) {
        return Arrow.delay(duration).seq(this);
    }

    triggeredBy(selector, event) {
        return Arrow.elem(selector).seq(Arrow.event(event)).remember().seq(this);
    }

    then(success, failure) {
        if (failure === undefined) {
            return this.seq(success);
        } else {
            return this.try(success, failure);
        }
    }

    catch(failure) {
        return this.then(Arrow.id(), failure);
    }

    // Data Routing

    split(n) {
        return this.seq(Arrow.split(n));
    }

    nth(n) {
        return this.seq(Arrow.nth(n));
    }

    fanout(/* ...arrows */) {
        return Arrow.fanout([this].concat(Array.copy(arguments)));
    }

    tap(/* ...functions */) {
        return Arrow.tap(this, arguments);
    }

    on(name, handler) {
        return this.seq(Arrow.split(2), Arrow.id().all(Arrow.event(name)), handler);
    }

    remember() {
        return this.carry().nth(1);
    }

    carry() {
        return Arrow.split(2).seq(Arrow.id().all(this));
    }

    // Repeating

    times(n) {
        return this.fold(
            Arrow.lift(0),
            Arrow.lift(x => {
                /* @arrow :: Number ~> Bool */
                return x < n;
            }),
            Arrow.lift((x, _) => {
                /* @arrow :: (Number, _) ~> Number */
                return x + 1;
            }));
    }

    forever() {
        return Arrow.fix(a => this.seq(a));
    }

    whileTrue() {
        return Arrow.fix(a => this.ifTrue(a));
    }

    /*
     * 'this' arrow returns 'b' and if 'b' is true, then runs 'update' with 'x' and loops back, otherwise, completes.
     */
    whileTrueThen(update) {
        return Arrow.fix(alpha => this.ifTrue(update.seq(alpha)));
    }

    /*
     * Repeat 'this' until 'cond' is true and return the output of 'this'.
     */
    repeatUntil(cond) {
        return Arrow.fix(alpha => this.seq(cond.ifFalse(alpha)));
    }

    /*
     * If 'this' arrow returns true, then runs 'update' with 'x' else returns 'x'
     */
    ifTrue(update) {
        return this.ifThenElse(update, Arrow.id());
    }

    ifFalse(update) {
        return this.ifThenElse(Arrow.id(), update);
    }

    /*
     * If 'this' returns true, then run 'thenA', otherwise runs 'elseA' with 'x'.
     */
    ifThenElse(thenA, elseA) {
        return this.carry().seq(
            (([x, b], k1, k2) => {
              if (b) k1(x);
              else k2(x);
            }).liftchoice(thenA, elseA));
    }

    /*
     * Runs 'this' and 'that' arrow in parallel with the same input but only waits for the result of 'this'
     */
    spawn(that) {
        return Arrow.spawn(this, that);
    }

    /*
     * usage: a1.until(a2)
     * a1 runs until some event of a2 occurs, after which a2 runs
     */
    until(a2) {
        return this.noemit().any(a2);
    }

    race(a2) {
        return this.noemit().any(a2.noemit());
    }

    /*
     * Fold over the output of 'this':   'a ~> 'b.
     *
     * fold takes an initial value:       _ ~> 'a,
     *           a condition arrow:      'a ~> Bool,
     *    and an accumulator arrow: 'a * 'b ~> 'a
     */

    fold(initial, condition, accumulator) {
        return initial.seq(condition.whileTrueThen(this.carry().seq(accumulator)));
    }

    switchMap(a) {
        return Arrow.fix(alpha =>
            this.seq(a.noemit().seq(alpha).any(alpha))
        );
    }

    merge(that, next) {
        return Arrow.fix(alpha => this.any(that).seq(next).seq(alpha));
    }

    zip(that, next) {
        return Arrow.fix(alpha => this.fanout(that).seq(next).seq(alpha));
    }

    combine(that, next) {
        return Arrow.fix(alpha =>
            this.all(Arrow.id())
            .any(Arrow.id().all(that))
            .seq(next.remember())
            .seq(alpha)
        );
    }

    snapshot(that, next) {
        return Arrow.fix(alpha =>
            this.all(that).noemit()
            .any(Arrow.id().all(that))
            .seq(next.remember())
            .seq(alpha)
        );
    }

    mapE(next) {
        return Arrow.fix(alpha => this.seq(next.fanout(alpha)).nth(1));
    }

    startsWith(x) {
        return (x).lift().seq(this);
    }
}

Arrow.numarrows = 0;

