/**
 * Created by sammy on 16/12/1.
 */

const ScryptN = 1 << 18;
const ScryptP = 1;
const ScryptR = 8;
const ScryptDKLen = 32;

var crypto = require('crypto');
var scrypt = require("scrypt");
var ethutil = require('ethereumjs-util');

function GenKey() {
    var privatekey;
    do {
        privatekey = crypto.randomBytes(32);
    } while (!ethutil.isValidPrivate(privatekey));
    var publicKey = ethutil.privateToPublic(privatekey);
    var address = ethutil.pubToAddress(publicKey);
    return {
        prvkey: privatekey,
        pubkey: publicKey,
        addr: address
    }
}

function EncryptKey(key, passwd) {
    var salt = crypto.randomBytes(32);
    var dpasswd = scrypt.hashSync(passwd, {"N":ScryptN, "r":ScryptR, "p":ScryptP}, ScryptDKLen, salt);
    var epasswd = dpasswd.slice(0, 16);
    var fpasswd = dpasswd.slice(16, 32);

    var iv = crypto.randomBytes(16);
    var cipher = crypto.createCipheriv('aes-128-ctr', epasswd, iv);
    var ciphertext = cipher.update(key.prvkey, 'utf8', 'hex');
    ciphertext += cipher.final('hex');

    var mac = ethutil.sha3(Buffer.concat([fpasswd, new Buffer(ciphertext, 'hex')]));

    return {
        address: key.addr.toString('hex'),
        crypto: {
            cipher: 'aes-128-ctr',
            ciphertext: ciphertext,
            cipherparams: {
                iv: iv.toString('hex')
            },
            kdf: 'scrypt',
            kdfparams: {
                dklen: ScryptDKLen,
                n: ScryptN,
                p: ScryptP,
                r: ScryptR,
                salt: salt.toString('hex')
            },
            mac: mac.toString('hex')
        },
        version: 3
    };
}

function DecryptKey(keyJsonStr, passwd) {
    var keyJson = JSON.parse(keyJsonStr);

    var plainText;
    var version = keyJson["version"];
    if (version && version == "3") {
        plainText = DecryptKeyV3(keyJson.crypto, passwd);
    } else {
        throw "version must be 3";
    }
    return plainText;
}

function DecryptKeyV3(cryptoJSON, passwd) {
    var cipher = cryptoJSON.cipher;
    if (cipher != "aes-128-ctr") {
        throw "Cipher not support: " + cipher;
    }

    if (cryptoJSON.kdf != 'scrypt') {
        throw "only support scrypt";
    }
    var salt = new Buffer(cryptoJSON.kdfparams.salt, 'hex');
    var dpasswd = scrypt.hashSync(passwd, {
        "N":cryptoJSON.kdfparams.n,
        "r":cryptoJSON.kdfparams.r,
        "p":cryptoJSON.kdfparams.p
    }, cryptoJSON.kdfparams.dklen, salt);
    var mac = cryptoJSON.mac;
    var iv = new Buffer(cryptoJSON.cipherparams.iv, 'hex');
    var ciphertext = new Buffer(cryptoJSON.ciphertext, 'hex');
    var calculatedMAC = ethutil.sha3(Buffer.concat([dpasswd.slice(16,32), ciphertext])).toString('hex');

    if (calculatedMAC != mac) {
        throw "could not decrypt key with given passphrase"
    }

    var cipher = crypto.createCipheriv('aes-128-ctr', dpasswd.slice(0, 16), iv);

    var plaintext = cipher.update(ciphertext, 'utf8', 'hex');
    plaintext += cipher.final('hex');

    return plaintext;
}

// return buffer
function getKDFKey(cryptoJSON, auth) {
    var salt = cryptoJSON.KDFParams["salt"],
        dklen = cryptoJSON.KDFParams["dklen"],
        n = cryptoJSON.KDFParams["n"],
        r = cryptoJSON.KDFParams["r"],
        p = cryptoJSON.KDFParams["p"],
        c, prf;
    // todo 验证 dklen，n，r，p，c 为数字

    // todo 将dklen，n，r，p，c转换为数字
    if (cryptoJSON.KDF == "scrypt") {
        return scrypt(auth,salt,n,r,p,dklen)
    }

    return "Unsupported KDF: " + cryptoJSON.KDF
}

module.exports = {
    GenKey: GenKey,
    EncryptKey: EncryptKey,
    DecryptKey: DecryptKey
}