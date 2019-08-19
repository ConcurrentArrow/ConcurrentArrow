import Arrow from "./arrow.js";
import { Combinator, ensureArrow } from "./combinators.js";
import { ParamType } from "./types.js";
import { ArrowType, ConstraintSet } from "./typecheck.js";
import assert from "./assert.js";

export class LiftedAllArrow extends Combinator {
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

