export type SyncAsync<T = void> = PromiseLike<T> | T;
class Commitment<T = void> implements PromiseLike<T> {
    #value: () => SyncAsync<T>;

    constructor(value: () => SyncAsync<T>) {
        let result: SyncAsync<T> | undefined;
        this.#value = () => (result = result || value());
    }

    then<R1 = T, R2 = never>(onfulfilled?: ((value: T) => SyncAsync<R1>) | undefined | null, onrejected?: ((reason: unknown) => SyncAsync<R2>) | undefined | null): Commitment<R1 | R2> {
        const fulfill = onfulfilled ?? (t => t as unknown as (SyncAsync<R1>));
        const reject = onrejected ?? (e => { throw e; });
        return new Commitment(() => {
            let result: SyncAsync<T>;
            try {
                result = this.#value();
            } catch (e) {
                return reject(e);
            }
            return (result && 'then' in result)
                ? result.then(fulfill, reject)
                : fulfill(result as T);
        });
    }

    catch<R = never>(onrejected?: ((reason: unknown) => R | PromiseLike<R>) | undefined | null): Commitment<T | R> {
        if (!onrejected)
            return this;
        return this.then(null, onrejected);
    }

    finally(onfinally?: (() => void) | undefined | null): Commitment<T> {
        if (!onfinally)
            return this;
        return this.then(t => {
            onfinally();
            return t;
        }, e => {
            onfinally();
            throw e;
        });
    }

    honour() {
        return this.#value();
    }
}
export function commit(): Commitment<void> {
    return new Commitment(() => void null);
}
