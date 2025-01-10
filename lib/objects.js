import { klona } from "klona/json";

export class Objects {
    static structuredClone(objectToClone) {
        return klona(objectToClone);
        // const stringified = JSON.stringify(objectToClone);
        // const parsed = JSON.parse(stringified);
        // return parsed;
    }

    static requireNonNull(obj, message = "Object is null") {
        if (obj === undefined || obj === null) {
            throw new Error(message);
        }
        return obj;
    }

    static async resolvePromise(obj) {
        try {
            return obj;
        } catch (e) {
            console.error("Error", e.message);
            throw e;
        }
    }

    static sortKeys(unordered) {
        const ordered = Object.keys(unordered)
            .sort()
            .reduce((obj, key) => {
                obj[key] = unordered[key];
                return obj;
            }, {});

        return ordered;
    }
    static isEmpty(obj) {
        return !obj || Object.keys(obj).length === 0;
    }

    static deepFreeze(o) {
        if (!Object.isFrozen(o)) {
            Object.freeze(o);
            if (o === undefined) {
                return o;
            }

            Object.getOwnPropertyNames(o).forEach(function (prop) {
                if (
                    o[prop] !== null &&
                    (typeof o[prop] === "object" ||
                        typeof o[prop] === "function") &&
                    !Object.isFrozen(o[prop])
                ) {
                    deepFreeze(o[prop]);
                }
            });
        }
        return o;
    }

    static addNewOnly(resultCol, col) {
        Object.keys(col).filter(x => !resultCol[x])
            .forEach(x => resultCol[x] = col[x]);
        return resultCol;
    }
}
