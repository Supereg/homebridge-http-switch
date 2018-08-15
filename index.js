"use strict";

let Service, Characteristic, api;
const request = require("request");
const async = require("async");
const packageJSON = require('./package.json');

module.exports = function (homebridge) {
    Service = homebridge.hap.Service;
    Characteristic = homebridge.hap.Characteristic;

    api = homebridge;

    homebridge.registerAccessory("homebridge-http-switch", "HTTP-SWITCH", HTTP_SWITCH);
};

function HTTP_SWITCH(log, config) {
    this.log = log;
    this.name = config.name;

    this.switchType = config.switchType || 'stateful';
    this.timeout = config.timeout || 1000;
    if (typeof timeout !== 'number') {
        this.timeout = 1000;
    }

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

    this.statusUrl = config.statusUrl;

    if (config.auth) {
        if (!(config.auth.username && config.auth.password))
            this.log("Authentication parameters are not set completely. Username or password is missing!");
        else {
            this.auth = {};
            this.auth.username = config.auth.username;
            this.auth.password = config.auth.password;
        }
    }

    this.homebridgeService = new Service.Switch(this.name);
    this.homebridgeService.getCharacteristic(Characteristic.On)
        .on("get", this.getStatus.bind(this))
        .on("set", this.setStatus.bind(this));

    if (this.switchType === "stateless-reverse")
        this.homebridgeService.setCharacteristic(Characteristic.On, true);

    this.notificationID = config.notificationID;
    this.notificationPassword = config.notificationPassword;

    if (this.notificationID) {
        api.on('didFinishLaunching', function() {
            if (api.notificationRegistration && typeof api.notificationRegistration === "function") {
                try {
                    api.notificationRegistration(this.notificationID, this.handleNotification.bind(this), this.notificationPassword);
                    this.log("Detected running notification server. Registered successfully!");
                } catch (error) {
                    this.log("Could not register notification handler. ID '" + this.notificationID + "' is already taken!")
                }
            }
        }.bind(this));
    }
}

HTTP_SWITCH.prototype = {

    identify: function (callback) {
        this.log("Identify requested!");
        callback();
    },

    getServices: function () {
        const informationService = new Service.AccessoryInformation();

        informationService
            .setCharacteristic(Characteristic.Manufacturer, "Andreas Bauer")
            .setCharacteristic(Characteristic.Model, "HTTP Switch")
            .setCharacteristic(Characteristic.SerialNumber, "SW01")
            .setCharacteristic(Characteristic.FirmwareRevision, packageJSON.version);

        return [informationService, this.homebridgeService];
    },

    handleNotification: function(body) {
        const value = body.value;

        let characteristic;
        switch (body.characteristic) {
            case "On":
                characteristic = Characteristic.On;
                break;
            default:
                this.log("Encountered unknown characteristic handling notification: " + body.characteristic);
                return;
        }

        this.log("Updating '" + body.characteristic + "' to new value: " + body.value);

        this.ignoreNextSet = true;
        this.homebridgeService.setCharacteristic(characteristic, value);
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
                        const switchedOn = parseInt(body) > 0;
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
        if (this.ignoreNextSet) {
            this.ignoreNextSet = false;
            callback(undefined, "");
            return;
        }

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
        const that = this;

        const urlArray = on ? this.onUrl : this.offUrl;

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

        const functionArray = new Array(urlArray.length);
        for (let i = 0; i < urlArray.length; i++) {
            const url = urlArray[i];

            functionArray[i] = function (callback) {
                that._httpRequest(url, "", that.httpMethod, function (error, response, body) {
                    if (error) {
                        that.log("setStatus()[" + (i + 1) + "] failed: %s", error.message);
                        callback(error);
                    }
                    else if (response.statusCode !== 200) {
                        that.log("setStatus()[" + (i + 1) + "] http request returned http error code: %s", response.statusCode);
                        callback(new Error("Got html error code " + response.statusCode));
                    }
                    else {
                        that.log("setStatus()[" + (i + 1) + "] successfully set switch to %s", on? "ON": "OFF");
                        callback(undefined, body);
                    }
                }.bind(this));
            }
        }

        async.parallel(functionArray, function (errors, results) {
            that.resetSwitchWithTimeout();

            if (functionArray.length === 1) {
                callback(errors, results);
            }
            else {
                let errors = 0;
                let errorMessage = " errors occurred when calling multiple urls: {";

                for (let i = 0; i < errors.length; i++) {
                    const error = errors[i];

                    if (error instanceof Error) {
                        errors++;
                        errorMessage += "\"" + error.message + "\", ";
                    }
                }

                errorMessage = errors + errorMessage.substring(0, errorMessage.length - 2) + "}";

                if (errors > 0) {
                    callback(new Error(errorMessage.format()));
                    that.log(errorMessage);
                }
                else {
                    callback(undefined, "");
                }
            }
        });
    },

    resetSwitchWithTimeout: function () {
        const that = this;

        switch (this.switchType) {
            case "stateless":
                this.log("Resetting switch to OFF");

                setTimeout(function () {
                    this.homebridgeService.setCharacteristic(Characteristic.On, false);
                }.bind(this), that.timeout);
                break;
            case "stateless-reverse":
                this.log("Resetting switch to ON");

                setTimeout(function () {
                    this.homebridgeService.setCharacteristic(Characteristic.On, true);
                }.bind(this), that.timeout);
                break;
        }
    },

    _httpRequest: function (url, body, method, callback) {
        let auth = undefined;

        if (this.auth && this.auth.username && this.auth.password) {
            auth = {};
            auth.username = this.auth.username;
            auth.password = this.auth.password;
        }

        request(
            {
                url: url,
                body: body,
                method: method,
                rejectUnauthorized: false,
                auth: auth
            },
            function (error, response, body) {
                callback(error, response, body);
            }
        )
    }

};