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
 * @file eth.js
 * @author Marek Kotewicz <marek@ethdev.com>
 * @author Fabian Vogelsteller <fabian@ethdev.com>
 * @date 2015
 */

"use strict";

var formatters = require('../formatters');
var utils = require('../../utils/utils');
var Method = require('../method');
var Property = require('../property');
var c = require('../../utils/config');
var Contract = require('../contract');
var watches = require('./watches');
var Filter = require('../filter');
var IsSyncing = require('../syncing');
var namereg = require('../namereg');
var Iban = require('../iban');
var transfer = require('../transfer');

var blockCall = function (args) {
    return (utils.isString(args[0]) && args[0].indexOf('0x') === 0) ? "eth_getBlockByHash" : "eth_getBlockByNumber";
};

var transactionFromBlockCall = function (args) {
    return (utils.isString(args[0]) && args[0].indexOf('0x') === 0) ? 'eth_getTransactionByBlockHashAndIndex' : 'eth_getTransactionByBlockNumberAndIndex';
};

var uncleCall = function (args) {
    return (utils.isString(args[0]) && args[0].indexOf('0x') === 0) ? 'eth_getUncleByBlockHashAndIndex' : 'eth_getUncleByBlockNumberAndIndex';
};

var getBlockTransactionCountCall = function (args) {
    return (utils.isString(args[0]) && args[0].indexOf('0x') === 0) ? 'eth_getBlockTransactionCountByHash' : 'eth_getBlockTransactionCountByNumber';
};

var uncleCountCall = function (args) {
    return (utils.isString(args[0]) && args[0].indexOf('0x') === 0) ? 'eth_getUncleCountByBlockHash' : 'eth_getUncleCountByBlockNumber';
};

function Eth(web3) {
    this._requestManager = web3._requestManager;

    var self = this;

    methods().forEach(function(method) {
        method.attachToObject(self);
        method.setRequestManager(self._requestManager);
    });

    properties().forEach(function(p) {
        p.attachToObject(self);
        p.setRequestManager(self._requestManager);
    });


    this.iban = Iban;
    this.sendIBANTransaction = transfer.bind(null, this);
}

Object.defineProperty(Eth.prototype, 'defaultBlock', {
    get: function () {
        return c.defaultBlock;
    },
    set: function (val) {
        c.defaultBlock = val;
        return val;
    }
});

Object.defineProperty(Eth.prototype, 'defaultAccount', {
    get: function () {
        return c.defaultAccount;
    },
    set: function (val) {
        c.defaultAccount = val;
        return val;
    }
});

