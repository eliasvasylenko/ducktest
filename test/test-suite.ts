import { strict as assert } from 'assert';
import { testcase, subcase, assertions, suite, tap } from '../dist/ducktest.js';

testcase('make a new suite', async () => {
    const lines: string[] = [];
    const s = suite(tap(line => lines.push(line)));

    subcase('make an empty test', () => {
        s.testcase('empty test', () => { });
    });

    subcase('make a failing test', () => {
        s.testcase('failing test', () => {
            s.assertions.softFail(new Error('failure'));
        });
        assert.deepEqual(lines, [
            '    not ok - failure',
            '      ---',
            '      ...',
            'not ok - failing test'
        ]);
    });
});
