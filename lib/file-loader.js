import fs from "fs";
import path from "path";
import { Config } from "./config.js";

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

    static getFile(filePath, innerFilePath) {
        const fsplitted = innerFilePath.split("/");
        const fileName = fsplitted[fsplitted.length - 1];
        const fileNameSplitted = fileName.split(".");

        const route = innerFilePath.split(".");

        const fd = new FileDetails({
            // appName: appName,
            // module: moduleName,
            name: fileNameSplitted[0],
            suffix: fileNameSplitted[1],
            fileName: fileName,
            route: route[0],
            filePath: filePath + innerFilePath,
            moduleFilePath: innerFilePath,
        });

        return fd;
    }

    static config(name) {
        return Config.get("default", name)
    }

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

    static async asObject(fd) {
        if (fd && fd.suffix == "js") {
            const module = await import(path.resolve(fd.filePath));
            return module;
        }

        return {};
    }
}
