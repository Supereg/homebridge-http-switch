"use strict";

let Service, Characteristic, api;

const _http_base = require("homebridge-http-base");
const http = _http_base.http;
const configParser = _http_base.configParser;
const PullTimer = _http_base.PullTimer;
const notifications = _http_base.notifications;
const MQTTClient = _http_base.MQTTClient;
const Cache = _http_base.Cache;
const utils = _http_base.utils;

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
    STATELESS_REVERSE: "stateless-reverse",
    TOGGLE: "toggle",
    TOGGLE_REVERSE: "toggle-reverse",
});

function HTTP_SWITCH(log, config) {
    this.log = log;
    this.name = config.name;
    this.debug = config.debug || false;

    this.switchType = utils.enumValueOf(SwitchType, config.switchType, SwitchType.STATEFUL);
    if (!this.switchType) {
        this.log.warn(`'${this.switchType}' is a invalid switchType! Aborting...`);
        return;
    }

    this.timeout = config.timeout;
    if (typeof this.timeout !== 'number') {
        this.timeout = 1000;
    }

    if (config.serialNumber !== undefined && typeof config.serialNumber === "string") {
        this.serialNumber = config.serialNumber;
    }

    if (this.switchType === SwitchType.STATEFUL) {
        this.statusPattern = /1/;
        if (config.statusPattern) {
            if (typeof config.statusPattern === "string")
                this.statusPattern = new RegExp(config.statusPattern);
            else
                this.log.warn("Property 'statusPattern' was given in an unsupported type. Using default one!");
        }

        this.statusCache = new Cache(config.statusCache, 0);
        if (config.statusCache && typeof config.statusCache !== "number")
            this.log.warn("Property 'statusCache' was given in an unsupported type. Using default one!");
    }

    /** @namespace config.multipleUrlExecutionStrategy */
    if (config.multipleUrlExecutionStrategy) {
        const result = http.setMultipleUrlExecutionStrategy(config.multipleUrlExecutionStrategy);

        if (!result)
            this.log.warn("'multipleUrlExecutionStrategy' has an invalid value (" + config.multipleUrlExecutionStrategy + "). Continuing with defaults!");
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
            this.log("'auth.username' and/or 'auth.password' was not set!");
        else {
            if (this.on) {
                this.on.forEach(urlObject => {
                    urlObject.auth.username = config.auth.username;
                    urlObject.auth.password = config.auth.password;

                    if (typeof config.auth.sendImmediately === "boolean")
                        urlObject.auth.sendImmediately = config.auth.sendImmediately;
                });
            }
            if (this.off) {
                this.off.forEach(urlObject => {
                    urlObject.auth.username = config.auth.username;
                    urlObject.auth.password = config.auth.password;

                    if (typeof config.auth.sendImmediately === "boolean")
                        urlObject.auth.sendImmediately = config.auth.sendImmediately;
                });
            }
            if (this.status) {
                this.status.auth.username = config.auth.username;
                this.status.auth.password = config.auth.password;

                if (typeof config.auth.sendImmediately === "boolean")
                    this.status.auth.sendImmediately = config.auth.sendImmediately;
            }
        }
    }

    this.homebridgeService = new Service.Switch(this.name);
    const onCharacteristic = this.homebridgeService.getCharacteristic(Characteristic.On)
        .on("get", this.getStatus.bind(this))
        .on("set", this.setStatus.bind(this));


    switch (this.switchType) {
        case SwitchType.TOGGLE_REVERSE:
        case SwitchType.STATELESS_REVERSE:
            onCharacteristic.updateValue(true);
            break;
    }

    /** @namespace config.pullInterval */
    if (config.pullInterval) {
        if (this.switchType === SwitchType.STATEFUL) {
            this.pullTimer = new PullTimer(this.log, config.pullInterval, this.getStatus.bind(this), value => {
                this.homebridgeService.getCharacteristic(Characteristic.On).updateValue(value);
            });
            this.pullTimer.start();
        }
        else
            this.log("'pullInterval' was specified, however switch is stateless. Ignoring property and not enabling pull updates!");
    }

    if (config.notificationID) {
        if (this.switchType === SwitchType.STATEFUL
            || this.switchType === SwitchType.TOGGLE || this.switchType === SwitchType.TOGGLE_REVERSE) {
            /** @namespace config.notificationPassword */
            /** @namespace config.notificationID */
            notifications.enqueueNotificationRegistrationIfDefined(api, log, config.notificationID, config.notificationPassword, this.handleNotification.bind(this));
        }
        else
            this.log("'notificationID' was specified, however switch is stateless. Ignoring property and not enabling notifications!");
    }

    if (config.mqtt) {
        if (this.switchType === SwitchType.STATEFUL
            || this.switchType === SwitchType.TOGGLE || this.switchType === SwitchType.TOGGLE_REVERSE) {
            let options;
            try {
                options = configParser.parseMQTTOptions(config.mqtt)
            } catch (error) {
                this.log.error("Error occurred while parsing MQTT property: " + error.message);
                this.log.error("MQTT will not be enabled!");
            }

            if (options) {
                try {
                    this.mqttClient = new MQTTClient(this.homebridgeService, options, this.log);
                    this.mqttClient.connect();
                } catch (error) {
                    this.log.error("Error occurred creating mqtt client: " + error.message);
                }
            }
        }
        else
            this.log("'mqtt' options were specified, however switch is stateless. Ignoring it!");
    }

    this.log("Switch successfully configured...");
    if (this.debug) {
        this.log("Switch started with the following options: ");
        this.log("  - switchType: " + this.switchType);
        if (this.switchType === SwitchType.STATEFUL)
            this.log("  - statusPattern: " + this.statusPattern);

        if (this.auth)
            this.log("  - auth options: " + JSON.stringify(this.auth));

        if (this.on)
            this.log("  - onUrls: " + JSON.stringify(this.on));
        if (this.off)
            this.log("  - offUrls: " + JSON.stringify(this.off));
        if (this.status)
            this.log("  - statusUrl: " + JSON.stringify(this.status));

        if (this.switchType === SwitchType.STATELESS || this.switchType === SwitchType.STATELESS_REVERSE)
            this.log("  - timeout for stateless switch: " + this.timeout);

        if (this.pullTimer)
            this.log("  - pullTimer started with interval " + config.pullInterval);

        if (config.notificationID)
            this.log("  - notificationsID specified: " + config.notificationID);

        if (this.mqttClient) {
            const options = this.mqttClient.mqttOptions;
            this.log(`  - mqtt client instantiated: ${options.protocol}://${options.host}:${options.port}`);
            this.log("     -> subscribing to topics:");

            for (const topic in this.mqttClient.subscriptions) {
                if (!this.mqttClient.subscriptions.hasOwnProperty(topic))
                    continue;

                this.log(`         - ${topic}`);
            }
        }
    }
}

