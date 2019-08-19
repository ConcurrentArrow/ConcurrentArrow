var ArrowJs = (function (exports) {
    'use strict';

    let _cancelerId = 0;

    class Progress {
        constructor(canEmit) {
            this.canEmit = canEmit;
            this.cancelers = {};
            this.observers = [];
        }

        addObserver(observer) {
            this.observers.push(observer);
        }

        addCanceler(canceler) {
            let id = _cancelerId++;
            this.cancelers[id] = canceler;
            return id;
        }

        advance(cancelerId) {
            if (cancelerId !== null) {
                this.cancelers[cancelerId] = null;
            }

            while (this.observers.length > 0) {
                let observer = this.observers.pop();

                if (this.canEmit) {
                    observer();
                }
            }
        }

        cancel(e) {
            for (let id in this.cancelers) {
                if (this.cancelers[id] !== null) {
                    this.cancelers[id](e);
                }
            }

            this.cancelers = {};
        }
    }

    class Arrow {
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

    class TypeClash extends Error {
        constructor(type, value) {
            super();

            this.type = type;
            this.value = value;
        }

        toString() {
            return `Runtime type assertion failure: Expected ${this.type.toString()}", got "${JSON.stringify(this.value)}".`;
        }
    }


    class Type {
        equals(that) {
            throw new Error("Equals undefined");
        }

        check(value) {
            throw new TypeClash(this, value);
        }

        isParam() {
            return false;
        }

        isConcrete() {
            return true;
        }

        harvest() {
            return [];
        }

        substitute(map) {
            return this;
        }

        sanitize(map) {
            return this;
        }
    }

    let uniqid = 0;

    class ParamType extends Type {
        static fresh(noreduce) {
            return new ParamType(++uniqid, noreduce || false);
        }

        constructor(id, noreduce) {
            super();
            this.id = id;
            this.noreduce = noreduce;
            this.children = [];
        }

        equals(that) {
            return that instanceof ParamType && this.id === that.id;
        }

        toString() {
            return "'" + this.id;
        }

        check(value) {
        }

        isParam() {
            return true;
        }

        isConcrete() {
            return false;
        }

        harvest() {
            return [this];
        }

        substitute(map) {
            return this.id in map ? map[this.id] : this;
        }

        sanitize(map) {
            if (!(this.id in map)) {
                let p = ParamType.fresh(this.noreduce);
                this.children.push(p);
                map[this.id] = p;
            }

            return map[this.id];
        }
    }

    class TopType extends Type {
        equals(that) {
            return that instanceof TopType;
        }

        toString() {
            return "_";
        }

        check(value) {
        }
    }

    let runtimeCheckers = {
        "Bool"  : v => v === true || v === false,
        "Number": v => typeof v == "number",
        "String": v => typeof v == "string",
        "Elem"  : v => typeof Node !== 'undefined' && (v instanceof Node || v instanceof NodeList),
        "Event" : v => typeof Event !== 'undefined' && (v instanceof Event),
    };

    function checkNamedType(name, value) {
        let checker = runtimeCheckers[name];

        if (checker) {
            return checker(value);
        } else {
            throw new Error(`Named type "${name}" does not have an associated checker.`);
        }
    }

    class NamedType extends Type {
        constructor(name) {
            super();
            this.names = [name];
        }

        equals(that) {
            return that instanceof NamedType && this.names[0] === that.names[0];
        }

        toString() {
            return this.names[0];
        }

        check(value) {
            if (!checkNamedType(this.names[0], value)) {
                super.check(value);
            }
        }
    }

    class SumType extends Type {
        constructor(names) {
            super();
            this.names = names.unique().sort();
        }

        equals(that) {
            if (that instanceof SumType) {
                return this.names.length === that.names.length && this.names.every((n, i) => n === that.names[i]);
            }

            return false;
        }

        toString() {
            return this.names.join("+");
        }

        check(value) {
            if (!this.names.some(name => checkNamedType(name, value))) {
                super.check(value);
            }
        }
    }

    class TaggedUnionType extends Type {
        constructor(map) {
            super();
            this.vals = map;
            this.keys = Object.keys(map).sort();
        }

        equals(that) {
            if (that instanceof TaggedUnionType) {
                return this.keys.length === that.keys.length && this.keys.every(k => this.vals[k].equals(that.vals[k]));
            }

            return false;
        }

        toString() {
            return "<" + this.keys.map(k => k + ": " + this.vals[k].toString()).join(", ") + ">";
        }

        check(value) {
            try {
                for (let key in this.keys) {
                    if (value.hasTag(key)) {
                        return this.vals[key].check(value.value());
                    }
                }

                return false;
            } catch (err) {
                return super.check(value);
            }
        }

        isConcrete() {
            return this.keys.every(k => this.vals[k].isConcrete());
        }

        harvest() {
            return this.keys.reduce((acc, k) => acc.concat(this.vals[k].harvest()), []);
        }

        substitute(map) {
            let vals = {};
            this.keys.forEach(k => {
                vals[k] = this.vals[k].substitute(map);
            });

            return new TaggedUnionType(vals);
        }

        sanitize(map) {
            let vals = {};
            this.keys.forEach(k => {
                vals[k] = this.vals[k].sanitize(map);
            });

            return new TaggedUnionType(vals);
        }
    }

    class ArrayType extends Type {
        constructor(type) {
            super();
            this.type = type;
        }

        equals(that) {
            if (that instanceof ArrayType) {
                return this.type.equals(that.type);
            }

            return false;
        }

        toString() {
            return "[" + this.type.toString() + "]";
        }

        check(value) {
            if (value && value.constructor === Array) {
                value.forEach(v => this.type.check(v));
            } else {
                super.check(value);
            }
        }

        isConcrete() {
            return this.type.isConcrete();
        }

        harvest() {
            return this.type.harvest();
        }

        substitute(map) {
            return new ArrayType(this.type.substitute(map));
        }

        sanitize(map) {
            return new ArrayType(this.type.sanitize(map));
        }
    }

    class TupleType extends Type {
        constructor(types) {
            super();
            this.types = types;
        }

        equals(that) {
            if (that instanceof TupleType) {
                return this.types.length === that.types.length && this.types.every((t, i) => t.equals(that.types[i]));
            }

            return false;
        }

        toString() {
            return "(" + this.types.map(t => t.toString()).join(", ") + ")";
        }

        check(value) {
            if (value && value.constructor === Array) {
                value.forEach((v, i) => this.types[i].check(v));
            } else {
                super.check(value);
            }
        }

        isConcrete() {
            return this.types.every(t => t.isConcrete());
        }

        harvest() {
            return this.types.reduce((acc, t) => acc.concat(t.harvest()), []);
        }

        substitute(map) {
            return new TupleType(this.types.map(t => t.substitute(map)));
        }

        sanitize(map) {
            return new TupleType(this.types.map(t => t.sanitize(map)));
        }
    }

    class RecordType extends Type {
        constructor(map) {
            super();
            this.vals = map;
            this.keys = Object.keys(map).sort();
        }

        equals(that) {
            if (that instanceof RecordType) {
                return this.keys.length === that.keys.length && this.keys.every(k => this.vals[k].equals(that.vals[k]));
            }

            return false;
        }

        toString() {
            return "{" + this.keys.map(k => k + ": " + this.vals[k].toString()).join(", ") + "}";
        }

        check(value) {
            try {
                this.keys.forEach(k => {
                    this.vals[k].check(value[k]);
                });
            } catch (err) {
                super.check(value);
            }
        }

        isConcrete() {
            return this.keys.every(k => this.vals[k].isConcrete());
        }

        harvest() {
            return this.keys.reduce((acc, k) => acc.concat(this.vals[k].harvest()), []);
        }

        substitute(map) {
            let vals = {};
            this.keys.forEach(k => {
                vals[k] = this.vals[k].substitute(map);
            });

            return new RecordType(vals);
        }

        sanitize(map) {
            let vals = {};
            this.keys.forEach(k => {
                vals[k] = this.vals[k].sanitize(map);
            });

            return new RecordType(vals);
        }
    }

    function hasNames(t) {
        return t instanceof NamedType || t instanceof SumType;
    }

    function createNamedType(names) {
        if (names.length == 1) {
            return new NamedType(names[0]);
        }

        return new SumType(names);
    }

    //
    // Type Utilities
    //

    function sanitizeTypes(arrows) {
        return arrows.map(a => a.type).map(t => t.sanitize());
    }

    function lub(a, b) {
        if (a.equals(b)) {
            return a;
        }

        if (hasNames(a) && hasNames(b)) {
            let na = a.names;
            let nb = b.names;
            return createNamedType(na.concat(nb.filter(n => na.indexOf(n) < 0)));
        }

        if (a instanceof TaggedUnionType && b instanceof TaggedUnionType) {
            let map = {};
            b.keys.filter(k => a.keys.indexOf(k) >= 0).forEach(k => {
                map[k] = lub(a.vals[k], b.vals[k]);
            });

            return new TaggedUnionType(map);
        }

        if (a instanceof ArrayType && b instanceof ArrayType) {
            return new ArrayType(lub(a.type, b.type));
        }

        if (a instanceof TupleType && b instanceof TupleType) {
            return new TupleType(a.types.length < b.types.length
                ? a.types.map((t, i) => lub(t, b.types[i]))
                : b.types.map((t, i) => lub(t, a.types[i])));
        }

        if (a instanceof RecordType && b instanceof RecordType) {
            let map = {};
            a.keys.filter(k => b.keys.indexOf(k) >= 0).forEach(k => {
                map[k] = lub(a.vals[k], b.vals[k]);
            });

            return new RecordType(map);
        }

        return new TopType();
    }

    function glb(a, b) {
        if (a.equals(b)) {
            return a;
        }

        if (a instanceof TopType) return b;
        if (b instanceof TopType) return a;

        if (hasNames(a) && hasNames(b)) {
            let names = a.names.filter(t1 => b.names.some(t2 => t1 == t2));
            if (names.length > 0) {
                return createNamedType(names);
            }
        }

        if (a instanceof ArrayType && b instanceof ArrayType) {
            return new ArrayType(glb(a.type, b.type));
        }

        if (a instanceof TupleType && b instanceof TupleType) {
            return new TupleType(a.types.length < b.types.length
                ? b.types.map((t, i) => { return i >= a.types.length ? t : glb(t, a.types[i]); })
                : a.types.map((t, i) => { return i >= b.types.length ? t : glb(t, b.types[i]); }));
        }

        if (a instanceof TaggedUnionType && b instanceof TaggedUnionType) {
            let map = {};
            a.keys.forEach(k => { map[k] = (k in map) ? glb(map[k], a.vals[k]) : a.vals[k]; });
            b.keys.forEach(k => { map[k] = (k in map) ? glb(map[k], b.vals[k]) : b.vals[k]; });

            return new RecordType(map);
        }

        if (a instanceof RecordType && b instanceof RecordType) {
            let map = {};
            a.keys.forEach(k => { map[k] = (k in map) ? glb(map[k], a.vals[k]) : a.vals[k]; });
            b.keys.forEach(k => { map[k] = (k in map) ? glb(map[k], b.vals[k]) : b.vals[k]; });

            return new RecordType(map);
        }

        throw new Error(`No greatest lower bound of "${a.toString()}" and "${b.toString()}".`);
    }


    class Constraint {
        constructor(lower, upper) {
            this.lower = lower;
            this.upper = upper;
        }

        equals(that) {
            if (that instanceof Constraint) {
                return this.lower.equals(that.lower) && this.upper.equals(that.upper);
            }

            return false;
        }

        toString() {
            return this.lower.toString() + " <= " + this.upper.toString();
        }

        isUseless() {
            return this.lower.equals(this.upper) || this.upper instanceof TopType;
        }

        isConsistent() {
            let a = this.lower;
            let b = this.upper;

            if (hasNames(a) && hasNames(b)) {
                return a.names.every(t1 => b.names.some(t2 => t1 == t2));
            }

            if (a instanceof ArrayType       && b instanceof ArrayType)       return true;
            if (a instanceof TupleType       && b instanceof TupleType)       return b.types.length <= a.types.length;
            if (a instanceof TaggedUnionType && b instanceof TaggedUnionType) return a.keys.every(k => b.keys.indexOf(k) >= 0);
            if (a instanceof RecordType      && b instanceof RecordType)      return b.keys.every(k => a.keys.indexOf(k) >= 0);

            return b instanceof TopType || a.isParam() || b.isParam();
        }

        unary() {
            if (this.lower instanceof ArrayType && this.upper instanceof ArrayType) {
                return [new Constraint(this.lower.type, this.upper.type)];
            }

            if (this.lower instanceof TupleType && this.upper instanceof TupleType) {
                return this.upper.types.filter((t, i) => i < this.lower.types.length).map((t, i) => new Constraint(this.lower.types[i], t));
            }

            if (this.lower instanceof TaggedUnionType && this.upper instanceof TaggedUnionType) {
                return this.lower.keys.filter(k => this.upper.keys.indexOf(k) >= 0).map(k => new Constraint(this.lower.vals[k], this.upper.vals[k]));
            }

            if (this.lower instanceof RecordType && this.upper instanceof RecordType) {
                return this.upper.keys.filter(k => this.lower.keys.indexOf(k) >= 0).map(k => new Constraint(this.lower.vals[k], this.upper.vals[k]));
            }

            return [];
        }

        binary(that) {
            if (this.upper.equals(that.lower)) {
                return [new Constraint(this.lower, that.upper)];
            }

            if (this.lower.equals(that.upper)) {
                return [new Constraint(that.lower, this.upper)];
            }

            return [];
        }
    }

    class ConstraintSet {
        constructor(constraints) {
            this.constraints = constraints.filter(c => !c.isUseless());
            let inconsistent = constraints.filter(c => !c.isConsistent());

            if (inconsistent.length != 0) {
                throw new Error("Inconsistent constraints: [" + inconsistent.map(c => c.toString()).join(", ") + "]");
            }
        }

        equals(that) {
            if (this.constraints.length == that.constraints.length) {
                for (let i = 0; i < this.constraints.length; i++) {
                    if (!this.contains(this.constraints[i])) {
                        return false;
                    }
                }

                return true;
            }

            return false;
        }

        contains(constraint) {
            for (let i = 0; i < this.constraints.length; i++) {
                if (this.constraints[i].equals(constraint)) {
                    return true;
                }
            }

            return false;
        }

        toString() {
            return "{" + this.constraints.map(c => c.toString()).join(", ") + "}";
        }

        add(constraint) {
            if (this.constraints.some(c => c.equals(constraint))) {
                return this;
            }

            return new ConstraintSet(this.constraints.concat([constraint]));
        }

        addAll(constraints) {
            return constraints.reduce((set, c) => set.add(c), this);
        }

        concat(cs) {
            return this.addAll(cs.constraints);
        }

        substitute(map) {
            return new ConstraintSet(this.constraints.map(c => new Constraint(c.lower.substitute(map), c.upper.substitute(map))));
        }

        sanitize(map) {
            return new ConstraintSet(this.constraints.map(c => new Constraint(c.lower.sanitize(map), c.upper.sanitize(map))));
        }
    }

    //
    // Arrow Type
    //

    class ArrowType {
        constructor(arg, out, constraints, errors) {
            this.arg = arg;
            this.out = out;
            this.constraints = constraints || new ConstraintSet([]);
            this.errors = [];

            for (let type of (errors || [])) {
                if (!this.errors.some(e => e.equals(type))) {
                    this.errors.push(type);
                }
            }

            this.resolve();
        }

        toString() {
            let type = this.arg.toString() + " ~> " + this.out.toString();

            if (this.constraints.constraints.length > 0 || this.errors.length > 0) {
                type += " \\ (";
                type += this.constraints.toString();
                type += ", {";
                type += this.errors.map(t => t.toString()).join(", ");
                type += "})";
            }

            return type;
        }

        resolve() {
            let initial = this.constraints;

            for (;;) {
                this.constraints = this.closure();
                this.constraints = this.mergeConcreteBounds();

                let map = this.collectBounds();

                if (Object.getOwnPropertyNames(map).length === 0) {
                    break;
                }

                this.substitute(map);
            }

            let cs = this.prune();

            if (cs.constraints.length === this.constraints.constraints.length || initial.equals(cs)) {
                return;
            }

            this.constraints = cs;
            this.resolve();
        }

        substitute(map) {
            this.arg = this.arg.substitute(map);
            this.out = this.out.substitute(map);
            this.constraints = this.constraints.substitute(map);
            this.errors = this.errors.map(e => e.substitute(map));
        }

        /**
         * Add the result of unary and binary closure rules on each constraint in
         * the set until no new constraints are produced (a fixed point reached).
         */
        closure() {
            let cs = [];
            let wl = Array.copy(this.constraints.constraints);

            while (wl.length > 0) {
                let w = wl.pop();

                if (!cs.some(c => c.equals(w))) {
                    w.unary().forEach(c => wl.push(c));

                    for (let c of cs) {
                        w.binary(c).forEach(c => wl.push(c));
                    }

                    cs.push(w);
                }
            }

            return new ConstraintSet(cs);
        }

        /**
         * Replace multiple constraints which upper bound or lower bound a param
         * type with the lub or glb, respectively, of the concrete bound.
         */
        mergeConcreteBounds() {
            let idmap = {};
            let lower = {};
            let upper = {};
            let other = [];

            for (let c of this.constraints.constraints) {
                let a = c.lower;
                let b = c.upper;

                if (a.isParam()) idmap[a.id] = a;
                if (b.isParam()) idmap[b.id] = b;

                if (a.isParam() && b.isConcrete()) {
                    lower[a.id] = (a.id in lower) ? glb(lower[a.id], b) : b;
                } else if (b.isParam() && a.isConcrete()) {
                    upper[b.id] = (b.id in upper) ? lub(upper[b.id], a) : a;
                } else {
                    other.push(c);
                }
            }

            if (lower.length === 0 && upper.length === 0) {
                return null;
            }

            Object.keys(lower).forEach(id => other.push(new Constraint(idmap[id], lower[id])));
            Object.keys(upper).forEach(id => other.push(new Constraint(upper[id], idmap[id])));

            return new ConstraintSet(other);
        }

        /**
         * Create a substitution map. A param type p can be replaced by type t iff
         * one of the following hold:
         *
         *    - t <= p and p <= t
         *    - p^- <= t (and t is sole upper bound of p)
         *    - t <= p^+ (and t is sole lower bound of p)
         */
        collectBounds() {
            let map = {};

            function addToMap(p, t) {
                map[p.id] = (t.isParam() && t.id in map) ? map[t.id] : t;
            }

            let cs = this.constraints.constraints;
            let lowerParam = cs.filter(c => c.lower.isParam() && !c.lower.noreduce);
            let upperParam = cs.filter(c => c.upper.isParam() && !c.upper.noreduce);

            lowerParam.forEach(c1 => {
                upperParam.forEach(c2 => {
                    if (c1.lower.equals(c2.upper) && c1.upper.equals(c2.lower)) {
                        addToMap(c1.lower, c1.upper);
                    }
                });
            });

            let [n, p] = this.polarity();
            let negVar = n.filter(v => !p.some(x => x.equals(v))); // negative-only params
            let posVar = p.filter(v => !n.some(x => x.equals(v))); // positive-only params

            // Replace negative variables by their sole upper bound, if it exists
            negVar.map(p => cs.filter(c => c.lower === p)).filter(cs => cs.length === 1).forEach(c => {
                addToMap(c[0].lower, c[0].upper);
            });

            // Replace positive variables by their sole lower bound, if it exists
            posVar.map(p => cs.filter(c => c.upper === p)).filter(cs => cs.length === 1).forEach(c => {
                addToMap(c[0].upper, c[0].lower);
            });

            return map;
        }

        /**
         * Remove all constraints which are in one of the following forms:
         *
         *    - t <= t where neither are params
         *    - a <= b and (a or b) is not in the arrow type
         *    - t <= p^-
         *    - p^+ <= t
         */
        prune() {
            let [n, p] = this.polarity();
            let params = this.arg.harvest().concat(this.out.harvest()).concat(this.errors);

            return new ConstraintSet(this.constraints.constraints.filter(c => {
                // Keep no-reduce parameters
                if (c.lower.isParam() && c.lower.noreduce) return true;
                if (c.upper.isParam() && c.upper.noreduce) return true;

                // Remove non-parameter constraints
                if (!c.lower.isParam() && !c.upper.isParam()) return false;

                // Remove unknown type variables
                if (c.lower.isParam() && c.upper.isParam() && !params.some(p => p.equals(c.lower))) return false;
                if (c.lower.isParam() && c.upper.isParam() && !params.some(p => p.equals(c.upper))) return false;

                // Remove constraints with useless polarity
                if (c.lower.isParam() && !n.some(p => p.equals(c.lower))) return false;
                if (c.upper.isParam() && !p.some(p => p.equals(c.upper))) return false;

                return true;
            }));
        }

        /**
         * Determine which variables in arg and out have negative or positive position. This algorithm uses
         * dumb iteration and may be improved by the use of a worklist. The return value fo this function is
         * a pair [n, p] where n is the set of negative variables and p is the set of positive variables. If
         * a variable is both negative and positive it exists in both sets. If a variable is unreachable by
         * arg or out then it will be absent from both lists.
         */
        polarity() {
            let neg = this.arg.harvest();
            let pos = this.out.harvest().concat(this.errors);

            let changed = true;
            let negDefs = this.constraints.constraints.filter(c => c.lower.isParam()).map(c => [c.lower, c.upper.harvest()]);
            let posDefs = this.constraints.constraints.filter(c => c.upper.isParam()).map(c => [c.upper, c.lower.harvest()]);

            while (changed) {
                changed = false;

                let extraNeg = negDefs.filter(([a, b]) => neg.some(p => p === a)).reduce((c, [a, b]) => c.concat(b), []).filter(x => !neg.some(p => p === x));
                let extraPos = posDefs.filter(([a, b]) => pos.some(p => p === a)).reduce((c, [a, b]) => c.concat(b), []).filter(x => !pos.some(p => p === x));

                if (extraNeg.length > 0 || extraPos.length > 0) {
                    changed = true;
                    neg = neg.concat(extraNeg);
                    pos = pos.concat(extraPos);
                }
            }

            return [neg, pos];
        }

        sanitize() {
            let map = {};
            let arg = this.arg.sanitize(map);
            let out = this.out.sanitize(map);
            let constraints = this.constraints.sanitize(map);
            let errors = this.errors.map(e => e.sanitize(map));

            return new ArrowType(arg, out, constraints, errors);
        }
    }

    class TaggedValue {
        constructor(tag, val) {
            this.tag = tag;
            this.val = val;
        }

        hasTag(tag) {
            return tag == this.tag;
        }

        value() {
            return this.val;
        }
    }

    let typechecks = 0;
    let typecheckTime = 0;

    exports._enableTypecheck = true;

    // benchmark
    exports._enableBenchmark = false;

    function enableBenchmark(enable) {
      exports._enableBenchmark = Boolean(enable);
    }

    function benchmarkTimeNow() {
      if (exports._enableBenchmark) {
        if (typeof NODEJS_ENV === 'undefined')
          return window.performance.now();
        else return process.hrtime().bigint();
      }
      return NaN;
    }

    // type checking
    function enableTypecheck(bool) {
      exports._enableTypecheck = bool;
    }

    function _construct(f) {
        if (exports._enableTypecheck) {
            return f();
        } else {
            return new ArrowType(new TopType(), new TopType());
        }
    }

    function _check(type, value) {
        if (exports._enableTypecheck) {
            let start = benchmarkTimeNow();

            type.check(value);

            let elapsed = benchmarkTimeNow() - start;
            typechecks++;

            if (exports._enableBenchmark) {
                typecheckTime += elapsed;
                console.log(typechecks + " checks, " + (typecheckTime / 1e6) + "ms");
            }
        }
    }

    function getLocation(stack) {
        let r = new RegExp(/(?:https?|file):\/\/(.+):(\d+):\d+/g);

        let matches = stack.match(r);
        if (matches) {
          for (let match of matches) {
              let parts = new RegExp(/(?:https?|file):\/\/(.+):(\d+):\d+/g).exec(match);

              if (!parts[1].endsWith("arrows.js")) {
                  return parts[1] + ":" + parts[2];
              }
          }
        }

        return "";
    }

    // type annotation
    let annotationCache = {};

    exports.numannotations = 0;
    exports.annotationParseTime = 0;


    function parseAnnotation(str, f) {
      let anno = annotationCache[str];
      if (anno !== undefined) return anno;

      let start = benchmarkTimeNow();
      anno = f(str);
      let elapsed = (benchmarkTimeNow() - start) / 1e6;

      annotationCache[str] = anno;

      exports.numannotations++;
      exports.annotationParseTime += elapsed;
      return anno;
    }

    /* parser generated by jison 0.4.18 */
    /*
      Returns a Parser object of the following structure:

      Parser: {
        yy: {}
      }

      Parser.prototype: {
        yy: {},
        trace: function(),
        symbols_: {associative list: name ==> number},
        terminals_: {associative list: number ==> name},
        productions_: [...],
        performAction: function anonymous(yytext, yyleng, yylineno, yy, yystate, $$, _$),
        table: [...],
        defaultActions: {...},
        parseError: function(str, hash),
        parse: function(input),

        lexer: {
            EOF: 1,
            parseError: function(str, hash),
            setInput: function(input),
            input: function(),
            unput: function(str),
            more: function(),
            less: function(n),
            pastInput: function(),
            upcomingInput: function(),
            showPosition: function(),
            test_match: function(regex_match_array, rule_index),
            next: function(),
            lex: function(),
            begin: function(condition),
            popState: function(),
            _currentRules: function(),
            topState: function(),
            pushState: function(condition),

            options: {
                ranges: boolean           (optional: true ==> token location info will include a .range[] member)
                flex: boolean             (optional: true ==> flex-like lexing behaviour where the rules are tested exhaustively to find the longest match)
                backtrack_lexer: boolean  (optional: true ==> lexer regexes are tested in order and for each matching regex the action code is invoked; the lexer terminates the scan when a token is returned by the action code)
            },

            performAction: function(yy, yy_, $avoiding_name_collisions, YY_START),
            rules: [...],
            conditions: {associative list: name ==> set},
        }
      }


      token location info (@$, _$, etc.): {
        first_line: n,
        last_line: n,
        first_column: n,
        last_column: n,
        range: [start_number, end_number]       (where the numbers are indexes into the input string, regular zero-based)
      }


      the parseError function receives a 'hash' object with these members for lexer and parser errors: {
        text:        (matched text)
        token:       (the produced terminal token, if any)
        line:        (yylineno)
      }
      while parser (grammar) errors will also provide these members, i.e. parser errors deliver a superset of attributes: {
        loc:         (yylloc)
        expected:    (string describing the set of expected tokens)
        recoverable: (boolean: TRUE when the parser has a error recovery rule available for this particular error)
      }
    */
    var parser = (function(){
    var o=function(k,v,o,l){for(o=o||{},l=k.length;l--;o[k[l]]=v);return o},$V0=[1,3],$V1=[1,4],$V2=[1,5],$V3=[1,6],$V4=[1,7],$V5=[1,8],$V6=[1,9],$V7=[2,17],$V8=[1,12],$V9=[6,7,13,16,19,21,23,25,30],$Va=[1,14],$Vb=[1,20],$Vc=[16,21],$Vd=[19,21],$Ve=[1,48];
    var parser = {trace: function trace () { },
    yy: {},
    symbols_: {"error":2,"top":3,"type":4,"annotations":5,"EOF":6,"~>":7,"IDENT":8,"sum_tail":9,"_":10,"'":11,"[":12,"]":13,"(":14,"types":15,")":16,"<":17,"named_types":18,">":19,"{":20,"}":21,"+":22,",":23,":":24,"\\\\":25,"bounds":26,"throws":27,"bound":28,"bound_tail":29,"<=":30,"$accept":0,"$end":1},
    terminals_: {2:"error",6:"EOF",7:"~>",8:"IDENT",10:"_",11:"'",12:"[",13:"]",14:"(",16:")",17:"<",19:">",20:"{",21:"}",22:"+",23:",",24:":",25:"\\\\",30:"<="},
    productions_: [0,[3,3],[3,5],[4,1],[4,2],[4,1],[4,2],[4,3],[4,3],[4,3],[4,3],[9,2],[9,3],[15,1],[15,3],[18,3],[18,5],[5,0],[5,6],[26,2],[26,3],[26,4],[27,2],[27,3],[28,3],[29,2],[29,3]],
    performAction: function anonymous(yytext, yyleng, yylineno, yy, yystate /* action[1] */, $$ /* vstack */, _$ /* lstack */) {
    /* this == yyval */

    var $0 = $$.length - 1;
    switch (yystate) {
    case 1:
     return [$$[$0-2], $$[$0-1]];     
    break;
    case 2:
     return [$$[$0-4], $$[$0-2], $$[$0-1]]; 
    break;
    case 3:
     this.$ = new NamedType($$[$0]);                           
    break;
    case 4:
     this.$ = new SumType([$$[$0-1]].concat($$[$0]));                
    break;
    case 5:
     this.$ = new TopType();                               
    break;
    case 6:
     this.$ = new ParamType($$[$0]);                           
    break;
    case 7:
     this.$ = new ArrayType($$[$0-1]);                           
    break;
    case 8:
     this.$ = new TupleType($$[$0-1]);                           
    break;
    case 9:
     this.$ = new TaggedUnionType(pairsToMap($$[$0-1]));         
    break;
    case 10:
     this.$ = new RecordType(pairsToMap($$[$0-1]));              
    break;
    case 11: case 13: case 25:
     this.$ = [$$[$0]];            
    break;
    case 12: case 26:
     this.$ = [$$[$0-1]].concat($$[$0]); 
    break;
    case 14:
     this.$ = [$$[$0-2]].concat($$[$0]); 
    break;
    case 15:
     this.$ = [[$$[$0-2], $$[$0]]];            
    break;
    case 16:
     this.$ = [[$$[$0-4], $$[$0-2]]].concat($$[$0]); 
    break;
    case 17:
     this.$ = [[], []]; 
    break;
    case 18:
     this.$ = [$$[$0-3], $$[$0-1]]; 
    break;
    case 19:
     this.$ = [];              
    break;
    case 20:
     this.$ = [$$[$0-1]];            
    break;
    case 21:
     this.$ = [$$[$0-2]].concat($$[$0-1]); 
    break;
    case 22:
     this.$ = [];   
    break;
    case 23:
     this.$ = $$[$0-1];   
    break;
    case 24:
     this.$ = new Constraint($$[$0-2], $$[$0]); 
    break;
    }
    },
    table: [{3:1,4:2,8:$V0,10:$V1,11:$V2,12:$V3,14:$V4,17:$V5,20:$V6},{1:[3]},{5:10,6:$V7,7:[1,11],25:$V8},o($V9,[2,3],{9:13,22:$Va}),o($V9,[2,5]),{8:[1,15]},{4:16,8:$V0,10:$V1,11:$V2,12:$V3,14:$V4,17:$V5,20:$V6},{4:18,8:$V0,10:$V1,11:$V2,12:$V3,14:$V4,15:17,17:$V5,20:$V6},{8:$Vb,18:19},{8:$Vb,18:21},{6:[1,22]},{4:23,8:$V0,10:$V1,11:$V2,12:$V3,14:$V4,17:$V5,20:$V6},{14:[1,24]},o($V9,[2,4]),{8:[1,25]},o($V9,[2,6]),{13:[1,26]},{16:[1,27]},o($Vc,[2,13],{23:[1,28]}),{19:[1,29]},{24:[1,30]},{21:[1,31]},{1:[2,1]},{5:32,6:$V7,25:$V8},{20:[1,34],26:33},o($V9,[2,11],{9:35,22:$Va}),o($V9,[2,7]),o($V9,[2,8]),{4:18,8:$V0,10:$V1,11:$V2,12:$V3,14:$V4,15:36,17:$V5,20:$V6},o($V9,[2,9]),{4:37,8:$V0,10:$V1,11:$V2,12:$V3,14:$V4,17:$V5,20:$V6},o($V9,[2,10]),{6:[1,38]},{23:[1,39]},{4:42,8:$V0,10:$V1,11:$V2,12:$V3,14:$V4,17:$V5,20:$V6,21:[1,40],28:41},o($V9,[2,12]),o($Vc,[2,14]),o($Vd,[2,15],{23:[1,43]}),{1:[2,2]},{20:[1,45],27:44},{23:[2,19]},{21:[1,46],23:$Ve,29:47},{30:[1,49]},{8:$Vb,18:50},{16:[1,51]},{4:18,8:$V0,10:$V1,11:$V2,12:$V3,14:$V4,15:53,17:$V5,20:$V6,21:[1,52]},{23:[2,20]},{21:[1,54]},{4:42,8:$V0,10:$V1,11:$V2,12:$V3,14:$V4,17:$V5,20:$V6,28:55},{4:56,8:$V0,10:$V1,11:$V2,12:$V3,14:$V4,17:$V5,20:$V6},o($Vd,[2,16]),{6:[2,18]},{16:[2,22]},{21:[1,57]},{23:[2,21]},{21:[2,25],23:$Ve,29:58},o([21,23],[2,24]),{16:[2,23]},{21:[2,26]}],
    defaultActions: {22:[2,1],38:[2,2],40:[2,19],46:[2,20],51:[2,18],52:[2,22],54:[2,21],57:[2,23],58:[2,26]},
    parseError: function parseError (str, hash) {
        if (hash.recoverable) {
            this.trace(str);
        } else {
            var error = new Error(str);
            error.hash = hash;
            throw error;
        }
    },
    parse: function parse(input) {
        var self = this, stack = [0], vstack = [null], lstack = [], table = this.table, yytext = '', yylineno = 0, yyleng = 0, TERROR = 2, EOF = 1;
        var args = lstack.slice.call(arguments, 1);
        var lexer = Object.create(this.lexer);
        var sharedState = { yy: {} };
        for (var k in this.yy) {
            if (Object.prototype.hasOwnProperty.call(this.yy, k)) {
                sharedState.yy[k] = this.yy[k];
            }
        }
        lexer.setInput(input, sharedState.yy);
        sharedState.yy.lexer = lexer;
        sharedState.yy.parser = this;
        if (typeof lexer.yylloc == 'undefined') {
            lexer.yylloc = {};
        }
        var yyloc = lexer.yylloc;
        lstack.push(yyloc);
        var ranges = lexer.options && lexer.options.ranges;
        if (typeof sharedState.yy.parseError === 'function') {
            this.parseError = sharedState.yy.parseError;
        } else {
            this.parseError = Object.getPrototypeOf(this).parseError;
        }
        _token_stack:
            var lex = function () {
                var token;
                token = lexer.lex() || EOF;
                if (typeof token !== 'number') {
                    token = self.symbols_[token] || token;
                }
                return token;
            };
        var symbol, preErrorSymbol, state, action, r, yyval = {}, p, len, newState, expected;
        while (true) {
            state = stack[stack.length - 1];
            if (this.defaultActions[state]) {
                action = this.defaultActions[state];
            } else {
                if (symbol === null || typeof symbol == 'undefined') {
                    symbol = lex();
                }
                action = table[state] && table[state][symbol];
            }
                        if (typeof action === 'undefined' || !action.length || !action[0]) {
                    var errStr = '';
                    expected = [];
                    for (p in table[state]) {
                        if (this.terminals_[p] && p > TERROR) {
                            expected.push('\'' + this.terminals_[p] + '\'');
                        }
                    }
                    if (lexer.showPosition) {
                        errStr = 'Parse error on line ' + (yylineno + 1) + ':\n' + lexer.showPosition() + '\nExpecting ' + expected.join(', ') + ', got \'' + (this.terminals_[symbol] || symbol) + '\'';
                    } else {
                        errStr = 'Parse error on line ' + (yylineno + 1) + ': Unexpected ' + (symbol == EOF ? 'end of input' : '\'' + (this.terminals_[symbol] || symbol) + '\'');
                    }
                    this.parseError(errStr, {
                        text: lexer.match,
                        token: this.terminals_[symbol] || symbol,
                        line: lexer.yylineno,
                        loc: yyloc,
                        expected: expected
                    });
                }
            if (action[0] instanceof Array && action.length > 1) {
                throw new Error('Parse Error: multiple actions possible at state: ' + state + ', token: ' + symbol);
            }
            switch (action[0]) {
            case 1:
                stack.push(symbol);
                vstack.push(lexer.yytext);
                lstack.push(lexer.yylloc);
                stack.push(action[1]);
                symbol = null;
                if (!preErrorSymbol) {
                    yyleng = lexer.yyleng;
                    yytext = lexer.yytext;
                    yylineno = lexer.yylineno;
                    yyloc = lexer.yylloc;
                } else {
                    symbol = preErrorSymbol;
                    preErrorSymbol = null;
                }
                break;
            case 2:
                len = this.productions_[action[1]][1];
                yyval.$ = vstack[vstack.length - len];
                yyval._$ = {
                    first_line: lstack[lstack.length - (len || 1)].first_line,
                    last_line: lstack[lstack.length - 1].last_line,
                    first_column: lstack[lstack.length - (len || 1)].first_column,
                    last_column: lstack[lstack.length - 1].last_column
                };
                if (ranges) {
                    yyval._$.range = [
                        lstack[lstack.length - (len || 1)].range[0],
                        lstack[lstack.length - 1].range[1]
                    ];
                }
                r = this.performAction.apply(yyval, [
                    yytext,
                    yyleng,
                    yylineno,
                    sharedState.yy,
                    action[1],
                    vstack,
                    lstack
                ].concat(args));
                if (typeof r !== 'undefined') {
                    return r;
                }
                if (len) {
                    stack = stack.slice(0, -1 * len * 2);
                    vstack = vstack.slice(0, -1 * len);
                    lstack = lstack.slice(0, -1 * len);
                }
                stack.push(this.productions_[action[1]][0]);
                vstack.push(yyval.$);
                lstack.push(yyval._$);
                newState = table[stack[stack.length - 2]][stack[stack.length - 1]];
                stack.push(newState);
                break;
            case 3:
                return true;
            }
        }
        return true;
    }};


    function pairsToMap(pairs) {
        var map = {};
        pairs.forEach(function(k) {
            if (k[0] in map) {
                throw new Error("Duplicate key in record type.");
            }

            map[k[0]] = k[1];
        });

        return map;
    }
    /* generated by jison-lex 0.3.4 */
    var lexer = (function(){
    var lexer = ({

    EOF:1,

    parseError:function parseError(str, hash) {
            if (this.yy.parser) {
                this.yy.parser.parseError(str, hash);
            } else {
                throw new Error(str);
            }
        },

    // resets the lexer, sets new input
    setInput:function (input, yy) {
            this.yy = yy || this.yy || {};
            this._input = input;
            this._more = this._backtrack = this.done = false;
            this.yylineno = this.yyleng = 0;
            this.yytext = this.matched = this.match = '';
            this.conditionStack = ['INITIAL'];
            this.yylloc = {
                first_line: 1,
                first_column: 0,
                last_line: 1,
                last_column: 0
            };
            if (this.options.ranges) {
                this.yylloc.range = [0,0];
            }
            this.offset = 0;
            return this;
        },

    // consumes and returns one char from the input
    input:function () {
            var ch = this._input[0];
            this.yytext += ch;
            this.yyleng++;
            this.offset++;
            this.match += ch;
            this.matched += ch;
            var lines = ch.match(/(?:\r\n?|\n).*/g);
            if (lines) {
                this.yylineno++;
                this.yylloc.last_line++;
            } else {
                this.yylloc.last_column++;
            }
            if (this.options.ranges) {
                this.yylloc.range[1]++;
            }

            this._input = this._input.slice(1);
            return ch;
        },

    // unshifts one char (or a string) into the input
    unput:function (ch) {
            var len = ch.length;
            var lines = ch.split(/(?:\r\n?|\n)/g);

            this._input = ch + this._input;
            this.yytext = this.yytext.substr(0, this.yytext.length - len);
            //this.yyleng -= len;
            this.offset -= len;
            var oldLines = this.match.split(/(?:\r\n?|\n)/g);
            this.match = this.match.substr(0, this.match.length - 1);
            this.matched = this.matched.substr(0, this.matched.length - 1);

            if (lines.length - 1) {
                this.yylineno -= lines.length - 1;
            }
            var r = this.yylloc.range;

            this.yylloc = {
                first_line: this.yylloc.first_line,
                last_line: this.yylineno + 1,
                first_column: this.yylloc.first_column,
                last_column: lines ?
                    (lines.length === oldLines.length ? this.yylloc.first_column : 0)
                     + oldLines[oldLines.length - lines.length].length - lines[0].length :
                  this.yylloc.first_column - len
            };

            if (this.options.ranges) {
                this.yylloc.range = [r[0], r[0] + this.yyleng - len];
            }
            this.yyleng = this.yytext.length;
            return this;
        },

    // When called from action, caches matched text and appends it on next action
    more:function () {
            this._more = true;
            return this;
        },

    // When called from action, signals the lexer that this rule fails to match the input, so the next matching rule (regex) should be tested instead.
    reject:function () {
            if (this.options.backtrack_lexer) {
                this._backtrack = true;
            } else {
                return this.parseError('Lexical error on line ' + (this.yylineno + 1) + '. You can only invoke reject() in the lexer when the lexer is of the backtracking persuasion (options.backtrack_lexer = true).\n' + this.showPosition(), {
                    text: "",
                    token: null,
                    line: this.yylineno
                });

            }
            return this;
        },

    // retain first n characters of the match
    less:function (n) {
            this.unput(this.match.slice(n));
        },

    // displays already matched input, i.e. for error messages
    pastInput:function () {
            var past = this.matched.substr(0, this.matched.length - this.match.length);
            return (past.length > 20 ? '...':'') + past.substr(-20).replace(/\n/g, "");
        },

    // displays upcoming input, i.e. for error messages
    upcomingInput:function () {
            var next = this.match;
            if (next.length < 20) {
                next += this._input.substr(0, 20-next.length);
            }
            return (next.substr(0,20) + (next.length > 20 ? '...' : '')).replace(/\n/g, "");
        },

    // displays the character position where the lexing error occurred, i.e. for error messages
    showPosition:function () {
            var pre = this.pastInput();
            var c = new Array(pre.length + 1).join("-");
            return pre + this.upcomingInput() + "\n" + c + "^";
        },

    // test the lexed token: return FALSE when not a match, otherwise return token
    test_match:function(match, indexed_rule) {
            var token,
                lines,
                backup;

            if (this.options.backtrack_lexer) {
                // save context
                backup = {
                    yylineno: this.yylineno,
                    yylloc: {
                        first_line: this.yylloc.first_line,
                        last_line: this.last_line,
                        first_column: this.yylloc.first_column,
                        last_column: this.yylloc.last_column
                    },
                    yytext: this.yytext,
                    match: this.match,
                    matches: this.matches,
                    matched: this.matched,
                    yyleng: this.yyleng,
                    offset: this.offset,
                    _more: this._more,
                    _input: this._input,
                    yy: this.yy,
                    conditionStack: this.conditionStack.slice(0),
                    done: this.done
                };
                if (this.options.ranges) {
                    backup.yylloc.range = this.yylloc.range.slice(0);
                }
            }

            lines = match[0].match(/(?:\r\n?|\n).*/g);
            if (lines) {
                this.yylineno += lines.length;
            }
            this.yylloc = {
                first_line: this.yylloc.last_line,
                last_line: this.yylineno + 1,
                first_column: this.yylloc.last_column,
                last_column: lines ?
                             lines[lines.length - 1].length - lines[lines.length - 1].match(/\r?\n?/)[0].length :
                             this.yylloc.last_column + match[0].length
            };
            this.yytext += match[0];
            this.match += match[0];
            this.matches = match;
            this.yyleng = this.yytext.length;
            if (this.options.ranges) {
                this.yylloc.range = [this.offset, this.offset += this.yyleng];
            }
            this._more = false;
            this._backtrack = false;
            this._input = this._input.slice(match[0].length);
            this.matched += match[0];
            token = this.performAction.call(this, this.yy, this, indexed_rule, this.conditionStack[this.conditionStack.length - 1]);
            if (this.done && this._input) {
                this.done = false;
            }
            if (token) {
                return token;
            } else if (this._backtrack) {
                // recover context
                for (var k in backup) {
                    this[k] = backup[k];
                }
                return false; // rule action called reject() implying the next rule should be tested instead.
            }
            return false;
        },

    // return next match in input
    next:function () {
            if (this.done) {
                return this.EOF;
            }
            if (!this._input) {
                this.done = true;
            }

            var token,
                match,
                tempMatch,
                index;
            if (!this._more) {
                this.yytext = '';
                this.match = '';
            }
            var rules = this._currentRules();
            for (var i = 0; i < rules.length; i++) {
                tempMatch = this._input.match(this.rules[rules[i]]);
                if (tempMatch && (!match || tempMatch[0].length > match[0].length)) {
                    match = tempMatch;
                    index = i;
                    if (this.options.backtrack_lexer) {
                        token = this.test_match(tempMatch, rules[i]);
                        if (token !== false) {
                            return token;
                        } else if (this._backtrack) {
                            match = false;
                            continue; // rule action called reject() implying a rule MISmatch.
                        } else {
                            // else: this is a lexer rule which consumes input without producing a token (e.g. whitespace)
                            return false;
                        }
                    } else if (!this.options.flex) {
                        break;
                    }
                }
            }
            if (match) {
                token = this.test_match(match, rules[index]);
                if (token !== false) {
                    return token;
                }
                // else: this is a lexer rule which consumes input without producing a token (e.g. whitespace)
                return false;
            }
            if (this._input === "") {
                return this.EOF;
            } else {
                return this.parseError('Lexical error on line ' + (this.yylineno + 1) + '. Unrecognized text.\n' + this.showPosition(), {
                    text: "",
                    token: null,
                    line: this.yylineno
                });
            }
        },

    // return next match that has a token
    lex:function lex () {
            var r = this.next();
            if (r) {
                return r;
            } else {
                return this.lex();
            }
        },

    // activates a new lexer condition state (pushes the new lexer condition state onto the condition stack)
    begin:function begin (condition) {
            this.conditionStack.push(condition);
        },

    // pop the previously active lexer condition state off the condition stack
    popState:function popState () {
            var n = this.conditionStack.length - 1;
            if (n > 0) {
                return this.conditionStack.pop();
            } else {
                return this.conditionStack[0];
            }
        },

    // produce the lexer rule set which is active for the currently active lexer condition state
    _currentRules:function _currentRules () {
            if (this.conditionStack.length && this.conditionStack[this.conditionStack.length - 1]) {
                return this.conditions[this.conditionStack[this.conditionStack.length - 1]].rules;
            } else {
                return this.conditions["INITIAL"].rules;
            }
        },

    // return the currently active lexer condition state; when an index argument is provided it produces the N-th previous condition state, if available
    topState:function topState (n) {
            n = this.conditionStack.length - 1 - Math.abs(n || 0);
            if (n >= 0) {
                return this.conditionStack[n];
            } else {
                return "INITIAL";
            }
        },

    // alias for begin(condition)
    pushState:function pushState (condition) {
            this.begin(condition);
        },

    // return the number of states currently on the stack
    stateStackSize:function stateStackSize() {
            return this.conditionStack.length;
        },
    options: {},
    performAction: function anonymous(yy,yy_,$avoiding_name_collisions,YY_START) {
    switch($avoiding_name_collisions) {
    case 0:return 7
    break;
    case 1:return 30
    break;
    case 2:return 25
    break;
    case 3:return 10
    break;
    case 4:return 14
    break;
    case 5:return 16
    break;
    case 6:return 17
    break;
    case 7:return 19
    break;
    case 8:return 12
    break;
    case 9:return 13
    break;
    case 10:return 20
    break;
    case 11:return 21
    break;
    case 12:return 23
    break;
    case 13:return 24
    break;
    case 14:return 22
    break;
    case 15:return "'";
    break;
    case 16:return 8
    break;
    case 17:/* skip */
    break;
    case 18:return 6
    break;
    case 19:return 'INVALID'
    break;
    }
    },
    rules: [/^(?:~>)/,/^(?:<=)/,/^(?:\\)/,/^(?:_\b)/,/^(?:\()/,/^(?:\))/,/^(?:<)/,/^(?:>)/,/^(?:\[)/,/^(?:\])/,/^(?:\{)/,/^(?:\})/,/^(?:,)/,/^(?::)/,/^(?:\+)/,/^(?:')/,/^(?:[_a-zA-Z][_a-zA-Z0-9]*)/,/^(?:\s+)/,/^(?:$)/,/^(?:.)/],
    conditions: {"INITIAL":{"rules":[0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19],"inclusive":true}}
    });
    return lexer;
    })();
    parser.lexer = lexer;
    function Parser () {
      this.yy = {};
    }
    Parser.prototype = parser;parser.Parser = Parser;
    return new Parser;
    })();

    class LiftedArrow extends Arrow {
        constructor(f, type) {
            if (!(f instanceof Function)) {
                throw new Error("Cannot lift non-function");
            }

            if (!(type instanceof ArrowType)) {
                type = _construct(() => {
                    let s = f.toString();
                    let i = s.indexOf("/*");
                    let j = s.indexOf("*/", i + 1);
                    let c = s.substring(i + 2, j);

                    let parsed = parseAnnotation(c, c => {
                        let comment, ty;

                        try {
                            comment = c.match(/@arrow :: (.*)\n?/)[1];
                        } catch (err) {
                            if (exports._enableTypecheck) {
                                console.warn("Function being lifted does not contain an @arrow annotation");
                            }

                            comment = "_ ~> _";
                            return [ParamType.fresh(), ParamType.fresh(), [[], []]];
                        }

                        try {
                            // jison exports the parser name like this
                            ty = parser.parse(comment);
                        } catch (err) {
                            throw new Error(`Function being lifted does not contain a parseable @arrow annotation.\n${err.message}\n`);
                        }

                        return ty;
                    });

                    let arg = parsed[0];
                    let out = parsed[1];
                    let ncs = new ConstraintSet([]).addAll(parsed[2][0]);

                    return new ArrowType(arg, out, ncs, parsed[2][1]).sanitize();
                });
            }

            super(type);

            this.f = f;
        }

        toString() {
            return "lift :: " + this.type.toString();
        }

        call(x, p, k, h) {
            let result;

            try {
                // If the function has more than one parameter and we have
                // an array argument, spread the elements. Else, just call
                // the function with a single argument.

                if (x && x.constructor === Array && this.f.length > 1) {
                    result = this.f.apply(null, x);
                } else {
                    result = this.f(x);
                }

                _check(this.type.out, result);
            } catch (err) {
                h(err);
                return;
            }

            k(result);
        }

        equals(that) {
            return that instanceof LiftedArrow && this.f === that.f;
        }
    }

    class KLiftedArrow extends Arrow {
        constructor(f, type) {
            if (!(f instanceof Function)) {
                throw new Error("Cannot lift non-function");
            }

            if (!(type instanceof ArrowType)) {
                type = _construct(() => {
                    let s = f.toString();
                    let i = s.indexOf("/*");
                    let j = s.indexOf("*/", i + 1);
                    let c = s.substring(i + 2, j);

                    let parsed = parseAnnotation(c, c => {
                        let comment, ty;

                        try {
                            comment = c.match(/@arrow :: (.*)\n?/)[1];
                        } catch (err) {
                            if (exports._enableTypecheck) {
                                console.warn("Function being lifted does not contain an @arrow annotation");
                            }

                            comment = "_ ~> _";
                            return [ParamType.fresh(), ParamType.fresh(), [[], []]];
                        }

                        try {
                            // jison exports the parser name like this
                            ty = parser.parse(comment);
                        } catch (err) {
                            throw new Error(`Function being lifted does not contain a parseable @arrow annotation.\n${err.message}\n`);
                        }

                        return ty;
                    });

                    let arg = parsed[0];
                    let out = parsed[1];
                    let ncs = new ConstraintSet([]).addAll(parsed[2][0]);

                    return new ArrowType(arg, out, ncs, parsed[2][1]).sanitize();
                });
            }

            super(type);

            this.f = f;
        }

        toString() {
            return "klift :: " + this.type.toString();
        }

        call(x, p, k, h) {
            let abort = false;
            let cleanup;  // clean up function to be called upon cancellation or completion
            const cl = () => { if (cleanup) cleanup(); };

            let callback = (...result) => {
                if (abort) return;
                    abort = true;
                    cl();

                p.advance();
                if (result.length <= 1) {
                     result = result[0];
                }
                _check(this.type.out, result);
                k(result);
            };

            p.addCanceler(() => { if (!abort) { abort = true; cl(); } });

            // If the function has more than one parameter and we have
            // an array argument, spread the elements. Else, just call
            // the function with a single argument.

            let args;
            if (this.f.length == 1) {
                args = [callback];
            } else {
                if (x && x.constructor === Array && this.f.length > 2)
                    args = x.concat(callback);
                else
                    args = [x, callback];
            }
            try {
                cleanup = this.f.apply(null, args);
            }
            catch (e) {
                h(e);
                cl();
            }
        }

        equals(that) {
            return that instanceof KLiftedArrow && this.f === that.f;
        }

        isAsync() {
            return true;
        }
    }


    Arrow.id = () => new LiftedArrow(x => {
        /* @arrow :: 'a ~> 'a */
        return x;
    });

    Arrow.lift = (o, type) => {
      return (o instanceof Object && 'lift' in o)
        ? o.lift(type) : new LiftedArrow(() => o, type);
    };
    Arrow.klift = (f, type) => new KLiftedArrow(f, type);


    // extensions
    Function.prototype.lift = function(type) {
        return new LiftedArrow(this, type);
    };

    Function.prototype.klift = function(type) {
      return new KLiftedArrow(this, type);
    };

    Number.prototype.lift = function() {
        let value = this.valueOf();

        return new LiftedArrow(() => {
            /* @arrow :: _ ~> Number */
            return value;
        });
    };

    Boolean.prototype.lift = function() {
        let value = this.valueOf();

        return new LiftedArrow(() => {
            /* @arrow :: _ ~> Bool */
            return value;
        });
    };

    String.prototype.lift = function() {
        let value = this.valueOf();

        return new LiftedArrow(() => {
            /* @arrow :: _ ~> String */
            return value;
        });
    };

    class ComposeError extends Error {
        constructor(message) {
            super();
            this.message = message;
        }

        toString() {
            return this.message;
        }
    }

    function ensureArrow(arrow) {
        if (!(arrow instanceof Arrow)) {
            throw new ComposeError(`Passed non-arrow (${JSON.stringify(arrow)}) to combinator`);
        }
        return arrow;
    }

    function getNonNullElems(arrows) {
        let filtered = arrows.filter(a => a !== null);
        if (filtered.length == 0) {
            throw new ComposeError("Combinator contains no non-null arguments.");
        }

        return filtered;
    }

    function getNonNullArrows(arrows) {
        let filtered = getNonNullElems(arrows);
        filtered.forEach(ensureArrow);
        return filtered;
    }

    function descendants(param) {
        let children = [param];
        for (let child of param.children) {
            for (let descendant of descendants(child)) {
                children.push(descendant);
            }
        }

        return children;
    }

    class Combinator extends Arrow {
        constructor(type, arrows) {
            super(type);
            this.arrows = arrows;
        }

        toString() {
            return this.constructor.name + "(" + this.arrows.map(a => a.toString()).join(", ") + ") :: " + this.type.toString();
        }

        isAsync() {
            return this.arrows.some(a => a.isAsync());
        }

        equals(that) {
            if (this.constructor === that.constructor) {
                return this.arrows.length === that.arrows.length && this.arrows.every((a, i) => a.equals(that.arrows[i]));
            }

            return false;
        }
    }

    class NoEmitCombinator extends Combinator {
        constructor(a) {
            ensureArrow(a);

            super(_construct(() => {
                return a.type;
            }), [a]);
        }

        toString() {
            return "noemit(" + this.arrows[0].toString() + ") :: " + this.type.toString();
        }

        call(x, p, k, h) {
            let quiet = new Progress(false);
            p.addCanceler(() => quiet.cancel());

            this.arrows[0].call(x, quiet, z => {
                p.advance();

                setTimeout(() => k(z), 0);
            }, h);
        }

        isAsync() {
            return true;
        }
    }

    class SeqCombinator extends Combinator {
        constructor(arrows) {
            arrows = getNonNullArrows(arrows);

            super(_construct(() => {
                let sty = sanitizeTypes(arrows);

                try {
                    let len = sty.length - 1;

                    let arg = sty[0].arg;
                    let out = sty[len].out;
                    let ncs = new ConstraintSet([]);
                    let err = sty[0].errors;

                    sty.forEach((t, i) => {
                        ncs = ncs.concat(t.constraints);
                        err = err.concat(t.errors);

                        if (i != 0) {
                            ncs = ncs.add(new Constraint(sty[i - 1].out, t.arg));
                        }
                    });

                    return new ArrowType(arg, out, ncs, err);
                } catch (err) {
                    let message;
                    let location = getLocation(err.stack);

                    if (location) {
                        message = "Unable to seq arrows at: " + location;
                    } else {
                        message = "Unable to seq arrows";
                    }

                    throw new ComposeError(message + "\n\tInput => Seq(" + sty.join(", ") + ")\n\tError => " + err);
                }
            }), arrows);
        }

        toString() {
            return "seq(" + this.arrows.map(a => a.toString()).join(", ") + ") :: " + this.type.toString();
        }

        call(x, p, k, h) {
            let i = 0;
            let arrows = this.arrows;
            const rec = y => {
                if (i >= arrows.length - 1) {
                    arrows[i].call(y, p, k, h);
                } else {
                    arrows[i++].call(y, p, rec, h);
                }
            };

            rec(x);
        }
    }

    class AllCombinator extends Combinator {
        constructor(arrows) {
            arrows = getNonNullArrows(arrows);

            super(_construct(() => {
                let sty = sanitizeTypes(arrows);

                try {
                    let arg = [];
                    let out = [];
                    let ncs = new ConstraintSet([]);
                    let err = [];

                    sty.forEach(t => {
                        arg.push(t.arg);
                        out.push(t.out);

                        ncs = ncs.concat(t.constraints);
                        err = err.concat(t.errors);
                    });

                    return new ArrowType(new TupleType(arg), new TupleType(out), ncs, err);
                } catch (err) {
                    let message;
                    let location = getLocation(err.stack);

                    if (location) {
                        message = "Unable to all arrows at: " + location;
                    } else {
                        message = "Unable to all arrows";
                    }

                    throw new ComposeError(message + "\n\tInput => All(" + sty.join(", ") + ")\n\tError => " + err);
                }
            }), arrows);
        }

        toString() {
            return "all(" + this.arrows.map(a => a.toString()).join(", ") + ") :: " + this.type.toString();
        }

        call(x, p, k, h) {
            let numFinished = 0;
            let callResults = this.arrows.map(() => null);

            this.arrows.forEach((a, i) => {
                a.call(x[i], p, y => {
                    callResults[i] = y;

                    // Once results array is finished, continue
                    if (++numFinished == this.arrows.length) {
                        k(callResults);
                    }
                }, h);
            });
        }
    }

    class AnyCombinator extends Combinator {
        constructor(arrows) {
            arrows = getNonNullArrows(arrows);

            super(_construct(() => {
                let sty = sanitizeTypes(arrows);

                try {
                    let arg = ParamType.fresh();
                    let out = ParamType.fresh();
                    let ncs = new ConstraintSet([]);
                    let err = [];

                    sty.forEach(t => {
                        ncs = ncs.concat(t.constraints);
                        err = err.concat(t.errors);

                        ncs = ncs.add(new Constraint(arg, t.arg));
                        ncs = ncs.add(new Constraint(t.out, out));
                    });

                    return new ArrowType(arg, out, ncs, err);
                } catch (err) {
                    let message;
                    let location = getLocation(err.stack);

                    if (location) {
                        message = "Unable to any arrows at: " + location;
                    } else {
                        message = "Unable to any arrows";
                    }

                    throw new ComposeError(message + "\n\tInput => Any(" + sty.join(", ") + ")\n\tError => " + err);
                }
            }), arrows);
        }

        toString() {
            return "any(" + this.arrows.map(a => a.toString()).join(", ") + ") :: " + this.type.toString();
        }

        call(x, p, k, h) {
            // Note: This must be done at execution time instead of construction
            // time because a recursive arrow may present itself as falsely async.

            if (!this.arrows.every(a => a.isAsync())) {
                throw new Error("Any combinator requires asynchronous arrow arguments");
            }

            let progress = this.arrows.map(() => new Progress(true));

            // If combinator is canceled, cancel all children
            p.addCanceler(e => progress.forEach(p => p.cancel(e)));

            this.arrows.forEach((a, i) => {
                // When arrow[i] progresses, cancel others
                progress[i].addObserver(() => {
                    p.advance();

                    progress.forEach((p, j) => {
                        if (j != i) {
                            p.cancel();
                        }
                    });
                });

                // TODO - clone value
                // Kick off execution synchronously
                a.call(x, progress[i], k, h);
            });
        }

        isAsync() {
            return true;
        }
    }

    class TryCombinator extends Combinator {
        constructor(a, s, f) {
            ensureArrow(a);
            ensureArrow(s);
            ensureArrow(f);

            super(_construct(() => {
                let sta = sanitizeTypes([a])[0];
                let sts = sanitizeTypes([s])[0];
                let stf = sanitizeTypes([f])[0];

                try {
                    let arg = sta.arg;
                    let out = ParamType.fresh();
                    let ncs = new ConstraintSet([]);
                    let err = [];

                    ncs = ncs.concat(sta.constraints);
                    ncs = ncs.concat(sts.constraints);
                    ncs = ncs.concat(stf.constraints);
                    ncs = ncs.add(new Constraint(sta.out, sts.arg));
                    ncs = ncs.add(new Constraint(sts.out, out));
                    ncs = ncs.add(new Constraint(stf.out, out));

                    sta.errors.forEach(e => {
                        ncs = ncs.add(new Constraint(e, stf.arg));
                    });

                    err = err.concat(sts.errors);
                    err = err.concat(stf.errors);

                    return new ArrowType(arg, out, ncs, err);
                } catch (err) {
                    let message;
                    let location = getLocation(err.stack);

                    if (location) {
                        message = "Unable to try arrows at: " + location;
                    } else {
                        message = "Unable to try arrows";
                    }

                    throw new ComposeError(message + "\n\tInput => Try(" + [sta, sts, stf].join(", ") + ")\n\tError => " + err);
                }
            }), [a, s, f]);
        }

        toString() {
            return "try(" + this.arrows.map(a => a.toString()).join(", ") + ") :: " + this.type.toString();
        }

        call(x, p, k, h) {
            // Invoke original error callback "h" if either
            // callback creates an error value. This allows
            // nesting of error callbacks.

            let branch = new Progress(true);
            p.addCanceler(() => branch.cancel());
            branch.addObserver(() => p.advance());

            this.arrows[0].call(x, branch,
                y => this.arrows[1].call(y, p, k, h),
                z => {
                    branch.cancel();
                    this.arrows[2].call(z, p, k, h);
                }
            );
        }

        isAsync() {
            return (this.arrows[0].isAsync() || this.arrows[1].isAsync()) && this.arrows[2].isAsync();
        }
    }

    //
    // Fix-Point Combinator
    //

    class ProxyArrow extends Arrow {
        constructor(arg, out) {
            super(_construct(() => {
                return new ArrowType(arg, out);
            }));

            this.arrow = null;
        }

        toString() {
            if (this.arrow !== null) {
                return "omega :: " + this.arrow.type.toString();
            }

            return "omega :: ???";
        }

        freeze(arrow) {
            this.arrow = arrow;
        }

        call(x, p, k, h) {
            return this.ensureFrozen(a => a.call(x, p, k, h));
        }

        equals(that) {
            return this.ensureFrozen(a => a.equals(that));
        }

        isAsync() {
            if (this._isAsync === undefined) {
              this._isAsync = false;
              this._isAsync = this.ensureFrozen(a => a.isAsync());
            }
            return this._isAsync;
        }

        ensureFrozen(f) {
            if (this.arrow !== null) {
                return f(this.arrow);
            }

            throw new Error("Proxy not frozen");
        }
    }

    Arrow.fix = function(ctor) {
        let arg = ParamType.fresh(true);
        let out = ParamType.fresh(true);

        let p = new ProxyArrow(arg, out);
        let a = ctor(p);
        p.freeze(a);

        if (!(a instanceof Arrow)) {
            throw new Error("Fix constructor must return an arrow");
        }

        let t = a.type.toString();

        let map = {};
        descendants(arg).forEach(d => map[d.id] = arg);
        descendants(out).forEach(d => map[d.id] = out);

        arg.noreduce = false;
        out.noreduce = false;
        a.type.substitute(map);

        a.type.constraints = a.type.constraints.add(new Constraint(a.type.arg, arg));
        a.type.constraints = a.type.constraints.add(new Constraint(arg, a.type.arg));
        a.type.constraints = a.type.constraints.add(new Constraint(a.type.out, out));
        a.type.constraints = a.type.constraints.add(new Constraint(out, a.type.out));

        try {
            a.type.resolve();
        } catch (err) {
            let message;
            let location = getLocation(err.stack);

            if (location) {
                message = "Unable to fix arrow at: " + location;
            } else {
                message = "Unable to fix arrow";
            }

            throw new ComposeError(message + "\n\tInput => Fix(" + t + ")\n\tError => " + err);
        }

        return a;
    };

    class FaninCombinator extends Combinator {
      constructor(left, right) {
        ensureArrow(left);
        ensureArrow(right);

        super(_construct(() => {
          let stl = sanitizeTypes([left])[0];
          let str = sanitizeTypes([right])[0];

          try {
            let tl = ParamType.fresh();
            let tr = ParamType.fresh();
            let arg = new TaggedUnionType({left: tl, right: tr});

            let out = ParamType.fresh();
            let ncs = new ConstraintSet([]);
            let err = [];

            ncs = ncs.concat(stl.constraints);
            ncs = ncs.concat(str.constraints);
            ncs = ncs.add(new Constraint(stl.arg, tl));
            ncs = ncs.add(new Constraint(str.arg, tr));

            ncs = ncs.add(new Constraint(stl.out, out));
            ncs = ncs.add(new Constraint(str.out, out));

            err = err.concat(stl.errors);
            err = err.concat(str.errors);

            return new ArrowType(arg, out, ncs, err);
          } catch (err) {
            throw new ComposeError("Unabled to compose Choice(" + stl + ", " + str + ")\n" + err);
          }
        }), [left, right]);
      }

      call(x, p, k, h) {
        if (!(x instanceof TaggedValue)) {
          throw new Error("Input value is not a tagged value");
        }

        if (x.hasTag("left")) {
          this.arrows[0].call(x.value(), p, k, h);
        } else if (x.hasTag("right")) {
          this.arrows[1].call(x.value(), p, k, h);
        } else {
          throw new Error("Input value does not have left or right tag");
        }
      }
    }


    // Unary combinators
    Arrow.noemit = arrow => new NoEmitCombinator(arrow);

    // N-ary combinators
    Arrow.seq = arrows => new SeqCombinator(arrows);
    Arrow.any = arrows => new AnyCombinator(arrows);
    Arrow.all = arrows => new AllCombinator(arrows);
    Arrow.try = (a, s, f) => new TryCombinator(a, s, f);
    Arrow.fanout = arrows => Arrow.split(arrows.length).seq(Arrow.all(arrows));

    // left  : a -> b
    // right : a' -> b
    // arrow : <left: a, right: a'> ~> b
    Arrow.fanin = (left, right) => new FaninCombinator(left, right);


    Arrow.tap = (ar, arrows) => {
        let sec = getNonNullElems(arrows.map(a => a.lift()));
        let rem = [ar].concat(sec.map(a => a.remember()));
        return Arrow.seq(rem);
    };

    function notEqual(actual, expected) {
      if (actual === expected) {
        throw new Error(`actual=${actual}, expected=${expected}`);
      }
    }

    function equal(actual, expected) {
      if (actual !== expected) {
        throw new Error(`actual=${actual}, expected=${expected}`);
      }
    }

    function fail(msg) {
      throw new Error(msg);
    }

    function assert(value) {
      equal(Boolean(value), true);
    }

    assert.equal = equal;
    assert.notEqual = notEqual;
    assert.ok = assert;
    assert.fail = fail;

    class LiftedAnyArrow extends Combinator {
      constructor(f, arrows) {
        // TODO
        super(new ArrowType(ParamType.fresh(), ParamType.fresh()));

        assert.equal(f.length - 1, arrows.length);
        //arrows.forEach(a => ensureArrow(a));

        this.f = f;
        this.arrows = arrows.map(a => a.lift());
      }

      call(x, p, k, h) {
        let stop = false;
        let progress = this.arrows.map(() => new Progress(true));

        p.addCanceler(() => {
          stop = true;
          progress.forEach(p => p.cancel());
        });

        let succ = i => {
          stop = true;
          p.advance();
          progress.forEach((p, j) => {
            if (j != i) {
              p.cancel();
            }
          });
        };

        let ka = progress.map((pi, i) => {
          progress[i].addObserver(() => succ(i));

          let ks = (y, sp) => {
            if (!stop) succ(i);
            k(y, sp);
          };

          return y => {
            if (!stop) {
              //progress[i].advance();
              this.arrows[i].call(y, progress[i], ks, h);
            }
          };
        });

        this.f.apply(null, [x].concat(ka));
      }

      isAsync() {
        return true;
      }
    }

    Arrow.liftany = (f, ...arrows) => new LiftedAnyArrow(f, arrows);

    Function.prototype.liftany = function(...arrows) {
      return new LiftedAnyArrow(this, arrows);
    };

    class LiftedAllArrow extends Combinator {
      constructor(f, arrows) {
        //TODO
        super(new ArrowType(ParamType.fresh(), ParamType.fresh()));

        assert.equal(f.length - 1, arrows.length);
        //arrows.forEach(a => ensureArrow(a));

        this.f = f;
        this.arrows = arrows.map(a => a.lift());
      }

      call(x, p, k, h) {
        let numFinished = 0;
        let callResults = this.arrows.map(() => null);

        // FIXME safe to block?
        let current = 0;
        let callInputs = this.arrows.map(() => undefined);
        let callRecieved = this.arrows.map(() => false);

        let ks = this.arrows.map((a, i) =>
          y => {
            callInputs[i] = y;
            callRecieved[i] = true;
            if (current < i) return;
            current++;

            let ka = z => {
              callResults[i] = z;
              if (++numFinished == this.arrows.length) {
                k(callResults);
              } else if (callRecieved[current]) {
                ks[current](callInputs[current]);
              }
            };

            a.call(y, p, ka, h);
          });

        this.f.apply(null, [x].concat(ks));
      }
    }

    Arrow.liftall = (f, ...arrows) => new LiftedAllArrow(f, arrows);

    Function.prototype.liftall = function(...arrows) {
      return new LiftedAllArrow(this, arrows);
    };

    class LiftedChoiceArrow extends Combinator {
      constructor(f, arrows) {
        // TODO
        super(new ArrowType(ParamType.fresh(), ParamType.fresh()));

        if (arrows.length == 1)
          arrows.push(Arrow.id());

        assert.ok(arrows.length > 1);
        //arrows.forEach(a => ensureArrow(a));

        this.f = f;
        this.arrows = arrows.map(a => a.lift());
      }

      call(x, p, k, h) {
        let stop = false;

        p.addCanceler(() => { stop = true; });

        let ka = this.arrows.map(a => y => {
          if (!stop) {
            stop = true;
            a.call(y, p, k, h);
          }
        });

        this.f.apply(null, [x].concat(ka));
      }
    }

    Arrow.liftchoice = (f, ...arrows) => new LiftedChoiceArrow(f, arrows);

    Function.prototype.liftchoice = function(...arrows) {
      return new LiftedChoiceArrow(this, arrows);
    };

    //
    // Simple Asynchronous Arrow Implementation
    //

    class SimpleAsyncArrow extends Arrow {
        isAsync() {
            return true;
        }
    }

    // Simple Asynchronous Arrow that takes in a config object

    class SimpleConfigBasedAsyncArrow extends SimpleAsyncArrow {
        constructor(f, errorType) {
            if (!(f instanceof Function)) {
                throw new Error("Cannot use non-function as configuration value");
            }

            super(_construct(() => {
                let s = f.toString();
                let i = s.indexOf("/*");
                let j = s.indexOf("*/", i + 1);
                let c = s.substring(i + 2, j);

                let ncs = new ConstraintSet([]);
                let err = [new NamedType(errorType)];

                let [conf, resp] = parseAnnotation(c, c => {
                    try {
                        // jison exports the parser name like this
                        conf = parser.parse(c.match(/@conf :: (.*)\n?/)[1]);

                        ncs = ncs.addAll(conf[1][0]);
                        err = err.concat(conf[1][1]);
                    } catch (ex) {
                        throw new ComposeError(`Config does not contain a parseable @conf annotation.\n${ex.message}\n`);
                    }

                    try {
                        // jison exports the parser name like this
                        resp = parser.parse(c.match(/@resp :: (.*)\n?/)[1]);

                        ncs = ncs.addAll(resp[1][0]);
                        err = err.concat(resp[1][1]);
                    } catch (ex) {
                        throw new ComposeError(`Config does not contain a parseable @resp annotation.\n${ex.message}\n`);
                    }

                    return [conf, resp];
                });

                return new ArrowType(conf[0], resp[0], ncs, err).sanitize();
            }));

            this.c = f;
        }
    }

    class QueryArrow extends SimpleConfigBasedAsyncArrow {
        constructor(f, db) {
            super(f, "QueryError");
            this.db = db;
        }

        toString() {
            return "query :: " + this.type.toString();
        }

        call(x, p, k, h) {
            let conf;
            if (x && x.constructor === Array && this.c.length > 1) {
                conf = this.c.apply(null, x);
            } else {
                conf = this.c(x);
            }

            let abort = false;

            const cancel = () => {
                abort = true;
            };

            const fail = h;
            const succ = x => {
                _check(this.type.out, x);
                k(x);
            };

            this.db.query(conf.query, conf.param, (err, rows) => {
                if (err) {
                    if (!abort) {
                        p.advance(cancelerId);
                        fail(err);
                    }
                } else {
                    if (!abort) {
                        p.advance(cancelerId);
                        succ(rows);
                    }
                }
            });

            let cancelerId = p.addCanceler(cancel);
        }

        equals(that) {
            // TODO - deep comparison of objects
            return that instanceof QueryArrow && this.c === that.c;
        }
    }

    Array.create = function(length, value) {
        let arr = [];
        while (--length >= 0) {
            arr.push(value);
        }

        return arr;
    };

    Array.copy = function(array) {
        return [].slice.call(array);
    };

    Array.prototype.unique = function() {
        return this.filter((v, i, s) => s.indexOf(v) === i);
    };

    // Convenience

    Arrow.bind = (event, a) =>
      Arrow.seq([
        Arrow.split(2),
        Arrow.id().all(Arrow.event(event)),
        a
      ]);

    Arrow.catch = (a, f) => Arrow.try(a, Arrow.id(), f);
    Arrow.db = (f, db) => new QueryArrow(f, db);

    // Built-ins

    Arrow.first = arrow => Arrow.all([arrow, Arrow.id()]);
    Arrow.second = arrow => Arrow.all([Arrow.id(), arrow]);

    Arrow.elem = selector => Arrow.lift(() => {
      /* @arrow :: _ ~> Elem */
      let matches = document.querySelectorAll(selector);
      if (matches.length < 2)
        matches = matches[0];
      return matches;
    });

    Arrow.event = event => {
      return Arrow.klift((e, k) => {
        /* @arrow :: Elem ~> Event */
        let nodes = e instanceof NodeList ? e : [e];
        for (let n of nodes) {
          e.addEventListener(event, k);
        }
        return () => {
          for (let n of nodes) {
            n.removeEventListener(event, k);
          }
        };
      });
    };

    Arrow.on = (elem, evt) => Arrow.elem(elem).seq(Arrow.event(evt));

    Arrow.delay = duration => Arrow.klift((x, k) => {
      /* @arrow :: 'a ~> 'a */
      let timer = setTimeout(() => k(x), duration);
      return () => clearTimeout(timer);
    });

    Arrow.ddelay = () => Arrow.klift((x, k) => {
        /* @arrow :: Number ~> _ */
        let timer = setTimeout(() => k(undefined), x);
        return () => clearTimeout(timer);
    });


    Arrow.split = n => Arrow.lift(x => {
        return Array.create(n, x);
      },
      _construct(() => {
        let arg = ParamType.fresh();
        let out = Array.create(n, arg);

        return new ArrowType(arg, new TupleType(out));
      })
    );

    Arrow.nth = n => Arrow.lift(x => {
        return x[n - 1];
      },
      _construct(() => {
        let arg = Array.create(n).map(() => ParamType.fresh());
        let out = arg[n - 1];

        return new ArrowType(new TupleType(arg), out);
      })
    );


    Arrow.log = () => Arrow.lift(x => {
      /* @arrow :: 'a ~> 'a */
      console.log(x);
      return x;
    });

    Arrow.throwFalse = () => Arrow.lift(x => {
      /* @arrow :: Bool ~> _ \ ({}, {Bool}) */
      if (x) throw x;
      return x;
    });

    Arrow.raise = error => Arrow.lift(() => {
      throw error;
    });

    // same as
    // (x) => {
    //   try { return a(x); }
    //   catch(e) { h([x, e]); }
    // }
    Arrow.handle = (h, a) => {
        // tag right if success, tag left if exception
      let tag = t => Arrow.lift(x => {
        /* @arrow :: 'a ~> <left: 'a, right: 'a> */
        return new TaggedValue(t, x);
      });

      let tr = Arrow.try(a, tag('right'), tag('left'));
      let m = Arrow.lift(([x, t]) => {
        /* @arrow :: ('a, <left: 'b, right: 'b>) ~> <left: ('a, 'b), right: ('a, 'b)> */
        return new TaggedValue(t.tag, [x, t.val]);
      });

      let succ = Arrow.lift(([_, v]) => {
        /* @arrow :: ('a, 'b) ~> 'b */
        return v;
      });

      return tr.carry().seq(m).seq(Arrow.fanin(h, succ));
    };

    function benchmarkResultsOrRun(...arrows) {
        if (exports._enableBenchmark) {
            console.log("Arrows: " + Arrow.numarrows);
            console.log("Num annotations: " + exports.numannotations);
            console.log("Annotation parse time: " + exports.annotationParseTime);
        } else {
            for (let i = 0; i < arrows.length; i++) {
                arrows[i].run();
            }
        }
    }

    class CancelableArrow extends Arrow {
      constructor(a, f) {
        super(a.type);
        this.f = f;
        this.arrow = ensureArrow(a);
      }

      call(x, p, k, h) {
        this.arrow.call(x, p, k, h);
        p.addCanceler(c => this.f.call(null, x, c));
      }

      isAsync() {
        return this.arrow.isAsync();
      }
    }

    Arrow.onCancel = (a, f) => new CancelableArrow(a, f);

    // f takes (x, p)
    // where x is the input of a
    // p is the cancellation value
    Arrow.prototype.onCancel = function(f) {
      return new CancelableArrow(this, f);
    };

    function _load(nm) {
        if (typeof window !== 'undefined') {
            let Arrowjs = nm || this;
            if (Arrowjs !== undefined && Arrowjs !== window) {
                for (let k in Arrowjs)
                    window[k] = Arrowjs[k];
            }
        }
    }

    const reqAFrame = (k => {
        /* @arrow :: _ ~> Number */
        window.requestAnimationFrame(t => k(t));
    }).klift();

    // jquery
    const debounce = time => {
        let callback;
        const f = $.debounce(time, () => callback());

        return ((x, k) => {
            /* @arrow :: 'a ~> 'a */
            callback = () => k(x);
            f();
        }).klift();
    };

    const throttle = time => {
        let callback;
        const f = $.throttle(time, () => callback());

        return ((x, k) => {
            /* @arrow :: 'a ~> 'a */
            callback = () => k(x);
            f();
        }).klift();
    };

    const randomDelay = time => ((x, k) => {
        /* @arrow :: 'a ~> 'a */
        setTimeout(_ => k(x), Math.random() * time);
    }).klift();

    /*
     *  A stream arrow consists of an internal arrow and an emitter object
     *  The emitter has an on and off method to register and deregister a listener.
     *  The emitter has a fire method that passes an event to the registered listeners
     *  The emitter records its previous event (if any) so that it can be sampled as behavior.
     */

    class Emitter {
        constructor() {
            this.listener = [];
            this.now = undefined;

            this.emitA = (x => {
                /* @arrow :: 'a ~> 'a */
                this.now = x;
                this.listener.forEach(l => l(x));
                return x;
            }).lift();

            this.listenA = ((_, k) => {
                /* @arrow :: _ ~> 'a */
                this.listener.push(k);
                return () => {
                    this.listener =
                    this.listener.filter(l => l != k);
                };
            }).klift();

            this.nowA = (() => {
                /* @arrow :: _ ~> 'a */
                return this.now;
            }).lift();
        }
    }

    class BufferedEmitter extends Emitter {
        constructor(size = 0) {
            super();

            this.size = size;

            this.queue = [];
            this.empty = undefined;

            this.hasEventA = Arrow.lift(() => this.queue.length > 0);

            this.emptyA = ((x, k) => {
                /* @arrow :: 'a ~> 'a */
                const f = () => k(x);
                this.empty = f;
                return () => { this.empty = undefined; };
            }).klift();

            this.emitA = (x => {
                /* @arrow :: 'a ~> 'a */
                this.now = x;

                if (this.listener.length > 0) {
                    this.listener.forEach(l => l(x));
                }
                else {
                    this.queue.push(x);
                    if (this.queue.length > this.size) {
                        this.pop();
                    }
                }
                return x;
            }).lift();

            this.listenA = ((_, k) => {
                /* @arrow :: _ ~> 'a */
                if (this.queue.length > 0) {
                    k(this.pop());
                    if (this.queue.length == 0 && this.empty) {
                        this.empty();
                    }
                }
                else {
                    this.listener.push(k);
                }
                return () => {
                    this.listener =
                    this.listener.filter(l => l != k);
                };
            }).klift();

        }

        pop() {
            const x = this.queue[0];
            this.queue = this.queue.splice(1);
            return x;
        }
    }

    const counterA = () => {
        // number of events that are pending processing
        let count = 0;

        const incA = (x => {
            /* @arrow :: 'a ~> 'a */
            count++;
            return x;
        }).lift();

        const decA = (x => {
            /* @arrow :: 'a ~> 'a */
            count--;
            return x;
        }).lift();

        const isPositiveA = (() => {
            /* @arrow :: _ ~> Bool */
            return count > 0;
        }).lift();

        return [incA, decA, isPositiveA];
    };


    class StreamArrow {
        constructor(arrowF, name) {
            this.arrowF = arrowF;
            this.name = name;
        }

        /*
         * return an arrow and its associated emitter
         */
        instance() {
            const emitter = new Emitter();
            return [this.arrowF(emitter).seq(emitter.nowA), emitter];
        }


        /*
         * buffered stream with finite size
         */
        buffer(size) {
            const [thisArrow, thisEmitter] = this.instance();

            const f = emitter => {
                const loop = thisEmitter.listenA
                    .seq(emitter.emitA)
                    .forever();
                const cleanup = emitter.hasEventA.ifTrue(emitter.emptyA);

                return thisArrow.race(loop).seq(cleanup);
            };
            return new BufferedStream(f, 'buffer', size);
        }

        /*
         * Return accumulated value calculated using accumulator: ('a, 'b) ~> 'a on the events with 'seed: 'a' as the start.
         */
        scan(accumulator, seed) {
            const [thisArrow, thisEmitter] = this.instance();
            const f = emitter => {
                const loop = seed.seq(
                    thisEmitter.listenA
                    .carry()
                    .seq(accumulator)
                    .seq(emitter.emitA)
                    .forever()
                );
                return thisArrow.race(loop);
            };
            return new StreamArrow(f, 'scan');
        }

        /*
         * Return reduced value calculated using accumulator: ('a, 'a) ~> 'a on the events
         */
        reduce(accumulator) {
            const [thisArrow, thisEmitter] = this.instance();
            const f = emitter => {
                const loop =
                    thisEmitter.listenA
                    .carry()
                    .seq(accumulator)
                    .seq(emitter.emitA)
                    .forever();

                return thisArrow.race(thisEmitter.listenA.seq(emitter.emitA).seq(loop));
            };
            return new StreamArrow(f, 'reduce');
        }

        /*
         * Each event of 'this' stream is passed to an instance of the 'next' arrow.
         */
        map(next) {
            const [thisArrow, thisEmitter] = this.instance();

            const f = emitter => {
                const [incA, decA, isPositiveA] = counterA();
                const loop = thisEmitter.listenA.seq(
                    incA
                    .seq(next)
                    .seq(decA)
                    .seq(emitter.emitA)
                ).forever();

                return thisArrow.seq(isPositiveA.ifTrue(emitter.listenA)).race(loop);
            };

            return new StreamArrow(f, 'map');
        }

        /*
         * Each event of 'this' stream is passed to an instance of the 'next' arrow without waiting it to complete.
         */
        mapAsync(next) {
            const [thisArrow, thisEmitter] = this.instance();

            /*
             * Use spawn for immediate handling of events but the resulting events may be out of order.
             */
            const f = emitter => {
                const [incA, decA, isPositiveA] = counterA();
                const loop = Arrow.fix(alpha =>
                    thisEmitter.listenA.seq(
                        alpha.spawn(
                            incA
                            .seq(next)
                            .seq(decA)
                            .seq(emitter.emitA)
                        )
                    )
                );
                return thisArrow.seq(isPositiveA.whileTrueThen(emitter.listenA)).race(loop);
            };

            return new StreamArrow(f, 'mapAsync');
        }

        /*
         * Each event of 'this' stream will switch to an instance of the 'inner' stream (with the event as input).
         */
        switchMap(inner) {
            const [thisArrow, thisEmitter] = this.instance();
            const [innerArrow, innerEmitter] = inner.instance();

            const f = emitter => {
                const [incA, decA, isPositiveA] = counterA();
                const end = new Emitter();
                const pump = innerEmitter.listenA.seq(emitter.emitA).forever();

                const loop = Arrow.fix(alpha => thisEmitter.listenA.seq(
                    incA
                    .seq(innerArrow.race(pump))
                    .seq(decA)
                    .seq(end.emitA)
                    .seq(alpha)
                    .any(alpha)
                ));

                return thisArrow.seq(isPositiveA.ifTrue(end.listenA)).race(loop);
            };

            return new StreamArrow(f, 'switchmap');
        }

        /*
         * Each event of 'this' stream will run an instance of the 'arrow'
         */
        switch(arrow) {
            const [thisArrow, thisEmitter] = this.instance();

            const f = emitter => {
                const [incA, decA, isPositiveA] = counterA();
                const loop = Arrow.fix(alpha => thisEmitter.listenA.seq(
                    incA
                    .seq(arrow)
                    .seq(decA)
                    .seq(emitter.emitA)
                    .noemit()
                    .seq(alpha)
                    .any(alpha)
                ));

                return thisArrow.seq(isPositiveA.ifTrue(emitter.listenA)).race(loop);
            };
            return new StreamArrow(f, 'switch');
        }

        /*
         * Receive events from 'this' stream 'n' times and stops itself and 'this' stream.
         */
        take(n) {
            const [thisArrow, thisEmitter] = this.instance();
            const f = emitter => {
                const loop = thisEmitter.listenA
                    .seq(emitter.emitA)
                    .times(n);

                return thisArrow.race(loop);
            };
            return new StreamArrow(f, 'take');
        }

        /*
         * Continues to emit events until 'arrow' makes progress.
         */
        takeUntil(arrow) {
            const f = emitter => this.arrowF(emitter).until(arrow);
            return new StreamArrow(f, 'takeUntil');
        }

        /*
         * Continues to emit events while 'arrow' returns true after applying to the event.
         * arrow : 'a ~> Bool
         */
        takeWhile(arrow) {
            const [thisArrow, thisEmitter] = this.instance();

            const f = emitter => {
                const loop = Arrow.fix(alpha =>
                    thisEmitter.listenA.seq(
                        arrow.ifTrue(emitter.emitA.seq(alpha))
                    )
                );
                return thisArrow.race(loop);
            };

            return new StreamArrow(f, 'takeWhile');
        }

        /*
         * Only emit the events if 'arrow' returns true after applying to each of the events
         */
        filter(arrow) {
            const [thisArrow, thisEmitter] = this.instance();

            const f = emitter => {
                const loop = thisEmitter.listenA.seq(
                    arrow.ifTrue(emitter.emitA)
                ).forever();

                return thisArrow.race(loop);
            };

            return new StreamArrow(f, 'filter');
        }

        /*
         * Merges the events of 'this' stream  and 'that' stream.
         * Stops when both streams stop.
         */
        merge(that) {
            const [thisArrow, thisEmitter] = this.instance();
            const [thatArrow, thatEmitter] = that.instance();

            const f = emitter => {
                const loop = thisEmitter.listenA
                    .any(thatEmitter.listenA)
                    .seq(emitter.emitA)
                    .forever();

                return thisArrow.fanout(thatArrow).race(loop);
            };
            return new StreamArrow(f, 'merge');
        }

        /*
         * Take a snapshot of 'this' stream whenever the events of 'that' stream occurs.
         * Stops when 'that' stream stops.
         */
        snapshot(that) {
            const [thisArrow, thisEmitter] = this.instance();
            const [thatArrow, thatEmitter] = that.instance();

            const f = emitter => {
                const loop = thatEmitter.listenA
                    .seq(thisEmitter.nowA.fanout(Arrow.id()))
                    .seq(emitter.emitA)
                    .forever();

                return thisArrow.fanout(loop).race(thatArrow);
            };
            return new StreamArrow(f, 'snapshot');
        }

        /*
         * Emit the events of 'this' until it ends and then emits events of 'that'
         */
        concat(that) {
            const [thisArrow, thisEmitter] = this.instance();
            const [thatArrow, thatEmitter] = that.instance();

            const f = emitter => {
                const thisLoop = thisEmitter.listenA
                        .seq(emitter.emitA)
                        .forever();

                const thatLoop = thatEmitter.listenA
                        .seq(emitter.emitA)
                        .forever();

                return thisArrow.race(thisLoop).seq(thatArrow.race(thatLoop));
            };

            return new StreamArrow(f, 'concat');
        }

        arrow() {
            return this.arrowF(new Emitter());
        }

        seq(arrow) {
            return this.arrow().seq(arrow);
        }

        run(...args) {
            this.arrow().run(...args);
        }
    }

    /*
     * buffered stream only overrides `instance' method to provide a buffered emitter
     */
    class BufferedStream extends StreamArrow {
        constructor(arrowF, name, size) {
            super(arrowF, name);
            this.size = size;
        }

        instance() {
            const emitter = new BufferedEmitter(this.size);
            return [this.arrowF(emitter).seq(emitter.nowA), emitter];
        }
    }


    /*
     * emit each element of `array'
     */
    StreamArrow.fromArray = array => {
        const local = [...array];
        const f = emitter =>
            (x => {
                /* @arrow :: Number ~> 'a */
                return local[x];
            }).lift()
            .seq(emitter.emitA.after(0))
            .times(local.length);

        return new StreamArrow(f, 'fromArray');
    };

    StreamArrow.of = (...x) => StreamArrow.fromArray(x);

    /*
     * iteratively emit output of `arrow' with each element of `array' as input
     */
    StreamArrow.forEach = (array, arrow) => {
        const local = [...array];
        const f = emitter =>
            (x => {
                /* @arrow :: Number ~> 'a */
                return local[x];
            }).lift()
            .seq(arrow)
            .seq(emitter.emitA.after(0))
            .times(local.length);

        return new StreamArrow(f, 'forEach');
    };

    /*
     * like fromArray except the array is taken at runtime as input to arrow
     */
    StreamArrow.fromInputArray = () => {
        const f = emitter => {
            const hasMore = ((x, i) => {
                /* @arrow :: (['a], Number) ~> Bool */
                return x.length > i;
            }).lift();
            const next = ((x, i) => {
                /* @arrow :: (['a], Number) ~> 'a */
                return x[i];
            }).lift();
            const inc = ((x, i) => {
                /* @arrow :: (['a], Number) ~> (['a], Number) */
                return [x, i + 1];
            }).lift();
            const loop = Arrow.id().all((0).lift()).seq(
                Arrow.fix(alpha =>
                    hasMore.ifTrue(
                        next
                        .seq(emitter.emitA.after(0))
                        .remember()
                        .seq(inc.seq(alpha))
                    )
                )
            );

            return loop;
        };

        return new StreamArrow(f, 'iterator');
    };

    /*
     * Infinite epeatition of 'arrow'
     */
    StreamArrow.repeat = arrow => {
        const f = emitter => arrow.seq(emitter.emitA).forever();
        return new StreamArrow(f, 'repeat');
    };

    /*
     * An infinite stream of DOM events on 'elem' of 'evt' type.
     * This uses 'jQuery' to select 'elem' by name and register 'evt' listener.
     */
    StreamArrow.fromEvent = (elem, evt) => StreamArrow.repeat(Arrow.on(elem, evt));

    /*
     * An infinite stream of events for each 'n' milliseconds.
     * The events are repeating the same input event to this stream arrow.
     */
    StreamArrow.interval = n => StreamArrow.repeat(Arrow.delay(n));

    exports.AllCombinator = AllCombinator;
    exports.AnyCombinator = AnyCombinator;
    exports.ArrayType = ArrayType;
    exports.Arrow = Arrow;
    exports.ArrowType = ArrowType;
    exports.BufferedEmitter = BufferedEmitter;
    exports.BufferedStream = BufferedStream;
    exports.CancelableArrow = CancelableArrow;
    exports.Combinator = Combinator;
    exports.ComposeError = ComposeError;
    exports.Constraint = Constraint;
    exports.ConstraintSet = ConstraintSet;
    exports.Emitter = Emitter;
    exports.FaninCombinator = FaninCombinator;
    exports.KLiftedArrow = KLiftedArrow;
    exports.LiftedAllArrow = LiftedAllArrow;
    exports.LiftedAnyArrow = LiftedAnyArrow;
    exports.LiftedArrow = LiftedArrow;
    exports.LiftedChoiceArrow = LiftedChoiceArrow;
    exports.NamedType = NamedType;
    exports.NoEmitCombinator = NoEmitCombinator;
    exports.ParamType = ParamType;
    exports.ProxyArrow = ProxyArrow;
    exports.QueryArrow = QueryArrow;
    exports.RecordType = RecordType;
    exports.SeqCombinator = SeqCombinator;
    exports.SimpleAsyncArrow = SimpleAsyncArrow;
    exports.SimpleConfigBasedAsyncArrow = SimpleConfigBasedAsyncArrow;
    exports.StreamArrow = StreamArrow;
    exports.SumType = SumType;
    exports.TaggedUnionType = TaggedUnionType;
    exports.TopType = TopType;
    exports.TryCombinator = TryCombinator;
    exports.TupleType = TupleType;
    exports.Type = Type;
    exports.TypeClash = TypeClash;
    exports._check = _check;
    exports._construct = _construct;
    exports._load = _load;
    exports.annotationCache = annotationCache;
    exports.benchmarkResultsOrRun = benchmarkResultsOrRun;
    exports.benchmarkTimeNow = benchmarkTimeNow;
    exports.debounce = debounce;
    exports.descendants = descendants;
    exports.enableBenchmark = enableBenchmark;
    exports.enableTypecheck = enableTypecheck;
    exports.ensureArrow = ensureArrow;
    exports.getLocation = getLocation;
    exports.glb = glb;
    exports.lub = lub;
    exports.parseAnnotation = parseAnnotation;
    exports.randomDelay = randomDelay;
    exports.reqAFrame = reqAFrame;
    exports.sanitizeTypes = sanitizeTypes;
    exports.throttle = throttle;

    return exports;

}({}));

ArrowJs._load();
