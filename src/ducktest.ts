import { config } from 'process';
import { soften as softenImpl, silence as silenceImpl } from './assertions.js';
export { Ordering, Reporter, Report, Stream, tap } from './tap-output.js';
import { Ordering, Reporter, Report, Stream, tap } from './tap-output.js';
import { TestError } from './test-error.js';

type Spec = () => Promise<void> | void;
type Action = () => Promise<void> | void;
type Runner = (context: Partial<TestContext>, action: Action, description?: string) => Promise<void> | void;
type TestCallback = (report: Report, runner: Runner, description: string, spec: Spec) => Promise<void>;
type TestListener = (description: string, spec: Spec) => Promise<void>;

async function runFixture(report: Report, runner: Runner, description: string, spec: Spec): Promise<void> {
    await runner({
        async fixture(): Promise<void> {
            throw new TestError('fixture should not occur during fixture');
        }
    }, spec, description);
}

async function runTestcase(report: Report, runner: Runner, description: string, spec: Spec): Promise<void> {
    await runCase(runner, description, spec, [], new Set());
}

async function runCase(runner: Runner, description: string, spec: Spec, descriptions: string[], subcasesEncounteredByParent: Set<string>): Promise<void> {
    let children: string[] = [];

    await runner({
        subcase: runSubcase(children, descriptions, subcasesEncounteredByParent)
    }, async () => {
        await spec();

        const subcasesEncountered = new Set([
            ...subcasesEncounteredByParent,
            ...children
        ]);

        await Promise.all(children.map(child => runCase(
            runner,
            child,
            spec,
            [...descriptions, child],
            subcasesEncountered)));
    }, description);
}

function runSubcase(children: string[], subcasesOnPath: Iterable<string>, subcasesEncounteredByParent: Set<string>): TestCallback {
    const subcasesEncountered = new Set<string>();
    function checkForDuplicates(description: string) {
        if (subcasesEncountered.has(description))
            throw new TestError('duplicate subcase name encountered during run');
        subcasesEncountered.add(description);
    }

    const path = subcasesOnPath[Symbol.iterator]();
    function nextEncounterSubcase(): TestCallback {
        const nextSubcase = path.next();

        if (nextSubcase.done) {
            return async (report, runner, description) => {
                checkForDuplicates(description);
                children.push(description);
            };
        }

        return async (report, runner, description, spec) => {
            checkForDuplicates(description);

            if (nextSubcase.value === description) {
                return await runner({
                    subcase: nextEncounterSubcase()
                }, spec);
            }

            if (!subcasesEncounteredByParent.has(description)) {
                throw new TestError('encountered unexpected subcase');
            }
        };
    }

    let encounterSubcase = nextEncounterSubcase();

    return (report, runner, description, spec) => encounterSubcase(report, runner, description, spec);
}

interface TestContext {
    testcase: TestCallback;
    subcase: TestCallback;
    fixture: TestCallback;
}
interface TestRunner {
    testcase: TestListener;
    subcase: TestListener;
    fixture: TestListener;
    report(): Report;
    run(reporter: Reporter): Promise<void>;
}
type Plan = ((runner: TestRunner) => Promise<void>)[];