HTTP_SWITCH.prototype = {

    parseUrls: function (config) {
        /** @namespace config.onUrl */
        if (this.switchType !== SwitchType.STATELESS_REVERSE) {
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
        else if (config.onUrl)
            this.log.warn(`Property 'onUrl' is defined though it is not used with switchType ${this.switchType}. Ignoring it!`);

        /** @namespace config.offUrl */
        if (this.switchType !== SwitchType.STATELESS) {
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
        else if (config.offUrl)
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
            .setCharacteristic(Characteristic.SerialNumber, this.serialNumber || "SW01")
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

        this.homebridgeService.getCharacteristic(characteristic).updateValue(value);
    },

    getStatus: function (callback) {
        if (this.pullTimer)
            this.pullTimer.resetTimer();

        switch (this.switchType) {
            case SwitchType.STATEFUL:
                if (!this.statusCache.shouldQuery()) {
                    const value = this.homebridgeService.getCharacteristic(Characteristic.On).value;
                    if (this.debug)
                        this.log(`getStatus() returning cached value '${value? "ON": "OFF"}'${this.statusCache.isInfinite()? " (infinite cache)": ""}`);
                    callback(null, value);
                    break;
                }

                if (this.debug)
                    this.log("getStatus() doing http request...");

                http.httpRequest(this.status, (error, response, body) => {
                    if (error) {
                        this.log("getStatus() failed: %s", error.message);
                        callback(error);
                    }
                    else if (!(http.isHttpSuccessCode(response.statusCode) || http.isHttpRedirectCode(response.statusCode))) {
                        this.log("getStatus() http request returned http error code: %s", response.statusCode);
                        callback(new Error("Got html error code " + response.statusCode));
                    }
                    else {
                        if (this.debug)
                            this.log(`getStatus() request returned successfully (${response.statusCode}). Body: '${body}'`);

                        if (http.isHttpRedirectCode(response.statusCode)) {
                            this.log("getStatus() http request return with redirect status code (3xx). Accepting it anyways");
                        }

                        const switchedOn = this.statusPattern.test(body);
                        if (this.debug)
                            this.log("Switch is currently %s", switchedOn? "ON": "OFF");

                        this.statusCache.queried(); // we only update lastQueried on successful query
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
            case SwitchType.TOGGLE:
            case SwitchType.TOGGLE_REVERSE:
                callback(null, this.homebridgeService.getCharacteristic(Characteristic.On).value);
                break;

            default:
                callback(new Error("Unrecognized switch type"));
                break;
        }
    },

    setStatus: function (on, callback) {
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
            case SwitchType.TOGGLE:
            case SwitchType.TOGGLE_REVERSE:
                this._makeSetRequest(on, callback);
                break;

            default:
                callback(new Error("Unrecognized switch type"));
                break;
        }
    },

    _makeSetRequest: function (on, callback) {
        const urlObjectArray = on? this.on: this.off;

        if (this.debug)
            this.log("setStatus() doing http request...");

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
                else if (!(http.isHttpSuccessCode(result.response.statusCode) || http.isHttpRedirectCode(result.response.statusCode))) {
                    errors.push({
                        index: i,
                        error: new Error(`HTTP request returned with error code ${result.response.statusCode}`),
                        value: result.body
                    });
                }
                else {
                    if (http.isHttpRedirectCode(result.response.statusCode)) {
                        this.log("setStatus() http request return with redirect status code (3xx). Accepting it anyways");
                    }

                    successes.push({
                        index: i,
                        value: result.body
                    });
                }
            });

            if (errors.length > 0) {
                if (successes.length === 0) {
                    if (errors.length === 1) {
                        const errorObject = errors[0];
                        const errorMessage = errorObject.error.message;
                        this.log(`Error occurred setting state of switch: ${errorMessage}`);

                        if (errorMessage && !errorMessage.startsWith("HTTP request returned with error code "))
                            this.log(errorObject.error);
                        else if (errorObject.value && this.debug)
                            this.log("Body of set response is: " + errorObject.value);
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
                if (this.debug)
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
