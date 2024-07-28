// import Router from 'router'

// function empty() {

// }

// const data = {
//     "/board" : ()=>{}
// }

// let url = "/board/62dd28f98657a813740fff9c"
// url = "/board?test=213"

// const d = {}
// function resolve1( url) {
//     d.action = data[url]
// }

// const router = Router()
// router.get("/board", )

// function resolve2( url) {
//     d.action = data[url]
// }

// console.time("exe");

// for (let index = 0; index < 1000000; index++) {
//     resolve1( url)
// }

// console.timeEnd("exe");

const _PARAM_REGEX = /\[([a-zA-Z-_]+)\]/g;
// const _PARAM_REGEX = /:([a-zA-Z-_]+)/g;

export class MupliRouter {
    _routes = {};

    addRoute(path) {
        path = path.split("?")[0];

        if (path.indexOf("[") == -1) {
            if (!this._routes[path]) {
                this._routes[path] = {};
            }
            let r = this._routes[path];
            r.path = path.replace("//", "/");
            r.pathDef = path;
            return r;
        }

        const regExResult = path.match(_PARAM_REGEX);

        let p = path;
        if (regExResult) {
            let paramsCount = regExResult.length;

            while (paramsCount--) {
                p = p.replace(regExResult[paramsCount], "@");
            }
        }

        let sp = p.split("/").slice(1);
        let r = this._routes;

        for (let index = 0; index < sp.length; index++) {
            const pathPart = sp[index];

            const l = r[pathPart];
            if (!l) {
                r[pathPart] = {};
            }
            r = r[pathPart];
        }

        r.path = p.replace("//", "/");
        r.pathDef = path;
        r.sp = sp;
        r.params = regExResult.map(p=>p.replace("[","").replace("]", ""));

        return r;
    }

    getRoute(path) {
        // const parts = path.split("/").slice(1);
        // let routeParam = this._routes["@"];

        const staticPath = this._routes[path];
        if (staticPath && staticPath.path) {
            return staticPath;
        }

        let route = this._routes;

        const parts = path.split("/");
        const resValues = [];
        let valIndex = 0;

        for (let index = 1; index < parts.length; index++) {
            const element = parts[index];
            if (!route[element]) {
                if (route["@"]) {
                    resValues[valIndex++] = element;
                    route = route["@"];
                } else {
                    return null;
                }
            } else {
                route = route[element];
            }
        }

        return {
            path: route.path,
            pathDef:route.pathDef,
            // route: route,
            params: route.params,
            values: resValues
        };
    }

    getRouteV2(p) {
        let parts = [];
        let old = 0
        let index = p.indexOf("/")

        let pI = 0;
        while (index != -1) {
            parts[pI] = p.slice(old, index)
            old = index+1
            index = p.indexOf("/", old);
            pI++;
        }
        return parts;

        // console.log(parts)
        // let parts = [];
        // let old = 0;
        // let pI = 0;
        // let index = 0;

        // for (let i = 0; i < p.length; i++) {
        //     if (p[i] == "/") {
        //         index = i;
        //         parts[pI++] = p.slice(old + 1, index);
        //         old = index;
        //     }
        // }

        // console.log(parts)
        // const parts = p.substring(1).split("/");
        // let testPath = p;
        // let index = parts.length;
        // while (index--) {
        //     const roles = routes[testPath];
        //     const part = parts[index];
        //     testPath = testPath.substring(
        //         0,
        //         testPath.length - ("/" + (part || "")).length
        //     );
        // }
    }
}

// const router = new MupliRouter()
// const res = router.compile("/:test/spoko/android_:aaa");

// const c = "on_jest/spoko/android_wwww";

// const {route, values } =  router.getRoute(c)

// console.log(JSON.stringify(res));
