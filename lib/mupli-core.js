// import process from "node:process";
import { MupliRouter } from "./router.js";
import { apiModule } from "mupli-api";
import * as os from "os";
import { v4 as uuidv4 } from "uuid";
import { App } from "uWebSockets.js";
import { isMainThread, threadId, Worker } from "worker_threads";
import { AppConfig, Config } from "./config.js";
import { CoreUtils } from "./coreUtils.js";
import { BootConfig, Ctx } from "./ctx.js";
import { FileDetails, FileLoader } from "./file-loader.js";
import {
    CookieOptions,
    CorsOptions,
    Request,
    Response,
    WSRequest,
    WSResponse,
    WSService,
} from "./http.js";
import { abToString } from "./json.js";
import { Log } from "./log.js";
import { NamespaceContext as NamespaceContext, MupliModule, NamespaceDataHolder } from "./module.js";
import { Objects } from "./objects.js";

class Mupli {
    build;
    apps;
    hostNamesToApp; // key: safe.com  value: safeModule
    appPath; // default ./app

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
    _appConfigs = {};

    constructor(apps, appPath) {
        this.appPath = appPath;

        console.time("Mupli started");

        const argvMap = this._parseMap(process.argv);
        this.build = argvMap["build"];

        if (!this.build) {
            this.build = uuidv4();
            process.argv.push("build=" + this.build);
        }

        const searchTags = (argvMap["tags"] ?? "")
            .split(",")
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

        const loggerConfig =
            process.env.ENV === "prod"
                ? { levels: ["ERROR"] }
                : { levels: ["INFO", "WARN", "ERROR"] };

        Log.init(loggerConfig);
    }

    _parseMap(argv) {
        const map = {};
        argv.filter((v) => v.indexOf("=") > 0).forEach((v) => {
            const vk = v.split("=");
            map[vk[0].trim()] = vk[1].trim();
        });
        return map;
    }
    /**
     * @param {string} appPath
     * @param {BootConfig} bootConfig
     * @returns {Mupli}
     */
    static init(appPath = "./app") {
        let apps = Config.get({}, "apps");
        return new Mupli(apps, appPath) //
            .loadDefaultModules();
    }

    /**
     *
     * @returns {Mupli}
     */
    loadDefaultModules() {
        return this.modules([apiModule]);
    }

    /**
     *
     * @param {Array} modules
     * @returns {Mupli}
     */
    modules(modules) {
        if (!Array.isArray(modules)) {
            throw new Error("Is not an array");
        }

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
            const timeLogLabel = "app init - " + appName;
            console.time(timeLogLabel);

            const modulesNames = this.apps[appName].modules;
            let arch = this.apps[appName].arch;

            const rootPath = this.appPath + "/" + appName;
            await this._loadModules(appName, rootPath, arch, modulesNames);

            //End
            console.timeEnd(timeLogLabel);
        }

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

        process.on("unhandledRejection", (err) => {
            Log.error(err);
        });

