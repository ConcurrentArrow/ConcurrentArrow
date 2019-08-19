import { TopType } from "./types.js";
import { ArrowType } from "./typecheck.js";

let typechecks = 0;
let typecheckTime = 0;

export let _enableTypecheck = true;

// benchmark
export let _enableBenchmark = false;

export function enableBenchmark(enable) {
  _enableBenchmark = Boolean(enable);
}

export function benchmarkTimeNow() {
  if (_enableBenchmark) {
    if (typeof NODEJS_ENV === 'undefined')
      return window.performance.now();
    else return process.hrtime().bigint();
  }
  return NaN;
}

// type checking
export function enableTypecheck(bool) {
  _enableTypecheck = bool;
}

export function _construct(f) {
    if (_enableTypecheck) {
        return f();
    } else {
        return new ArrowType(new TopType(), new TopType());
    }
}

export function _check(type, value) {
    if (_enableTypecheck) {
        let start = benchmarkTimeNow();

        type.check(value);

        let elapsed = benchmarkTimeNow() - start;
        typechecks++;

        if (_enableBenchmark) {
            typecheckTime += elapsed;
            console.log(typechecks + " checks, " + (typecheckTime / 1e6) + "ms");
        }
    }
}

export function getLocation(stack) {
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
export let annotationCache = {};

export let numannotations = 0;
export let annotationParseTime = 0;


export function parseAnnotation(str, f) {
  let anno = annotationCache[str];
  if (anno !== undefined) return anno;

  let start = benchmarkTimeNow();
  anno = f(str);
  let elapsed = (benchmarkTimeNow() - start) / 1e6;

  annotationCache[str] = anno;

  numannotations++;
  annotationParseTime += elapsed;
  return anno;
}

