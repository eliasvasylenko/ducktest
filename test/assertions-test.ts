import { testcase, subcase, tap } from '../dist/ducktest.js';
import { soften, silence } from '../dist/assertions.js';
import { strict as assert } from 'assert';

testcase('using soften', () => {
    subcase('a softened function call intercepts the error', async () => {
        let error: any;
        const f = () => { throw 'error text'; };
        const soft = soften(f, e => error = e);

        soft();

        assert.equal(error, 'error text');
    });

    subcase('a softened property access intercepts the error', async () => {
        let error: any;
        const o = { get p() { throw 'error text'; } };
        const soft = soften(o, e => error = e);

        soft.p;

        assert.equal(error, 'error text');
    });

    subcase('a softened function call softens a returned object', async () => {
        let error: any;
        const f = () => () => { throw 'error text'; };
        const soft = soften(f, e => error = e);

        soft()();

        assert.equal(error, 'error text');
    });

    subcase('a softened property access softens a returned object', async () => {
        let error: any;
        const o = { get p() { return () => { throw 'error text'; }; } };
        const soft = soften(o, e => error = e);

        soft.p();

        assert.equal(error, 'error text');
    });

    subcase('a softened function call with a softened receiver binds the original receiver to `this`', async () => {
        let result;
        const o = { f() { result = this; } };
        const soft = soften(o, () => assert.fail('no error should be thrown'));

        soft.f();

        assert.equal(result, o);
    });

    subcase('a softened function call forwards the correct arguments', async () => {
        const f = (...args: any[]) => args;
        const soft = soften(f, () => assert.fail('no error should be thrown'));

        const r = soft(1, '2', { three: [] });

        assert.deepEqual([1, '2', { three: [] }], r);
    });

    subcase('a softened function call returns the correct result', async () => {
        const f = () => 42;
        const soft = soften(f, () => assert.fail('no error should be thrown'));

        const r = soft();

        assert.equal(42, r);
    });

    subcase('a softened property access returns the correct result', async () => {
        const o = { p: 42 };
        const soft = soften(o, () => assert.fail('no error should be thrown'));

        const r = soft.p;

        assert.equal(42, r);
    });
});
