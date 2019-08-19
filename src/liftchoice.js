import Arrow from "./arrow.js";
import { Combinator, ensureArrow } from "./combinators.js";
import { ParamType, TaggedUnionType } from "./types.js";
import { ArrowType, Constraint, ConstraintSet, sanitizeTypes } from "./typecheck.js";
import { _construct, _check } from "./util.js";
import assert from "./assert.js";


export class LiftedChoiceArrow extends Combinator {
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

