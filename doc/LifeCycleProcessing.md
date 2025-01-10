

## Lifecycles 

- init 
- services 
- routes 


###  Before Init 

1. Application scan apps.json 
2. Read all modules and nested modules in order : 
    - [...nested modules of M1 , module M1, neested modules of M2, M2, .... ]
3. Based on that create namespaces for NamespaceContext in the order from root and reverted order; 
    - M2, modules M2, M1..


### Init 
Order of the init is from root to leafs

1. M2 - init 
2. M2 modules..
3. M1 - init 

In case of collisions in statefull package, we should not allow to override root (M2) data. 

Note: this was done so there will be no double processing of things that can be overriden in the namespace data. 

### How Config works 
Processing starts from the root Overriting previous configs. 
1. Root/config/
2. Module/config/
3. app/[appName]/config/ 
