let _cancelerId = 0;

export default class Progress {
    constructor(canEmit) {
        this.canEmit = canEmit;
        this.cancelers = {};
        this.observers = [];
    }

    addObserver(observer) {
        this.observers.push(observer);
    }

    addCanceler(canceler) {
        let id = _cancelerId++;
        this.cancelers[id] = canceler;
        return id;
    }

    advance(cancelerId) {
        if (cancelerId !== null) {
            this.cancelers[cancelerId] = null;
        }

        while (this.observers.length > 0) {
            let observer = this.observers.pop();

            if (this.canEmit) {
                observer();
            }
        }
    }

    cancel(e) {
        for (let id in this.cancelers) {
            if (this.cancelers[id] !== null) {
                this.cancelers[id](e);
            }
        }

        this.cancelers = {};
    }
}

