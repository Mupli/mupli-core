import { MupliRouter } from "mupli-lib-resolver";
import * as os from "os";
import path from "path";
import { App } from "uWebSockets.js";
import { isMainThread, threadId, Worker } from "worker_threads";
import { Config } from "./config.js";
import { CoreUtils } from "./coreUtils.js";
import { Ctx } from "./ctx.js";
import { FileDetails, FileLoader } from "./file-loader.js";
import {
    Request,
    Response,
    WSRequest,
    WSResponse,
    WSService,
    CorsOptions,
    CookieOptions,
} from "./http.js";
import { abToString } from "./json.js";
import { Log } from "./log.js";
import { MupliModule } from "./module.js";
import { Objects } from "./objects.js";

class Mupli {
    apps;
    hostNamesToApp; // key: safe.com  value: safeModule

    dispatchers = {};
    _contextsBuilders = {};
    _services = [];
    _servicesCtx = {};
    _middlewares = {}; //undefined for performance
    _wsMiddlewares = {}; //undefined for performance
    _routeBuilders = {};
    _router = {};
    _wsRoutes = {};

    _registeredModuleExtensions = {};

    _modules = {};
    onErrorModules = [];

    // appName -> route -> function
    _routes = {};

    constructor(apps) {
        console.time("Mupli started");

        const searchTags = process.argv
            .filter((val) => val.indexOf("tags=") >= 0)
            .map((v) => v.replace("tags=", "").trim())
            .flatMap((x) => x.split(","))
            .map((x) => x.trim())
            .filter((x) => x.length > 0);

        if (searchTags.length > 0) {
            console.log("tags[]=" + searchTags.join(","));

            // remove apps that are not in tags
            Object.keys(apps).forEach((appKey) => {
                const appM = apps[appKey];

                if (
                    !appM.tags ||
                    !searchTags.some(
                        (moduleTag) => appM.tags.indexOf(moduleTag) >= 0
                    )
                ) {
                    delete apps[appKey];
                }
            });
        }

        this.apps = apps;

        let tmp = {};
        Object.keys(apps).forEach((appName) => {
            apps[appName].hosts.forEach((h) => {
                tmp[h] = appName;
            });
        });

        this.hostNamesToApp = tmp;

        const configLogger =
            process.env.ENV === "prod"
                ? { levels: ["ERROR"] }
                : { levels: ["INFO", "WARN", "ERROR"] };

        Log.init(configLogger);
    }

    /**
     * @param {Mupli} callback
     */
    static init() {
        let apps = FileLoader.config("apps");
        return new Mupli(apps);
    }

    /**
     *
     * @param {Array} modules
     * @returns {Mupli}
     */
    modules(modules) {
        modules.forEach((m) => {
            this.module(m);
        });
        return this;
    }

    /**
     *
     * @param {*} module
     * @returns {Mupli}
     */
    module(module) {
        if (!module) {
            throw new Error("Module undefined");
        }
        this._modules[module.moduleName] = module;
        return this;
    }

    async listen(port) {
        const me = this;
        this._routes = {};

        for (const appName in this.apps) {
            const timeLogLabel = "app init - " + appName + "";
            console.time(timeLogLabel);

            const modulesNames = this.apps[appName].modules;
            let arch = this.apps[appName].arch;

            const rootPath = "./app/" + appName;
            await this._loadModules(appName, rootPath, arch, modulesNames);

            //End
            console.timeEnd(timeLogLabel);
        }

        this._routes = this.buildRoutes();

        // Lit Routes
        const logRoutes = {};

        Object.keys(this.apps).forEach((key) => {
            const hosts = this.apps[key].hosts;
            const modules = this.apps[key].modules;
            logRoutes[key] = {
                hosts,
                modules,
                routes: this._routes[key],
                ws: this._wsRoutes[key],
            };
        });
        console.log(logRoutes);

        // http.createServer(function (req, res) {
        //     me._dispatch(req, res);
        // }).listen(port);

        if (process.env.ENV === "prod" && isMainThread) {
            /* Main thread loops over all CPUs */
            /* In this case we only spawn two (hardcoded) */
            os.cpus()
                // [0, 1]
                .forEach(() => {
                    /* Spawn a new thread running this source file */
                    new Worker("./app/app.js", { argv: process.argv });
                });

            /* I guess main thread joins by default? */
        } else {
            /* Here we are inside a worker thread */

            const app = App({});

            this._initWs(app);

            app.any("/*", async (res, req) => {
                try {
                    res.onAborted(() => {
                        Log.error("on aboard error");
                    });
                    // res.cork(() => {
                    await me._dispatch(req, res).catch((e) => {
                        Log.error(
                            "Core request _dispatch unexpected error " + e
                        );
                        Log.error(e);
                    });
                    // });
                    // me.test(res)
                    // res.write("OK");
                    // res.end();
                } catch (e) {
                    console.error("core error " + e);
                    console.error(e);
                }
            }).listen(parseInt(port), (listenSocket) => {
                if (listenSocket) {
                    const time = console.timeEnd("Mupli started");
                    console.log(
                        "Listening to port :" +
                            port +
                            " cpus:" +
                            os.cpus().length +
                            " threadId: " +
                            threadId
                    );
                } else {
                    Log.error("Error on listen completion");
                }
            });
        }
    }

