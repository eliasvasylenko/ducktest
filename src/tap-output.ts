import { TestError } from "./test-error.js";

export enum Ordering {
    Concurrent,
    Serial
}
export interface Reporter {
    beginSubtest(desc: string, ordering?: Ordering): Reporter;
    diagnostic(message: string): void;
    fail(cause: any): void;
    end(message?: string): void;
    success: boolean;
};
export type Stream = (line: string) => void;
export function tap(writeLine: Stream): Reporter {
    return new TapReporter(writeLine);
};

class TapReporter implements Reporter {
    _write: Stream;
    _ended = false;
    _ongoingSubtests = {
        [Ordering.Concurrent]: 0,
        [Ordering.Serial]: 0
    };
    success = true;
    constructor(writeLine: Stream) {
        this._write = writeLine;
    }
    beginSubtest(description: string, ordering = Ordering.Serial): Reporter {
        return new TapSubReporter(this, description, ordering);
    }
    diagnostic(message?: string) { this._write('# ' + message); }
    fail(cause: any) {
        this.success = false;
        this._write(`not ok${cause?.message ? ' - ' + cause.message : ''}`)
        this._write('  ---');
        this._write('  ...');
    }
    end(message?: string) {
        if (this._ended) throw new TestError('already ended!');
        if (this._ongoingSubtests[Ordering.Concurrent] + this._ongoingSubtests[Ordering.Serial]) throw new TestError('subtests not ended');
        this._ended = true;
        this._endMessage(message);
    }
    _endMessage(message?: string) {
        if (message != null) {
            this.diagnostic(message);
        }
    }
}

class TapSubReporter extends TapReporter {
    #parent: TapReporter;
    #description: string;
    #ordering: Ordering;
    constructor(parent: TapReporter, description: string, ordering: Ordering) {
        parent._ongoingSubtests[ordering]++;

        const o = ordering;
        let hasContent = false;
        const prefix = ordering == Ordering.Concurrent ? `  ${description}|  ` : '    ';
        const writeLine = (line: string) => {
            if (o === Ordering.Serial && !hasContent) {
                hasContent = true;
                parent.diagnostic(description);
            }
            parent._write(prefix + line);
        };
        super(writeLine);
        this.#parent = parent;
        this.#description = description;
        this.#ordering = ordering;
    }
    _endMessage(message?: string) {
        this.#parent._ongoingSubtests[this.#ordering as Ordering]--;
        this.#parent._write(`${this.success ? 'ok' : 'not ok'} - ${this.#description}${message ? ' # ' + message : ''}`);
        this.#parent.success &&= this.success;
    }
}
