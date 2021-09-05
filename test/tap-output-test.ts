import { strict as assert } from 'assert';
import { testcase, subcase } from '../dist/ducktest.js';
import { tap, Ordering, Stream, Reporter } from '../dist/tap-output.js';
import { expect } from 'chai';

testcase('start a report', async () => {
    let output: string[] = [];
    const report = tap(line => output.push(line));

    subcase('end the report', () => {
        report.end();
        assert.deepEqual(output, [
            'ok - empty test'
        ]);
    });
});
