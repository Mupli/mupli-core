/* Helper function for reading a posted JSON body */
export function readBody(res, cb, err) {
    let buffer;
    /* Register data cb */
    res.onData((ab, isLast) => {
        let chunk = Buffer.from(ab);
        if (isLast) {
            if (buffer) {
                cb(Buffer.concat([buffer, chunk]));
            } else {
                cb(chunk);
            }
        } else {
            if (buffer) {
                buffer = Buffer.concat([buffer, chunk]);
            } else {
                buffer = Buffer.concat([chunk]);
            }
        }
    });

    /* Register error cb */
    res.onAborted(err);
}

/* Helper function for reading a posted JSON body */
export function readJson(res, cb, err) {
    let buffer;
    /* Register data cb */
    res.onData((ab, isLast) => {
        let chunk = Buffer.from(ab);
        if (isLast) {
            let json;
            if (buffer) {
                try {
                    json = JSON.parse(Buffer.concat([buffer, chunk]));
                } catch (e) {
                    /* res.close calls onAborted */
                    res.close();
                    return;
                }
                cb(json);
            } else {
                try {
                    json = JSON.parse(chunk);
                } catch (e) {
                    /* res.close calls onAborted */
                    res.close();
                    return;
                }
                cb(json);
            }
        } else {
            if (buffer) {
                buffer = Buffer.concat([buffer, chunk]);
            } else {
                buffer = Buffer.concat([chunk]);
            }
        }
    });

    /* Register error cb */
    res.onAborted(err);
}

export async function readBodyOther(res) {
    return new Promise((resolve) => {
        let buffer = Buffer.from("");
        res.onData((ab, isLast) => {
            const chunk = Buffer.from(ab);
            buffer = Buffer.concat([buffer, chunk]);
            if (isLast) {
                resolve(buffer);
            }
        });
    });
}

export function abToString(buffer) {
    var arr = new Uint8Array(buffer);
    return String.fromCharCode.apply(null, arr);
}
