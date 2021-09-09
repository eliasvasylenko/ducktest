import { strict as assert } from 'assert';
import { testcase, subcase, assertions, report, tap, suite, Stream } from '../dist/ducktest.js';
import { TestError } from '../dist/test-error.js';

testcase('make a new report', async () => {
    let output: string[] = [];
    const stream: Stream = line => output.push(line);
    const s = suite();

    subcase('run an empty test', async () => {
        await s.testcase('empty test', () => { });
        await s.report(stream);
        assert.deepEqual(output, [
            'TAP version 13',
            '1..1',
            'ok - empty test'
        ]);
    });

    subcase('run a failing test', async () => {
        await s.testcase('failing test', () => {
            s.assertions.softFail(new Error('failure'));
        });
        await s.report(stream);
        assert.deepEqual(output, [
            'TAP version 13',
            '1..1',
            '[failing test]',
            '    not ok - failure',
            '      ---',
            '      ...',
            '    1..1',
            'not ok - failing test'
        ]);
    });

    subcase('run a test with multiple subtests', async () => {
        await s.testcase('passing test', () => {
            s.subcase('subcase one', () => { });
            s.subcase('subcase two', () => { });
        });
        await s.report(stream);
        assert.deepEqual(output, [
            'TAP version 13',
            '1..1',
            '[passing test]',
            '    ok - subcase one',
            '    ok - subcase two',
            '    1..2',
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
        await s.report(stream);
        assert.deepEqual(output, [
            'TAP version 13',
            '1..1',
            '[test]',
            '    [failing subcase]',
            '        not ok - failure',
            '          ---',
            '          ...',
            '        1..1',
            '    not ok - failing subcase',
            '    ok - empty subcase',
            '    1..2',
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
        await s.report(stream);
        assert.deepEqual(output, [
            'TAP version 13',
            '1..1',
            '[test]',
            '    not ok - failure',
            '      ---',
            '      ...',
            '    ok - failing subcase # SKIP enclosing case failed',
            '    ok - empty subcase # SKIP enclosing case failed',
            '    1..3',
            'not ok - test'
        ]);
    });

    subcase('bail out of a test case after a message', async () => {
        await s.testcase('test', () => {
            s.message('message');
            throw new TestError('cause');
        });
        await s.report(stream);
        assert.deepEqual(output, [
            'TAP version 13',
            '1..1',
            '[test]',
            '    # message',
            'Bail out! cause'
        ]);
    });

    subcase('bail out of a subcase after a message', async () => {
        await s.testcase('test', () => {
            s.subcase('subcase', () => {
                s.message('message');
                throw new TestError('cause');
            });
        });
        await s.report(stream);
        assert.deepEqual(output, [
            'TAP version 13',
            '1..1',
            '[test]',
            '    [subcase]',
            '        # message',
            'Bail out! cause'
        ]);
    });
});
