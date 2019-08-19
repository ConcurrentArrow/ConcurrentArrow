import Arrow from "./arrow.js";
import TaggedValue from "./taggedvalue.js";
import { _construct, _check, parseAnnotation } from "./util.js";
import { ComposeError } from "./combinators.js";
import { NamedType, ParamType, TupleType } from "./types.js";
import { ArrowType, ConstraintSet } from "./typecheck.js";
import parser from "./parser.js";

//
// Simple Asynchronous Arrow Implementation
//

export class SimpleAsyncArrow extends Arrow {
    isAsync() {
        return true;
    }
}

// Simple Asynchronous Arrow that takes in a config object

export class SimpleConfigBasedAsyncArrow extends SimpleAsyncArrow {
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

export class QueryArrow extends SimpleConfigBasedAsyncArrow {
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