    async _loadModules(appName, rootPath, arch, modulesNames) {
        const multiModules = this._findModules(modulesNames);

        // modules inheritance
        await this._handleInheritedModules(multiModules, appName);

        let config = {
            appName: appName,
            appPath: rootPath,
            localModules: this._getLocalModules(arch, appName),
        };

        //init + execute
        await this._executeInit(multiModules, config);
        await this._executeCreateServices(multiModules, appName);

        this._registerModuleExtentions(appName, multiModules);
        this._executeModuleExtentions(appName, multiModules);

        // PREPARE -----------
        this._prepareContexts(multiModules, appName);
        this._prepareMiddlewares(multiModules, config);
        this._prepareWsMiddlewares(multiModules, config);
        // Routes
        this._prepareRoutes(appName, multiModules);
        //WebSockets
        this._prepareWSRoutesAndMiddlewares(appName, multiModules);

        this._prepareErrorHandlers(appName, multiModules);
    }

    _getLocalModules(arch, appName) {
        let localModules = [];
        if (arch == "modular") {
            localModules = CoreUtils.getLocalModuleNames(appName);
        }
        return localModules;
    }

    async _handleInheritedModules(multiModules, appName) {
        const c = multiModules
            .filter((module) => module.modules)
            .map(async (m) => {
                console.log(m);
                await this._loadModules(appName, m.appPath, m.arch, m.modules);
                return "";
            });

        if (c.length > 0) {
            await Promise.allSettled(c);
        }
    }

    _findModules(modulesNames) {
        return modulesNames
            .filter((m) => m.indexOf("#") == -1)
            .map((moduleName) => {
                const m = this._modules[moduleName];
                if (m == undefined)
                    throw new MupliError(
                        "Missing module with name :" + moduleName
                    );
                return m;
            });
    }

    _prepareErrorHandlers(appName, multiModules) {
        this.onErrorModules[appName] = {};
        multiModules
            .filter((x) => x.onError)
            .map((x) => x.onError(appName))
            .forEach((m) => {
                const exceptionTypes = Object.keys(m);
                for (const exType of exceptionTypes) {
                    if (!this.onErrorModules[appName][exType]) {
                        this.onErrorModules[appName][exType] = [];
                    }
                    this.onErrorModules[appName][exType].push(m[exType]);
                }
            });
    }

    _executeModuleExtentions(appName, multiModules) {
        const handlerList = this._registeredModuleExtensions[appName];
        const handlerListKeys = Object.keys(handlerList);
        multiModules.forEach((module) => {
            handlerListKeys
                .filter((methodName) => {
                    return module[methodName] !== undefined;
                })
                .forEach((methodName) => {
                    let results = module[methodName](
                        this._servicesCtx[appName]
                    );

                    // results = Objects.resolvePromise(results)
                    Objects.resolvePromise(handlerList[methodName](results));
                });
        });
    }

