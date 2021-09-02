/**
 * This function takes an API entry point for a typical chaining-style
 * assertion library and wraps it so errors are passed to a callback
 * instead of being thrown.
 * 
 * @param {T} subject An API entry point for an assertion library, e.g. 'strict'
 * in the node.js assert module, or 'expect' in chai.
 * 
 * @param {(error: any) => void} consume A callback to which to pass trapped errors.
 */
export function soften<T extends object>(subject: T, consume: (error: any) => void): T {
    return new Proxy<T>(subject, {
        get: function (target, prop, receiver) {
            if (prop === subjectSymbol)
                return subject;
            try {
                return soften(Reflect.get(target, prop, receiver), consume);
            } catch (e) {
                consume(e);
                return null;
            }
        },
        apply: function (target, thisArg, argumentsList) {
            try {
                if (target instanceof Function) {
                    thisArg = thisArg?.[subjectSymbol] ?? thisArg;
                    return soften(target.call(thisArg, ...argumentsList), consume);
                }
            } catch (e) {
                consume(e);
                return null;
            }
        }
    });
}
const subjectSymbol = Symbol('proxy-subject');