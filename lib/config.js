import { BootConfig } from "./ctx.js";
import { FileLoader } from "./file-loader.js";
import { Objects } from "./objects.js";

const CONFIG_CACHE = {};
const _ROOT_CONFIGS = {};

export class AppConfig {
    _appName;
    _config;

    /**
     * 
     * @param {*} appName 
     * @param {BootConfig} config 
     */
    constructor(appName, config) {
        this._config = config;
    }

    get(name, def = undefined) {
        if (name.indexOf(".") > 0) {
            const parts = name.split(".");
            let obj = Config.get(this._config, parts[0]);
            if (obj) {
                const p = Array.from(parts).slice(1);

                for (const pValue of p) {
                    obj = obj[pValue];
                }
                return obj ?? def;
            }

            return def;
        } else {
            return Config.get(this._config, name) ?? def;
        }
    }
}

function _getJsonProp(fileName) {
    if (FileLoader.exist(fileName)) {
        const configProperties = FileLoader.readFile(fileName);
        if (configProperties) {
            let rootLevel = JSON.parse(configProperties);

            for (const key in rootLevel) {
                _extendObj(rootLevel, key);
            }
            return rootLevel;
        }
    }

    return null;
}

function _extendObj(rootProperties, k) {
    let properties = rootProperties[k];

    for (const key in properties) {
        const property = properties[key];

        if (typeof property == "object" && !Array.isArray(property)) {
            properties[key] = _extendObj(properties, key);
        } else if (key == "$extend") {
            delete properties[key];

            const extendProps = _extendObj(rootProperties, property);

            properties = Object.assign(
                Object.assign({}, extendProps),
                properties
            );
        }
    }

    rootProperties[k] = properties;
    return properties;
}

export class Config {
    static config(key) {
        return Config.get({ appName: "default" }, key);
    }

    static getFromRoot(name) {
        if (!_ROOT_CONFIGS[name]) {
            _ROOT_CONFIGS[name] =
                _getJsonProp("./config/" + name + ".json") ?? {};
        }
        return _ROOT_CONFIGS[name];
    }

    static getFromLocal(config, fileName) {
        if (fileName.indexOf(".json") >= 0) {
            throw new Error("filename argument shoul not have suffix (.json) - " + fileName);
        }

        const appName = config.appName;
        const appPath = config.appPath ?? "./app";

        if (!CONFIG_CACHE[appName]) {
            CONFIG_CACHE[appName] = {};
        }

        if (!CONFIG_CACHE[appName]["_loaded"]) {
            CONFIG_CACHE[appName]["_loaded"] = {};
        }

        if (
            !CONFIG_CACHE[appName][fileName] ||
            !CONFIG_CACHE[appName]["_loaded"][fileName + "_" + appPath]
        ) {
            CONFIG_CACHE[appName]["_loaded"][fileName + "_" + appPath] = true;
            CONFIG_CACHE[appName][fileName] = {};

            let moduleProp = {};

            if (config.localModules && config.localModules.length > 0) {
                for (const moduleName of config.localModules) {
                    const tmp = _getJsonProp(
                        appPath + "/" + moduleName + "/config/" + fileName + ".json"
                    );

                    Object.assign(moduleProp, tmp);
                }
            } else {
                moduleProp = _getJsonProp(
                    appPath + "/config/" + fileName + ".json"
                );
            }

            if (!Objects.isEmpty(moduleProp))
                Object.assign(CONFIG_CACHE[appName][fileName], moduleProp);
        }

        return CONFIG_CACHE[appName][fileName];
    }

    /**
     * 
     * @param {BootConfig} bootConfig 
     * @param {*} name | filename
     * @returns 
     */
    static get(bootConfig, name) {
        const local = this.getFromLocal(bootConfig, name);

        if (!Objects.isEmpty(local)) {
            return Objects.structuredClone(local);
        }

        const root = this.getFromRoot(name);
        return root;
    }

    static _get2(config, name) {
        const appName = config.appName;
        const appPath = config.appPath ?? "./app";

        if (!CONFIG_CACHE[appName]) {
            CONFIG_CACHE[appName] = {};
        }

        if (!CONFIG_CACHE[appName]["_loaded"]) {
            CONFIG_CACHE[appName]["_loaded"] = {};
        }

        if (
            !CONFIG_CACHE[appName][name] ||
            !CONFIG_CACHE[appName]["_loaded"][name + "_" + appPath]
        ) {
            CONFIG_CACHE[appName]["_loaded"][name + "_" + appPath] = true;

            CONFIG_CACHE[appName][name] = this.getFromRoot(name);

            let moduleProp = {};

            if (config.localModules && config.localModules.length > 0) {
                for (const moduleName of config.localModules) {
                    const tmp = _getJsonProp(
                        appPath + "/" + moduleName + "/config/" + name + ".json"
                    );

                    Object.assign(moduleProp, tmp);
                }
            } else {
                moduleProp = _getJsonProp(
                    appPath + "/config/" + name + ".json"
                );
            }

            if (moduleProp) {
                Object.assign(CONFIG_CACHE[appName][name], moduleProp);
            }
        }

        return Objects.structuredClone(CONFIG_CACHE[appName][name]);
    }
}
