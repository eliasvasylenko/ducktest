import { strict as assert } from 'assert';
import { testcase, subcase, assertions, suite, tap } from '../dist/ducktest.js';

function dedent(strings: TemplateStringsArray) {
    let string = strings[0];
    assert(string.startsWith('\n')); // first line should be empty
    string = string.slice(1);
    const match = string.match(/\n%s*$/);
    assert(match); // last line should contain only whitespace
    string.replaceAll(match[0], '\n');
}

testcase('make a new suite', async () => {
    let output: string = '';
    const reporter = tap(line => output += line + '\n');
    const s = suite(reporter);

    subcase('run an empty test', async () => {
        await s.testcase('empty test', () => { });
        reporter.end();
        assert.equal(output, dedent`
            ok - empty test
        `);
    });

    subcase('run a failing test', async () => {
        await s.testcase('failing test', () => {
            s.assertions.softFail(new Error('failure'));
        });
        reporter.end();
        assert.deepEqual(output, dedent`
                not ok - failure
                  ---
                  ...
            not ok - failing test
        `);
    });

    subcase('run a test with multiple subtests', async () => {
        await s.testcase('passing test', () => {
            s.subcase('subcase one', () => { });
            s.subcase('subcase two', () => { });
        });
        reporter.end();
        assert.deepEqual(output, dedent`
                ok - subcase one
                ok - subcase two
            ok - passing test
        `);
    });

    subcase('run a failing subtest followed by another subtest', async () => {
        await s.testcase('test', () => {
            s.subcase('failing subcase', () => {
                s.assertions.softFail(new Error('failure'));
            });
            s.subcase('empty subcase', () => { });
        });
        reporter.end();
        assert.deepEqual(output, dedent`
                    not ok - failure
                      ---
                      ...
                not ok - failing subcase
                ok - empty subcase
            not ok - test
        `);
    });
});