function makeSynchronousTestRunner(): TestRunner {
    let top: TestRunner;
    let lastRun: Promise<void> = Promise.resolve();

    async function run(context: Partial<TestContext>, report: Report, action: Action) {
        const { testcase, subcase, fixture } = context;
        const r = report;
        const a = action;

        await lastRun;
        lastRun = Promise.resolve();

        const previousTop = top;
        top = {
            ...top,
            ...(testcase && { testcase(description, spec) { return testcase(top.report(), runSubsection, description, spec); } }),
            ...(subcase && { subcase(description, spec) { return subcase(top.report(), runSubsection, description, spec); } }),
            ...(fixture && { fixture(description, spec) { return fixture(top.report(), runSubsection, description, spec); } }),
            run() { throw new TestError('report should not occur during report'); },
            report() { return r; }
        };

        try {
            let resolve: () => void;
            const run = new Promise(r => resolve = r);
            const newChildren = (async () => { await a(); })();
            await lastRun;
            lastRun = newChildren;
            await lastRun;

        } finally {
            top = previousTop;
        }
    }

    const runSubsection: Runner = async (context, action, description) => {
        if (description) {
            const report = top.report().beginSubsection(description);
            try {
                await run(context, report, action);
                report.end();
            } catch (e) {
                if (e instanceof TestError) throw e;
                report.fail(e);
            }
        } else {
            await run(context, top.report(), action);
        }
    };

    async function runPlan(reporter: Reporter, plan: Plan) {
        const context = { testcase: runTestcase, fixture: runFixture };
        const report = reporter.beginReport(Ordering.Serial, plan.length);
        try {
            await run(context, report, async () => {
                for (const test of plan) {
                    await test(top);
                }
            });
            report.end();
        } catch (e) {
            if (e instanceof TestError)
                report.bailOut(e);
            else
                report.fail(e);
        }
    }

    top = makePlanningInterface(runPlan);

    return {
        get run() { return top.run; },
        get testcase() { return top.testcase; },
        get subcase() { return top.subcase; },
        get fixture() { return top.fixture; },
        get report() { return top.report; }
    };
}

function makeConcurrentTestRunner(): TestRunner {
    let top: TestRunner;
    let children: Promise<void> = Promise.resolve();

    async function run(context: Partial<TestContext>, report: Report, action: Action) {
        throw '';
    }

    const runSubsection: Runner = async (context, description, action) => {
        throw '';
    };

    async function runPlan(reporter: Reporter, plan: Plan) {
        throw '';
    }

    top = makePlanningInterface(runPlan);

    return {
        get run() { return top.run; },
        get testcase() { return top.testcase; },
        get subcase() { return top.subcase; },
        get fixture() { return top.fixture; },
        get report() { return top.report; }
    };
}

function makePlanningInterface(runPlan: (reporter: Reporter, plan: Plan) => Promise<void>): TestRunner {
    const plan: Plan = [];
    return {
        async testcase(description, spec): Promise<void> {
            const d = description;
            const s = spec;
            plan.push(runner => runner.testcase(d, s));
        },
        async subcase(): Promise<void> {
            throw new TestError('subcase should occur during testcase');
        },
        async fixture(description, spec): Promise<void> {
            const d = description;
            const s = spec;
            plan.push(runner => runner.fixture(d, s));
        },
        report(): Report {
            throw new TestError('reporting should occur during test');
        },
        async run(reporter) { await runPlan(reporter, plan); }
    };
}

export const defaultReporter: Reporter = tap(console.log);
export class Suite {
    #runner = makeSynchronousTestRunner();

    async report(output?: Stream | Reporter): Promise<void> {
        const reporter = output
            ? ('beginReport' in output)
                ? output as Reporter
                : tap(output as Stream)
            : defaultReporter;

        await this.#runner.run(reporter);
    }

    async softFail(error: any) {
        this.#runner.report().fail(error);
    }
    soften<T extends object>(subject: T): T {
        return softenImpl(subject, this.softFail)
    }
    async softly(action: () => Promise<void> | void) {
        try {
            await action();
        } catch (e) {
            this.softFail(e);
        }
    }
    silence = silenceImpl;

    async message(message: string): Promise<void> {
        this.#runner.report().diagnostic(message);
    }
    testcase(description: string, spec: Spec) { return this.#runner.testcase(description, spec); }
    subcase(description: string, spec: Spec) { return this.#runner.subcase(description, spec); }
    fixture(description: string, spec: Spec) { return this.#runner.fixture(description, spec); }
};

const s = new Suite();
export default s;
export const softFail = s.softFail.bind(s);
export const soften = s.soften.bind(s);
export const softly = s.softly.bind(s);
export const silence = s.silence.bind(s);
export const testcase = s.testcase.bind(s);
export const subcase = s.subcase.bind(s);
export const report = s.report.bind(s);

if (process?.on) {
    process?.on('exit', () => report());
}
