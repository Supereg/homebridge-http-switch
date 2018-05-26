
# "homebridge-http-switch" Plugin

With this plugin you can create HomeKit switches which will contact your http API Server to control your accessories. This 
is handy if already have home automated equipment which only exposes an http server. Or you simply want to manage your 
accessories in another program.

## Configuration:

```json
{
    "accessories": [
        {
          "accessory": "HTTP-SWITCH",
          "name": "Switch",
          
          "switchType": "stateful",
          
          "httpMethod": "POST",
          "onUrl": "http://localhost/api/switchOn",
          "offUrl": "http://localhost/api/switchOff",
          
          "statusUrl": "http://localhost/api/switchStatus"
        }   
    ]
}
```

* `switchType` is **optional**, default is 'stateful'. This property defines the type of the switch:
    * `stateful`: A normal switch and thus the default value
    * `stateless`: A stateless switch remains in only one state. If you switch it to on, it immediately goes back to off. 
    Configuration example is further down.
    * `stateless-reverse`: Default position is ON. If you switch it off, it immediately gies back to on. Configuration 
    example is further down.
* `httpMethod` is **optional**, default is 'GET*' This defines the httpMethod which is used for the `onUrl`and `offUrl`
 requests
* `onUrl` is the http url which is called when you turn on the switch (**required**)
* `offUrl` is the http url which is called when you turn off the switch (**required**)
* `statusUrl` is the http url which is called to retrieve the current state of the switch. It is an **GET** request and 
expects to return 0 for OFF or 1 for ON without any html markup.

## Stateless Switch

```json
{
    "accessories": [
        {
          "accessory": "HTTP-SWITCH",
          "name": "Switch",
          
          "switchType": "stateless",
          
          "timeout": 1000,
          
          "onUrl": "http://localhost/api/switchOn"
        }   
    ]
}  
```

* `timeout`: is **optional**, default is '1000'. This property sets the timeout after which the switch returns to its 
originals state in milliseconds

Since **OFF** is the only possible state you do not need to declare `offUrl` or a `statusUrl`

## Reverse Stateless Switch

```json
{
    "accessories": [
        {
          "accessory": "HTTP-SWITCH",
          "name": "Switch",
          
          "switchType": "stateless-reverse",
          
          "timeout": 1000,
          
          "offUrl": "http://localhost/api/switchOff"
        }   
    ]
}
```

* `timeout`: is **optional**, default is '1000'. This property sets the timeout after which the switch returns to its 
originals state in milliseconds

Since **ON** is the only possible state you do not need to declare `onUrl` or a `statusUrl`

## Multiple On or Off Urls
If you wish to do so you can specify an array of urls (`onUrl` or `offUrl`) when your switch is a **stateless switch** 
or a **reverse-stateless switch**. This is not possible with a normal stateful switch.

Below you can see an example config of an stateless switch with three urls.

```json
{
    "accessories": [
        {
          "accessory": "HTTP-SWITCH",
          "name": "Switch",
          
          "switchType": "stateless",
          "onUrl": [
            "http://localhost/api/switch1On",
            "http://localhost/api/switch2On",
            "http://localhost/api/switch3On"
          ]
        }   
    ]
}
```

## Notification Server

`homebridge-http-switch` can be used together with 
[homebridge-http-notification-server](https://github.com/Supereg/homebridge-http-notification-server) in order to receive
updates when the state changes at your external program. For detauls on ow to implement those updates and how to 
install and configure `homebridge-http-notification-server`, please refer to the 
[README](https://github.com/Supereg/homebridge-http-notification-server) of the repository.

Down here is an example on how to configure `homebridge-http-switch` to work with your implementation of the 
`homebridge-http-notification-server`.

```json
{
    "accessories": [
        {
          "accessory": "HTTP-SWITCH",
          "name": "Switch",
          
          "notificationID": "my-switch",
          "notificationPassword": "superSecretPassword",
          
          "onUrl": "http://localhost/api/switchOn",
          "offUrl": "http://localhost/api/switchOff",
          
          "statusUrl": "http://localhost/api/switchStatus"
        }   
    ]
}
```

* `notificationID` is an per Homebridge instance unique id which must be included in any http request.  
* `notificationPassword` is **optional**. It can be used to secure any incoming requests.

To get more details about the configuration have a look at the 
[README](https://github.com/Supereg/homebridge-http-notification-server).