/*
    This file is part of web3.js.

    web3.js is free software: you can redistribute it and/or modify
    it under the terms of the GNU Lesser General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    web3.js is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU Lesser General Public License for more details.

    You should have received a copy of the GNU Lesser General Public License
    along with web3.js.  If not, see <http://www.gnu.org/licenses/>.
*/
/**
 * @file function.js
 * @author Marek Kotewicz <marek@ethdev.com>
 * @date 2015
 */

var coder = require('../solidity/coder');
var utils = require('../utils/utils');
var formatters = require('./formatters');
var sha3 = require('../utils/sha3');

/**
 * This prototype should be used to call/sendTransaction to solidity functions
 */
var SolidityFunction = function (eth, json, address) {
    this._eth = eth;
    this._inputTypes = json.inputs.map(function (i) {
        return i.type;
    });
    this._outputTypes = json.outputs.map(function (i) {
        return i.type;
    });
    this._constant = json.constant;
    this._name = utils.transformToFullName(json);
    this._address = address;
};

SolidityFunction.prototype.extractCallback = function (args) {
    if (utils.isFunction(args[args.length - 1])) {
        return args.pop(); // modify the args array!
    }
};

SolidityFunction.prototype.extractDefaultBlock = function (args) {
    if (args.length > this._inputTypes.length && !utils.isObject(args[args.length - 1])) {
        return formatters.inputDefaultBlockNumberFormatter(args.pop()); // modify the args array!
    }
};

/**
 * Should be used to create payload from arguments
 *
 * @method toPayload
 * @param {Array} solidity function params
 * @param {Object} optional payload options
 */
SolidityFunction.prototype.toPayload = function (args) {
    var options = {};
    var privkey = '';
    if (args.length > this._inputTypes.length && utils.isString(args[args.length - 1])) {
        privkey = new Buffer(args.pop(), 'hex');
    }
    if (args.length > this._inputTypes.length && utils.isObject(args[args.length - 1])) {
        // options = args[args.length - 1];
        options = args.pop();
    }
    options.from = options.from.slice(0, 2) === '0x' ? options.from : "0x" + options.from;
    options.to = this._address;
    options.payload = '0x' + this.signature() + coder.encodeParams(this._inputTypes, args);
    options.timestamp = (new Date().getTime()) * 1e6;//to ns
    options.nonce = parseInt(utils.random16bits(), 10);
    var clientHash = "0x" + utils.generateHash(options);
    options = utils.sign(options, clientHash, privkey);
    return options;
};

/**
 * Should be used to get function signature
 *
 * @method signature
 * @return {String} function signature
 */
SolidityFunction.prototype.signature = function () {
    return sha3(this._name).slice(0, 8);
};


SolidityFunction.prototype.unpackOutput = function (output) {
    if (!output) {
        return;
    }

    output = output.length >= 2 ? output.slice(2) : output;
    var result = coder.decodeParams(this._outputTypes, output);
    return result.length === 1 ? result[0] : result;
};

/**
 * Calls a contract function.
 *
 * @method call
 * @param {...Object} Contract function arguments
 * @param {function} If the last argument is a function, the contract function
 *   call will be asynchronous, and the callback will be passed the
 *   error and result.
 * @return {String} output bytes
 */
SolidityFunction.prototype.call = function () {
    var args = Array.prototype.slice.call(arguments).filter(function (a) { return a !== undefined; });
    var callback = this.extractCallback(args);
    var defaultBlock = this.extractDefaultBlock(args);
    var payload = this.toPayload(args);


    if (!callback) {
        var output = this._eth.call(payload, defaultBlock);
        return this.unpackOutput(output);
    }

    var self = this;
    this._eth.call(payload, defaultBlock, function (error, output) {
        callback(error, self.unpackOutput(output));
    });
};

/**
 * This is the function which is modified to call the contract's function in Hyperchain
 * Should be used to sendTransaction to solidity function
 *
 * @method sendTransaction
 * @param {...String} params The parameters of the contract's function
 * @param {Object} payloadOptions (optional) The options of the contract's function
 * @param {String} privKey (required) The privete key used to sign
 * @param {object} queryOptions (optional) The options of max last time and interval of polling for result querying
 * @param {function} callback (optional) If the last parameter is a function, it will be treat as callback function which is called with error and result as parameter. (the result means the return value of the contract' function). If there is no function at last position, the function will just return the hash value of transaction
 */
SolidityFunction.prototype.sendTransaction = function () {
    var args = Array.prototype.slice.call(arguments).filter(function (a) { return a !== undefined; });
    var callback = this.extractCallback(args);
    var queryOptions = {
        timeout: 8000,
        interval: 50,
    };
    if (utils.isObject(args[args.length - 1])){
        let op = args.pop();
        queryOptions.timeout = op.timeout ? op.timeout : queryOptions.timeout;
        queryOptions.interval = op.interval ? op.interval : queryOptions.interval;
        
    }

    var payload = this.toPayload(args);

    if (!callback) {
        return this.getResult(this._eth.invokeContract(payload), queryOptions);
    }

    else {
        this._eth.invokeContract(payload, (error, result) => {
            if (error) {
                callback(error);
            } else {
                this.getResult(result, queryOptions, callback);
            }
        });
    }
};

