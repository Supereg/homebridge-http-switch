"use strict";

let Service, Characteristic, api;

const http = require("homebridge-http-base").http;
const configParser = require("homebridge-http-base").configParser;
const PullTimer = require("homebridge-http-base").PullTimer;
const notifications = require("homebridge-http-base").notifications;

const packageJSON = require('./package.json');

module.exports = function (homebridge) {
    Service = homebridge.hap.Service;
    Characteristic = homebridge.hap.Characteristic;

    api = homebridge;

    homebridge.registerAccessory("homebridge-http-switch", "HTTP-SWITCH", HTTP_SWITCH);
};

const SwitchType = Object.freeze({
    STATEFUL: "stateful",
    STATELESS: "stateless",
    STATELESS_REVERSE: "stateless-reverse"
});

function HTTP_SWITCH(log, config) {
    this.log = log;
    this.name = config.name;
    this.debug = config.debug || false;

    this.switchType = config.switchType || SwitchType.STATEFUL;
    this.switchType.toLowerCase();

    let validSwitchType = false;
    Object.keys(SwitchType).forEach(key => {
        const value = SwitchType[key];

        if (this.switchType === value)
            validSwitchType = true;
    });
    if (!validSwitchType) {
        this.log.warn(`'${this.switchType}' is a invalid switchType! Aborting...`);
        return;
    }

    this.timeout = config.timeout || 1000;
    if (typeof this.timeout !== 'number') {
        this.timeout = 1000;
    }

    if (this.switchType === SwitchType.STATEFUL) {
        this.statusPattern = /1/;

        if (config.statusPattern) {
            if (typeof config.statusPattern === "string")
                this.statusPattern = new RegExp(config.statusPattern);
            else
                this.log.warn("Property 'statusPattern' was given in an unsupported type. Using default one!");
        }
    }

    const success = this.parseUrls(config); // parsing 'onUrl', 'offUrl', 'statusUrl'
    if (!success) {
        this.log.warn("Aborting...");
        return;
    }

    /** @namespace config.httpMethod */
    if (config.httpMethod) { // if we have it defined globally override the existing one of ON and OFF config object
        this.log("Global 'httpMethod' is specified. Overriding method of on and off!");
        if (this.on)
            this.on.forEach(urlObject => urlObject.method = config.httpMethod);
        if (this.off)
            this.off.forEach(urlObject => urlObject.method = config.httpMethod);

        /*
         * New way would expect to also override method of this.status, but old implementation used fixed 'httpMethod' (GET)
         * for this.status and was unaffected by this config property. So we leave this.status unaffected for now to maintain
         * backwards compatibility.
         */
    }

    if (config.auth) {
        if (!(config.auth.username && config.auth.password))
            this.log("auth.username' and/or 'auth.password' was not set!");
        else {
            if (this.on) {
                this.on.forEach(urlObject => {
                    urlObject.auth.username = config.auth.username;
                    urlObject.auth.password = config.auth.password;
                });
            }
            if (this.off) {
                this.off.forEach(urlObject => {
                    urlObject.auth.username = config.auth.username;
                    urlObject.auth.password = config.auth.password;
                });
            }
            if (this.status) {
                this.status.auth.username = config.auth.username;
                this.status.auth.password = config.auth.password;
            }
        }
    }

    this.homebridgeService = new Service.Switch(this.name);
    this.homebridgeService.getCharacteristic(Characteristic.On)
        .on("get", this.getStatus.bind(this))
        .on("set", this.setStatus.bind(this));

    if (this.switchType === SwitchType.STATELESS_REVERSE)
        this.homebridgeService.setCharacteristic(Characteristic.On, true);

    /** @namespace config.pullInterval */
    if (config.pullInterval) {
        if (this.switchType === SwitchType.STATEFUL) {
            this.pullTimer = new PullTimer(this.log, config.pullInterval, this.getStatus.bind(this), value => {
                this.ignoreNextSet = true;
                this.homebridgeService.setCharacteristic(Characteristic.On, value);
            });
            this.pullTimer.start();
        }
        else
            this.log("'pullInterval' was specified, however switch is stateless. Ignoring property and not enabling pull updates!");
    }

    if (config.notificationID) {
        if (this.switchType === SwitchType.STATEFUL) {
            /** @namespace config.notificationPassword */
            /** @namespace config.notificationID */
            notifications.enqueueNotificationRegistrationIfDefined(api, log, config.notificationID, config.notificationPassword, this.handleNotification.bind(this));
        }
        else
            this.log("'notificationID' was specified, however switch is stateless. Ignoring property and not enabling notifications!");
    }
    this.log("Switch successfully configured...");
}