    _registerModuleExtentions(appName, multiModules) {
        this._registeredModuleExtensions[appName] = {};
        multiModules
            .filter((module) => module.moduleExtensions)
            .map((module) =>
                module.moduleExtensions(appName, this._servicesCtx[appName])
            )
            .forEach(async (handlers) => {
                const moduleExtList = this._registeredModuleExtensions[appName];
                Object.keys(handlers).forEach((methodName) => {
                    if (methodName.indexOf("Ext") === -1) {
                        throw new Error(
                            "moduleExtentions needs to have declared Ext in method name : securityExt, cronExt"
                        );
                    }
                    moduleExtList[methodName] = handlers[methodName];
                });
            });
    }

    _prepareRoutes(appName, multiModules) {
        this._router[appName] = new MupliRouter();
        this._routeBuilders[appName] = [];

        multiModules
            .filter((module) => module.routes)
            .forEach((module) => this._routeBuilders[appName].push(module));
    }

    _prepareWSRoutesAndMiddlewares(appName, multiModules) {
        this._wsRoutes[appName] = {};
        multiModules
            .filter((module) => module.ws)
            .forEach((m) => {
                const wsRoutes = m.ws(appName);

                if (wsRoutes["upgrade"]) {
                    this._wsMiddlewares[appName].push(
                        CoreUtils.createActionFromArray(wsRoutes["upgrade"])
                    );
                }

                let routesWithFn = {};
                Object.keys(wsRoutes)
                    .filter((k) => k.indexOf("upgrade") < 0)
                    .forEach((k) => {
                        routesWithFn[k] = CoreUtils.createActionFromArray(
                            wsRoutes[k]
                        );
                    });

                this._wsRoutes[appName][m.moduleName] = routesWithFn;
            });

        this._wsMiddlewares[appName] = CoreUtils.createActionFromArray(
            this._wsMiddlewares[appName]
        );
    }

    async _executeCreateServices(multiModules, appName) {
        this._servicesCtx[appName] = {
            appName,
            log: Log,
        };
        const services = multiModules.filter((module) => module.services);

        for (const key in services) {
            const module = services[key];
            const data = await module.services(
                appName,
                this._servicesCtx[appName]
            );
            Object.assign(this._servicesCtx[appName], data);
        }
    }

    _prepareWsMiddlewares(multiModules, config) {
        this._wsMiddlewares[config.appName] = CoreUtils.getFromModules(
            multiModules.filter((m) => m.wsMiddlewares),
            (m) => m.wsMiddlewares(config.appName)
        );
    }

    _prepareMiddlewares(multiModules, config) {
        this._middlewares[config.appName] = CoreUtils.createActionFromArray(
            CoreUtils.getFromModules(
                multiModules.filter((m) => m.middlewares),
                (m) => m.middlewares(config.appName, config)
            )
        );
    }

    _prepareContexts(multiModules, appName) {
        const tmp = [];
        multiModules
            .filter((module) => module.context)
            .forEach((module) => {
                tmp.push(module);
            });

        this._contextsBuilders[appName] = tmp ?? [];
    }

    async _executeInit(multiModules, configDef) {
        const config = Objects.structuredClone(configDef);

        const initRes = multiModules
            .filter((module) => module.init)
            .map((module) => {
                config.moduleName = module.moduleName;
                return module.init(config.appName, config);
            });

        await Promise.all(initRes);
    }

