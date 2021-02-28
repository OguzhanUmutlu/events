'use strict';

var common = require('./common');
var assert = require('assert');
var EventEmitter = require('../').EventEmitter;
var on = require('../').on;

async function basic() {
  var ee = new EventEmitter();
  process.nextTick(function () {
    ee.emit('foo', 'bar');
    // 'bar' is a spurious event, we are testing
    // that it does not show up in the iterable
    ee.emit('bar', 24);
    ee.emit('foo', 42);
  });

  var iterable = on(ee, 'foo');

  var expected = [['bar'], [42]];

  for await (var event of iterable) {
    var current = expected.shift();

    assert.deepStrictEqual(current, event);

    if (expected.length === 0) {
      break;
    }
  }
  assert.strictEqual(ee.listenerCount('foo'), 0);
  assert.strictEqual(ee.listenerCount('error'), 0);
}

async function error() {
  var ee = new EventEmitter();
  var _err = new Error('kaboom');
  process.nextTick(function () {
    ee.emit('error', _err);
  });

  var iterable = on(ee, 'foo');
  let looped = false;
  let thrown = false;

  try {
    // eslint-disable-next-line no-unused-vars
    for await (var event of iterable) {
      looped = true;
    }
  } catch (err) {
    thrown = true;
    assert.strictEqual(err, _err);
  }
  assert.strictEqual(thrown, true);
  assert.strictEqual(looped, false);
}

async function errorDelayed() {
  var ee = new EventEmitter();
  var _err = new Error('kaboom');
  process.nextTick(function () {
    ee.emit('foo', 42);
    ee.emit('error', _err);
  });

  var iterable = on(ee, 'foo');
  var expected = [[42]];
  let thrown = false;

  try {
    for await (var event of iterable) {
      var current = expected.shift();
      assert.deepStrictEqual(current, event);
    }
  } catch (err) {
    thrown = true;
    assert.strictEqual(err, _err);
  }
  assert.strictEqual(thrown, true);
  assert.strictEqual(ee.listenerCount('foo'), 0);
  assert.strictEqual(ee.listenerCount('error'), 0);
}

async function throwInLoop() {
  var ee = new EventEmitter();
  var _err = new Error('kaboom');

  process.nextTick(function () {
    ee.emit('foo', 42);
  });

  try {
    for await (var event of on(ee, 'foo')) {
      assert.deepStrictEqual(event, [42]);
      throw _err;
    }
  } catch (err) {
    assert.strictEqual(err, _err);
  }

  assert.strictEqual(ee.listenerCount('foo'), 0);
  assert.strictEqual(ee.listenerCount('error'), 0);
}

async function next() {
  var ee = new EventEmitter();
  var iterable = on(ee, 'foo');

  process.nextTick(function() {
    ee.emit('foo', 'bar');
    ee.emit('foo', 42);
    iterable.return();
  });

  var results = await Promise.all([
    iterable.next(),
    iterable.next(),
    iterable.next()
  ]);

  assert.deepStrictEqual(results, [{
    value: ['bar'],
    done: false
  }, {
    value: [42],
    done: false
  }, {
    value: undefined,
    done: true
  }]);

  assert.deepStrictEqual(await iterable.next(), {
    value: undefined,
    done: true
  });
}

async function nextError() {
  var ee = new EventEmitter();
  var iterable = on(ee, 'foo');
  var _err = new Error('kaboom');
  process.nextTick(function() {
    ee.emit('error', _err);
  });
  var results = await Promise.allSettled([
    iterable.next(),
    iterable.next(),
    iterable.next()
  ]);
  assert.deepStrictEqual(results, [{
    status: 'rejected',
    reason: _err
  }, {
    status: 'fulfilled',
    value: {
      value: undefined,
      done: true
    }
  }, {
    status: 'fulfilled',
    value: {
      value: undefined,
      done: true
    }
  }]);
  assert.strictEqual(ee.listeners('error').length, 0);
}

async function iterableThrow() {
  var ee = new EventEmitter();
  var iterable = on(ee, 'foo');

  process.nextTick(function () {
    ee.emit('foo', 'bar');
    ee.emit('foo', 42); // lost in the queue
    iterable.throw(_err);
  });

  var _err = new Error('kaboom');
  let thrown = false;

  assert.throws(function () {
    // No argument
    iterable.throw();
  }, {
    message: 'The "EventEmitter.AsyncIterator" property must be' +
    ' an instance of Error. Received undefined',
    name: 'TypeError'
  });

  var expected = [['bar'], [42]];

  try {
    for await (var event of iterable) {
      assert.deepStrictEqual(event, expected.shift());
    }
  } catch (err) {
    thrown = true;
    assert.strictEqual(err, _err);
  }
  assert.strictEqual(thrown, true);
  assert.strictEqual(expected.length, 0);
  assert.strictEqual(ee.listenerCount('foo'), 0);
  assert.strictEqual(ee.listenerCount('error'), 0);
}

async function eventTarget() {
  const et = new EventTarget();
  const tick = () => et.dispatchEvent(new Event('tick'));
  const interval = setInterval(tick, 0);
  let count = 0;
  for await (const [ event ] of on(et, 'tick')) {
    count++;
    assert.strictEqual(event.type, 'tick');
    if (count >= 5) {
      break;
    }
  }
  assert.strictEqual(count, 5);
  clearInterval(interval);
}

async function errorListenerCount() {
  const et = new EventEmitter();
  on(et, 'foo');
  assert.strictEqual(et.listenerCount('error'), 1);
}

async function run() {
  var funcs = [
    basic,
    error,
    errorDelayed,
    throwInLoop,
    next,
    nextError,
    iterableThrow,
  ];

  if (typeof EventTarget === 'function') {
    funcs.push(
      eventTarget,
      errorListenerCount
    );
  } else {
    common.test.comment('Skipping EventTarget tests');
  }

  for (var fn of funcs) {
    await fn();
  }
}

module.exports = run();
