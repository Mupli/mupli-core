import http from "http";

import { FileLoader, FileDetails } from "./file-loader.js";
import { Request, Response } from "./http.js";
import { App } from "uWebSockets.js";
import { MupliRouter } from "mupli-lib-resolver";
import { Ctx } from "./ctx.js";
import { MupliModule } from "./module.js";
import { Objects } from "./objects.js";
import { Config } from "./config.js";

import { Worker, isMainThread, threadId } from "worker_threads";
import * as os from "os";

class Mupli {
    apps;
    hostNamesToApp; // key: safe.com  value: safeModule
    db;
    dispatchers = {};
    _contextsBuilders = {};
    _services = [];
    _servicesCtx = {};
    _middlewares = {}; //undefined for performance
    _routeBuilders = {};
    _router = {};

    _registeredModuleExtensions = {};

    _modules = {};
    onErrorModules = [];

    // appName -> route -> function
    _routes = {};

    constructor(apps, db) {
        console.time("Mupli started");
        this.apps = apps;
        this.db = db;

        let tmp = {};
        Object.keys(apps).forEach((appName) => {
            apps[appName].hosts.forEach((h) => {
                tmp[h] = appName;
            });
        });

        this.hostNamesToApp = tmp;
    }

    /**
     * @param {Mupli} callback
     */
    static init() {
        const apps = FileLoader.config("apps");
        const db = FileLoader.config("db");

        return new Mupli(apps, db);
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
            const multiModules = modulesNames
                .map((moduleName) => {
                    return this._modules[moduleName];
                })
                .filter((x) => x);

            this.onErrorModules[appName] = [];
            multiModules
                .filter((x) => x.onError)
                .forEach((m) => {
                    this.onErrorModules[appName].push(m);
                });

            //init
            const initRes = multiModules
                .filter((module) => module.init)
                .map((module) => module.init(appName));

            await Promise.all(initRes);

            // ctx builder
            this._contextsBuilders[appName] = [];
            multiModules
                .filter((module) => module.context)
                .forEach((module) => {
                    this._contextsBuilders[appName].push(module);
                });

            // handle middlewares
            let tmpMiddlewares = [];
            multiModules
                .filter((module) => module.middlewares)
                .map((module) => module.middlewares(appName))
                .forEach((m) => {
                    if (Array.isArray(m)) {
                        m.forEach((el) => tmpMiddlewares.push(el));
                    }
                    tmpMiddlewares.push(m);
                });

            if (tmpMiddlewares.length == 1) {
                this._middlewares[appName] = tmpMiddlewares[0];
            } else if (tmpMiddlewares.length > 1) {
                this._middlewares[appName] = (ctx) => {
                    for (
                        let index = 0;
                        index < tmpMiddlewares.length;
                        index++
                    ) {
                        const result = tmpMiddlewares[index](ctx);
                        if (result) return result;
                    }
                };
            }

            // Routes
            this._router[appName] = new MupliRouter();
            this._routeBuilders[appName] = [];

            multiModules
                .filter((module) => module.routes)
                .forEach((module) => this._routeBuilders[appName].push(module));

            // Not existing ???????????
            this.dispatchers[appName] = [];
            multiModules
                .map((module) => module.dispatch)
                .forEach((module) => this.dispatchers[appName].push(module));

            //Services
            this._servicesCtx[appName] = { appName };
            const services = multiModules.filter((module) => module.services);

            for (const key in services) {
                const module = services[key];
                const data = await module.services(
                    appName,
                    this._servicesCtx[appName]
                );
                Object.assign(this._servicesCtx[appName], data);
            }

            //Register modules
            this._registeredModuleExtensions[appName] = {};
            multiModules
                .filter((module) => module.moduleExtensions)
                .map((module) => module.moduleExtensions(appName, this._servicesCtx[appName]))
                .forEach(async (handlers) => {

                    const moduleExtList =
                        this._registeredModuleExtensions[appName];
                    Object.keys(handlers).forEach((methodName) => {
                        if (methodName.indexOf("Ext") === -1) {
                            throw new Error("moduleExtentions needs to have declared Ext in method name : securityExt, cronExt")
                        }
                        moduleExtList[methodName] = handlers[methodName];
                    });
                });

            //Execute handlers for extensions
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

            //End
            console.timeEnd(timeLogLabel);
        }

        this._routes = this.buildRoutes();

        // Lit Routes
        const logRoutes = {};