    /**
     *
     * @param {TemplatedApp} app
     */
    _initWs(app) {
        const me = this;
        if (Object.keys(this._wsRoutes).length > 0) {
            Object.keys(this._wsRoutes).forEach((appName) => {
                // Object.keys(this._wsRoutes[appName]).forEach((key) => {
                const modulesWsRoutes = this._wsRoutes[appName];

                const servicesCtx = this._servicesCtx[appName];

                Object.keys(modulesWsRoutes).forEach((moduleName) => {
                    /**@type {WebSocketBehavior} */
                    const handler = {};
                    const path = "/" + moduleName;

                    if (this._wsMiddlewares[appName]) {
                        handler.upgrade = this._updgradeAction(appName, path);
                    }

                    const eventsAndActions = modulesWsRoutes[moduleName];
                    if (eventsAndActions.open) {
                        const openAction = CoreUtils.createActionFromArray(
                            eventsAndActions.open
                        );
                        handler.open = (ws) => {
                            const ctx = ws.ctx;
                            openAction({
                                appName,
                                ...servicesCtx,
                                ws: new WSService(ws, appName),
                                ...ctx,
                            });
                        };
                    }

                    handler.message = async function (ws, message, isBinary) {
                        try {
                            const eventsAndActions =
                                modulesWsRoutes[moduleName];

                            message = abToString(message);
                            message = JSON.parse(message);

                            let wRes = new WSResponse(ws, appName);
                            let ctx = {
                                appName,
                                ...servicesCtx,
                                ws: new WSService(ws, appName),
                                wsReq: new WSRequest(message.data),
                                wsRes: wRes,
                                ...ws.ctx,
                            };

                            let results = null;
                            if (!results && eventsAndActions[message.type]) {
                                results = eventsAndActions[message.type](ctx);
                            }

                            if (results) {
                                results = await Objects.resolvePromise(results);

                                if (results && !results._ws) {
                                    await ws.send(JSON.stringify(results));
                                } else {
                                    // results.end()
                                }
                            }
                        } catch (e) {
                            me._handleException(e);
                        }
                    };

                    const wsPath = "/" + appName + path;
                    app.ws(wsPath, handler);
                });
            });
        }
    }
    _updgradeAction(appName, path) {
        const me = this;
        let middlewareOrAction = this._wsMiddlewares[appName];

        return async (_res, _req, context) => {
            try {
                _res.onAborted(() => {
                    console.log("WS on aboard!??");
                });

                const res = new Response(_res);

                let ctx = {
                    appName,
                    // ...this._servicesCtx[appName],
                    req: new Request(_req, _res, path),
                    res: res,
                };

                ctx = Object.assign(ctx, this._servicesCtx[appName]);

                let tmpResultCtx = {};
                this._updateCtx(tmpResultCtx, ctx, appName);
                ctx = Object.assign(ctx, tmpResultCtx);

                let results = null;
                if (middlewareOrAction) results = middlewareOrAction(ctx);
                results = await Objects.resolvePromise(results);

                if (
                    !results ||
                    (results._statusCode && results._statusCode == 200)
                ) {
                    return CoreUtils.acceptWs(
                        _res,
                        _req,
                        context,
                        tmpResultCtx
                    );
                } else {
                    ctx.res.end();
                }
            } catch (e) {
                me._handleException(e);
                new Response(_res).status(500);
            }
        };
    }

    _handleException(e) {
        console.error("core error ", e);
        console.error(e);
    }

    /**
     *
     * @param {*} data
     * @param {Response} res
     * @param {string} path
     * @returns {boolean}
     */
    async _handleResAsync(data, res, path) {
        const results = await Objects.resolvePromise(data);

        if (results == undefined)
            throw new MupliWrongResponseException(
                "No response in method " + path
            );

        return await this._handleResults(results, res);
    }

    /**
     *
     * @param {Response} response
     * @param {*} data
     * @returns {boolean} returns true if handled
     */
    _handleResults(data, response) {
        if (data._res) {
            data.end();
            return true;
        } else if (typeof data === "object") {
            response.json(data).end();
            return true;
        } else {
            response.write(data).end();
            return true;
            // _res.status(200).write("Ok").end();
        }
        return false;
    }

