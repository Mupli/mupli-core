import { ProductService } from "../../mupli-products/src/ProductService.js";
import { Request, Response } from "./http.js";

class Store {
    findBy(collectionName, query) {}
    findOne(collectionName, query) {}
    save(collectionName, data) {}
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

    async findByIds(ids) {}
}

class MediaService{
    async save(userId, form) {
    }
    async findBy(query) {
    }

    async delete(userId, id) {}

    async findById(mediaId) {
    }

    async getAllForUser(userId) {
    }
    getFileKey(media){}
}

export class Ctx {
    /**@type {String} */
    appName;

    /**@type {Array} */
    routes = [];

    /**@type {Request} */
    req;

    /**@type {Response} */
    res;

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
    
}
