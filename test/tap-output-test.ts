import { strict } from 'assert';
import { testcase, subcase, assertions } from '../dist/ducktest.js';
import { tap, Ordering, Stream, Reporter } from '../dist/tap-output.js';

const assert: typeof strict = assertions.silence(strict);

testcase('start a report', async () => {
    let output: string[] = [];
    const report = tap({ write(line) { output.push(line); } });

    subcase('end the report', () => {
        report.end();
        assert.deepEqual(output, [
        ]);
    });
});
