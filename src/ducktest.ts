import { soften as softenImpl, silence as silenceImpl } from './assertions.js';
export { Ordering, Reporter, Report, Stream, tap } from './tap-output.js';
import { Ordering, Reporter, Report, Stream, tap } from './tap-output.js';
import { TestError } from './test-error.js';

interface Context {
    testcase?: TestImpl;
    subcase?: TestImpl;
    fixture?: TestImpl;
}
interface Tester {
    testcase: Test;
    subcase: Test;
    fixture: Test;
    report(): Report;
    run(reporter: Reporter): SyncAsync;
}
type Test = (description: string, spec: () => SyncAsync) => SyncAsync;
type ContextRunner = (context: Context) => (description: string, action: (tester: Tester) => SyncAsync) => SyncAsync;
type TestImpl = (runner: ContextRunner) => Test;
type SyncAsync = Promise<void> | void;

function syncAsyncChain(action: () => SyncAsync, ...actions: (() => SyncAsync)[]) {
    let result = action();
    for (const action of actions)
        result = result?.then(action) ?? action();
    return result;
}
function syncAsyncCatch(tryer: () => SyncAsync, catcher: (e: any) => void) {
    try {
        return tryer()?.catch(catcher);
    } catch (e) { catcher(e); }
}
function syncAsyncFinally(tryer: () => SyncAsync, finaller: () => void) {
    let cont: SyncAsync;
    try {
        cont = tryer();
    } catch (e) {
        finaller();
        throw e;
    }
    return cont?.finally(finaller) ?? finaller();
}

function runFixture(runner: ContextRunner): Test {
    return runner({
        fixture: () => () => { throw new TestError('fixture should not occur during fixture'); },
        testcase: runCase
    });
}

interface CaseContext {
    children: { description: string; runner: ContextRunner }[];
    promise: SyncAsync;
};
function runCase(runner: ContextRunner, subcasesOnPath: Iterable<string> = [], subcasesEncounteredByParent: Set<string> = new Set()): Test {
    return (description, spec): SyncAsync => {
        const context: CaseContext = { children: [], promise: void null };
        const r = runner({ subcase: runSubcase(context, subcasesOnPath, subcasesEncounteredByParent) });

        return r(description, tester =>
            syncAsyncChain(
                spec,
                () => context.promise,
                () => {
                    if (!tester.report().success) {
                        for (const child of context.children)
                            tester.report().beginSubsection(child.description).end('SKIP enclosing case failed')
                        return;
                    }

                    const subcasesEncountered = new Set([
                        ...subcasesEncounteredByParent,
                        ...context.children.map(c => c.description)
                    ]);

                    const promises = context.children.map(child => runCase(
                        child.runner,
                        [...subcasesOnPath, child.description],
                        subcasesEncountered)(
                            child.description,
                            spec));

                    if (promises.length > 0)
                        return Promise.all(promises).then();
                }));
    }
}

function runSubcase(context: CaseContext, subcasesOnPath: Iterable<string>, subcasesEncounteredByParent: Set<string>): TestImpl {
    const c = context;
    const encounteredByParent = subcasesEncounteredByParent;
    const encountered = new Set<string>();

    function checkForDuplicates(description: string) {
        if (encountered.has(description))
            throw new TestError('duplicate subcase name encountered during run');
        encountered.add(description);
    }

    const path = subcasesOnPath[Symbol.iterator]();
    function nextEncounterSubcase(): TestImpl {
        const nextSubcase = path.next();

        return (nextSubcase.done)
            ? runner => {
                const r = runner;
                return description => {
                    checkForDuplicates(description);

                    if (!encounteredByParent.has(description))
                        c.children.push({ description, runner: r });
                }
            }
            : () => (description, spec) => {
                checkForDuplicates(description);

                if (nextSubcase.value === description) {
                    encounterSubcase = nextEncounterSubcase();
                    c.promise = syncAsyncChain(
                        () => c.promise,
                        spec);
                    return c.promise;
                }

                if (!encounteredByParent.has(description))
                    throw new TestError('encountered unexpected subcase');
            };
    }

    let encounterSubcase = nextEncounterSubcase();

    return runner => encounterSubcase(runner);
}

