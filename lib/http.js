import { getParts } from "uWebSockets.js";
import { abToString, readBody, readBodyOther } from "./json.js";

export class CorsOptions {
    allowOrigin;
    allowMethods;
    allowHeaders;
    maxAge;
    exposeHeaders;
    allowCredentials;
}

export class CookieOptions {
    expires; //date
    domain;
    maxAge; // in seconds
    httpOnly; //
    hostOnly; // the cookie should be handled by the browser to the server only to the same host/server that firstly sent it to the browser.
    sameSite; //Strict, Lax, None
    secure;
    /**
     * path "/" will match "/test", "/test2"...,
     * path "/*" will match only "/*"  = no matching for /xyz
     *
     * @type {string}
     */
    path;
}

export class Request {
    _req;
    _res;
    _path;
    _headers = {}; //lazy
    _cookies; //lazy
    _pathKeys;
    _pathValues;

    _formData;
    // _paramsPart = {};

    _bodyData;
    _jsonData;
    _method;

    constructor(req, res, path, pathKeys, pathValues) {
        this._req = req;
        this._res = res;
        this._path = path;
        this._pathKeys = pathKeys;
        this._pathValues = pathValues;

        this.header("cookie");
        // if (paramsPart) {
        //     this._paramsPart = url.parse(req.url, true).query;
        // }
    }

    ip() {
        return Buffer.from(this._res.getRemoteAddressAsText()).toString();
    }

    /**
     *
     * @returns {Promise}
     */
    async body() {
        // let body = "";
        // const request = this._req;
        // request.on("data", function (data) {
        //     body += data;

        //     // Too much POST data, kill the connection!
        //     // 1e6 === 1 * Math.pow(10, 6) === 1 * 1000000 ~~~ 1MB
        //     if (body.length > 1e6) request.connection.destroy();
        // });

        // request.on("end", function () {
        //     return body;
        // });
        // return await new Promise((fulfill) =>
        //     request.on("end", () => {
        //         fulfill(body);
        //     })
        // );

        if (!this._bodyData) {
            this._bodyData = await new Promise((fulfill) => {
                readBody(
                    this._res,
                    (data) => {
                        fulfill(data);
                    },
                    (err) => {}
                );
            });
        }

        return this._bodyData;
    }

    /**
     *  form object (key is fileName)
     *  {  
     *      file2: {
                data: ArrayBuffer {
                    [Uint8Contents]: <5a 65 73 6b 61 6e 6f  74>,
                    byteLength: 20
                },
                name: 'file2',
                filename: 'some text.txt',
                type: 'text/plain'
            },
            test: 'test123',
            cdar: 'dasdasd'
        }
     * @returns {}
     */

    async form() {
        const me = this;
        if (!this._formData) {
            const header = this.header("content-type");
            const buffer = await readBodyOther(this._res);
            const data = getParts(buffer, header);
            const formData = {};

            data.forEach((field) => {
                if (field.type) {
                    formData[field.name] = field;
                } else {
                    formData[field.name] = abToString(field.data);
                }
            });
            this._formData = formData;
        }
        return this._formData;
    }

    cookie(name) {
        if (!this._cookies) {
            const cookies = this.header("cookie") ?? "";

            // const values = cookies
            //     .split(";")
            //     .filter((par) => par.indexOf(name + "=") >= 0)
            //     .map((par) => par.replace(name + "=", ""))
            //     .map((value) => {
            //         if (value.indexOf("{") > 0) {
            //             return JSON.parse(value);
            //         }
            //         return value.trim();
            //     });

            const tmpCk = {};

            cookies
                .split(";")
                .filter((par) => par.indexOf("=") > 0)
                .map((par) => par.split("="))
                .forEach((par) => {
                    const name = par[0];
                    const value = par[1];
                    if (value.indexOf("{") > 0) {
                        tmpCk[name] = JSON.parse(value);
                    } else {
                        tmpCk[name] = value.trim();
                    }
                });

            this._cookies = tmpCk;
        }
        return this._cookies[name];
    }

    headers() {
        if (!this._headers) {
            this._headers = {};
            this._req.forEach((key, value) => {
                this._headers[key] = value;
            });
        }

        return this._headers;
    }

    header(name) {
        if (this._headers[name] === undefined) {
            this._headers[name] = this._req.getHeader(name);
        }
        return this._headers[name];
    }

    async text() {
        const body = await this.body();
        // return body;
        return abToString(body);
    }

    async json() {
        if (!this._jsonData) {
            const body = await this.body();
            this._jsonData = JSON.parse(abToString(body));
        }

        return this._jsonData;
    }

    param(paramName, defaultValue = undefined) {
        return this._req.getQuery(paramName) || defaultValue;
        // return this._paramsPart[paramName] || defaultValue;
    }
    pathParam(key) {
        return this._pathValues[this._pathKeys.indexOf(key)];
    }

