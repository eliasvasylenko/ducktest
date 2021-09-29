import { TestError } from "./test-error.js";

export enum Ordering {
    Concurrent,
    Serial
}

export interface Reporter {
    beginReport(ordering?: Ordering, plan?: number): Report;
}
export interface Report {
    beginSubsection(desc: string): Report;
    diagnostic(message: string): void;
    fail(cause: unknown): void;
    end(message?: string): void;
    bailOut(cause?: unknown): void;
    success: boolean;
}
export interface Stream {
    (line: string): void;
}
export function tap(writeLine: Stream): Reporter {
    return { beginReport(ordering: Ordering = Ordering.Serial, plan?: number) { return new TapReport(writeLine, ordering, plan); } };
}

function prepend(prefix: string, lines: string) {
    return prefix + lines.replaceAll('\n', '\n' + prefix);
}

class TapOutput implements Report {
    _stream: Stream;
    #ordering: Ordering;
    #plan?: number;
    #subtests = 0;
    _ongoingSubsections = {
        [Ordering.Concurrent]: 0,
        [Ordering.Serial]: 0
    };
    _hasContent = false;
    success = true;
    constructor(stream: Stream, ordering: Ordering, plan?: number) {
        this._stream = stream;
        this.#ordering = ordering;
        if (plan != null) {
            this._stream(`1..${plan}`);
            this.#plan = plan;
        }
    }
    beginSubsection(description: string): Report {
        this.#checkEnded();
        this.#subtests++;
        return new TapSubsection(this, description, this.#ordering);
    }
    diagnostic(message: string) {
        this.#checkEnded();
        this._stream(prepend('# ', message));
    }
    fail(cause: unknown) {
        this.#checkEnded();

        this.#subtests++;
        this.success = false;
        this._stream(`not ok${cause instanceof Error ? ' - ' + cause.message : ''}`)
        this._stream('  ---');
        this._stream('  ...');
    }
    end(message?: string) {
        this.#checkEnded();
        this.#ended = true;

        if (this._ongoingSubsections[Ordering.Concurrent] + this._ongoingSubsections[Ordering.Serial])
            throw new TestError('subsection(s) not ended');
        if (this.#plan == null && this._hasContent)
            this._stream(`1..${this.#subtests}`)
        this._endMessage(message);
    }
    bailOut(cause?: unknown) {
        this.#ended = true;

        this._stream(`Bail out!${cause instanceof Error ? (' ' + cause.message) : ''}`)
    }
    _endMessage(message?: string) {
        if (message != null) {
            this.diagnostic(message);
        }
    }
    #ended = false;
    #checkEnded() {
        if (this.#ended)
            throw new TestError('report already ended');
    }
}

class TapReport extends TapOutput {
    constructor(stream: Stream, ordering: Ordering, plan?: number) {
        stream('TAP version 13');
        super(stream, ordering, plan);
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
        super(write, ordering, plan);
        this.#parent = parent;
        this.#description = description;
        this.#ordering = ordering;
    }
    _endMessage(message?: string) {
        this.#parent._ongoingSubsections[this.#ordering as Ordering]--;
        this.#parent._stream(`${this.success ? 'ok' : 'not ok'} - ${this.#description}${message ? ' # ' + message : ''}`);
        this.#parent.success = this.#parent.success && this.success;
    }
}
