import Arrow from "./arrow.js";
import { Combinator, ComposeError } from "./combinators.js";
import { ParamType, ArrowType } from "./types.js";
import { _construct, getLocation } from "./util.js";
import { Constraint, ConstraintSet, sanitizeTypes } from "./typecheck.js";

/*
 * new SpawnCombinator(a1, a2, a3) runs a1 and returns its result and spawns a2 and a3 but does not wait for their completion.
 */
class SpawnCombinator extends Combinator {
    constructor(arrows) {
        super(_construct(() => {
            let sty = sanitizeTypes(arrows);

            try {
                let arg = ParamType.fresh();
                let out = ParamType.fresh();
                let ncs = new ConstraintSet([]);
                let err = [];

                sty.forEach((t, i) => {
                    ncs = ncs.concat(t.constraints);
                    err = err.concat(t.errors);

                    ncs = ncs.add(new Constraint(arg, t.arg));
                    if (i == 0) { // only the first arrow's return type is used
                            ncs = ncs.add(new Constraint(t.out, out));
                    }
                });

                return new ArrowType(arg, out, ncs, err);
            } catch (err) {
                let message;
                let location = getLocation(err.stack);

                if (location) {
                    message = "Unable to spawn arrows at: " + location;
                } else {
                    message = "Unable to spawn arrows";
                }

                throw new ComposeError(message + "\n\tInput => Spawn(" + sty.join(", ") + ")\n\tError => " + err);
            }
        }), arrows);
    }

    toString() {
        return "spawn(" + this.arrows.map(a => a.toString()).join(", ") + ") :: " + this.type.toString();
    }

    call(x, p, k, h) {
        this.arrows.forEach((a, i) => {
            // only return the result of the first arrow
            if (i == 0) {
                a.call(x, p, k, h);
            }
            // discard the result of other arrows.
            else {
                a.call(x, p, x => x, h);
            }
        });
    }

    isAsync() {
        return this.arrows[0].isAsync();
    }
}

Arrow.spawn = (...arrows) => new SpawnCombinator(arrows);


