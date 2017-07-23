/**
 * A mock homebridge object to simulate all the parts needed to load the plugin
 *
 * @module homebridge
 * @param {object} config Configuration to generate the homebridge accessory
 * @return {object}
 */
module.exports = function(config) {

    /**
     * Does nothing. No really.
     *
     * @function noop
     */
    function noop() {
    }

    return {
        hap: {
            Service: require("hap-nodejs").Service,
            Characteristic: require("hap-nodejs").Characteristic
        },
        /*
        */
        registerAccessory: function(pluginName, accessoryName, constructor) {
            this.accessory = new constructor(noop, config);
        }
    };
};