        if (process.env.ENV === "prod" && isMainThread) {
            /* Main thread loops over all CPUs */
            os.cpus()
                /* In this case we only spawn two (hardcoded) */
                // [0, 1]
                .forEach(() => {
                    /* Spawn a new thread running this source file */
                    new Worker(this.appPath + "/app.js", {
                        argv: process.argv,
                    });
                });

            /* I guess main thread joins by default? */
        } else {
            /* Here we are inside a worker thread */

            console.log(
                "app start build: " + this.build + " thread:" + threadId
            );

            const app = App({});
            this.app = app;
            this._initWs(app);
            app.any("/*", async (res, req) => {
                try {
                    res.onAborted(() => {
                        res.aborted = true;
                        Log.error("On abort error.");
                    });
                    await me._dispatch(req, res).catch((e) => {
                        Log.error(
                            "Core request _dispatch unexpected error " + e
                        );
                        Log.error(e);
                    });

                    // me.test(res)
                    // res.cork(() => {
                    // res.write("OK");
                    // res.end();
                    // });
                } catch (e) {
                    Log.error("Core error: {}", e);
                    Log.error(e);
                }
            }).listen("0.0.0.0", parseInt(port), (listenSocket) => {
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

            function gracefulClose(signal) {
                Log.warn("Gracefull App close!!!");

                app.close();
                // process.kill();
                process.exit(0);
            }

            process.stdin.resume();

            process.on("SIGINT", gracefulClose);
            process.on("SIGTERM", gracefulClose);
        }
    }

    /**
     *
     * @param {BootConfig} bootDefaultConfig
     */
    async _buildRoutes(bootDefaultConfig) {
        const appName = bootDefaultConfig.appName;

        this._router[appName] = new MupliRouter();
        const router = this._router[appName];

        let resultRoutes = this._routes;

        // copy routes
        resultRoutes[appName] = {};

        // get routes
        var moduleAndConfig = this._routeBuilders[appName];

        const routesResults = [];


        const reversedOrder = moduleAndConfig.slice().reverse();
        for (const ma of reversedOrder) {
            const { module, config } = ma;
            /**@type {NamespaceDataHolder} */
            const nsDataHolder = this._namespaceDataHolder[config.appName];
            const nsData = nsDataHolder.getDataFor(module, config)
            ma.nsData = nsData;
        }

        const normalOrder = moduleAndConfig;
        for (const ma of normalOrder) {
            const { module, config, nsData } = ma;

            const routesData = await module.routes(config, this._servicesCtx[appName], nsData);
            routesResults.push(routesData);
        }

        routesResults.forEach((route) => {
            for (const path in route) {
                const action = route[path];

                // register path in router (just for quick resolve later)
                const preparedRoute = router.addRoute(path);

                resultRoutes[appName][preparedRoute.pathDef] =
                    CoreUtils.pipe(action);
            }
        });
        resultRoutes[appName] = Objects.sortKeys(resultRoutes[appName]);
    }

    async _loadModules(appName, rootPath, arch, modulesNames) {

        this._namespaceDataHolder[appName] = new NamespaceDataHolder();

        /**
         * @type {BootConfig}
         */
        let bootConfig = {
            appName: appName,
            build: this.build,
            appPath: rootPath,
            //modular directiors example : product, groups,
            localModules: this._getLocalModules(arch, rootPath),
        };

        // root modules (added from apps)
        const rootModuleList = this._findModules(modulesNames);

        this._appConfigs[appName] = new AppConfig(appName, bootConfig);

        // modules inheritance
        const moduleAndConfigSubModulesList = this._flattenSubModulesWithmodules(
            {},
            rootModuleList,
            bootConfig
        );

        // const mSubIDs = moduleAndConfigSubModulesList
        //     .map((mC) => mC.config)
        //     .map((c) => CoreUtils.getModuleConfigId(c));

        // let moduleAndConfigAppList = rootModuleList
        //     .map((module) => {
        //         const config = Objects.structuredClone(bootConfig);
        //         config.moduleName = module.moduleName;
        //         return {
        //             module: module,
        //             config: config,
        //         };
        //     })
        //     .filter((mC) => {
        //         const id = CoreUtils.getModuleConfigId(mC.config);
        //         return !mSubIDs.includes(id);
        //     });

        // const allModuleAndConfigList = [
        //     ...moduleAndConfigSubModulesList,
        //     ...moduleAndConfigAppList,
        // ];
        const allModuleAndConfigList = Object.values(
            moduleAndConfigSubModulesList
        );

        //init + execute
        await this._executeInit(allModuleAndConfigList);
        await this._executeCreateServices(allModuleAndConfigList, appName);

        this._registerModuleExtentions(appName, rootModuleList);
        this._executeModuleExtentions(appName, rootModuleList);

        //not used ???
        await this._onservices({ appName }, rootModuleList);

        // PREPARE -----------
        this._prepareContexts(rootModuleList, appName);
        this._prepareMiddlewares(allModuleAndConfigList, appName);
        this._prepareWsMiddlewares(allModuleAndConfigList, appName);
        // Routes
        this._prepareRoutes(appName, allModuleAndConfigList);

        //WebSockets
        this._prepareWSRoutesAndMiddlewares(appName, allModuleAndConfigList);

        this._prepareErrorHandlers(appName, allModuleAndConfigList);

        await this._buildRoutes(bootConfig);
    }

    _getLocalModules(arch, appPath) {
        let localModules = [];
        if (arch == "modular") {
            localModules = CoreUtils.getLocalModuleNames(appPath);
        }
        return localModules;
    }

    _flattenSubModulesWithmodules(results, moduleList, parentConfig) {
        const me = this;

        const { appName } = parentConfig;

        const hasSubModules = function (mAndConfig) {
            return mAndConfig.module.modules;
        };

        const modAndConf = moduleList
            .flatMap((module) => {
                const paths =
                    module.appPath !== parentConfig.appPath
                        ? [module, parentConfig]
                        : [module];

                return paths
                    .filter((m) => !!m.appPath)
                    .map((configOrModule) => {
                        const config = {
                            appName,
                            build: me.build,
                            /**
                             * rootModue->[page] should load pages only in X.appPath or in its own.
                             */
                            appPath: configOrModule.appPath,
                            namespace: module.namespace ?? parentConfig.namespace,

                            moduleName: module.moduleName,

                            parentModuleName: parentConfig.moduleName,

                            arch: configOrModule.arch,
                            //arch domain modules
                            localModules:
                                configOrModule.localModules ??
                                me._getLocalModules(
                                    module.arch,
                                    configOrModule.appPath
                                ),
                        };

                        return {
                            module, config,
                            loadSubs: module.appPath == parentConfig.appPath
                                || config.appPath != parentConfig.appPath
                        };
                    });
            })
            .filter((m) => !results[CoreUtils.getModuleConfigId(m.config)]);

        // check if has module
        // add oly sub modules
        modAndConf
            .filter(hasSubModules) //
            .filter(mac => mac.loadSubs)
            .forEach((maAndConfig) => {
                const { module, config } = maAndConfig;
                const moduleModules = this._findModules(module.modules);

                const sub = this._flattenSubModulesWithmodules(
                    results,
                    moduleModules,
                    config
                );

                for (const id in sub) {
                    if (Objects.isEmpty(results[id])) {
                        const subModule = sub[id];
                        results[id] = subModule;
                    }
                }
            });

        //Add root
        modAndConf.forEach((moduleAndConfig) => {
            const id = CoreUtils.getModuleConfigId(moduleAndConfig.config);
            if (Objects.isEmpty(results[id])) {
                results[id] = moduleAndConfig;
            }
        });

        return results;

        // if (c.length > 0) {
        //     await Promise.allSettled(c);
        // }
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
            .slice().reverse()
            .filter((m) => m.module.onError)
            .map((m) => m.module.onError(appName, this._namespaceDataHolder[appName].getDataFor(m.module, m.config)))
            .filter((module) => module)
            .forEach((module) => {
                const exceptionTypes = Object.keys(module);
                for (const exType of exceptionTypes) {
                    if (!this.onErrorModules[appName][exType]) {
                        this.onErrorModules[appName][exType] = [];
                    }
                    this.onErrorModules[appName][exType].push(module[exType]);
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

    _prepareRoutes(appName, moduleAndConfigList) {
        this._routeBuilders[appName] = []; // routes for processing

        moduleAndConfigList
            .filter((moduleAndConfig) => moduleAndConfig.module.routes)
            //add modules
            .forEach((moduleAndConfig) =>
                this._routeBuilders[appName].push(moduleAndConfig)
            );
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
            build: this.build,
            log: Log,
            config: this._appConfigs[appName],
        };

        for (const def of multiModules) {
            if (def.module.services) {
                const data = await def.module.services(
                    def.config,
                    this._servicesCtx[appName]
                );
                Object.assign(this._servicesCtx[appName], data);
            }
        }
    }

    async _onservices({ appName }, multiModules) {
        const services = multiModules.filter((module) => module.onServices);

        for (const key in services) {
            const module = services[key];
            const data = await module.onServices(
                appName,
                this._servicesCtx[appName]
            );

            Object.assign(this._servicesCtx[appName], data);
        }
    }

    _prepareWsMiddlewares(multiModules, appName) {
        this._wsMiddlewares[appName] = CoreUtils.getFromModules(
            _removeDuplicates(
                multiModules.filter((m) => m.module.wsMiddlewares)
            ),
            (m) => m.module.wsMiddlewares(m.config.appName, m.config)
        );
    }

    _prepareMiddlewares(multiModules, appName) {
        const filteredModules = multiModules.filter(
            (m) => m.module.middlewares
        );

        //removeDuplicates in case all modules has "security" module
        const resultModules = _removeDuplicates(filteredModules);

        this._middlewares[appName] = CoreUtils.createActionFromArray(
            CoreUtils.getFromModules(resultModules, (m) =>
                m.module.middlewares(m.config.appName, m.config)
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

    async _executeInit(multiModules) {
        const actions = multiModules.filter((m) => m.module.init);


        const maps = actions.slice().reverse().map(m => {
            const module = m.module;
            const config = m.config;

            /**@type {NamespaceDataHolder} */
            const nsDataHolder = this._namespaceDataHolder[config.appName];
            const nsData = nsDataHolder.getDataFor(module, config)
            return { module, config, nsData }
        })

        for (const m of maps) {
            const module = m.module;
            const config = m.config;
            const nsData = m.nsData;

            await module.init(config.appName, config, nsData);
        }

    }
    /**
     * @type {NamespaceDataHolder}
     */
    _namespaceDataHolder = {};

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
                    console.log("WS on abort!??");
                });

                const res = new Response(this.app, _res, _req);

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
                new Response(this.app, _res, _req).status(500).end();
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
            Log.error(
                "App name not found for host: {}{}{} ",
                h,
                nodeReq.getUrl(),
                nodeReq.getQuery() ? "?" + nodeReq.getQuery() : ""
            );
            nodeRes.close();
            return;
        }
        const url = nodeReq.getUrl() || "";
        const uindex = url.indexOf("?");
        const route = uindex > 0 ? url.slice(0, uindex) : url;

        const routes = this._routes[appName];
        /**@var {MupliRouter} */
        const router = this._router[appName];

        const routeValues = router.getRoute(route) || {};

        const req = new Request(
            nodeReq,
            nodeRes,
            route,
            routeValues.params,
            routeValues.values
            //  routeParam[1]
        );
        const res = new Response(this.app, nodeRes, nodeReq);

        let tmp = {
            appName: appName,
            host: host,
            routes: routes,
            req: req,
            res: res,
            config: this._appConfigs[appName],
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
                throw new MupliNoActionException("NoAction for - " + route);
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
            //For security reason Exception should not be part of response
            ctx.res
                .status(500)
                // .json(e)
                .write("Error")
                .end();
        }
    }

    _handler = {
        get(target, propKey, receiver) {
            // host, routes , appName, req, res
            if (target[propKey]) return target[propKey];

            // servicesCtx
            if (target.servicesCtx[propKey]) return target.servicesCtx[propKey];

            // context( if already built)
            if (target.ctx[propKey]) return target.ctx[propKey];

            // context builder by index so there won't be second execution
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

function _removeDuplicates(filteredModules) {
    const modulesMap = {};
    filteredModules.map((m) => {
        modulesMap[m.module.moduleName] = m;
    });
    const resultModules = Object.values(modulesMap);
    return resultModules;
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
    CookieOptions,
    CoreUtils,
    CorsOptions,
    Ctx,
    FileDetails,
    FileLoader,
    Log,
    Mupli,
    MupliModule,
    MupliNoActionException,
    Objects,
    Request,
    Response,
};
