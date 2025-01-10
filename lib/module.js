import { BootConfig } from "./ctx.js";
import { Objects } from "./objects.js";

export class MupliModule {
    moduleName;

    constructor(config = { routerPrefix: undefined, moduleName: undefined }) { }

    async init(appName) { }
    routes({ appName }) { }
    services({ appName }, ctx) { }
}

export class NamespaceDataHolder {
    _data = {}

    getDataFor(module, config) {
        const moduleName = module._nsName ?? module.moduleName;
        const namespace = config.namespace ?? "root";


        if (!this._data[namespace]) {
            this._data[namespace] = {};
        }

        if (!this._data[namespace][moduleName]) {
            if (!config) {
                throw new Error("No Config for creation new namespace !!!")
            }
            this._data[namespace][moduleName] = new NamespaceContext(namespace);
        }

        return this._data[namespace][moduleName];
    }
}


export class NamespaceContext extends BootConfig {

    _name;
    _nameSpaceData = {};

    constructor(name) {
        super();
        this._name = name;

        // Object.assign(this, initData);
    }

    put(key, value) {
        this._nameSpaceData[key] = value;
    }

    has(key) {
        return !Objects.isEmpty(this._nameSpaceData[key])
    }

    from(key, defaultValue = () => ({})) {
        if (this._nameSpaceData[key]) {
            return this._nameSpaceData[key];
        }
        if (this[key]) {
            return this[key];
        }

        this._nameSpaceData[key] = defaultValue();
        return this._nameSpaceData[key];
    }

    clear(key) {
        if (this._nameSpaceData[key])
            if (!delete this._nameSpaceData[key]) throw new Error("Didn't delete key: " + key);
    }
}