    path() {
        return this._path;
    }

    host() {
        return this.header("host");
        // return req.headers.host;
    }

    /**
     * uppercased safe
     *
     * @param {string} method
     * @returns
     */
    is(method) {
        this._method = this._method ?? this._req.getMethod();
        return this._method === method.toLowerCase();
    }
}

export class Response {
    _res;

    constructor(res) {
        this._res = res;
    }

    _statusCode;
    _content;
    _headerUsed = false;
    _headers = {};
    _cookiesUsed = false;
    _cookies = {};

    ok() {
        return this.status(200);
    }

    badRequest() {
        return this.status(400);
    }

    notFound() {
        return this.status(404);
    }

    status(statusCode) {
        this._statusCode = statusCode;
        return this;
    }

    /**
     *
     * @link https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Set-Cookie
     * @param {*} key
     * @param {*} value
     * @param {CookieOptions} options
     */
    cookie(key, value, options = {}) {
        this._cookiesUsed = true;
        let cookieValue = [];

        cookieValue.push(key + "=" + value);

        if (options.domain) cookieValue.push("Domain=" + options.domain);
        if (options.path) cookieValue.push("Path=" + options.path);
        if (options.expires) {
            cookieValue.push(
                "Expires=" + new Date(options.expires).toISOString()
            );
        }
        if (options.maxAge) cookieValue.push("Max-Age=" + options.maxAge);
        if (options.sameSite) cookieValue.push("SameSite=" + options.sameSite);
        if (options.hostOnly) cookieValue.push("HostOnly");
        if (options.httpOnly) cookieValue.push("HttpOnly");
        if (options.secure) cookieValue.push("Secure");

        this._cookies[key] = cookieValue.join(";") + ";";
        return this;
    }

    header(key, value) {
        this._headerUsed = true;
        this._headers[key] = value;
        return this;
    }
    contentEncoding(contentEncoding) {
        this.header("content-encoding", contentEncoding);
        return this;
    }

    contentType(contentType) {
        this.header("Content-Type", contentType ?? "text/html");
        return this;
    }

    json(content) {
        this.contentType("text/json");
        this._content = JSON.stringify(content);
        return this;
    }

    text(content) {
        this.contentType("text/html");
        this._content = "" + content;
        return this;
    }

    body(content) {
        return this.write(content);
    }

    write(content) {
        this._content = content;
        return this;
    }

    /**
     * fileDataBuffer = fs.readFileSync(fileName)
     *
     * @param {} fileDataBuffer
     * @returns
     */
    stream(fileDataBuffer) {
        const videoFile = fileDataBuffer.buffer.slice(
            fileDataBuffer.byteOffset,
            fileDataBuffer.byteOffset + fileDataBuffer.byteLength
        );

        // const totalSize = videoFile.byteLength;

        this._content = videoFile;

        //TODO FOR Async
        // https://github.com/uNetworking/uWebSockets.js/blob/master/examples/VideoStreamer.js
        return this;
    }

    redirectTo(url) {
        return this.status("302").header("Location", url);
    }

    end() {
        this._res.writeStatus("" + (this._statusCode ?? 200));

        if (this._headerUsed) {
            const me = this;
            Object.keys(this._headers).forEach((key) => {
                const value = me._headers[key];
                me._res.writeHeader(key, value);
            });
        }

        if (this._cookiesUsed) {
            const me = this;
            Object.values(this._cookies).forEach((cookieString) => {
                me._res.writeHeader("Set-Cookie", cookieString);
            });
        }
        this._res.end(this._content);
    }
}

export class WSRequest {
    _message;

    constructor(message) {
        this._message = message;
    }
    async json() {
        return this._message;
    }
    async body() {
        return this._message;
    }
    async text() {
        return this._message;
    }
}
export class WSService {
    _ws;

    _appName;

    constructor(ws, appName) {
        this._ws = ws;
        this._appName = appName;
    }

    clientOn(...topics) {
        topics.forEach((t) => {
            this._ws.subscribe(t);
        });
    }

    publish(event, object) {
        this._ws.publish(event, JSON.stringify(object), false);
    }
}

export class WSResponse {
    /**
     *
     */
    _ws;

    _appName;

    constructor(ws, appName) {
        this._ws = ws;
        this._appName = appName;
    }

    json(content) {
        this.text(JSON.stringify(content));
        return this;
    }

    text(content) {
        this._content = "" + content;
        return this;
    }

    write(content) {
        this._content = content;
        return this;
    }

    to(topic) {
        this._to = topic;
        return this;
    }

    publish(event, message) {
        this._ws.publish(event, message, false);
    }

    async end() {
        // "/" + this._appName + this._to +" "
        await this._ws.send(this._content);
        return;
    }
}
