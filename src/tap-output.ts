import { TestError } from "./test-error.js";
export interface Reporter {
    beginSubtestSerial(desc: string): Reporter;
    beginSubtestConcurrent(desc: string): Reporter;
    diagnostic(message: string): void;
    fail(cause: any): void;
    end(message?: string): void;
};
export type Stream = (line: string) => void;

const write = Symbol('write');
const ended = Symbol('ended');
const subtests = Symbol('subtests');
const success = Symbol('success');
const endChild = Symbol('endChild');
const end = Symbol('end');
interface TapReporter extends Reporter {
    [write]: Stream;
    [ended]: boolean;
    [subtests]: number;
    [success]: boolean;
    [endChild]: (desc: string, success: boolean, message?: string) => void;
    [end]: () => void;
}
export function tap(writeLine: Stream): Reporter {
    return {
        [write]: writeLine,
        [ended]: false,
        [subtests]: 0,
        [success]: true,
        [endChild](desc, succ, message) {
            this[subtests]--;
            this[write](`${succ ? 'ok' : 'not ok'} - ${desc}${message ? ' #' + message : ''}`);
            this[success] &&= succ;
        },
        [end]() {
            if (this[ended]) throw new TestError('already ended!');
            if (this[subtests] > 0) throw new TestError('subtests not ended');
            this[ended] = true;
        },
        beginSubtestSerial(desc: string): Reporter {
            this[subtests]++;
            return tapSubtest(this, desc, '    ');
        },
        beginSubtestConcurrent(desc: string): Reporter {
            this[subtests]++;
            return tapSubtest(this, desc, `  ${desc}|  `);
        },
        diagnostic(message: string) { this[write]('# ' + message); },
        fail(cause: any) {
            this[success] = false;
            this[write](`not ok${cause?.message ? ' - ' + cause.message : ''}`)
            this[write]('  ---');
            this[write]('  ...');
        },
        end(message?: string) {
            this[end]();
            if (message != null) this.diagnostic(message);
        }
    } as TapReporter;
};

function tapSubtest(parent: TapReporter, desc: string, prefix: string): Reporter {
    const p = parent;
    const d = desc;
    const pr = prefix;
    const writeLine = (line: string) => p[write](pr + line);
    return {
        ...tap(writeLine),
        end(message?: string) {
            this[end]();
            p[endChild](d, this[success], message);
        }
    } as TapReporter;
};
