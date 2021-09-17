import { soften as softenImpl, silence as silenceImpl } from './assertions.js';
export { Ordering, Reporter, Report, Stream, tap } from './tap-output.js';
import { Ordering, Reporter, Report, Stream, tap } from './tap-output.js';
import { TestError } from './test-error.js';

type Spec = () => SyncAsync;
type Action = (runner: TestRunner) => SyncAsync;
type Runner = (context: Partial<TestContext>, action: Action, description: string) => SyncAsync;
type TestCallback = (runner: Runner, description: string, spec: Spec) => SyncAsync;
type TestListener = (description: string, spec: Spec) => SyncAsync;

type SyncAsync = Promise<void> | void;
function syncAsyncChain(from: SyncAsync, to: () => (SyncAsync)) {
    try {
        return from?.then(to) ?? to();
    } catch (e) { throw e; }
}
function syncAsyncCatch(tryer: () => (SyncAsync), catcher: (e: any) => void) {
    try {
        return tryer()?.catch(catcher);
    } catch (e) { catcher(e); }
}
function syncAsyncFinally(tryer: () => (SyncAsync), finaller: () => void) {
    let cont: SyncAsync;
    try {
        cont = tryer();
    } catch (e) {
        finaller();
        throw e;
    }
    return cont?.finally(finaller) ?? finaller();
}

function runFixture(runner: Runner, description: string, spec: Spec): SyncAsync {
    return runner({
        fixture() {
            throw new TestError('fixture should not occur during fixture');
        },
        testcase: runTestcase
    }, spec, description);
}

function runTestcase(runner: Runner, description: string, spec: Spec): SyncAsync {
    return runCase(runner, description, spec, [], new Set());
}

interface CaseContext {
    children: { description: string; runner: Runner }[];
    promise: SyncAsync;
};
function runCase(runner: Runner, description: string, spec: Spec, subcasesOnPath: string[], subcasesEncounteredByParent: Set<string>): SyncAsync {
    const context: CaseContext = {
        children: [],
        promise: void null
    };

    return runner({
        subcase: runSubcase(context, subcasesOnPath, subcasesEncounteredByParent)
    }, runner => {
        let cont = spec();
        cont = syncAsyncChain(cont, () => context.promise);
        cont = syncAsyncChain(cont, () => {
            if (!runner.report().success) {
                for (const child of context.children)
                    runner.report().beginSubsection(child.description).end('SKIP enclosing case failed')
                return;
            }

            const subcasesEncountered = new Set([
                ...subcasesEncounteredByParent,
                ...context.children.map(c => c.description)
            ]);

            const promises = context.children.map(child => runCase(
                child.runner,
                child.description,
                spec,
                [...subcasesOnPath, child.description],
                subcasesEncountered));

            if (promises.length > 0)
                return Promise.all(promises).then();
        });
        return cont;
    }, description);
}

function runSubcase(context: CaseContext, subcasesOnPath: Iterable<string>, subcasesEncounteredByParent: Set<string>): TestCallback {
    const c = context;
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
            ? (runner, description) => {
                checkForDuplicates(description);

                if (!encounteredByParent.has(description))
                    c.children.push({ description, runner });
            }
            : (runner, description, spec) => {
                checkForDuplicates(description);

                if (nextSubcase.value === description) {
                    encounterSubcase = nextEncounterSubcase();
                    c.promise = syncAsyncChain(c.promise, spec);
                    return c.promise;
                }

                if (!encounteredByParent.has(description))
                    throw new TestError('encountered unexpected subcase');
            };
    }

    let encounterSubcase = nextEncounterSubcase();

    return (runner, description, spec) => encounterSubcase(runner, description, spec);
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
    run(reporter: Reporter): SyncAsync;
}
type Plan = ((runner: TestRunner) => SyncAsync)[];
interface SynchronousStack {
    parent?: SynchronousStack;
    promise: SyncAsync;
    report: Report;
    description: string;
}
function makeSynchronousTestRunner(): TestRunner {
    let top: TestRunner;
    function run(context: Partial<TestContext>, stack: SynchronousStack, action: Action) {
        const { testcase, subcase, fixture } = context;

        const report = stack.report;
        const subsection = runSubsection(stack);
        const previousTop = top;
        top = {
            ...top,
            ...(testcase && { testcase(description, spec) { return testcase(subsection, description, spec); } }),
            ...(subcase && { subcase(description, spec) { return subcase(subsection, description, spec); } }),
            ...(fixture && { fixture(description, spec) { return fixture(subsection, description, spec); } }),
            run() { throw new TestError('report should not occur during report'); },
            report() { return report; }
        };

        return syncAsyncFinally(
            () => action(top),
            () => void (top = previousTop));
    }

    function runSubsection(stack: SynchronousStack): Runner {
        const s = stack;
        return (context, action, description) => {
            const c = context;
            const a = action;
            const d = description;

            let promise: SyncAsync;
            const promiser = () => {
                const subsection = s.report.beginSubsection(d);
                const substack: SynchronousStack = { parent: s, report: subsection, description: d, promise: void null };

                let cont = run(c, substack, runner =>
                    syncAsyncCatch(
                        () => syncAsyncChain(a(runner), () => subsection.end()),
                        (e: any) => {
                            if (e instanceof TestError) throw e;
                            subsection.fail(e);
                            subsection.end();
                        }));
                cont = syncAsyncChain(cont, () => substack.promise);
                return cont;
            };
            promise = syncAsyncChain(s.promise, promiser);
            s.promise = promise;
            return promise;
        };
    };

    function runPlan(reporter: Reporter, plan: Plan) {
        const report = reporter.beginReport(Ordering.Serial, plan.length);
        const stack: SynchronousStack = { report, description: 'root', promise: void null };
        const context = { testcase: runTestcase, fixture: runFixture };
        const p = plan;

        return syncAsyncCatch(() => {
            let cont = run(context, stack, runner => {
                const r = runner;
                let c: SyncAsync = void null;
                for (const test of p) {
                    c = syncAsyncChain(c, () => test(r));
                }
                return c;
            });
            cont = syncAsyncChain(cont, () => stack.promise);
            cont = syncAsyncChain(cont, () => report.end());
            return cont;
        }, (e) => {
            report.bailOut(e);
        });
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

function makePlanningInterface(runPlan: (reporter: Reporter, plan: Plan) => (SyncAsync)): TestRunner {
    const plan: Plan = [];
    return {
        testcase(description, spec) {
            const d = description;
            const s = spec;
            plan.push(runner => runner.testcase(d, s));
        },
        subcase() {
            throw new TestError('subcase should occur during testcase');
        },
        fixture(description, spec) {
            const d = description;
            const s = spec;
            plan.push(runner => runner.fixture(d, s));
        },
        report() {
            throw new TestError('reporting should occur during test');
        },
        run(reporter) { return runPlan(reporter, plan); }
    };
}

export const defaultReporter: Reporter = tap(console.log);
export class Suite {
    #runner = makeSynchronousTestRunner();

    report(output?: Stream | Reporter) {
        const reporter = output
            ? ('beginReport' in output)
                ? output as Reporter
                : tap(output as Stream)
            : defaultReporter;

        return this.#runner.run(reporter);
    }

    softFail(error: any) {
        this.#runner.report().fail(error);
    }
    soften<T extends object>(subject: T): T {
        return softenImpl(subject, this.softFail)
    }
    softly(action: () => SyncAsync) {
        return syncAsyncCatch(action, e => this.softFail(e));
    }
    silence = silenceImpl;

    message(message: string) {
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

process?.once?.('beforeExit', report);