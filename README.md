# Mupli framework
Framework to improve reusability of code once written for different project. Framework force you to write code the way that can be resuable for different applications.

For example. If You want to have different application with same layout and same user management but with different content. So You can reuse "users" and "admin" module in both projects. 

Same with authorization or mail management or static page generation. 

## why?

In my 10 years carrer I wrote so many code that it is dead now. And some projects were great. Usualy after some time I drop my project because of burnout. But then for example I have different idea, so again I write user registration, emails management, etc and again I'm geting burn. Then after some time I have idea .. maybe I will resurrect previous project. And then I see that tech I used was bad, my ideas for user management were bad. So this code is not usable anymore. In some cases it was written in different language (not sure why??).

I have user management from my last project so I would need to copy and update code. Well it wasn't easy and endup with two user-management that I need to mantain (burnout x^2). Same with mail management, Ux, UI etc. 
 
So I thought wouldn't be nice to have some bigger building blocks even if I switch project then I will be ready :D. 

That is why I have created framework that will support me with modularization and reusability.
And modules by adding moduleName:
Example:
```json
{
    "app1": {
        "host": ["app1.localhost"],
        "modules": ["custom-module", "users", "page", "my-layout", "mail"]
    },

    "app2": {
        "host": ["app2.localhost"],
        "modules": ["users", "page", "security", "cors", "mail", "my-layout", "cron"]
    }
}
```
Different modules can add different functionality. For example "mail" is my private (for now) module that adds mailSender service that use AWS mailer to send emails and read all templates from app/{appName}/mail/{names}.html. I wrote this once and now can reuse it in two different project app1 and app2. I just need to update the templates in app1 and and app2 or leave it and have default template.  

Perfect example is "sitemap" as well, by adding it to project would be super easy. 

This is just example, but You can have cms-module or admin-module and adjust its behavior for any project. 

## Working examples 
 https://github.com/Mupli/mupli-examples

## Design patten and big limitation.

Framework is a structure for

-   monolith modularity ?

And mainly created for monolith servers. 

### Microservices 
It can be be used for microservices, but you will need to split code base or deploy same codebase but with tags ( tags="user-microservice"). I think for Startups and MVP go with monolith approach. If you start earning and find bootlenecks then split project in multiservices. 

Important Tip: Code sharing between projects should be done via modules. If you share using node js imports/require you will endup with spagethi code and yout code will not be resuable nor split_able.  



## HOW to run project

```
node app/app.js
```

or with tags:

```
node app/app.js tags=dev,sit,some-other
```

Note this will run only projects with tags.

## LifeCycle

### Initialization steps

- process inheritance modules 
- init (app, config)
- services -> services(appName, ctx)
- moduleExtentions -> moduleExtentions(appName)
- routes -> fn(app)
    - ws -> fn(app)

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