import Arrow from "./arrow.js";
import Progress from "./progress.js";
import { Combinator, ensureArrow } from "./combinators.js";
import { ParamType } from "./types.js";
import { ArrowType, ConstraintSet } from "./typecheck.js";
import { _construct, _check } from "./util.js";
import assert from "./assert.js";

export class LiftedAnyArrow extends Combinator {
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


