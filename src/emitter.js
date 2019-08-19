import Arrow from "./arrow.js";

/*
 *  A stream arrow consists of an internal arrow and an emitter object
 *  The emitter has an on and off method to register and deregister a listener.
 *  The emitter has a fire method that passes an event to the registered listeners
 *  The emitter records its previous event (if any) so that it can be sampled as behavior.
 */

export class Emitter {
    constructor() {
        this.listener = [];
        this.now = undefined;

        this.emitA = (x => {
            /* @arrow :: 'a ~> 'a */
            this.now = x;
            this.listener.forEach(l => l(x));
            return x;
        }).lift();

        this.listenA = ((_, k) => {
            /* @arrow :: _ ~> 'a */
            this.listener.push(k);
            return () => {
                this.listener =
                this.listener.filter(l => l != k);
            };
        }).klift();

        this.nowA = (() => {
            /* @arrow :: _ ~> 'a */
            return this.now;
        }).lift();
    }
}

export class BufferedEmitter extends Emitter {
    constructor(size = 0) {
        super();

        this.size = size;

        this.queue = [];
        this.empty = undefined;

        this.hasEventA = Arrow.lift(() => this.queue.length > 0);

        this.emptyA = ((x, k) => {
            /* @arrow :: 'a ~> 'a */
            const f = () => k(x);
            this.empty = f;
            return () => { this.empty = undefined; };
        }).klift();

        this.emitA = (x => {
            /* @arrow :: 'a ~> 'a */
            this.now = x;

            if (this.listener.length > 0) {
                this.listener.forEach(l => l(x));
            }
            else {
                this.queue.push(x);
                if (this.queue.length > this.size) {
                    this.pop();
                }
            }
            return x;
        }).lift();

        this.listenA = ((_, k) => {
            /* @arrow :: _ ~> 'a */
            if (this.queue.length > 0) {
                k(this.pop());
                if (this.queue.length == 0 && this.empty) {
                    this.empty();
                }
            }
            else {
                this.listener.push(k);
            }
            return () => {
                this.listener =
                this.listener.filter(l => l != k);
            };
        }).klift();

    }

    pop() {
        const x = this.queue[0];
        this.queue = this.queue.splice(1);
        return x;
    }
}