type Plan = ((tester: Tester) => SyncAsync)[];
interface SynchronousStack {
    parent?: SynchronousStack;
    promise: SyncAsync;
    report: Report;
    description: string;
}
function makeSynchronousTester(): Tester {
    let top: Tester;
    function run(context: Context) {
        const { testcase, subcase, fixture } = context;

        return (stack: SynchronousStack, action: (tester: Tester) => SyncAsync) => {
            const report = stack.report;
            const subsection = runSubsection(stack);
            const previousTop = top;
            top = {
                ...top,
                ...(testcase && { testcase: testcase(subsection) }),
                ...(subcase && { subcase: subcase(subsection) }),
                ...(fixture && { fixture: fixture(subsection) }),
                run() { throw new TestError('report should not occur during report'); },
                report() { return report; }
            };

            return syncAsyncFinally(
                () => action(top),
                () => void (top = previousTop));
        };
    }

    function runSubsection(stack: SynchronousStack): ContextRunner {
        const s = stack;

        return (context) => {
            const r = run(context);

            return (description, action) => {
                const d = description;
                const a = action;

                return (s.promise = syncAsyncChain(
                    () => s.promise,
                    () => {
                        const subsection = s.report.beginSubsection(d);
                        const substack: SynchronousStack = { parent: s, report: subsection, description: d, promise: void null };

                        return syncAsyncChain(
                            () => r(substack, tester =>
                                syncAsyncCatch(
                                    () => syncAsyncChain(
                                        () => a(tester),
                                        () => subsection.end()),
                                    e => {
                                        if (e instanceof TestError) throw e;
                                        subsection.fail(e);
                                        subsection.end();
                                    })),
                            () => substack.promise);
                    }));
            };
        };
    }

    function runPlan(reporter: Reporter, plan: Plan) {
        const report = reporter.beginReport(Ordering.Serial, plan.length);
        const stack: SynchronousStack = { report, description: 'root', promise: void null };
        const r = run({ testcase: runCase, fixture: runFixture });
        const p = plan;

        return syncAsyncCatch(() =>
            syncAsyncChain(
                () => r(stack, tester => {
                    const r = tester;
                    let c: SyncAsync = void null;
                    for (const test of p) {
                        c = syncAsyncChain(
                            () => c,
                            () => test(r));
                    }
                    return c;
                }),
                () => stack.promise,
                () => report.end()),
            e => report.bailOut(e));
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

function makePlanningInterface(runPlan: (reporter: Reporter, plan: Plan) => SyncAsync): Tester {
    const plan: Plan = [];
    return {
        testcase(description, spec) {
            const d = description;
            const s = spec;
            plan.push(tester => tester.testcase(d, s));
        },
        subcase() {
            throw new TestError('subcase should occur during testcase');
        },
        fixture(description, spec) {
            const d = description;
            const s = spec;
            plan.push(tester => tester.fixture(d, s));
        },
        report() {
            throw new TestError('reporting should occur during test');
        },
        run(reporter) { return runPlan(reporter, plan); }
    };
}

export const defaultReporter: Reporter = tap(console.log);
export class Suite {
    #runner = makeSynchronousTester();

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
        return softenImpl(subject, e => this.softFail(e))
    }
    softly(action: () => SyncAsync) {
        return syncAsyncCatch(action, e => this.softFail(e));
    }
    silence = silenceImpl;

    message(message: string) {
        this.#runner.report().diagnostic(message);
    }
    testcase: Test = (description, spec) => { return this.#runner.testcase(description, spec); }
    subcase: Test = (description, spec) => { return this.#runner.subcase(description, spec); }
    fixture: Test = (description, spec) => { return this.#runner.fixture(description, spec); }
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