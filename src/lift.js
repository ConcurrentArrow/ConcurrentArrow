import Arrow from "./arrow.js";
import { ArrowType, ConstraintSet } from "./typecheck.js";
import { ParamType } from "./types.js";
import { _construct, _check, _enableTypecheck, parseAnnotation } from "./util.js";
import parser from "./parser.js";

export class LiftedArrow extends Arrow {
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
                        if (_enableTypecheck) {
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

export class KLiftedArrow extends Arrow {
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
                        if (_enableTypecheck) {
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

