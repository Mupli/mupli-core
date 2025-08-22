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
    _tmpAppsToLoadAsync = [];
    hostNamesToApp = {}; // key: safe.com  value: safeModule
    appPath; // default ./app
    overridePort;// port from cli params if null then used from listen(3000)

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

        this._tags = (argvMap["tags"] ?? "")
            .split(",")
            .map((x) => x.trim())
            .filter((x) => x.length > 0);

        this.apps = apps;

        const loggerConfig =
            process.env.ENV === "prod"
                ? { levels: ["ERROR"] }
                : { levels: ["INFO", "WARN", "ERROR"] };

        Log.init(loggerConfig);

        this.overridePort = (argvMap["port"] ?? undefined);
    }

    hostNamesToAppCalculation() {
        let apps = this.apps;
        let me = this;
        Object.keys(apps).forEach((appName) => {
            apps[appName].hosts.forEach((h) => {
                me.hostNamesToApp[h] = appName;
            });
        });
    }

    /**
     * String or mupli of application to be added. 
     * @param {string|Mupli} nameOrObject 
     * @returns 
     */
    loadApp(nameOrObject) {
        if (!nameOrObject instanceof Mupli && typeof nameOrObject != "string") {
            throw new MupliError("loadApp passed non Mupli instance")
        }

        if (typeof nameOrObject == "string") {
            this._tmpAppsToLoadAsync.push(nameOrObject);
            return this;
        }

        Objects.addNewOnly(this.apps, nameOrObject.apps);
        Objects.addNewOnly(this._modules, nameOrObject._modules);

        return this;
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
        if (module.alias) {
            this._modules[module.alias] = module;
        } else
            this._modules[module.moduleName] = module;
        return this;
    }

    async listen(port) {
        const me = this;
        this._routes = {};

        for (const appName of this._tmpAppsToLoadAsync) {
            const path = this.appPath + "/" + appName + "/app.config.json";
            if (!FileLoader.exist(path))
                throw new MupliError("app.config.json not exist in " + path)

            const data = FileLoader.readFile(this.appPath + "/" + appName + "/app.config.json");
            this.apps[appName] = JSON.parse(data);
        }

        this.filterAppsByTags();
        this.hostNamesToAppCalculation();

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

        if (process.env.ENV === "prod" && isMainThread & os.cpus().length > 2) {
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

            const portToListen = parseInt(this.overridePort ?? port);

            const app = App({});
            this.app = app;
            this._initWs(app);
            app.any("/*", async (res, req) => {
                try {
                    res.onAborted(() => {
                        res.aborted = true;
                        Log.error("On abort error.");
                    });

                    !res.aborted &&
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
                    if (res.aborted) return;
                    Log.error("Core error: {}", e);
                    Log.error(e);
                }
            }).listen("0.0.0.0", portToListen, (listenSocket) => {
                if (listenSocket) {
                    const time = console.timeEnd("Mupli started");
                    console.log(
                        "Listening to port:" +
                        portToListen +
                        " cpus:" +
                        os.cpus().length +
                        " threadId: " +
                        threadId
                    );
                } else {
                    Log.error("Error with running server on port: " + portToListen);
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

    filterAppsByTags() {
        const me = this;
        if (this._tags.length > 0) {
            console.log("tags[]=" + this._tags.join(","));

            let apps = this.apps;

            // remove apps that are not in tags
            Object.keys(apps).forEach((appKey) => {
                const appM = apps[appKey];

                if (!appM.tags ||
                    !me._tags.some(
                        (moduleTag) => appM.tags.indexOf(moduleTag) >= 0
                    )) {
                    delete apps[appKey];
                }
            });

            if (Objects.isEmpty(apps))
                throw new MupliError("No apps with the tags: " + this._tags.join(","));
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

        const allModuleAndConfigListOrderFromRoot = Object.values(
            moduleAndConfigSubModulesList
        ).flatMap(x => [...x.values()])

        const allModuleAndConfigListReversedInner = Object.values(
            moduleAndConfigSubModulesList
        ).flatMap(x => [...x.values()].slice().reverse())

        //init + execute
        await this._executeInit(allModuleAndConfigListOrderFromRoot);
        await this._executeCreateServices(allModuleAndConfigListReversedInner, appName);

        this._registerModuleExtentions(appName, rootModuleList);
        this._executeModuleExtentions(appName, rootModuleList);

        //not used ???
        await this._onservices({ appName }, rootModuleList);

        // PREPARE -----------
        this._prepareContexts(rootModuleList, appName);
        this._prepareMiddlewares(allModuleAndConfigListReversedInner, appName);
        this._prepareWsMiddlewares(allModuleAndConfigListReversedInner, appName);
        // Routes
        this._prepareRoutes(appName, allModuleAndConfigListReversedInner);

        //WebSockets
        this._prepareWSRoutesAndMiddlewares(appName, allModuleAndConfigListReversedInner);

        this._prepareErrorHandlers(appName, allModuleAndConfigListReversedInner);

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
                        ? [parentConfig, module]
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
                            _nsName: module._nsName,

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
                            module,
                            config,
                            loadSubs: module.appPath == parentConfig.appPath
                                || config.appPath != parentConfig.appPath
                        };
                    });
            })
            .filter((m) => {
                var nsId = CoreUtils.getNsId(m.config);
                return !results[nsId] || !results[nsId][m.config.appPath]
            });

        //Add root
        modAndConf.forEach((moduleAndConfig) => {
            const conf = moduleAndConfig.config;
            const nsId = CoreUtils.getNsId(conf);

            if (!results[nsId]) {
                results[nsId] = new Map();
            }
            if (!results[nsId].has(conf.appPath))
                results[nsId].set(conf.appPath, moduleAndConfig);
        });

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

                for (const nsId in sub) {
                    if (!results[nsId]) {
                        results[nsId] = new Map();
                    }

                    for (const appPath in sub[nsId]) {
                        const subOb = sub[nsId].get(appPath);
                        if (!results[nsId].has(appPath))
                            results[nsId].set(appPath, subOb);
                    }

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
        /**@type {NamespaceDataHolder} */
        var nsDataHolder = this._namespaceDataHolder[appName];

        const services = multiModules.filter(def => def.module.services)

        for (const def of services) {
            const data = await def.module.services(
                def.config,
                this._servicesCtx[appName],
                nsDataHolder.getDataFor(def.module, def.config)
            );

            Object.assign(this._servicesCtx[appName], data);
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
                tmp.push({
                    module,
                    nsData: this._namespaceDataHolder[appName].getDataFor(module, { namespace: module.namespace })
                });
            });

        this._contextsBuilders[appName] = tmp ?? [];
    }

    async _executeInit(multiModules) {
        const actions = multiModules.filter((m) => m.module.init);

        const maps = actions
            .map(m => {
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
        let res = new Response(this.app, nodeRes, nodeReq);

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

                            let results = await Objects.resolvePromise(action(ctx));

                            if (results == undefined)
                                throw new MupliWrongResponseException(
                                    "No response in method for path : /404"
                                );

                            if (results._res) {
                                results = results.notFound();
                            }

                            return await this._handleResults(results, res);
                        } else {
                            Log.warn(e);
                            Log.warn(
                                "No Error Handlers or no file handler for app: " +
                                appName +
                                " " +
                                route
                            );

                            ctx.res
                                .notFound()//
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
                const context = target.contextsBuilders[
                    target.contextsBuildersIndex
                ];

                const c = context.module.context(target.appName, receiver, context.nsData);
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
            const c = m.module.context(appName, ctx, m.nsData);
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
    MupliRouter
};
