export * from './assertions.js';
import { fail } from 'assert/strict';
import { soften, silence } from './assertions.js';
export { Ordering, Reporter, Report, Stream, tap } from './tap-output.js';
import { Ordering, Reporter, Report, Stream, tap } from './tap-output.js';
import { TestError } from './test-error.js';

type Spec = () => Promise<void> | void;

function peek<T>(array: T[]) { return array[array.length - 1]; }

export interface Suite {
    assertions: {
        softFail(error: any): void;
        soften<T extends object>(subject: T): T;
        softly(action: () => Promise<void> | void): Promise<void>;
        silence<T extends object>(subject: T): T;
    };
    fixture(description: string, spec: Spec): void;
    testcase(description: string, spec: Spec): void;
    subcase(description: string, spec: Spec): Promise<void>;
    report(stream?: Stream, reporter?: Reporter): Promise<void>;
    message(message: string): Promise<void>;
};

interface TestcaseContext {
    description: string;
    subcases: Set<string>;
    subcase: Iterator<string>;
    complete: Promise<void>;
    report: Report;
};
function makeTestcaseContext(description: string, report: Report): TestcaseContext {
    return {
        description,
        subcases: new Set(),
        subcase: [][Symbol.iterator](),
        complete: Promise.resolve(),
        report: report.beginSubtest(description)
    };
}

interface TestcaseState {
    currentReport: Report;
    currentPass: {
        subcasesEncountered: Set<string>;
    }
    stackIndex: number;
    stack: TestcaseContext[];
};
function makeTestcaseState(baseReport: Report): TestcaseState {
    const base = baseReport;
    return {
        get currentReport() { return peek(this.stack)?.report ?? base; },
        currentPass: {
            subcasesEncountered: new Set<string>()
        },
        stackIndex: 0,
        stack: []
    };
}

export const defaultStream: Stream = console.log;
export const defaultReporter: Reporter = tap;
export function suite(): Suite {
    async function nextPass(state: TestcaseState, desc: string, spec: Spec): Promise<string> {
        const s = state;
        // run begin
        s.stack.push(makeTestcaseContext(desc, s.currentReport));

        s.currentPass.subcasesEncountered.clear();
        try {
            await spec();
            await s.stack[0].complete;
        } catch (e) {
            if (e instanceof TestError)
                throw e;
            s.currentReport.fail(e);
        }
        peek(s.stack).subcase = peek(s.stack).subcases[Symbol.iterator]();

        let value;
        if (!s.currentReport.success) {
            while (!({ value } = (peek(s.stack)?.subcase?.next() ?? {}))?.done) {
                s.currentReport?.beginSubtest(value).end('SKIP enclosing case failed')
            }
        }

        while (({ value } = (peek(s.stack)?.subcase?.next() ?? {}))?.done) {
            // run complete
            s.stack.pop()?.report.end();
        }
        return value;
    }

    async function nextSubcase(state: TestcaseState, spec: Spec) {
        const s = state;
        s.stackIndex++;
        try {
            await spec();
            await s.stack[s.stackIndex].complete;
        } catch (e) {
            if (e instanceof TestError)
                throw e;
            s.currentReport.fail(e);
        }
        s.stackIndex--;
    }

    async function scheduleSubcase(state: TestcaseState, description: string) {
        const s = state;
        s.stack[s.stackIndex].subcases.add(description);
    }

    async function skipSubcase() { }

    const tests: ((report: Report) => Promise<void>)[] = [];
    let testcaseState: TestcaseState | null;
    return {
        assertions: {
            softFail(error: any) {
                if (!testcaseState) {
                    throw new TestError('soft failure should occur within testcase');
                }
                testcaseState.currentReport.fail(error);
            },
            soften<T extends object>(subject: T): T {
                return soften(subject, this.softFail)
            },
            async softly(action: () => Promise<void> | void) {
                try {
                    await action();
                } catch (e) {
                    this.softFail(e);
                }
            },
            silence
        },

        async message(message: string): Promise<void> {
            if (!testcaseState) {
                throw new TestError('subcase should occur within testcase');
            }

            testcaseState.currentReport.diagnostic(message);
        },

        testcase(description: string, spec: Spec): void {
            tests.push(async report => {
                const r = report;
                try {
                    testcaseState = makeTestcaseState(r);
                    const s = spec;
                    let desc = description;
                    do {
                        desc = await nextPass(testcaseState, desc, s);
                    } while (desc);
                } finally {
                    testcaseState = null;
                }
            });
        },

        subcase(description: string, spec: Spec): Promise<void> {
            if (!testcaseState) {
                throw new TestError('subcase should occur within testcase');
            }

            if (testcaseState.currentPass.subcasesEncountered.has(description)) {
                throw new TestError('duplicate subcase name encountered during run');
            } else {
                testcaseState.currentPass.subcasesEncountered.add(description);
            }

            if (testcaseState.stack[testcaseState.stackIndex + 1]?.description === description) {
                const i = testcaseState.stackIndex;
                return testcaseState.stack[i].complete = nextSubcase(testcaseState, spec);
            }

            for (let i = 0; i <= testcaseState.stackIndex; i++) {
                if (testcaseState.stack[i].subcases.has(description)) {
                    return skipSubcase();
                }
            }

            if ((testcaseState.stackIndex + 1) == testcaseState.stack.length) {
                return scheduleSubcase(testcaseState, description);
            }

            return Promise.reject(new TestError('encountered unexpected subcase'));
        },

        fixture(description: string, spec: Spec): void {
            tests.push(() => {
                return Promise.reject(new TestError('fixtures are not implemented'));
            });
        },

        async report(stream: Stream = defaultStream, reporter: Reporter = defaultReporter): Promise<void> {
            const r = reporter(stream);
            try {
                for (const test of tests) {
                    await test(r);
                }
                r.end();
            } catch (e) {
                r.bailOut(e);
            }
        }
    };
};

const s = suite();
export const assertions = s.assertions;
export const testcase = s.testcase.bind(s);
export const subcase = s.subcase.bind(s);
export const report = s.report.bind(s);

if (process?.on) {
    process?.on('exit', () => report());
}
