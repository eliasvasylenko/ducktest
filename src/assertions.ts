/**
 * This function [wraps]{@link wrap} an assertion API so that errors
 * are passed to a given callback instead of thrown.
 * 
 * @param {T} subject An API entry point for an assertion library, e.g. 'strict'
 * in the node.js assert module, or 'expect' in chai.
 * @param {(error: unknown) => void} consume A callback to which to pass trapped errors.
 */
export function soften<T extends unknown>(subject: T, consume: (error: unknown) => void): T {
    return wrap(subject, callback => {
        try {
            return callback();
        } catch (e) {
            consume(e);
            return null;
        }
    });
}
/**
 * This function [wraps]{@link wrap} an assertion API so that no
 * output is made to the console.
 * 
 * @param {T} subject An API entry point for an assertion library, e.g. 'strict'
 * in the node.js assert module, or 'expect' in chai.
 */
export function silence<T extends unknown>(subject: T): T {
    if (process) {
        return wrap(subject, callback => {
            const stdout = process?.stdout.write;
            const stderr = process?.stderr.write;
            try {
                process.stdout.write = () => { return false; };
                process.stderr.write = () => { return false; };
                return callback();
            } finally {
                process.stdout.write = stdout;
                process.stderr.write = stderr;
            }
        });
    }
    return subject;
}

/**
 * A generic proxy wrapper designed for synchronous chaining-style
 * APIs; in particular this should work for almost all popular
 * assertion libraries. Async callbacks will not be wrapped, but
 * an assertion generally needs to be made directly on the calling
 * stack, and feedback needs to be immediate, to be useful. So
 * this shouldn't generally be a problem.
 * 
 * For an assertion API which has many entry points the user may
 * need to jumpt through a few more hoop. For an APi which
 * pollutes prototypes, this API may not be appropriate at all.
 * 
 * @param {T}subject the entry point for the API to wrap
 * @param {<U>(callback: () => U) => U | null}wrapper the wrapper function, accepting the original
 * property access or function application to be wrapped as a
 * callback, so that context can be provided and parameters
 * or return values can be intercepted.
 * @returns 
 */
export function wrap<T extends unknown>(subject: T, wrapper: <U>(callback: () => U) => U | null): T {
    if (!(subject instanceof Object)) {
        return subject;
    }
    const s = subject;
    return new Proxy<typeof subject>(subject, {
        get: function (target, prop, receiver) {
            if (prop === subjectSymbol)
                return s;
            return wrapper(() => wrap(Reflect.get(target, prop, receiver), wrapper));
        },
        apply: function (target, thisArg, argumentsList) {
            return wrapper(() => {
                thisArg = thisArg?.[subjectSymbol] ?? thisArg;
                return wrap((target as ((...args: unknown[]) => unknown)).call(thisArg, ...argumentsList), wrapper);
            });
        }
    });
}
const subjectSymbol = Symbol('proxy-subject');
