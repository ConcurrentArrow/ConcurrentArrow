import Arrow from "./arrow.js";
import { ensureArrow } from "./combinators.js";

export class CancelableArrow extends Arrow {
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

