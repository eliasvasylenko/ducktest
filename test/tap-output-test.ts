import { strict } from 'assert';
import { testcase, subcase, assertions } from '../dist/ducktest.js';
import { tap, Ordering, Stream, Reporter } from '../dist/tap-output.js';

const assert: typeof strict = assertions.silence(strict);

testcase('start a report', async () => {
    let output: string[] = [];
    const report = tap({
        write(lines) {
            for (const line of lines.split('\n')) {
                output.push(line);
            }
        }
    });

    subcase('end the report', () => {
        report.end();
        assert.deepEqual(output, [
        ]);
    });

    subcase('emit multi-line diagnostic', () => {
        report.diagnostic('one\ntwo\nthree');
        report.end();
        assert.deepEqual(output, [
            '# one',
            '# two',
            '# three'
        ]);
    });

    subcase('emit multi-line diagnostic from subcase', () => {
        const subtest = report.beginSubtest('subtest');
        subtest.diagnostic('one\ntwo\nthree');
        subtest.end();
        report.end();
        assert.deepEqual(output, [
            '# subtest',
            '    # one',
            '    # two',
            '    # three',
            'ok - subtest'
        ]);
    });
});
