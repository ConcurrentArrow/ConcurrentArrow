export default class TaggedValue {
    constructor(tag, val) {
        this.tag = tag;
        this.val = val;
    }

    hasTag(tag) {
        return tag == this.tag;
    }

    value() {
        return this.val;
    }
}