var methods = function () {
    // var getAccounts = new Method({
    //     name: 'getAccounts',
    //     call: 'account_getAccounts',
    //     params: 0
    // });

    var getBalance = new Method({
        name: 'getBalance',
        call: 'account_getBalance',
        params: 1
    });

    var getStorageAt = new Method({
        name: 'getStorageAt',
        call: 'eth_getStorageAt',
        params: 3,
        inputFormatter: [null, utils.toHex, formatters.inputDefaultBlockNumberFormatter]
    });

    var getCode = new Method({
        name: 'getCode',
        call: 'contract_getCode',
        params: 1,
        inputFormatter: [formatters.inputAddressFormatter]
    });

    var getBlock = new Method({
        name: 'getBlock',
        call: blockCall,
        params: 2,
        inputFormatter: [formatters.inputBlockNumberFormatter, function (val) { return !!val; }],
        outputFormatter: formatters.outputBlockFormatter
    });

    var getUncle = new Method({
        name: 'getUncle',
        call: uncleCall,
        params: 2,
        inputFormatter: [formatters.inputBlockNumberFormatter, utils.toHex],
        outputFormatter: formatters.outputBlockFormatter,

    });

    // var getCompilers = new Method({
    //     name: 'getCompilers',
    //     call: 'eth_getCompilers',
    //     params: 0
    // });

    var getBlockTransactionCount = new Method({
        name: 'getBlockTransactionCount',
        call: getBlockTransactionCountCall,
        params: 1,
        inputFormatter: [formatters.inputBlockNumberFormatter],
        outputFormatter: utils.toDecimal
    });

    var getBlockUncleCount = new Method({
        name: 'getBlockUncleCount',
        call: uncleCountCall,
        params: 1,
        inputFormatter: [formatters.inputBlockNumberFormatter],
        outputFormatter: utils.toDecimal
    });

    var getTransaction = new Method({
        name: 'getTransaction',
        call: 'tx_getTransactionByHash',
        params: 1,
        outputFormatter: formatters.outputTransactionFormatter
    });

    var getTransactions = new Method({
        name: 'getTransactions',
        call: 'tx_getTransactions',
        params:1
    });

    var getDiscardTransactions = new Method({
        name: 'getDiscardTransactions',
        call: 'tx_getDiscardTransactions',
        params: 0
    });

    var getTransactionByHashNIdx = new Method({
        name: 'getTransactionByHashNIdx',
        call: 'tx_getTransactionByBlockHashAndIndex',
        params: 2,
        inputFormatter:[formatters.inputBlockNumberFormatter,null],
        outputFormatter: formatters.outputTransactionFormatter
    });

    var getTransactionByNumNIdx = new Method({
        name: 'getTransactionByNumNIdx',
        call: 'tx_getTransactionByBlockNumberAndIndex',
        params: 2,
        outputFormatter: formatters.outputTransactionFormatter
    });

    var getTransactionFromBlock = new Method({
        name: 'getTransactionFromBlock',
        call: transactionFromBlockCall,
        params: 2,
        inputFormatter: [formatters.inputBlockNumberFormatter, utils.toHex],
        outputFormatter: formatters.outputTransactionFormatter
    });

    var getTransactionReceipt = new Method({
        name: 'getTransactionReceipt',
        call: 'tx_getTransactionReceipt',
        params: 1,
        outputFormatter: formatters.outputTransactionReceiptFormatter
    });

    var getTransactionCount = new Method({
        name: 'getTransactionCount',
        call: 'tx_getTransactionsCount',
        params: 0,
        outputFormatter: utils.toDecimal
    });

    // var getTransactionCountByAddr = new Method({
    //     name: 'getTransactionCountByAddr',
    //     call: 'tx_getTransactionCountByAddr',
    //     params:1
    // });

    var getSignHash = new Method({
        name: 'getSignHash',
        call: 'tx_getSignHash',
        params: 1
        // inputFormatter: formatters.inputTransactionFormatter
    });

    var sendRawTransaction = new Method({
        name: 'sendRawTransaction',
        call: 'contract_deployContract',
        params: 1,
        inputFormatter: [null]
    });

    var sendTransactionTest = new Method({
        name: 'sendTransactionTest',
        call: 'tx_sendTransactionTest',
        params: 1,
        inputFormatter: [null]
    });

    var sendTransaction = new Method({
        name: 'sendTransaction',
        call: 'tx_sendTransaction',
        params: 1,
        inputFormatter: [formatters.inputTransactionFormatter]
    });

    // var sign = new Method({
    //     name: 'sign',
    //     call: 'eth_sign',
    //     params: 2,
    //     inputFormatter: [formatters.inputAddressFormatter, null]
    // });

    // var call = new Method({
    //     name: 'call',
    //     call: 'eth_call',
    //     params: 2,
    //     inputFormatter: [formatters.inputCallFormatter, formatters.inputDefaultBlockNumberFormatter]
    // });

    // var estimateGas = new Method({
    //     name: 'estimateGas',
    //     call: 'eth_estimateGas',
    //     params: 1,
    //     inputFormatter: [formatters.inputCallFormatter],
    //     outputFormatter: utils.toDecimal
    // });

    var compileSolidity = new Method({
        name: 'compile.solidity',
        call: 'contract_compileContract',
        params: 1
    });

    // var compileLLL = new Method({
    //     name: 'compile.lll',
    //     call: 'eth_compileLLL',
    //     params: 1
    // });

    // var compileSerpent = new Method({
    //     name: 'compile.serpent',
    //     call: 'eth_compileSerpent',
    //     params: 1
    // });

    var latestBlock= new Method({
        name: 'latestBlock',
        call: 'block_latestBlock',
        params: 0,
        outputFormatter: formatters.outputBlockFormatter

    });
    var getBlockByHash= new Method({
        name: 'getBlockByHash',
        call: 'block_getBlockByHash',
        params: 1,
        // inputFormatter: [formatters.inputBlockNumberFormatter, function (val) { return !!val; }],
        outputFormatter: formatters.outputBlockFormatter
    });
    var getBlockByNumber= new Method({
        name: 'getBlockByNumber',
        call: 'block_getBlockByNumber',
        params: 1,
        // inputFormatter: [formatters.inputBlockNumberFormatter, function (val) { return !!val; }],
        outputFormatter: formatters.outputBlockFormatter
    });
    var getBlocks = new Method({
        name: 'getBlocks',
        call: 'block_getBlocks',
        params: 1
    });
    var getExeTime = new Method({
        name: 'getExeTime',
        call: 'tx_getTxAvgTimeByBlockNumber',
        params: 1,
        outputFormatter:utils.toDecimal
    });
    var getNodes = new Method({
        name: 'getNodes',
        call: 'node_getNodes',
        params: 0
    });
    var deployContract = new Method({
        name: 'deployContract',
        call: 'contract_deployContract',
        params: 1
    });

    var invokeContract = new Method({
        name: 'invokeContract',
        call: 'contract_invokeContract',
        params: 1
    });

    var getBlocksWithRange = new Method({
        name: 'getBlocksWithRange',
        call: 'block_getBlocks',
        params: 1
    });
    return [
        // getAccounts,
        getBalance,
        getStorageAt,
        getCode,
        getBlock,
        getBlocks,
        getUncle,
        // getCompilers,
        getBlockTransactionCount,
        getBlockUncleCount,
        getTransaction,
        getTransactions,
        getDiscardTransactions,
        getTransactionByHashNIdx,
        getTransactionByNumNIdx,
        getTransactionFromBlock,
        getTransactionReceipt,
        getTransactionCount,
        getSignHash,
        sendRawTransaction,
        sendTransaction,
        compileSolidity,
        // compileLLL,
        // compileSerpent,
        latestBlock,
        getBlockByHash,
        getBlockByNumber,
        getExeTime,
        getNodes,
        deployContract,
        invokeContract,
        getBlocksWithRange
    ];
};


