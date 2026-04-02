# SAP-B1-model-get
This is applicable for obtaining custom material specification and model information through the API interface for SAP Business One 10 sales orders.

https://localhost:50000/b1s/v1/script/mycompany/CreateOrder

Script Writing: Write OrdersScript.js to intercept requests before order creation, query the database and fill in the data.
Registration Definition: Write the OrdersScript.ard file to describe the extended information.
Packaging and Deployment: Package the above files as a .zip and upload it through the Extension Manager.
Environment Configuration:
Reset the password of B1SiteUser to log in to the management console.
Allocate the extension to the company chart of accounts in the Extension Manager.
Key Steps: Restart the SAP Business One Service Layer service on Windows to force the refresh of the script cache.
API Call: Change the Postman request URL to the script route /b1s/v1/script/{Partner}/{ScriptName}.
