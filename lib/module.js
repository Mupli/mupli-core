export class MupliModule {
    moduleName;

    constructor(config = { routerPrefix: undefined, moduleName: undefined }) {}

    async init(appName) {}
    routes(appName) {}
    services(appName, ctx) {}
}
