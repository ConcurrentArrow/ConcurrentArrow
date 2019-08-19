import Arrow from "./arrow.js";
import { Emitter, BufferedEmitter } from "./emitter.js";

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


export class StreamArrow {
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
export class BufferedStream extends StreamArrow {
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

