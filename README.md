# ducktest

This is ducktest, a somewhat fresh take on testing in JavaScript.

## Defining Tests

Each test in ducktest consists of a single base case along with any number of subcases, nested recursively. We run through the test once for each case. Execution flows from top to bottom each time, entering only the cases needed to reach the one under test.

```js
testcase('make a new duck', () => {
  const duck = new Duck();

  assert.equal(duck.talk(), 'Quack.', 'it quacks like a duck');

  subcase('feed it a burger', async () => {
    const response = await duck.feed(hamburger);
    
    assert.equal(response, 'WTF is this?');
  });

  subcase('feed it some seeds', async () => {
    const response = await duck.feed(seeds);

    assert.equal(response, 'Yum, thank you.');

    subcase('feed it some more seeds', async () => {
      const response = await duck.feed(seeds);

      assert.equal(response, `That's enough, actually.`);
    });
  });
});
```

This model leans on developers' existing intuitions about normal control structures and lexical scoping, making tests easier to read *and* to write.

Common setup and teardown can be written inline with subcases, and variables can generally be assigned to in the same place that they are declared. In turn, readers don't need to bounce around between `beforeAll` and `afterEach` callbacks to search for hidden out-of-order side effects and variable assignments.

```js
testcase('introduce a duck to a pond', async () => {
  const pond = await pondService.makePond();
  const duck = new Duck();

  duck.introduceTo(pond);

  assert.equal(duck.location(), pond);

  subcase('introduce a crocodile to the pond', () => { ... });

  pondService.destroyPond(pond);
});
```

## Dynamically Defining Test Cases

Test logic in ducktest can be intermixed with normal control structures. This makes concepts like *parametric tests* and *assumptions* trivial to express in normal JavaScript.

```js
testcase('', async () => {
  ;
});
```

## Test Output

The `testcase` and `subcase` functions exported from ducktest stream TAP output to stdout. This makes ducktest compatible with any reporters that support `tape` or `node tap`.

```js
import {testcase, subcase} from 'ducktest';
```

It is also possible to ask ducktest for versions of `testcase` and `subcase` which stream output elsewhere.

```js
import {testRunner} from 'ducktest';
const {testcase, subcase} = testRunner({ output: stringBuffer });
```

## Parallelism

Test cases recording to the same output stream are run serially.

## Concurrency

Test cases recording to the same output stream are run serially. This limitation exists because when async subcases are run concurrently it is not always possible to find which parent test they are associated with.

However I see this not as an objective failure, but as a tradeoff, as there are some benefits.

Concurrent tests still need to write to an inherently serial output format. This makes memory utilisation less predictable as results need to be buffered to be serialised properly.

The ducktest API *could* be modified to facilitate concurrency by explicitly passing context down to subcases, but this decreases the signal to noise ratio when reading tests, and all the local renaming and shadowing makes tests brittle to refactoring.

It is worth noting that this limitation could be lifted in node through the use of AsyncLocalStorage, but no equivalent API is available in the browser so maintining support for both platforms simultaneously would introduce a great deal of complexity, for relatively little benefit.