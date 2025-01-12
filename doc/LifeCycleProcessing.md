

## Lifecycles 

- init 
- services 
- routes 


### Example inheritance structure: 
root (apps.json) -> M2 -> M1


###  Before Init 

1. Application scan apps.json 
2. Read all modules and nested modules from the LOWEST level : 
    - [...nested modules of M1 , module M1, neested modules of M2, M2, .... ]
3. Based on that create namespaces for NamespaceContext in the order from ROOT (HEIGHEST) level; 
    - M2, modules M2, M1..

### Init 
Order of the init is from root to leafs. 

0. root (engine processing)
1. M2 - init 
2. M2 modules..
3. M1 - init 

**Important**: 
In case of collisions in statefull package, we should not allow to override root (M2) data. 

Note: this was done so there will be no double processing of things that can be overriden in the namespace data. 

### How Config works 
Processing starts from the root overriding previous configs. 
1. Root/config/
2. previous overriden by: Module/config/
3. previous overriden by: app/[appName]/config/ 


## Api examples 


    /**
     * @param {*} registry 
     * @param {NamespaceContext} ctxData 
     */
    async init(appName, config, ctxData) {