import { FileLoader } from "./file-loader.js";
import { Objects } from "./objects.js";

const CONFIG_CACHE = {};
const _ROOT_CONFIGS = {};

function _getProperties(fileName) {
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

    static get(config, name) {
        const appName = config.appName;

        if (!CONFIG_CACHE[appName]) {
            CONFIG_CACHE[appName] = {};
        }

        if (!CONFIG_CACHE[appName][name]) {
            if (!_ROOT_CONFIGS[name]) {
                _ROOT_CONFIGS[name] =
                    _getProperties("./config/" + name + ".json") ?? {};
            }

            CONFIG_CACHE[appName][name] = _ROOT_CONFIGS[name];

            let moduleProp = {};
            if (config.localModules) {
                for (const moduleName of config.localModules) {
                    const tmp = _getProperties(
                        "./app/" +
                            appName +
                            "/" +
                            moduleName +
                            "/config/" +
                            name +
                            ".json"
                    );

                    Object.assign(moduleProp, tmp);
                }
            } else {
                moduleProp = _getProperties(
                    "./app/" + appName + "/config/" + name + ".json"
                );
            }

            if (moduleProp) {
                Object.assign(CONFIG_CACHE[appName][name], moduleProp);
            }
        }

        return Objects.structuredClone(CONFIG_CACHE[appName][name]);
    }
}
