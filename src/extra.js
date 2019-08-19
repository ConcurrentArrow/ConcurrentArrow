
export function _load(nm) {
    if (typeof window !== 'undefined') {
        let Arrowjs = nm || this;
        if (Arrowjs !== undefined && Arrowjs !== window) {
            for (let k in Arrowjs)
                window[k] = Arrowjs[k];
        }
    }
}

export const reqAFrame = (k => {
    /* @arrow :: _ ~> Number */
    window.requestAnimationFrame(t => k(t));
}).klift();

// jquery
export const debounce = time => {
    let callback;
    const f = $.debounce(time, () => callback());

    return ((x, k) => {
        /* @arrow :: 'a ~> 'a */
        callback = () => k(x);
        f();
    }).klift();
};

export const throttle = time => {
    let callback;
    const f = $.throttle(time, () => callback());

    return ((x, k) => {
        /* @arrow :: 'a ~> 'a */
        callback = () => k(x);
        f();
    }).klift();
};

export const randomDelay = time => ((x, k) => {
    /* @arrow :: 'a ~> 'a */
    setTimeout(_ => k(x), Math.random() * time);
}).klift();