HTTP_SWITCH.prototype = {

    parseUrls: function (config) {
        /** @namespace config.onUrl */
        if (this.switchType === SwitchType.STATEFUL || this.switchType === SwitchType.STATELESS) {
            if (config.onUrl) {
                try {
                    this.on = this.switchType === SwitchType.STATEFUL
                        ? [configParser.parseUrlProperty(config.onUrl)]
                        : configParser.parseMultipleUrlProperty(config.onUrl);
                } catch (error) {
                    this.log.warn("Error occurred while parsing 'onUrl': " + error.message);
                    return false;
                }
            }
            else {
                this.log.warn(`Property 'onUrl' is required when using switchType '${this.switchType}'`);
                return false;
            }
        }
        else if (this.switchType === SwitchType.STATELESS_REVERSE && config.onUrl)
            this.log.warn(`Property 'onUrl' is defined though it is not used with switchType ${this.switchType}. Ignoring it!`);

        /** @namespace config.offUrl */
        if (this.switchType === SwitchType.STATEFUL || this.switchType === SwitchType.STATELESS_REVERSE) {
            if (config.offUrl) {
                try {
                    this.off = this.switchType === SwitchType.STATEFUL
                        ? [configParser.parseUrlProperty(config.offUrl)]
                        : configParser.parseMultipleUrlProperty(config.offUrl);
                } catch (error) {
                    this.log.warn("Error occurred while parsing 'offUrl': " + error.message);
                    return false;
                }
            }
            else {
                this.log.warn(`Property 'offUrl' is required when using switchType '${this.switchType}'`);
                return false;
            }
        }
        else if (this.switchType === SwitchType.STATELESS && config.offUrl)
            this.log.warn(`Property 'offUrl' is defined though it is not used with switchType ${this.switchType}. Ignoring it!`);

        if (this.switchType === SwitchType.STATEFUL) {
            /** @namespace config.statusUrl */
            if (config.statusUrl) {
                try {
                    this.status = configParser.parseUrlProperty(config.statusUrl);
                } catch (error) {
                    this.log.warn("Error occurred while parsing 'statusUrl': " + error.message);
                    return false;
                }
            }
            else {
                this.log.warn(`Property 'statusUrl' is required when using switchType '${this.switchType}'`);
                return false;
            }
        }
        else if (config.statusUrl)
            this.log.warn(`Property 'statusUrl' is defined though it is not used with switchType ${this.switchType}. Ignoring it!`);

        return true;
    },

    identify: function (callback) {
        this.log("Identify requested!");
        callback();
    },

    getServices: function () {
        if (!this.homebridgeService)
            return [];

        const informationService = new Service.AccessoryInformation();

        informationService
            .setCharacteristic(Characteristic.Manufacturer, "Andreas Bauer")
            .setCharacteristic(Characteristic.Model, "HTTP Switch")
            .setCharacteristic(Characteristic.SerialNumber, "SW01")
            .setCharacteristic(Characteristic.FirmwareRevision, packageJSON.version);

        return [informationService, this.homebridgeService];
    },

    /** @namespace body.characteristic */
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

        if (this.debug)
            this.log("Updating '" + body.characteristic + "' to new value: " + body.value);

        if (this.pullTimer)
            this.pullTimer.resetTimer();

        this.ignoreNextSet = true;
        this.homebridgeService.setCharacteristic(characteristic, value);
    },

    getStatus: function (callback) {
        if (this.pullTimer)
            this.pullTimer.resetTimer();

        switch (this.switchType) {
            case SwitchType.STATEFUL:
                http.httpRequest(this.status, (error, response, body) => {
                    if (error) {
                        this.log("getStatus() failed: %s", error.message);
                        callback(error);
                    }
                    else if (response.statusCode !== 200) {
                        this.log("getStatus() http request returned http error code: %s", response.statusCode);
                        callback(new Error("Got html error code " + response.statusCode));
                    }
                    else {
                        if (this.debug)
                            this.log(`Body of status response is: '${body}'`);

                        const switchedOn = this.statusPattern.test(body);
                        this.log("Switch is currently %s", switchedOn? "ON": "OFF");
                        callback(null, switchedOn);
                    }
                });
                break;
            case SwitchType.STATELESS:
                callback(null, false);
                break;
            case SwitchType.STATELESS_REVERSE:
                callback(null, true);
                break;
            default:
                callback(new Error("Unrecognized switch type"));
                break;
        }
    },

    setStatus: function (on, callback) {
        if (this.ignoreNextSet) {
            this.ignoreNextSet = false;
            callback();
            return;
        }

        if (this.pullTimer)
            this.pullTimer.resetTimer();

        switch (this.switchType) {
            case SwitchType.STATEFUL:
                this._makeSetRequest(on, callback);
                break;
            case SwitchType.STATELESS:
                if (!on) {
                    callback();
                    break;
                }

                this._makeSetRequest(true, callback);
                break;
            case SwitchType.STATELESS_REVERSE:
                if (on) {
                    callback();
                    break;
                }

                this._makeSetRequest(false, callback);
                break;

            default:
                callback(new Error("Unrecognized switch type"));
                break;
        }
    },

    _makeSetRequest: function (on, callback) {
        const urlObjectArray = on? this.on: this.off;

        http.multipleHttpRequests(urlObjectArray, results => {
            const errors = [];
            const successes = [];

            results.forEach((result, i) => {
                if (result.error) {
                    errors.push({
                        index: i,
                        error: result.error
                    });
                }
                else if (result.response.statusCode !== 200) {
                    errors.push({
                        index: i,
                        error: new Error(`HTTP request returned with error code ${result.response.statusCode}`)
                    });
                }
                else {
                    successes.push({
                        index: i,
                        value: result.body
                    });
                }
            });

            if (errors.length > 0) {
                if (successes.length === 0) {
                    if (errors.length === 1) {
                        const errorMessage = errors[0].error.message;
                        this.log(`Error occurred setting state of switch: ${errorMessage}`);

                        if (errorMessage && !errorMessage.startsWith("HTTP request returned with error code "))
                            this.log(errors[0].error);
                    }
                    else {
                        this.log(`Error occurred setting state of switch with every request (${errors.length}):`);
                        this.log(errors);
                    }
                }
                else {
                    this.log(`${successes.length} requests successfully set switch to ${on? "ON": "OFF"}; ${errors.length} encountered and error:`);
                    this.log(errors);
                }

                callback(new Error("Some or every request returned with an error. See above!"));
            }
            else {
                this.log(`Successfully set switch to ${on ? "ON" : "OFF"}${successes.length > 1 ? ` with every request (${successes.length})` : ""}`);
                callback();
            }

            this.resetSwitchWithTimeoutIfStateless();
        });
    },

    resetSwitchWithTimeoutIfStateless: function () {
        switch (this.switchType) {
            case SwitchType.STATELESS:
                this.log("Resetting switch to OFF");

                setTimeout(() => {
                    this.homebridgeService.setCharacteristic(Characteristic.On, false);
                }, this.timeout);
                break;
            case SwitchType.STATELESS_REVERSE:
                this.log("Resetting switch to ON");

                setTimeout(() => {
                    this.homebridgeService.setCharacteristic(Characteristic.On, true);
                }, this.timeout);
                break;
        }
    },

};