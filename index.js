"use strict";

var Service, Characteristic;
var request = require("request");

module.exports = function (homebridge) {
    Service = homebridge.hap.Service;
    Characteristic = homebridge.hap.Characteristic;

    homebridge.registerAccessory("homebridge-http-switch", "HTTP-SWITCH", HTTP_SWITCH);
};

function HTTP_SWITCH(log, config) {
    this.log = log;
    this.name = config.name;

    this.switchType = config.switchType || 'stateful';

    this.httpMethod = config.httpMethod || "GET";

    this.onUrl = [];
    this.offUrl = [];

    if (!!config.onUrl && config.onUrl.constructor === Array) {
        this.onUrl = config.onUrl;
    }
    else if (config.onUrl) {
        this.onUrl = [config.onUrl];
    }

    if (!!config.offUrl && config.offUrl.constructor === Array) {
        this.offUrl = config.offUrl;
    }
    else if (config.offUrl) {
        this.offUrl = [config.offUrl];
    }

    /*this.onUrl = config.onUrl;
    this.offUrl = config.offUrl;*/

    this.statusUrl = config.statusUrl;

    this.homebridgeService = new Service.Switch(this.name);
    this.homebridgeService.getCharacteristic(Characteristic.On)
        .on("get", this.getStatus.bind(this))
        .on("set", this.setStatus.bind(this));

    if (this.switchType === "stateless-reverse")
        this.homebridgeService.setCharacteristic(Characteristic.On, true);
}

HTTP_SWITCH.prototype = {

    identify: function (callback) {
        this.log("Identify requested!");
        callback();
    },

    getServices: function () {
        return [this.homebridgeService];
    },

    getStatus: function (callback) {
        switch (this.switchType) {
            case "stateful":
                if (!this.statusUrl) {
                    this.log.warn("Ignoring getStatus() request, 'statusUrl' is not defined");
                    callback(new Error("No 'statusUrl' url defined!"));
                    break;
                }

                this._httpRequest(this.statusUrl, "", "GET", function (error, response, body) {
                    if (error) {
                        this.log("getStatus() failed: %s", error.message);
                        callback(error);
                    }
                    else if (response.statusCode !== 200) {
                        this.log("getStatus() http request returned http error code: %s", response.statusCode);
                        callback(new Error("Got html error code " + response.statusCode));
                    }
                    else {
                        var switchedOn = parseInt(body) > 0;
                        this.log("Switch is currently %s", switchedOn? "ON": "OFF");
                        callback(null, switchedOn);
                    }
                }.bind(this));
                break;
            case "stateless":
                callback(null, false);
                break;
            case "stateless-reverse":
                callback(null, true);
                break;

            default:
                callback(null, false);
                break;
        }
    },

    setStatus: function (on, callback) {
        switch (this.switchType) {
            case "stateful":
                this.makeSetRequest(on, callback);
                break;
            case "stateless":
                if (!on) {
                    callback();
                    break;
                }

                this.makeSetRequest(true, callback);
                break;
            case "stateless-reverse":
                if (on) {
                    callback();
                    break;
                }

                this.makeSetRequest(false, callback);
                break;

            default:
                callback();
                break;
        }
    },

    makeSetRequest: function (on, callback) {
        var httpSwitch = this;

        var urlArray = on? this.onUrl: this.offUrl;

        if (urlArray.length === 0) {
            this.log("Ignoring setStatus() request 'offUrl' or 'onUrl' is not defined");
            callback(new Error("No 'onUrl' or 'offUrl' defined!"));
            return;
        }

        if (this.switchType === "stateful" && urlArray.length !== 1) {
            this.log("Stateful switch cannot have multiple on/off urls");
            callback(new Error("Confused with urls"));
            return;
        }

        var lastIndex = urlArray.length - 1;
        for (var i = 0; i < urlArray.length; i++) {
            var url = urlArray[i];

            const iCopy = i;
            this._httpRequest(url, "", this.httpMethod, function (error, response, body) {
                if (error) {
                    httpSwitch.log("setStatus() failed: %s", error.message);
                    httpSwitch.resetSwitchWithTimeout();

                    if (iCopy === lastIndex) {
                        callback(error);
                    }
                }
                else if (response.statusCode !== 200) {
                    httpSwitch.log("setStatus() http request returned http error code: %s", response.statusCode);
                    httpSwitch.resetSwitchWithTimeout();

                    if (iCopy === lastIndex) {
                        callback(new Error("Got html error code " + response.statusCode));
                    }
                }
                else {
                    httpSwitch.log("setStatus() successfully set switch to %s", on? "ON": "OFF");
                    httpSwitch.resetSwitchWithTimeout();

                    if (iCopy === lastIndex) {
                        callback(undefined, body);
                    }
                }
            }.bind(this));
        }
    },

    resetSwitchWithTimeout: function () {
        switch (this.switchType) {
            case "stateless":
                this.log("Resetting switch to OFF");

                setTimeout(function () {
                    this.homebridgeService.setCharacteristic(Characteristic.On, false);
                }.bind(this), 1000);
                break;
            case "stateless-reverse":
                this.log("Resetting switch to ON");

                setTimeout(function () {
                    this.homebridgeService.setCharacteristic(Characteristic.On, true);
                }.bind(this), 1000);
                break;
        }
    },

    _httpRequest: function (url, body, method, callback) {
        request(
            {
                url: url,
                body: body,
                method: method,
                rejectUnauthorized: false
            },
            function (error, response, body) {
                callback(error, response, body);
            }
        )
    }

};