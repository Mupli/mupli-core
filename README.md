#
Framework to improve reusability of code once written for different project. Framework force you to write code the way that can be resuable for different applications.

For example. If You want to have different application with same layout and same user management but the content can be different. So You can reuse "users" and "admin" module in both projects. 

Same with authorization or mail management or static page generation. 

## why?

In my 10 years carrer I wrote so many code that it is dead now. And some projects were great. Usualy after some time I drop my project because of burnout. But then for example I have different idea, so again I write user registration, emails management, etc and again I'm geting burn. Then after some time I have idea .. maybe I will resurrect previous project. And then I see that tech I used was bad, my ideas for user management were bad. So this code is not usable anymore. In some cases it was written in different language (not sure why??).

I have user management from my last project so I would need to copy and update code. Well it wasn't easy and endup with two user-management that I need to mantain (burnout x^2). Same with mail management, Ux, UI etc. 
 
So I thought wouldn't be nice to have some bigger building blocks even if I switch project then I will be ready :D. 

That is why I have created framework that will support me with modularization and reusability. Example:

app1: 
- users, emails

app2: 
- users, emails, security 




## Design patten and big limitation.

Framework is a structure for

-   monolith modularity ?

And mainly created for monolith servers. 

It can be be used microservices, but later you will need to split code base or deploy same codebase but with tags ( tags="user-microservice")



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

## bigger example module

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


## Modules inheritance 

Mupli allows to inherit functionality of other modules: 

For example my new module can be full fledge application with UI that use "page" and "api" modules . 

```javascript
import path from "path";
import { fileURLToPath } from "url";

const currentFileDirectory = path.dirname(fileURLToPath(import.meta.url));

class MyAppModule {
    moduleName="myapp"
    appPath= currentFileDirectory +"/src";
    modules = ["page", "api"] //limited only to this module
    // arch = "domain" // optional structure
}

```

path of library can be custom. But In most caseses it will be ".node_modules/myapp/src"

module structure: 

- /src
    - /page
        - index.html
        - something.html
    - /api 
        - ...


in ourc config apps.json 
```json
{

    "myCurrentApp": {
        "hosts":["localhost"],
        "modules": ["myapp", "other"], 
    }

}

```

Go to /something  or /index