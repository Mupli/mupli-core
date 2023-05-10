import {klona} from "klona/json" 
export class Objects {
    static structuredClone(objectToClone) {
        return klona(objectToClone)
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
        let res = obj;
        if (obj && obj.then) {
            try {
                res = obj;
                return res;
            } catch (e) {
                console.error("Error", e.message);
                throw e;
            }
        }
        return obj;
    }
}
