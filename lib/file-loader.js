import fs from "fs";
import path from "path";
import { Config } from "./config.js";
import { Log } from "./log.js";
import { Objects } from "./objects.js";

const CONFIG_CACHE = {};

// {
//     appName: 'test',
//     module: 'page',
//     name: 'test',
//     suffix: 'html',
//     fileName: 'test.html',
//     route: 'test',
//     filePath: 'test.html',
//     moduleFilePath: 'page/test.html'
//   }

export class FileDetails {
    // appName;
    // module;
    name;

    suffix;
    fileName;
    route; //  /page/some/someView or /api/some/some

    filePath;
    moduleFilePath;

    constructor({
        appName,
        module,
        name,

        suffix,
        fileName,

        route,
        filePath,
        moduleFilePath,
    }) {
        // this.appName = appName;
        // this.module = module;
        this.name = name;

        this.suffix = suffix;
        this.fileName = fileName;
        this.route = route;

        this.filePath = filePath;
        this.moduleFilePath = moduleFilePath;
    }

    is(suffix) {
        return this.suffix == suffix;
    }
}

function walkSync(rootPath, currentDirPath, callback, ignorePath = []) {
    fs.readdirSync(path.resolve(rootPath + "/" + currentDirPath)).forEach(
        function (name) {
            var filePath = path.join(currentDirPath, name);

            var stat = fs.statSync(rootPath + "/" + filePath);
            if (stat.isFile()) {
                callback(rootPath + "/" + filePath, stat);
            } else if (stat.isDirectory()) {
                if (ignorePath.indexOf("/" + filePath) === -1)
                    walkSync(rootPath, filePath, callback);
            }
        }
    );
}

export class FileLoader {
    /**
     * @param {*} appName
     * @param {*} moduleName
     * @returns  {FileDetails}
     */
    static getFilesModule(appName, moduleName, ignorePaths = []) {
        const dir = appName + "/" + moduleName;
        const fullDirectory = "./app/" + dir;

        return FileLoader.getFiles(fullDirectory, ignorePaths);
    }

    /**
     *
     * @param {*} directory
     * @returns  {FileDetails}
     */

    static getFiles(directory, ignorePaths = []) {
        const files = [];
        if (this.exist(directory))
            walkSync(
                directory,
                "",
                (file, stat) => {
                    if (stat.isFile()) files.push(file);
                },
                ignorePaths
            );

        return files.map((filePath) => {
            const innerFilePath = filePath.replace(directory, "");
            return FileLoader.getFile(directory, innerFilePath);
        });
    }

    /**
     *
     * @param {*} filePath
     * @returns {FileDetails}
     */
    static getModuleFile(appName, moduleName, fileName) {
        const dir = appName + "/" + moduleName;
        const fullDirectory = "./app/" + dir;
        return FileLoader.getFile(fullDirectory, fileName);
    }

    static getFile(filePath, requestedFileName) {
        const fsplitted = requestedFileName.split("/");
        const fileName = fsplitted[fsplitted.length - 1];
        const fileNameSplitted = fileName.split(".");

        const route = requestedFileName.split(".");

        const fd = new FileDetails({
            // appName: appName,
            // module: moduleName,
            name: fileNameSplitted[0],
            suffix: fileNameSplitted[1],
            fileName: fileName,
            route: route[0],
            filePath: path.join(filePath, requestedFileName),
            moduleFilePath: requestedFileName,
        });

        return fd;
    }

    static getDirNames(rootPath) {
        let dirs = [];
        fs.readdirSync(path.resolve(rootPath)).forEach(function (name) {
            var stat = fs.statSync(rootPath + "/" + name);
            if (stat.isDirectory()) {
                dirs.push(name);
            }
        });
        return dirs;
    }

    // static config(name) {
    //     return Config.get({appName:"default"}, name);
    // }

    /**
     *
     * @param {FileDetails} fd
     */
    static load(fd) {
        return fs.readFileSync(fd.filePath, "utf8");
    }
    static readFile(filePath) {
        return fs.readFileSync(filePath, "utf8");
    }

    static exist(path) {
        return fs.existsSync(path);
    }


    /**
     * NOTE Danger: "import" result is cached by nodejs so if you modify "module" object on any level. 
     * It will affect other invocations. - STUPID as fuck
     * 
     * @param {FileDetails} fd 
     * @returns 
     */
    static async asObject(fd) {
        if (fd && fd.suffix == "js") {
            try {
                const filePath =path.resolve(fd.filePath)
                const module = await import(filePath);
                return module;
            } catch (e) {
                Log.error("Error when loading {}", JSON.stringify(fd));
                Log.error(e);
            }
        }

        return {};
    }

    static async getFunctions(fd) {
        const obj = await FileLoader.asObject(fd);

        const methods = Object.keys(obj);

        const fn = {}

        for (let index = 0; index < methods.length; index++) {
            const methodName = methods[index];

            const v = obj[methodName];

            if (typeof v === "function" &&  !/^\s*class\s+/.test(v.toString())) {
                fn[methodName]  = obj[methodName]
            }

        }

        return fn;
    }
}
