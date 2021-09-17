import { config } from 'process';
import { soften as softenImpl, silence as silenceImpl } from './assertions.js';
export { Ordering, Reporter, Report, Stream, tap } from './tap-output.js';
import { Ordering, Reporter, Report, Stream, tap } from './tap-output.js';
import { TestError } from './test-error.js';

type Spec = () => Promise<void> | void;
type Action = (report: Report) => Promise<void> | void;
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

async function runCase(runner: Runner, description: string, spec: Spec, subcasesOnPath: string[], subcasesEncounteredByParent: Set<string>): Promise<void> {
    let children: { description: string; runner: Runner }[] = [];

    await runner({
        subcase: runSubcase(children, subcasesOnPath, subcasesEncounteredByParent)
    }, async report => {
        await spec();

        if (!report.success) {
            for (const child of children)
                report.beginSubsection(child.description).end('SKIP enclosing case failed')
            return;
        }

        const subcasesEncountered = new Set([
            ...subcasesEncounteredByParent,
            ...children.map(c => c.description)
        ]);

        await Promise.all(children.map(child => runCase(
            child.runner,
            child.description,
            spec,
            [...subcasesOnPath, child.description],
            subcasesEncountered)));
    }, description);
}

function runSubcase(children: { description: string; runner: Runner }[], subcasesOnPath: Iterable<string>, subcasesEncounteredByParent: Set<string>): TestCallback {
    const c = children;
    const encounteredByParent = subcasesEncounteredByParent;
    const encountered = new Set<string>();
    function checkForDuplicates(description: string) {
        if (encountered.has(description))
            throw new TestError('duplicate subcase name encountered during run');
        encountered.add(description);
    }

    const path = subcasesOnPath[Symbol.iterator]();
    function nextEncounterSubcase(): TestCallback {
        const nextSubcase = path.next();

        return (nextSubcase.done)
            ? async (report, runner, description) => {
                checkForDuplicates(description);

                if (!encounteredByParent.has(description))
                    c.push({ description, runner });
            }
            : async (report, runner, description, spec) => {
                checkForDuplicates(description);

                if (nextSubcase.value === description)
                    return await runner({ subcase: nextEncounterSubcase() }, spec);

                if (!encounteredByParent.has(description))
                    throw new TestError('encountered unexpected subcase');
            };
    }

    return nextEncounterSubcase();
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

function lockify<T extends unknown[]>(f: (...t: T) => Promise<void>): (...t: T) => Promise<void> {
    let lock = Promise.resolve()
    return (...t) => {
        const result = lock.then(() => f(...t));
        lock = result.catch(() => { })
        return result;
    }
}
function makeSynchronousTestRunner(): TestRunner {
    let top: TestRunner;
    let topRun: { promise: Promise<void> } = { promise: Promise.resolve() };

    async function run(context: Partial<TestContext>, report: Report, action: Action) {
        const { testcase, subcase, fixture } = context;
        const r = report;
        const a = action;

        const ss = runSubsection();

        const previousTopRun = topRun;
        const previousTop = top;
        topRun = { promise: Promise.resolve() };
        top = {
            ...top,
            ...(testcase && { testcase(description, spec) { return testcase(top.report(), ss, description, spec); } }),
            ...(subcase && { subcase(description, spec) { return subcase(top.report(), ss, description, spec); } }),
            ...(fixture && { fixture(description, spec) { return fixture(top.report(), ss, description, spec); } }),
            run() { throw new TestError('report should not occur during report'); },
            report() { return r; }
        };

        const tr = topRun;
        previousTopRun.promise = (async () => {
            try {
                await a(r);
            } finally {
                await tr.promise.catch(() => { });
                top = previousTop;
                topRun = previousTopRun;
            }
        })();
        await previousTopRun.promise;
    }

    const runSubsection = (): Runner => lockify(async (context, action, description) => {
        if (description) {
            const report = top.report().beginSubsection(description);
            try {
                await run(context, report, action);
                report.end();
            } catch (e) {
                if (e instanceof TestError) throw e;
                report.fail(e);
                report.end();
            }
        } else {
            await run(context, top.report(), action);
            await topRun.promise;
        }
    });

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
            report.bailOut(e);
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
export const fixture = s.fixture.bind(s);
export const message = s.message.bind(s);

if (process?.on) {
    process?.on('exit', () => report());
}
