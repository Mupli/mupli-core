import { getParts } from "uWebSockets.js";
import { abToString, readBody, readBodyOther } from "./json.js";
import qs from "fast-querystring";
import { Log } from "./log.js";

export class CorsOptions {
    allowOrigin;
    allowMethods;
    allowHeaders;
    maxAge;
    exposeHeaders;
    allowCredentials;
}

export class CookieOptions {
    expires; // cookie valid until date
    domain;
    maxAge; // in seconds
    httpOnly; // it won't be visible in Javascript
    hostOnly; // the cookie should be handled by the browser to the server only to the same host/server that firstly sent it to the browser.
    sameSite; //Strict, Lax, None
    secure; // if true - it can be send only over https (mitigate man in the middle)
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
    _headers; //lazy
    _cookies; //lazy
    _pathKeys;
    _pathValues;

    _formData;
    // _paramsPart = {};

    _bodyData;
    _jsonData;
    _method;
    _query;

    constructor(req, res, path, pathKeys, pathValues) {
        this._req = req;
        this._res = res;
        this._path = path;
        this._pathKeys = pathKeys??[];
        this._pathValues = pathValues??{};

        this.headers();
        this._query = req.getQuery();
        this._method = req.getMethod();

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
        if (this._formData === undefined) {
            const header = this.header("content-type");
            if (header) {
                const buffer = await readBodyOther(this._res);

                let formData = {};
                if (header.indexOf("multipart") >= 0) {
                    let data = getParts(buffer, header) ?? [];

                    data.forEach((field) => {
                        if (field.type) {
                            formData[field.name] = field;
                        } else {
                            formData[field.name] = abToString(field.data);
                        }
                    });
                } else {
                    const params = Buffer.from(buffer).toString("utf8");
                    formData = qs.parse(params);
                }

                this._formData = formData;
            } else {
                this._formData = null;
            }
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
                    const name = par[0].trim();
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
        if (!this._headers) {
            this.headers();
        }
        return this._headers[name];
    }

    async text() {
        const body = await this.body();
        // return body;
        return abToString(body);
    }

    async json() {
        if (this._jsonData === undefined) {
            const body = await this.body();
            const str = abToString(body);
            if (str) {
                try {
                    this._jsonData = JSON.parse(str);
                } catch (e) {
                    Log.warn(
                        "Error when parsing req json. Message : {}",
                        e.message
                    );
                    this._jsonData = null;
                }
            }
        }

        return this._jsonData;
    }

    _params;

    param(paramName, defaultValue = undefined) {
        if (this._params === undefined) {
            this._params = qs.parse(this._query);
        }

        return this._params[paramName] ?? defaultValue;
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
    /**
     * @type {import("uWebSockets.js").HttpResponse}
     */
    _res;
    _req;

    _statusCode;
    _content;
    _headerUsed = false;
    _headers = {};
    _cookiesUsed = false;
    _cookies = {};

    constructor(res, req) {
        this._res = res;
        this._req = req;
    }

    static from(x) {
        const c = new Response(x._res, x._req);
        c._statusCode = x._statusCode;
        c._content = x._content;
        c._headerUsed = x._headerUsed;
        c._headers = x._headers;
        c._cookiesUsed = x._cookiesUsed;
        c._cookies = x._cookies;
        return c;
    }

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
        const r = Response.from(this)
        r._statusCode = statusCode;
        
        if (!r._headers["Content-Type"]) {
            r.contentType("plain/text");
        }
        return r;
    }

    /**
     *
     * @link https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Set-Cookie
     * @param {*} key
     * @param {*} value
     * @param {CookieOptions} options
     */
    cookie(key, value, options = {}) {
        let r = Response.from(this);
        r._cookiesUsed = true;
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

        r._cookies[key] = cookieValue.join(";") + ";";
        return r;
    }

    header(key, value) {
        var r = Response.from(this);
        r._headerUsed = true;
        r._headers[key] = value;
        return r;
    }
    contentEncoding(contentEncoding) {
        return this.header("content-encoding", contentEncoding);
    }

    contentType(contentType) {
        return this.header("Content-Type", contentType ?? "text/html");
    }

    json(content) {
        const res = this.contentType("text/json");
        res._content = JSON.stringify(content);
        return res;
    }

    text(content) {
        const res = this.contentType("text/html");
        res._content = "" + content;
        return res;
    }

    body(content) {
        return this.write(content);
    }

    write(content) {
        const r= Response.from(this)
        r._content = content;
        return r;
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

        return this.write(videoFile);

        //TODO FOR Async
        // https://github.com/uNetworking/uWebSockets.js/blob/master/examples/VideoStreamer.js
    }

    redirectTo(url) {
        // if (url.indexOf("/") == 0) {
        //     url = "http://"+this._req.getHeader("host") + url;

        // }

        return this.status("302")
            .contentType("text/html")
            .header("Location", url);
    }

    end() {
        //_res.aboterd is set in core in OnAborted by me
        !this._res.aborted &&
            this._res.cork(() => {
                const me = this;
                me._res.writeStatus("" + (this._statusCode ?? 200));

                if (me._headerUsed) {
                    Object.keys(this._headers).forEach((key) => {
                        const value = me._headers[key];
                        me._res.writeHeader(key, value);
                    });
                }

                if (me._cookiesUsed) {
                    Object.values(this._cookies).forEach((cookieString) => {
                        me._res.writeHeader("Set-Cookie", cookieString);
                    });
                }
                me._res.end(this._content);
            });
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
