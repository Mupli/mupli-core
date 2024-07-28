# Mupli Framework Documentation

Mupli is a modular framework designed to enhance code reusability across different projects. It enforces a structure that promotes the creation of reusable components, enabling developers to maintain consistency and efficiency in their codebase. This documentation will guide you through the core concepts, usage, and advanced features of Mupli.

## Why Mupli?

Over a decade-long career, repetitive tasks like user registration and email management often lead to burnout. The Mupli framework addresses this by providing a way to modularize and reuse code across projects. This approach minimizes redundancy and maximizes the reuse of well-tested components.

## Key Features

-   **Modular Architecture**: Break down applications into reusable modules.
-   **Easy Configuration**: Use JSON configurations to manage modules across different projects.
-   **Monolith and Microservices Support**: Start with a monolith and scale to microservices as needed.
-   **Lifecycle Management**: Clearly defined steps for initialization and invocation.

## One node server but two websites

Configuration file:
`/root/config/apps.json`

```json
{
    "myProject1": {
        "host": ["app1.localhost"],
        "modules": ["custom-module", "users", "page", "my-layout", "mail"]
    },
    "app2": {
        "host": ["app2.localhost"],
        "modules": [
            "users",
            "page",
            "security",
            "cors",
            "mail",
            "my-layout",
            "cron"
        ],
        "tags": ["dev", "some-other"]
    }
}
```

## Getting Started

### Instalation 

`npm install mupli-core`

