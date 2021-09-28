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

So in running the above test we make the following passes, hitting the listed cases each time:
- Pass one: `make a new duck`
- Pass two: `make a new duck`, `feed it a burger`
- Pass three: `make a new duck`, `feed it some seeds`
- Pass four: `make a new duck`, `feed it some seeds`, `feed it some more seeds`

This model leans on developers' existing intuitions about normal control structures and lexical scoping, making tests easier to read *and* to write.

Common setup and teardown can be written inline, and variables can generally be assigned to in the same place that they are declared. This means that readers don't need to bounce around between `beforeAll` and `afterEach` callbacks to search for hidden out-of-order side effects and variable assignments.

```js
fixture('prepare the pond service', () => {
  // before all cases
  const pondService = await initPondService();

  await testcase('introduce a duck to a pond', async () => {
    // before each subcase
    const duck = new Duck();
    const pond = await pondService.makePond();
    try {
      duck.introduceTo(pond);

      assert.equal(duck.location(), pond);

      await subcase('introduce a crocodile to the same pond', () => {
        ...
      });

      ...
    } finally {
      // after each subcase
      pondService.destroyPond(pond);
    }
  });

  // after all cases
  pondService.dispose();
});
```

Since tests are run as they are encountered don't forget to `await` the conclusion of an async test before teardown.

### Making Assertions

This project adheres to the philosophy of doing one thing well, so it doesn't prescribe the use of any single assertion style or library.

Both "hard" and "soft" assertions are supported; this means that upon failing an assert the caller can choose whether to bail out of the test case, or to continue with the possibility to report further failures, respectively.

By these definitions exiting assertion libraries are typicaly hard by default, in that they throw upon failure. It is possible in ducktest to derive a soft version of such a library which mirrors the API exactly.

```js
import { testcase, subcase, assertions } from 'ducktest';
import { expect } from 'chai';

const softExpect = assertions.soften(expect);

testcase('does it look like a duck?', () => {
  const duck = new Dog(); // oops!
  softExpect(duck).to.have.property('feathers');
  softExpect(duck).to.have.property('legs');
  softExpect(duck).to.have.property('bill');
  softExpect(duck).to.have.property('wings');
});
```

The test above---given the obvious mistake---should report failures for three of the four assertions.

The `soften` function should work for any typical property-chaining and function-chaining style of assertion API.

### Dynamically Defining Test Cases

Test logic in ducktest can be intermixed with normal control structures. This makes concepts like *parametric tests* and *assumptions* trivial to express in normal JavaScript.

```js
testcase('', async () => {
  ; // TODO come up with a duck-themed illustrative example.
});
```

## Test Output

Most of the testing and reporting functions exported from ducktest are associated with a "default suite". When running in Node, this suite is run and reported before exit, streaming TAP output to stdout. This makes ducktest compatible OOTB with most reporters that support `tape` or `node tap`.

```js
import { testcase, subcase } from 'ducktest';
```

It is also possible to instantiate a fresh suite, for manual control of reporting.

```js
import { Suite } from 'ducktest';
const suite = new Suite();
const { testcase, subcase } = suite;

...

suite.report(customReporter)
```

## Concurrency

Test cases recording to the same output stream are currently run serially. This limitation exists because when async subcases are run concurrently it is not always possible to find which parent test they are associated with, at least using standard web APIs in the browser.

The ducktest API *could* be modified to facilitate concurrency in the browser by explicitly passing context down to subcases, but this decreases the signal to noise ratio when reading tests, and all the local renaming and/or shadowing makes tests brittle to refactoring.

However this limitation is intended to be lifted in Node through the use of AsyncLocalStorage. The test scheduling and state management implementation is factored to facilitate this, and the TAP reporter supports a forward-compatible TAP flavour which encodes concurrent results (i.e. interleaved subtest output) without requiring buffering.