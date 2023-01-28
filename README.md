## LifeCycle

### Initialization steps
0. init
1. routes -> fn(app)
3. services -> services(appName, ctx)
4. moduleExtentions -> moduleExtentions(appName) 


###  Invocation steps 
0. dispatch //TODO
1. context -> context(appName, ctx)
2. middlewears -> (ctx) // global middlewears
3. action (route action)
5. onError (appName, e, ctx)

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