Note: you need to create minimal folder structure. Please check [https://github.com/Mupli/mupli-examples/tree/main/example-api](https://github.com/Mupli/mupli-examples/tree/main/example-api) 
- /config/apps.json
- /app/app.js
- /app/myProject1/api/test.js

That is it!! Not you just need to run it. 


### Running the Project

To start a Mupli project, run:

```bash
node app/app.js
```

You can also run with specific tags:

```bash
node app/app.js tags=dev,sit,some-other
```

This will only run projects with the specified tags.

### Project Structure

#### Directories

```
 /root
    /app
        - app.js
        /[projectName]
            /api
            - users.js  - user controller
            /page
            /cron       - cron job definitions (mupli-cron module)
        /[modularProject]
            /user
                /api
                /cron    - same as /cron
                /page    - directory with html templates (mupli-page or mupli-handlebar)
            /mail
                /mailer  - mailer (mupli-mail)
                /cron    - same as /cron
            /products
                /static  - some example
                /events  - event handlers (mupli-events module)
    /config
        - apps.json

```

Minimal dirctory structure

```
/root/app/app.js
/root/app/myProject/api/users.js
/root/config/apps.json
```

### Simplified Api example

/root/app/myProject/api/users.js

```js
import { executeOn, isAuthenticated, isMethod } from "mupli-lib-middlewares";


// Exported method (api/[fileName]/search)
export async function search({req, res, userService}) {
    const name = req.param("userName");
    const users = await userService.findAllByName(name);
    return ctx.res.json(users);
}

// Exported root method (takes file name)
export const init = [
    isAuthenticated(),
    executeOn(isMethod("post", "put"), _createOrUpdateUser),
    executeOn(isMethod("delete"), _deleteUser),
    (ctx) => ctx.res.status("405"),
];

async function _createOrUpdateUser({req, userService}) {
    const user = await ctx.req.json();
    // Do stuff
    await userService.save(user);
    return { status: "OK" };
}



```

- url: GET localhost:3000/api/users/search
- url: POST localhost:3000/api/users

## Modules development

#### Initialization Steps

1. **Process Inheritance Modules**: Handles module inheritance.
2. **Init**: Initialize the application with `appName` and `bootConfig`.
3. **Services**: Initialize services with `bootConfig` and `ctx`.
4. **Module Extensions**: Apply module extensions using `appName`.
5. **Routes**: Set up routes using `appConfig` and `serviceCtx`.

#### Invocation Steps

1. **Dispatch**: (TODO)
2. **Context**: Set up request context.
3. **Middlewares**: Apply global middlewares.
4. **Action**: Execute route action.
5. **OnError**: Handle errors.

### WebSocket Invocation Steps

1. **WS Context**: Set up WebSocket context.
2. **WS Middlewares**: Apply WebSocket middlewares.
3. **Action**: Execute WebSocket action.
4. **OnError**: Handle WebSocket errors.

### App Configuration

Define your application configuration in `config/apps.json`:

```json
{
    "test": {
        "hosts": ["localhost", "www.example.com"],
        "tags": ["dev", "prod"],
        "modules": ["page", "store", "api", "services"],
        "arch": "modular"
    }
}
```

### Module Extensions

Modules can extend the functionality of other modules:

```javascript
moduleExtensions(appName, ctx) {
    const me = this;
    return {
        securityExt: async function (obj) {
            // handle data from other modules
        },
        otherNameExt: async function (obj) {
            // handle ..
        },
    };
}
```

## Creating a Minimal Module

```javascript
export const myModule = {
    moduleName: "myModuleName",
    routes: (appName, serviceCtx) => {
        return {
            "/page": (ctx) => {
                return "OK";
            },
        };
    },
};
```

Add the module to your app configuration:

```json
{
    "myapp": {
        "host": ["localhost"],
        "modules": ["myModuleName"]
    },
    "myapp-still-in-development": {
        "host": ["dev.localhost"],
        "arch": "modular",
        "tags": ["dev", "someother"],
        "modules": ["users", "page"]
    }
}
```

## Example App Initialization

```javascript
new Mupli() //
    .module(myModule)
    .listen(3000);
```

Run the app:

```bash
node app/app.js
```

## Available Modules

-   **page**: HTML page renderer module
-   **api**: REST module
-   **mail**: Mail sender module
-   **newsletter**
-   **user**
-   **register**
-   **product**
-   **cron**
-   **aws**
-   **files**

## Advanced Module Example

### User Module

```javascript
// file usersModule.js
export const usersModule = {
    moduleName: "usersModule",

    services(appName, ctx) {
        return {
            userServices: new UserServices(ctx.dbConnection);
        }
    }
};
```

### Custom Module

```javascript
//file : myModule.js
export const myModule = {
    moduleName: "myModuleName",

    init(appName) {
        // Initialization logic
    },

    services(appName, ctx) {
        return {
            myService: new MyService(dbConnection, ctx.userServices),
            myEmailService: //...
        }
    },

    middlewares: (appName) => [
        globalMiddleWare,
        (ctx) => {
            console.log("all request log");
        },
        isMethod("post", "patch"),
        (ctx) => {
            if (ctx.req.is("POST")) {
                return ctx.res.status(403);
            }
        }
    ],

    routes: (appName, serviceCtx) => {
        return {
            "/page": [
                localMiddleware,
                (ctx) => {
                    console.log("Invoked middlewares");
                },
                isMethod("get"),
                isOwner("dataCollection", "_id"),
                hasRoles("PRODUCT_CREATOR", "ADMIN"),
                validateGroupAccess(),
                isAuthenticated(),
                async (ctx) => {
                    const myData = await ctx.req.json();
                    const savedMyDate = await myService.save(myData);

                    await ctx.userService.saveRelation(ctx.auth.id, myData.id);
                    return ctx.res.ok();
                }
            ]
        };
    },
};
```

## Module Inheritance

Mupli allows modules to inherit functionality from other modules:

### Example

```javascript
import path from "path";
import { fileURLToPath } from "url";

const currentFileDirectory = path.dirname(fileURLToPath(import.meta.url));

class MyAppModule {
    moduleName = "myapp";
    appPath = currentFileDirectory + "/src";
    modules = ["page", "api"];
}
```

Define your module structure in `config/apps.json`:

```json
{
    "myCurrentApp": {
        "hosts": ["localhost"],
        "modules": ["myapp", "other"]
    }
}
```

## Conclusion

Mupli is a powerful framework that facilitates code reusability and modularization, making it easier to manage and maintain projects. By following the structure and guidelines provided, developers can create scalable and maintainable applications efficiently.
