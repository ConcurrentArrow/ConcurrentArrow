
function notEqual(actual, expected) {
  if (actual === expected) {
    throw new Error(`actual=${actual}, expected=${expected}`);
  }
}

function equal(actual, expected) {
  if (actual !== expected) {
    throw new Error(`actual=${actual}, expected=${expected}`);
  }
}

function fail(msg) {
  throw new Error(msg);
}

export default function assert(value) {
  equal(Boolean(value), true);
}

assert.equal = equal;
assert.notEqual = notEqual;
assert.ok = assert;
assert.fail = fail;


