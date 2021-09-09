import { TestError } from "./test-error.js";

export enum Ordering {
    Concurrent,
    Serial
}
enum Status {
    Empty,
    Begun,
    Ended
}

export interface Reporter {
    beginReport(plan?: number): Report;
};
export interface Report {
    beginSubsection(desc: string, ordering?: Ordering): Report;
    diagnostic(message: string): void;
    fail(cause: any): void;
    end(message?: string): void;
    bailOut(cause?: any): void;
    success: boolean;
};
export interface Stream {
    (line: string): void;
};
export function tap(writeLine: Stream): Reporter {
    return { beginReport(plan: number) { return new TapReport(writeLine, plan); } };
};

function prepend(prefix: string, lines: string) {
    return prefix + lines.replaceAll('\n', '\n' + prefix);
}
function alreadyEnded() {
    throw new TestError('report already ended');
}

class TapOutput implements Report {
    _stream: Stream;
    #plan?: number;
    #subtests = 0;
    _ongoingSubsections = {
        [Ordering.Concurrent]: 0,
        [Ordering.Serial]: 0
    };
    _hasContent = false;
    success = true;
    constructor(stream: Stream, plan?: number) {
        this._stream = stream;
        if (plan != null) {
            this._stream(`1..${plan}`);
            this.#plan = plan;
        }
    }
    beginSubsection(description: string, ordering = Ordering.Serial): Report {
        this.#subtests++;
        return new TapSubsection(this, description, ordering);
    }
    diagnostic(message: string) { this._stream(prepend('# ', message)); }
    fail(cause: any) {
        this.#subtests++;
        this.success = false;
        this._stream(`not ok${cause?.message ? ' - ' + cause.message : ''}`)
        this._stream('  ---');
        this._stream('  ...');
    }
    end(message?: string) {
        this.end = alreadyEnded;
        this.bailOut = alreadyEnded;
        if (this._ongoingSubsections[Ordering.Concurrent] + this._ongoingSubsections[Ordering.Serial])
            throw new TestError('subsection(s) not ended');
        if (this.#plan == null && this._hasContent)
            this._stream(`1..${this.#subtests}`)
        this._endMessage(message);
    }
    bailOut(cause?: any) {
        this.end = alreadyEnded;
        this.bailOut = alreadyEnded;
        this._stream(`Bail out!${cause?.message ? (' ' + cause.message) : ''}`)
    }
    _endMessage(message?: string) {
        if (message != null) {
            this.diagnostic(message);
        }
    }
}

class TapReport extends TapOutput {
    constructor(stream: Stream, plan?: number) {
        stream('TAP version 13');
        super(stream, plan);
        this._hasContent = true;
    }
}

class TapSubsection extends TapOutput {
    #parent: TapOutput;
    #description: string;
    #ordering: Ordering;
    constructor(parent: TapOutput, description: string, ordering: Ordering, plan?: number) {
        parent._ongoingSubsections[ordering]++;

        const o = ordering;
        const prefix = ordering == Ordering.Concurrent ? `  ${description}|  ` : '    ';
        const write = (line: string) => {
            if (o === Ordering.Serial && !this._hasContent) {
                this._hasContent = true;
                parent._stream(`[${description}]`);
            }
            parent._stream(prepend(prefix, line));
        };
        super(write, plan);
        this.#parent = parent;
        this.#description = description;
        this.#ordering = ordering;
    }
    _endMessage(message?: string) {
        this.#parent._ongoingSubsections[this.#ordering as Ordering]--;
        this.#parent._stream(`${this.success ? 'ok' : 'not ok'} - ${this.#description}${message ? ' # ' + message : ''}`);
        this.#parent.success &&= this.success;
    }
}
