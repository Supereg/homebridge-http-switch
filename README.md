
# "homebridge-http-switch" Plugin

Configuration:

```
    "accessories": [
        {
          "accessory": "HTTP-SWITCH",
          "name": "Switch",
          
          "httpMethod": "POST", // optional, defaults to 'GET'
          "onUrl": "http://localhost/api/switchOn",
          "offUrl": "http://localhost/api/switchOff",
          
          "statusUrl": "http://localhost/api/switchStatus" // GET request
        }   
    ]

```
With this plugin you can create switches which will contact your http API Server to control your Equipment. This is handy if you want to make use of homebridge but can't create plugins in NodeJS or want to use a somehow better language to control your devices/switch.

The statusUrl route has to return 0 for off and 1 for on without any html markup.

## Stateless Switch

A Stateless Switch remains in only one state. If you switch it to on, it goes immediately back to off. Thus there is no need declaring a 'offUrl' or a 'statusUrl' in the configuration

```
    "accessories": [
        {
          "accessory": "HTTP-SWITCH",
          "name": "Switch 1",
          
          "switchType": "stateless", // default is 'stateful'
          "onUrl": "http://localhost/api/switchOn"
          // only possible state, so neither 'offUrl' nor 'statusUrl' needs to be defined
        }   
    ]

```

## Reverse Stateless Switch

The default position of a Reverse Stateless Switch is on.

```
    "accessories": [
        {
          "accessory": "HTTP-SWITCH",
          "name": "Switch",
          
          "switchType": "stateless-reverse",
          "offUrl": "http://localhost/api/switchOff"
        }   
    ]

```