        Object.keys(this._routes).forEach((key) => {
            const hosts = this.apps[key].hosts;
            const modules = this.apps[key].modules;
            logRoutes[key] = {
                hosts,
                modules,
                routes: this._routes[key],
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
                    new Worker("./app/app.js");
                });

            /* I guess main thread joins by default? */
        } else {
            /* Here we are inside a worker thread */

            App({})
                .any("/*", (res, req) => {
                    try {
                        res.onAborted(() => {
                            //
                            console.log("on aboard!??");
                        });
                        me._dispatch(req, res);
                        // me.test(res)
                        // res.write("OK");
                        // res.end();
                    } catch (e) {
                        console.error("core error " + e);
                        console.error(e);
                    }
                })
                .listen(parseInt(port), (listenSocket) => {
                    if (listenSocket) {
                        const time = console.timeEnd("Mupli started");
                        console.log(
                            "Listening to port :" +
                                port +
                                " cpus:" +
                                os.cpus().length
                        );
                    } else {
                        console.log("error");
                    }
                });
        }
    }

    async test(res) {
        res.end("Ok");
        return true;
    }

    /**
     *
     * @param {Response} _res
     * @param {*} data
     * @returns
     */
    _handleResults(data, _res) {
        if (data._res) {
            data.end();
        } else if (typeof data === "object") {
            _res.status(200).json(data).end();
        } else {
            _res.status(200).write(data).end();
            // _res.status(200).write("Ok").end();
        }
        return true;
    }

    _dispatch(nodeReq, nodeRes) {
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

        const _req = new Request(
            nodeReq,
            nodeRes,
            route,
            routeValues.params,
            routeValues.values
            //  routeParam[1]
        );
        const _res = new Response(nodeRes);

        let ctx = { appName: appName, routes: routes, req: _req, res: _res };
        // ctx builder ------------------------------------

        Object.assign(ctx, this._servicesCtx[appName]);

        this._contextsBuilders[appName].forEach((m) => {
            const c = m.context(appName, ctx);
            // console.log(c)
            // Object.assign(ctx, this._contextsLoaded[appName])
            // const c = this._contextsLoaded[appName];
            // Object.assign(ctx, c)

            for (const key in c) {
                ctx[key] = c[key];
            }
        });

        try {
            const action = routes[routeValues.pathDef];

            if (!action) {
                throw new MupliNoActionException("NoAction");
            }

            const middlewears = this._middlewares[appName];

            let results;
            if (middlewears) results = middlewears(ctx);
            if (!results) results = action(ctx);

            return this._handleResAsync(results, _res).catch((e) => {
                console.error(e);
                ctx.res.status(404).write("500");
            });
        } catch (e) {
            const errorHandlers = this.onErrorModules[appName];
            this._executeHandlers(e, errorHandlers, appName, ctx)
                .then((result) => {
                    if (!result) {
                        const action = this._routes[appName]["/404"];
                        if (action) {
                            const results = action(ctx);
                            return this._handleResAsync(results, _res);
                        } else {
                            console.error(e);
                            console.error(
                                "No Error Handler or no file handler for app: " +
                                    appName +
                                    " " +
                                    route
                            );
                            return this._handleResAsync(
                                ctx.res.status(404).write("404"),
                                _res
                            );
                        }
                    }
                    return;
                })
                .catch((e) => {
                    console.log(e);
                    nodeRes.end();
                });
        }
    }

    async _executeHandlers(e, errorHandlers, appName, ctx) {
        for (const errorHandler of errorHandlers) {
            const data = await errorHandler.onError(appName, e, ctx);

            if (data) {
                return this._handleResAsync(data, ctx.res);
            }
        }
        return null;
    }

    /**
     *
     * @param {*} results
     * @param {*} _res
     * @returns  {Promise}
     */
    async _handleResAsync(results, _res) {
        if (results.then) {
            return results.then((dr) => {
                return this._handleResults(dr, _res);
            });
        } else {
            return this._handleResults(results, _res);
        }
    }

    buildRoutes() {
        const resultRoutes = {};

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

                        if (Array.isArray(action)) {
                            const actionArray = Array.from(action);
                            const actionFn = async (ctx) => {
                                for (
                                    let index = 0;
                                    index < actionArray.length;
                                    index++
                                ) {
                                    let actionResults = actionArray[index](ctx);
                                    if (actionResults && actionResults.then) {
                                        actionResults = await actionResults;
                                    }
                                    if (actionResults) {
                                        return actionResults;
                                    }
                                }
                            };
                            resultRoutes[appName][preparedRoute.pathDef] =
                                actionFn;
                        } else {
                            resultRoutes[appName][preparedRoute.pathDef] =
                                action;
                        }
                    }
                });
        }

        return resultRoutes;
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
};
