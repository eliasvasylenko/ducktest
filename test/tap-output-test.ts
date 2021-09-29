import { strict } from 'assert';
import { testcase, subcase, silence } from '../dist/ducktest.js';
import { tap, Stream } from '../dist/tap-output.js';

const assert: typeof strict = silence(strict);

testcase('start a report without a plan', async () => {
    const output: string[] = [];
    const stream: Stream = lines => {
        for (const line of lines.split('\n')) {
            output.push(line);
        }
    };
    const report = tap(stream).beginReport();

    subcase('end the report', () => {
        report.end();
        assert.deepEqual(output, [
            'TAP version 13',
            '1..0'
        ]);
    });

    subcase('emit multi-line diagnostic', () => {
        report.diagnostic('one\ntwo\nthree');
        report.end();
        assert.deepEqual(output, [
            'TAP version 13',
            '# one',
            '# two',
            '# three',
            '1..0'
        ]);
    });

    subcase('emit multi-line diagnostic from subcase', () => {
        const subtest = report.beginSubsection('subtest');
        subtest.diagnostic('one\ntwo\nthree');
        subtest.end();
        report.end();
        assert.deepEqual(output, [
            'TAP version 13',
            '[subtest]',
            '    # one',
            '    # two',
            '    # three',
            '    1..0',
            'ok - subtest',
            '1..1'
        ]);
    });

    subcase('emit output on original stream while report is in progress', () => {
        stream('stream output')
        report.end();
        assert.deepEqual(output, [
            'TAP version 13',
            'stream output',
            '1..0'
        ]);
    });
});
