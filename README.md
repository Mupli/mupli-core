#

## why?

To improve reusability of code once written for different project. Framework force you to write code they way that it can be resuable for different applications.

## What?

Framework is a structure for

-   monolith modularity ?

## HOW to run project

```
node app/app.js
```

or with tags:

```
node app/app.js tags=dev,sit,someother
```

Note this will run only projects with tags.

## LifeCycle

### Initialization steps

0. init
1. routes -> fn(app)
    - ws -> fn(app)
2. services -> services(appName, ctx)
3. moduleExtentions -> moduleExtentions(appName)

### Invocation steps

0. dispatch //TODO
1. context -> context(appName, ctx)
2. middlewares -> (ctx) // global middlewares
3. action (route action)
4. onError (appName, e, ctx)

### Invocation WebSocket steps

1. wsContext -> context(appName, ctx)
2. wsmiddlewares -> (ctx) // global middlewares
3. action (ws action)
4. onError (appName, e, ctx)

### module Extensions -

One module can add extensions for others

```javascript
    moduleExtensions(appName, ctx) {
        const me = this;
        return {
            securityExt: async function (obj) {
                // handle data from other modules
            },
            otherNameExt : async function (obj) {
                // handle ..
            },
        };
    }
```

## Minimal module

```javascript
export const myModule = {
    moduleName: "myModuleName",
    routes: (appName) => {
        return {
            "/page": (ctx) => {
                return "OK";
            },
        };
    },
};
```

config/apps.json

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

app/app.js

```javascript
new Mupli() //
    .module(myModule)
    .listen(3000);
```

node app/app.js

## MODULES

-   page - html page renderer module
-   api - Rest module
-   mail - mail sender module
-   newsletter
-   user
-   register
-   product
-   cron
-   aws
-   files

# bigger example module

```javascript
// file usersModule.js
export const usersModule = {
    moduleName: "myModuleName",

    services(appName) {
        return  {
            userServices: new UserServices(dbConnection);
        }
    }
}

//file : myModule.js
export const myModule = {
    moduleName: "myModuleName",

    init(appName){
        // do  stugff
    }

    services(appName) {
        return  {
            myService: new MyService(dbConnection),
            myEmailService: //...
        }
    }

    middlewares: (appName) =>([
        globalMiddleWare,
        (ctx) => {
            console.log("all request log")
        },
        isMethod("post", "patch"), //use mupli-middlewares
        //or manual middleware
        (ctx) => {
            if (ctx.req.is("POST")) {
                // no post is allowed
                // return values will break stop the invocation
                return ctx.res.status(403);
            }
        }
    ])

    routes: (appName) => {
        return {
            "/page": [
                localMiddleware,
                (ctx)=>{
                    console.log("Invoked middle wears")
                },
                isMethod("get"),
                isOwner("dataCollection", "_id")
                hasRoles("PRODUCT_CREATOR", "ADMIN"),
                validateGroupAccess(),
                isAuthenticated()

                async (ctx) => {
                    // my do logic
                    const myData = await ctx.req.json()
                    const savedMyDate = await myService.save(myData)

                    await ctx.userService.saveRelation(ctx.auth.id, myData.id)
                    return ctx.res.ok();
                }
            ]
        };
    },
};
```
