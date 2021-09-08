import { TestError } from "./test-error.js";

export enum Ordering {
    Concurrent,
    Serial
}

export type Reporter = (stream: Stream) => Report;
export interface Report {
    beginSubtest(desc: string, ordering?: Ordering): Report;
    diagnostic(message: string): void;
    fail(cause: any): void;
    end(message?: string): void;
    success: boolean;
};
export interface Stream {
    open?(): void;
    close?(): void;
    write(line: string): void;
};
export function tap(writeLine: Stream): Report {
    return new TapReport(writeLine);
};

export function prepend(prefix: string, lines: string) {
    return prefix + lines.replaceAll('\n', '\n' + prefix);
}

class TapReport implements Report {
    _stream: Stream;
    _ended = false;
    _ongoingSubtests = {
        [Ordering.Concurrent]: 0,
        [Ordering.Serial]: 0
    };
    success = true;
    constructor(stream: Stream) {
        this._stream = stream;
        if (this._stream.open) this._stream.open();
    }
    beginSubtest(description: string, ordering = Ordering.Serial): Report {
        return new TapSubReport(this, description, ordering);
    }
    diagnostic(message: string) { this._stream.write(prepend('# ', message)); }
    fail(cause: any) {
        this.success = false;
        this._stream.write(`not ok${cause?.message ? ' - ' + cause.message : ''}`)
        this._stream.write('  ---');
        this._stream.write('  ...');
    }
    end(message?: string) {
        try {
            if (this._ended) throw new TestError('already ended!');
            if (this._ongoingSubtests[Ordering.Concurrent] + this._ongoingSubtests[Ordering.Serial]) throw new TestError('subtests not ended');
            this._ended = true;
            this._endMessage(message);
        } finally {
            if (this._stream.close) this._stream.close();
        }
    }
    _endMessage(message?: string) {
        if (message != null) {
            this.diagnostic(message);
        }
    }
}

class TapSubReport extends TapReport {
    #parent: TapReport;
    #description: string;
    #ordering: Ordering;
    constructor(parent: TapReport, description: string, ordering: Ordering) {
        parent._ongoingSubtests[ordering]++;

        const o = ordering;
        let hasContent = false;
        const prefix = ordering == Ordering.Concurrent ? `  ${description}|  ` : '    ';
        const write = (line: string) => {
            if (o === Ordering.Serial && !hasContent) {
                hasContent = true;
                parent.diagnostic(description);
            }
            parent._stream.write(prepend(prefix, line));
        };
        super({ write });
        this.#parent = parent;
        this.#description = description;
        this.#ordering = ordering;
    }
    _endMessage(message?: string) {
        this.#parent._ongoingSubtests[this.#ordering as Ordering]--;
        this.#parent._stream.write(`${this.success ? 'ok' : 'not ok'} - ${this.#description}${message ? ' # ' + message : ''}`);
        this.#parent.success &&= this.success;
    }
}
