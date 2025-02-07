import { FileDetails, FileLoader } from "./file-loader.js";
import { Objects } from "./objects.js";

export class CoreUtils {
    static pipe(array) {
        return CoreUtils.createActionFromArray(array);
    }

    static createWrapper(obj) {
        const keys = Object.keys(obj);

        keys.forEach((k) => {
            const method = CoreUtils.createActionFromArray(obj[k]);
            if (method) {
                if (typeof method == "function") method.bind(obj);
                obj[k] = method;
            }
        });

        return obj;
    }

    static _isAllFunction(tmp = []) {
        for (const element of tmp) {
            if (typeof element !== "function") {
                return false;
            }
        }
        return true;
    }

    static createActionFromArray(tmpMiddlewares) {
        if (!Array.isArray(tmpMiddlewares)) {
            return tmpMiddlewares;
        } else if (tmpMiddlewares.length == 1) {
            return tmpMiddlewares[0];
        } else if (
            tmpMiddlewares.length > 1 &&
            CoreUtils._isAllFunction(tmpMiddlewares)
        ) {
            return async (...data) => {
                for (let index = 0; index < tmpMiddlewares.length; index++) {
                    let result = tmpMiddlewares[index](...data);
                    result = await Objects.resolvePromise(result);
                    if (result !== undefined) return result;
                }
            };
        } else if (typeof tmpMiddlewares == "function") {
            return tmpMiddlewares;
        } else {
            return null;
        }
    }

    static getFromModules(modules, functonFetcher) {
        let tmpMiddlewares = [];
        modules
            // .filter(functonFetcher)
            .map(functonFetcher)
            .forEach((data) => {
                if (Array.isArray(data)) {
                    data.forEach((el) => tmpMiddlewares.push(el));
                } else {
                    tmpMiddlewares.push(data);
                }
            });
        return tmpMiddlewares;
    }

    static acceptWs(res, req, context, tmpResultCtx) {
        res.upgrade(
            // upgrade to websocket
            { ctx: tmpResultCtx }, // 1st argument sets which properties to pass to ws object, in this case ip address
            req.getHeader("sec-websocket-key"),
            req.getHeader("sec-websocket-protocol"),
            req.getHeader("sec-websocket-extensions"), // 3 headers are used to setup websocket
            context // also used to setup websocket
        );
    }

    /**
     *
     * @param {*} appName
     * @param {*} config  {moduleName, localModules}
     * @returns {FileDetails}
     */
    static getFiles(appName, config) {
        const localModules = config.localModules;
        const moduleName = config.moduleName;

        if (localModules.length > 0) {
            let files = [];
            localModules.forEach((name) => {
                const path = config.appPath + "/" + name + "/" + moduleName;
                FileLoader.getFiles(path) //
                    .forEach((f) => {
                        files.push(f);
                    });
            });

            return files;
        } else {
            const path = config.appPath + "/" + moduleName;
            return FileLoader.getFiles(path); //
        }
    }

    /**
     * Return paths for module or sub modules ("arch":"modular")
     * for example.
     *
     *  - /app/my-app/page
     *  - /app/my-app2/products/page
     *
     * @param {*} config
     * @returns {array}
     */
    static getLocalModulePaths(config) {
        const localModules = config.localModules;
        const moduleName = config.moduleName;

        if (localModules.length > 0) {
            let files = [];
            localModules.forEach((name) => {
                const path = config.appPath + "/" + name + "/" + moduleName;
                if (FileLoader.exist(path)) files.push(path); //
            });

            return files;
        } else {
            const path = config.appPath + "/" + moduleName;
            if (FileLoader.exist(path)) return [path];
        }
        return [];
    }

    static getLocalModuleNames(appPath) {
        return FileLoader.getDirNames(appPath);
    }

    static getModuleConfigId(config) {
        const nsPart = "_ns:" + (config.namespace ?? "root");
        return config.moduleName + nsPart + "_apppath:" + config.appPath;
    }
}
