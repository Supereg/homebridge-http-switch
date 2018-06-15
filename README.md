
# homebridge-http-switch Plugin

`homebridge-http-switch` is a [Homebridge](https://github.com/nfarina/homebridge) plugin with which you can configure 
HomeKit switches which forward any requests to a defined http server. This comes in handy when you already have home 
automated equipment which can be controlled via http requests. Or you have built your own equipment, for example some sort 
of lightning controlled with an wifi enabled Arduino board which than can be integrated via this plugin into Homebridge.

`homebridge-http-switch` supports three different type of switches. A normal `stateful` switch and two variants of 
_stateless_ switches (`stateless` and `stateless-reverse`) which differ in their original position. For stateless switches 
you can specify multiple urls to be targeted when the switch is turned On/Off.   
More about on how to configure such switches can be read further down.

The _'On'_ characteristic from the _'switch'_ service has the permission to `notify` the HomeKit controller of state 
changes. `homebridge-http-switch` is able to receive such notifications and forwards them to the HomeKit controller. 
State changes happening on the http device can then be instantly reflected for example in the Home App.  
How to implement the protocol into your http device can be read in the chapter [**Notification Server**](#notification-server)

## Configuration:

```json
{
    "accessories": [
        {
          "accessory": "HTTP-SWITCH",
          "name": "Switch",
          
          "switchType": "stateful",
          
          "httpMethod": "GET",
          "onUrl": "http://localhost/api/switchOn",
          "offUrl": "http://localhost/api/switchOff",
          
          "statusUrl": "http://localhost/api/switchStatus"
        }   
    ]
}
```

* `switchType` is **optional**, default is 'stateful'. The property defines the type of the switch:
    * `stateful`: A normal switch and thus the default value
    * `stateless`: A stateless switch remains in only one state. If you switch it to on, it immediately goes back to off. 
    Configuration example is further down.
    * `stateless-reverse`: Default position is ON. If you switch it off, it immediately gies back to on. Configuration 
    example is further down.
* `httpMethod` is **optional**, default is 'GET'. It defines the httpMethod which is used for the `onUrl`and `offUrl`
 requests
* `onUrl` is the http url which is called when you turn on the switch (**required**)
* `offUrl` is the http url which is called when you turn off the switch (**required**)
* `statusUrl` is the http url which is called to retrieve the current state of the switch. It is an **GET** request and 
expects to return 0 for OFF or 1 for ON without any html markup (**required**)

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
updates when the state changes at your external program. For details on how to implement those updates and how to 
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

**Available characteristics (for the POST body)**

Down here are all characteristics listed which can be updated with an request to the `homebridge-http-notification-server`

* `characteristic` "On": expects a boolean `value`