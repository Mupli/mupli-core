function date() {
    return new Date().toISOString().replace("T", " ");
}
const COLOR_RED = "\x1b[31m%s\x1b[0m";
const COLOR_YELLOW = "\x1b[33m%s\x1b[0m";

const _defaultConfig = {
    INFO: {},
    WARN: { color: COLOR_YELLOW },
    ERROR: { color: COLOR_RED },
};

let _config = {};

export class Log {
    static init(config = { levels: ["INFO", "WARN", "ERROR"] }) {
        let tmpConfig = {};
        config.levels.forEach((level) => {
            tmpConfig[level] = _defaultConfig[level];
        });

        _config = tmpConfig;

        return Log;
    }

    static info(msg, ...data) {
        if (_config["INFO"]) {
            let message = _stringifyMsg(msg);
            message = _handleParams(message, data);

            var fileAndLine = _traceErr(msg);
            console.log(date() + " INFO  -- " + fileAndLine + " : " + message);
            logError(msg);
        }
    }
    static warn(msg, ...data) {
        if (_config["WARN"]) {
            let message = _stringifyMsg(msg);
            message = _handleParams(message, data);
            var fileAndLine = _traceErr(msg);
            const color = _config["WARN"].color ?? COLOR_YELLOW;
            console.log(
                color,
                date() + " WARN  -- " + fileAndLine + " : " + message
            );
            logError(msg, color);
        }
    }

    static error(msg, ...data) {
        if (_config["ERROR"]) {
            let message = _stringifyMsg(msg);
            message = _handleParams(message, data);
            var fileAndLine = _traceErr(msg);
            const color = _config["ERROR"].color ?? COLOR_RED;
            console.log(
                color,
                date() + " ERROR -- " + fileAndLine + " : " + message
            );
            logError(msg, color);
        }
    }
}

function _traceErr(msg) {
    var fileAndLine;
    if (msg instanceof Error) {
        fileAndLine = traceCaller(2, msg);
    } else {
        fileAndLine = traceCaller(2);
    }
    return fileAndLine;
}

/**
 * examines the call stack and returns a string indicating
 * the file and line number of the n'th previous ancestor call.
 * this works in chrome, and should work in nodejs as well.
 *
 * @param n : int (default: n=1) - the number of calls to trace up the
 *   stack from the current call.  `n=0` gives you your current file/line.
 *  `n=1` gives the file/line that called you.
 */
function traceCaller(n, err) {
    var s = err ? err.stack : new Error().stack;
    let b;
    if (isNaN(n) || n < 0) n = 1;
    n += 1;
    var a = s.indexOf("\n", 5);
    while (n--) {
        a = s.indexOf("\n", a + 1);
        if (a < 0) {
            a = s.lastIndexOf("\n", s.length);
            break;
        }
    }
    b = s.indexOf("\n", a + 1);
    if (b < 0) b = s.length;
    // a = Math.max(s.lastIndexOf(" ", b), s.lastIndexOf("/", b));
    // a = s.lastIndexOf("///", b);
    b = s.lastIndexOf(":", b);
    // s = s.substring(a + 1, b);

    const size = 35;

    s = s.substring(b - (size + 3), b);
    s = s.replace(".js", "");

    a = s.indexOf("/");
    if (a < 10) {
        s = s.substring(a + 1);
    } else {
        s = s.substring(s.length - size);
    }

    const sIndex = s.length > size ? s.length - size : 0;
    if (sIndex > 0) {
        s = s.substring(0, 5) + "..." + s.substring(8 + sIndex, s.length);
    } else {
        s = "".padStart(size - s.length - 1, ".") + " " + s;
    }

    return s;
}

function _handleParams(msg, data = []) {
    for (let index = 0; index < data.length; index++) {
        let element = data[index];
        if (typeof element == "object") {
            element = JSON.stringify(element);
        }
        msg = msg.replace("{}", element);
    }
    return msg;
}

function _stringifyMsg(msg) {
    if (msg instanceof Error) {
        msg = msg.message;
    } else if (typeof msg == "object") {
        msg = JSON.stringify(msg);
    }
    return msg;
}

function logError(msg, color) {
    if (msg instanceof Error) {
        if (color) {
            console.log(color, msg.stack);
        } else {
            console.log(msg.stack);
        }
    }
}
