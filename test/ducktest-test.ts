import { strict as assert } from 'assert';
import { testcase, subcase, assertions, suite, tap } from '../dist/ducktest.js';

testcase('make a new suite', async () => {
    let output: string[] = [];
    const reporter = tap(line => output.push(line));
    const s = suite(reporter);

    subcase('run an empty test', async () => {
        await s.testcase('empty test', () => { });
        reporter.end();
        assert.deepEqual(output, [
            'ok - empty test'
        ]);
    });

    subcase('run a failing test', async () => {
        await s.testcase('failing test', () => {
            s.assertions.softFail(new Error('failure'));
        });
        reporter.end();
        assert.deepEqual(output, [
            '# failing test',
            '    not ok - failure',
            '      ---',
            '      ...',
            'not ok - failing test'
        ]);
    });

    subcase('run a test with multiple subtests', async () => {
        await s.testcase('passing test', () => {
            s.subcase('subcase one', () => { });
            s.subcase('subcase two', () => { });
        });
        reporter.end();
        assert.deepEqual(output, [
            '# passing test',
            '    ok - subcase one',
            '    ok - subcase two',
            'ok - passing test'
        ]);
    });

    subcase('run a failing subtest followed by another subtest', async () => {
        await s.testcase('test', () => {
            s.subcase('failing subcase', () => {
                s.assertions.softFail(new Error('failure'));
            });
            s.subcase('empty subcase', () => { });
        });
        reporter.end();
        assert.deepEqual(output, [
            '# test',
            '    # failing subcase',
            '        not ok - failure',
            '          ---',
            '          ...',
            '    not ok - failing subcase',
            '    ok - empty subcase',
            'not ok - test'
        ]);
    });

    subcase('run a failing test case with subcases', async () => {
        await s.testcase('test', () => {
            s.assertions.softFail(new Error('failure'));
            s.subcase('failing subcase', () => {
                s.assertions.softFail(new Error('failure'));
            });
            s.subcase('empty subcase', () => { });
        });
        reporter.end();
        assert.deepEqual(output, [
            '# test',
            '    not ok - failure',
            '      ---',
            '      ...',
            '    ok - failing subcase # SKIP enclosing case failed',
            '    ok - empty subcase # SKIP enclosing case failed',
            'not ok - test'
        ]);
    });
});