# ducktest

This is ducktest, a different way to test for JavaScript.

## Defining Tests

Tests in ducktest consist of a single base case and any number of subcases. We pass through a test once for each case it describes. Execution flows from top to bottom each pass, entering only the cases needed to reach the one under test.

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

So in running the above test we make four passes over it, hitting the following cases each time:

`make a new duck`

`make a new duck :: feed it a burger`

`make a new duck :: feed it some seeds`

`make a new duck :: feed it some seeds :: feed it some more seeds`

This model leans on developers' existing intuitions about normal control structures and lexical scoping, making tests easier to read *and* to write.

Common setup and teardown can be written inline, and variables can generally be assigned to in the same place that they are declared. This means that readers don't need to bounce around between `beforeAll` and `afterEach` callbacks to search for hidden out-of-order side effects and variable assignments.

```js
const pondService = await initPondService(); // before all cases

await testcase('introduce a duck to a pond', async () => {
  const pond = await pondService.makePond(); // before each case
  const duck = new Duck();

  duck.introduceTo(pond);

  assert.equal(duck.location(), pond);

  await subcase('introduce a crocodile to the same pond', async () => {
    ...
  });

  pondService.destroyPond(pond); // after each case
});

pondService.dispose(); // after all cases
```

Since tests are run as they are encountered don't forget to `await` the conclusion of an async test before teardown.

### Making Assertions

This project adheres to the philosophy of doing one thing well, so it doesn't prescribe the use of any single assertion style or library.

Both "hard" and "soft" assertions are supported; these mean, respectively, that upon failing an assert the caller can choose whether to bail out of the test case, or to continue with the possibility to report further failures.

By these definitions exiting assertion libraries are typicaly hard by default, in that they throw upon failure. It is possible in ducktest to derive a soft version of such a library which mirrors the API exactly.

```js
import { testcase, subcase, assertions } from 'ducktest';
import { expect } from 'chai';

const softExpect = assertions.soften(expect);

testcase('does it look like a duck?', () => {
  const duck = new Dog(); // oops!
  softExpect(duck).to.have.property('feathers');
  softExpect(duck).to.have.property('bill');
  softExpect(duck).to.have.property('wings');
});
```

The test above---given the obvious mistake---should report failures for all three assertions.

The `soften` function should work for any typical property-chaining and function-chaining style of assertion API.

### Dynamically Defining Test Cases

Test logic in ducktest can be intermixed with normal control structures. This makes concepts like *parametric tests* and *assumptions* trivial to express in normal JavaScript.

```js
testcase('', async () => {
  ; // TODO come up with a duck-themed illustrative example.
});
```

## Test Output

The `testcase` and `subcase` functions exported from ducktest stream TAP output to stdout. This makes ducktest compatible with most reporters that support `tape` or `node tap`.

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

It is worth noting that this limitation could be lifted in node through the use of AsyncLocalStorage, but no equivalent API is currently available in the browser so maintining support for both platforms simultaneously would introduce a great deal of complexity.