/**
 * Should be call to get transaction result in Hyperchain
 * @method getResult
 * @param {String} hash (required) The hash value of transaction
 * @param {Object} options (optional) The config option of query, may have properties('interval' set the interval of polling, 'timeout' set the max last time of polling)
 * @param {Function} callback (optional) The callback function shoulb be able to receipt {Error} and {Array} as params
 * @return {Object} result
 */
SolidityFunction.prototype.getResult = function () {
    // need wait for receipt
    let startTime = new Date().getTime();

    // extract the callback and hash value of transaction
    let args = Array.prototype.slice.call(arguments).filter(function (a) { return a !== undefined; });
    let callback = null;
    let hash = "";

    let options = {
        timeout: 8000,
        interval: 50
    }
    if (utils.isFunction(args[args.length - 1])) {
        callback = args.pop();
    }
    if (utils.isObject(args[args.length - 1])){
        options.timeout = args[args.length - 1].timeout ? args[args.length - 1].timeout : options.timeout;
        options.interval = args[args.length - 1].interval ? args[args.length - 1].interval : options.interval;
        args.pop();
    }

    if (utils.isString(args[args.length - 1])) {
        hash = args.pop();
    }

    // The function used to get transaction result by request
    let getResp = function () {

        if ((new Date().getTime() - startTime < options.timeout)) {
            this._eth.getTransactionReceipt(hash, (err, receipt) => {
                if (receipt && receipt.ret !== undefined) {

                    // decode the return value
                    // * Note: the sting which consist of one or more return values is start with '0x' now, and it can not be processed by the coder.decodeParams function. The function just map the types to the certain length strings, and extract the strings by index from the input string. Thus, replace the '0x' in the ret string by ''. 
                    let encodeString = receipt.ret.replace('0x', '');
                    let result = coder.decodeParams(this._outputTypes, encodeString);
                    if (callback) {
                        callback(null, result);
                    }
                    else {
                        return result;
                    }
                }
                else {
                    setTimeout(getResp, options.interval);
                }
            });
        }
        else {
            let error = new Error("getTransactionReceipt timeout...");
            if (callback) {
                callback(error);
            }
            else {
                return error;
    }

        }
    }.bind(this);
    getResp();
};

/**
 * Should be used to estimateGas of solidity function
 *
 * @method estimateGas
 */
SolidityFunction.prototype.estimateGas = function () {
    var args = Array.prototype.slice.call(arguments);
    var callback = this.extractCallback(args);
    var payload = this.toPayload(args);

    if (!callback) {
        return this._eth.estimateGas(payload);
    }

    this._eth.estimateGas(payload, callback);
};

/**
 * Return the encoded data of the call
 *
 * @method getData
 * @return {String} the encoded data
 */
SolidityFunction.prototype.getData = function () {
    var args = Array.prototype.slice.call(arguments);
    var payload = this.toPayload(args);

    return payload.data;
};

/**
 * Should be used to get function display name
 *
 * @method displayName
 * @return {String} display name of the function
 */
SolidityFunction.prototype.displayName = function () {
    return utils.extractDisplayName(this._name);
};

/**
 * Should be used to get function type name
 *
 * @method typeName
 * @return {String} type name of the function
 */
SolidityFunction.prototype.typeName = function () {
    return utils.extractTypeName(this._name);
};

/**
 * Should be called to get rpc requests from solidity function
 *
 * @method request
 * @returns {Object}
 */
SolidityFunction.prototype.request = function () {
    var args = Array.prototype.slice.call(arguments);
    var callback = this.extractCallback(args);
    var payload = this.toPayload(args);
    var format = this.unpackOutput.bind(this);

    return {
        method: this._constant ? 'eth_call' : 'eth_sendTransaction',
        callback: callback,
        params: [payload],
        format: format
    };
};

/**
 * Should be called to execute function
 *
 * @method execute
 */
SolidityFunction.prototype.execute = function () {
    var transaction = !this._constant;

    // send transaction
    if (transaction) {
        return this.sendTransaction.apply(this, Array.prototype.slice.call(arguments));
    }

    // call
    return this.call.apply(this, Array.prototype.slice.call(arguments));
};

/**
 * Should be called to attach function to contract
 *
 * @method attachToContract
 * @param {Contract}
 */
SolidityFunction.prototype.attachToContract = function (contract) {
    var execute = this.execute.bind(this);
    execute.request = this.request.bind(this);
    execute.call = this.call.bind(this);
    execute.sendTransaction = this.sendTransaction.bind(this);
    execute.estimateGas = this.estimateGas.bind(this);
    execute.getData = this.getData.bind(this);
    var displayName = this.displayName();
    if (!contract[displayName]) {
        contract[displayName] = execute;
    }
    contract[displayName][this.typeName()] = execute; // circular!!!!
};

module.exports = SolidityFunction;

