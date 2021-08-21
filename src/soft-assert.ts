const subjectSymbol = Symbol('proxy-subject');
export function soften<T extends object>(subject: T, consume: (_: any) => void): T {
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