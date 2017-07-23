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
    this.onUrl = config.onUrl;
    this.offUrl = config.offUrl;

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
                if (!this.onUrl || !this.offUrl) {
                    this.log.warn("Ignoring setStatus() request, 'onUrl' or 'offUrl' is not defined");
                    callback(new Error("No 'onUrl' or 'offUrl' defined!"));
                    break;
                }

                this.makeSetRequest(on, callback);
                break;
            case "stateless":
                if (!on) {
                    callback();
                    break;
                }

                if (!this.onUrl) {
                    this.log.warn("Ignoring setStatus() request, 'onUrl' is not defined");
                    callback(new Error("No 'onUrl' defined!"));
                    break;
                }

                this.makeSetRequest(true, callback);
                break;
            case "stateless-reverse":
                if (!on) {
                    callback();
                    break;
                }

                if (!this.offUrl) {
                    this.log.warn("Ignoring setStatus() request, 'offUrl' is not defined");
                    callback(new Error("No 'offUrl' defined!"));
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
        var url = on? this.onUrl: this.offUrl;

        this._httpRequest(url, "", this.httpMethod, function (error, response, body) {
            if (error) {
                this.log("setStatus() failed: %s", error.message);
                this.resetSwitchWithTimeout();

                callback(error);
            }
            else if (response.statusCode !== 200) {
                this.log("setStatus() http request returned http error code: %s", response.statusCode);
                this.resetSwitchWithTimeout();

                callback(new Error("Got html error code " + response.statusCode));
            }
            else {
                this.log("setStatus() successfully set switch to %s", on? "ON": "OFF");
                this.resetSwitchWithTimeout();

                callback(undefined, body);
            }
        });
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