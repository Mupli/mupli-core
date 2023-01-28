export class Objects {
    static structuredClone(objectToClone) {
        const stringified = JSON.stringify(objectToClone);
        const parsed = JSON.parse(stringified);
        return parsed;
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
                res = await obj;
            } catch (e) {
                console.error("Error", e.message);
                throw e;
            }
        }
        return res;
    }
}
