import Arrow from "./arrow.js";
import { _enableBenchmark, numannotations, annotationParseTime } from "./util.js";

export function benchmarkResultsOrRun(...arrows) {
    if (_enableBenchmark) {
        console.log("Arrows: " + Arrow.numarrows);
        console.log("Num annotations: " + numannotations);
        console.log("Annotation parse time: " + annotationParseTime);
    } else {
        for (let i = 0; i < arrows.length; i++) {
            arrows[i].run();
        }
    }
}

