import { Request, Response, WSRequest, WSResponse, WSService } from "./http.js";
import { Log } from "./log.js";

export class BootConfig {
    appName;
    build;
    appPath;
    //modular directors example : product, groups,
    localModules = [];
}

export class AppConfig {
    get(key, def = undefined) {}
}

export class Store {
    findBy(collectionName, query) {}
    aggregate(collectionName, aggr) {}
    findOne(collectionName, query) {}
    save(collectionName, data) {}
    deleteBy(collectionName, query) {}
    updateMany(collectionName, filter, update) {}
    countBy(collectionName, query) {}

    /**@returns {Repository} */
    createRepository(collectionName, indexes = {}) {}
}
class AuthObject {
    id;
    login;
    firstName;
    lastName;
    roles;
}

class SecurityCtx {
    getAuth() {}

    /**
     * @param {AuthObject}
     * @returns {token}
     */
    authorize(_authObj) {}

    clearAuth() {}

    /**
     * @returns {Boolean}
     */
    isAuthenticated() {}

    /**
     * @returns {Boolean}
     */
    hasAuthRoles(roles) {}

    checkRoles(roles) {}
    checkAuthenticated() {}
}

export class FilesSerice {
    /**
     *
     * @param {String} key
     * @param {stream} data
     * @return {Promise}
     */
    async save(key, data) {}
    async deleteBy(key) {}
    getUrl(key) {}
}

export class User {
    _id;
    login;
    firstName;
    lastName;
    state;
}

export class UserService {
    /**
     * @returns {User}
     */
    async register({ login, password, roles = [] }) {}

    /**
     * @param {User} user
     * @returns {User}
     */
    async save(user) {}

    /**
     *
     * @param {User} id
     * @returns {User}
     */
    async getBasic(id) {}
    /**
     *
     * @param {User} id
     * @returns {User}
     */
    async getUserWithDetails(id) {}
    /**
     *
     * @param {User} id
     * @returns {User}
     */
    async getUserWithDetailsBy(query) {}

    /**
     *
     * @param {*} query
     * @returns {User}
     */
    async getBasicBy(query) {}

    async update(userId, data) {}

    async findByIds(ids) {}

    /**
     * @param {string} userId
     * @returns {string}
     */
    async createPasswordResetId(userId) {}

    /**
     *
     * @param {boolean} verificationCode
     */
    async verifyUser(verificationCode) {}

    /**
     * @param {string} linkId
     * @returns {boolean}
     */
    isPassChangeIdValid(linkId) {}
}

class MediaService {
    async save(userId, form) {}
    async findBy(query) {}

    async delete(userId, id) {}

    async findById(mediaId) {}

    async getAllForUser(userId) {}
    getFileKey(media) {}
}

class EventService {
    async publish(handlerName, data) {}
    async publishEvent(eventObject) {}
}

export class Ctx {
    /**@type {String} */
    appName;

    /**@type {AppConfig} */
    config;

    /**@type {Array} */
    routes = [];

    /**@type {Request} */
    req;

    /**@type {Response} */
    res;

    /**@type {WSService} */
    ws;

    /**@type {Log} */
    log;

    /**@type {WSRequest} */
    wsReq;

    /**@type {WSResponse} */
    wsRes;

    /**@type {SecurityCtx} */
    security;

    /**@type {Store} */
    store;

    /**@type {AuthObject} */
    auth;
    /**@type {FilesSerice} */
    files;
    /**@type {FilesSerice} */
    filesSecured;

    /**@type {UserService} */
    userService;

    /**@type {ProductService} */
    productService;

    /**@type {MediaService} */
    media;

    /**@type {EventService} */
    events;
}