var properties = function () {
    return [
        new Property({
            name: 'coinbase',
            getter: 'eth_coinbase'
        }),
        new Property({
            name: 'mining',
            getter: 'eth_mining'
        }),
        new Property({
            name: 'hashrate',
            getter: 'eth_hashrate',
            outputFormatter: utils.toDecimal
        }),
        new Property({
            name: 'syncing',
            getter: 'eth_syncing',
            outputFormatter: formatters.outputSyncingFormatter
        }),
        new Property({
            name: 'gasPrice',
            getter: 'eth_gasPrice',
            outputFormatter: formatters.outputBigNumberFormatter
        }),
        new Property({
            name: 'accounts',
            getter: 'account_getAccounts'
        }),
        new Property({
            name: 'blockNumber',
            getter: 'eth_blockNumber',
            outputFormatter: utils.toDecimal
        }),
        new Property({
            name: 'protocolVersion',
            getter: 'eth_protocolVersion'
        })
    ];
};

Eth.prototype.contract = function (abi) {
    var factory = new Contract(this, abi);
    return factory;
};

Eth.prototype.filter = function (fil, callback) {
    return new Filter(this._requestManager, fil, watches.eth(), formatters.outputLogFormatter, callback);
};

Eth.prototype.namereg = function () {
    return this.contract(namereg.global.abi).at(namereg.global.address);
};

Eth.prototype.icapNamereg = function () {
    return this.contract(namereg.icap.abi).at(namereg.icap.address);
};

Eth.prototype.isSyncing = function (callback) {
    return new IsSyncing(this._requestManager, callback);
};

module.exports = Eth;

