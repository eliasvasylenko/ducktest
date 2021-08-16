# ducktest

This is ducktest, a JavaScript testing framework built on top of [tape](https://github.com/substack/tape).

In ducktest, tests are grouper hierarchically. Execution flows through all tests from top to bottom, with common setup and teardown written inline.

```js
test`make a new duck`(() => {
  const duck = new Duck();

  assert`it quacks like a duck`.equal('quack', duck.talk());
  
  test`feed it some seeds`(() => {
    const response = duck.feed(seeds);

    assert.equal('yum yum, thank you.', response);
  });

  test`feed it a burger`(() => {
    const response = duck.feed(hamburger);
    
    assert.equal('wtf is this?', response);
  });
});
```

This leans on developers' intuitions of normal control structures and lexical scoping. When reading a test there is no need to bounce around between `beforeAll` and `afterEach` callbacks to look for hidden out-of-order side effects, and variables can generally be assigned to in the same place that they are declared.

In fact tests in ducktest can be intermixed with normal control structures. This makes concepts like *parametric tests* and *assumptions* trivial to express without the need to learn some framework-specific callback-based DSL. Just write it in normal JavaScript!

```js
for (Species of birds) {
  test`make a new ${Species.constructor}`(() => {
    const bird = new Species();

    if (bird.talk() === 'quack') {
      message`assuming it's a duck`;

      test`feed it some seeds`(() => {
        const response = duck.feed(seeds);

        assert.equal('yum yum, thank you.', response);
      });
    }
    
    // ...
});
```

There are a couple of tricks needed to make this work.

The most important rule is that for any given execution of a test, at most one subtest is executed. This way subtests nested within the same enclosing test do not interfere with one another. Each is given a fresh run.

The second trick is the use of tagged template literals for test descriptions. Each template literal in JavaScript has a unique identity, meaning subtests marked by a template literal can be consistently identified between runs. This allows ducktest to easily see which subtests have already been executed. It would also be feasible to simply assume that the same subtests appear in the same order each time ... but this strategy would be less robust in the presence of `if` statements, loops, and misbehaving tests.
