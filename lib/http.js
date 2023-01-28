import { getParts } from "uWebSockets.js";
import { abToString, readBody, readBodyOther } from "./json.js";

export class Request {
    _req;
    _res;
    _path;
    _headers; //lazy
    _pathKeys;
    _pathValues;

    _formData;
    // _paramsPart = {};

    constructor(req, res, path, pathKeys, pathValues) {
        this._req = req;
        this._res = res;
        this._path = path;
        this._pathKeys = pathKeys;
        this._pathValues = pathValues;

        // if (paramsPart) {
        //     this._paramsPart = url.parse(req.url, true).query;
        // }
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
        return await new Promise((fulfill) => {
            readBody(
                this._res,
                (data) => {
                    fulfill(data);
                },
                () => {}
            );
        });
    }


    /**
     *  form object (key is fileName)
     *  {  
     *      file2: {
                data: ArrayBuffer {
                    [Uint8Contents]: <5a 65 73 6b 61 6e 6f 77 61 6e 79 20 64 6f 6b 75 6d 65 6e 74>,
                    byteLength: 20
                },
                name: 'file2',
                filename: 'upuszczony tekst.txt',
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
            const header = this._req.getHeader("content-type");
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
        const cookies = this._req.getHeader("cookie");

        const values = cookies
            .split(";")
            .filter((par) => par.indexOf(name + "=") >= 0)
            .map((par) => par.replace(name + "=", ""))
            .map((value) => {
                if (value.indexOf("{") > 0) {
                    return JSON.parse(value);
                }
                return value.trim();
            });

        return values[0];
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
        return this._req.getHeader(name);
    }

    async json() {
        const body = await this.body();
        // return body;
        return JSON.parse(body);
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
        return this._req.getHeader("host");
        // return req.headers.host;
    }

    /**
     * uppercased safe
     *
     * @param {string} method
     * @returns
     */
    is(method) {
        return this._req.getMethod() === method.toLowerCase();
    }
}

export class Response {
    _res;

    constructor(res) {
        this._res = res;
    }

    _statusCode;
    _contentType;
    _content;

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
        this._res.writeStatus("" + (this._statusCode ?? 200));
        return this;
    }

    header(key, value) {
        this._res.writeHeader(key, value);
        return this;
    }
    contentEncoding(contentEncoding) {
        this._contentEncoding = contentEncoding;
        // console.log(contentEncoding)
        this._res.writeHeader("content-encoding", contentEncoding);
        return this;
    }

    contentType(contentType) {
        this._contentType = contentType;
        this._res.writeHeader("Content-Type", this._contentType ?? "text/html");
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
        this._res.end(this._content);
    }
}