    async _dispatch(nodeReq, nodeRes) {
        const h = nodeReq.getHeader("host");
        const hindex = h.indexOf(":");
        const host = hindex > 0 ? h.slice(0, hindex) : h;

        const appName = this.hostNamesToApp[host];

        if (!appName) {
            console.error("App name not found for host: " + host);
            return;
        }
        const url = nodeReq.getUrl() || "";
        const uindex = url.indexOf("?");
        const route = uindex > 0 ? url.slice(0, uindex) : url;

        const routes = this._routes[appName];
        const routeValues = this._router[appName].getRoute(route) || {};

        const req = new Request(
            nodeReq,
            nodeRes,
            route,
            routeValues.params,
            routeValues.values
            //  routeParam[1]
        );
        const res = new Response(nodeRes);

        let tmp = {
            appName: appName,
            routes: routes,
            req: req,
            res: res,
            servicesCtx: this._servicesCtx[appName],
            contextsBuilders: this._contextsBuilders[appName],
            contextsBuildersIndex: 0,
            contextsBuildersLength: this._contextsBuilders[appName].length,
            ctx: {},
        };
        // ctx builder ------------------------------------

        let ctx = new Proxy(tmp, this._handler);

        // console.log(ctx.appName)

        // this._updateCtx(ctx, ctx, appName);

        try {
            const action = routes[routeValues.pathDef];

            if (!action) {
                throw new MupliNoActionException("NoAction");
            }

            const middlewares = this._middlewares[appName];

            let results;
            if (middlewares) results = await middlewares(ctx);
            if (!results) results = action(ctx);

            return await this._handleResAsync(results, res, route);
        } catch (e) {
            if (this.onErrorModules[appName] && e.constructor) {
                const errorsHandlers =
                    this.onErrorModules[appName][e.constructor.name];

                if (errorsHandlers) {
                    for (
                        let index = 0;
                        index < errorsHandlers.length;
                        index++
                    ) {
                        const onError = errorsHandlers[index];

                        if (onError) {
                            const httpResponse = await onError(e, ctx);

                            if (httpResponse) {
                                const handleStatusBool =
                                    await this._handleResAsync(
                                        httpResponse,
                                        ctx.res,
                                        "onError"
                                    );

                                if (handleStatusBool)
                                    /// handled
                                    return true;
                            }
                        }
                    }

                    if (errorsHandlers.length > 0) {
                        const action = this._routes[appName]["/404"];
                        if (action) {
                            const results = action(ctx);
                            res.notFound();
                            return this._handleResAsync(results, res, "/404");
                        } else {
                            Log.warn(e);
                            Log.warn(
                                "No Error Handlers or no file handler for app: " +
                                    appName +
                                    " " +
                                    route
                            );

                            ctx.res
                                .status(404) //
                                .write("404")
                                .end();
                            return;
                        }
                    }
                }
            }

            Log.error("Critical error: {}", e.message);
            Log.error(e);
            ctx.res.status(500).json(e).end();
        }
    }

    _handler = {
        get(target, propKey, receiver) {
            if (target[propKey]) return target[propKey];
            if (target.servicesCtx[propKey]) return target.servicesCtx[propKey];
            if (target.ctx[propKey]) return target.ctx[propKey];

            for (
                ;
                target.contextsBuildersIndex < target.contextsBuildersLength;
                target.contextsBuildersIndex++
            ) {
                const c = target.contextsBuilders[
                    target.contextsBuildersIndex
                ].context(target.appName, receiver);
                for (const key in c) {
                    target.ctx[key] = c[key];
                }
                if (c[propKey]) return c[propKey];
            }

            return undefined;
        },
    };

    _updateCtx(ctxResult, ctx, appName) {
        this._contextsBuilders[appName].forEach((m) => {
            const c = m.context(appName, ctx);
            for (const key in c) {
                ctxResult[key] = c[key];
            }
        });
        return ctxResult;
    }

    async _executeHandlers(e, errorHandlers, appName, ctx) {
        for (const errorHandler of errorHandlers) {
        }
        return null;
    }

    buildRoutes() {
        let resultRoutes = {};

        // copy routes
        for (const appName in this.apps) {
            resultRoutes[appName] = {};

            this._routeBuilders[appName]
                .map((module) => {
                    return module.routes(appName);
                })
                .forEach((route) => {
                    for (const path in route) {
                        const action = route[path];
                        const preparedRoute =
                            this._router[appName].addRoute(path);

                        resultRoutes[appName][preparedRoute.pathDef] =
                            CoreUtils.pipe(action);
                    }
                });
            resultRoutes[appName] = Objects.sortKeys(resultRoutes[appName]);
        }

        return resultRoutes;
    }
}

class MupliError extends Error {
    constructor(m) {
        super(m);
    }
}

class MupliWrongResponseException extends Error {
    constructor(m) {
        super(m);
    }
}

function MupliNoActionException(message) {
    this.message = message;
    this.prototype = Error;

    // Use V8's native method if available, otherwise fallback
    if ("captureStackTrace" in Error)
        Error.captureStackTrace(this, MupliNoActionException);
    else this.stack = new Error().stack;
}

export {
    Config,
    Mupli,
    FileLoader,
    FileDetails,
    Request,
    Response,
    MupliNoActionException,
    Ctx,
    MupliModule,
    Objects,
    CoreUtils,
    Log,
    CorsOptions,
    CookieOptions,
};
