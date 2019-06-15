'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
const assert = require('assert');
const bitcoinjs = require('bitcoinjs-lib');
const dhttpCallback = require('dhttp/200');
// use Promises
const dhttp = options =>
  new Promise((resolve, reject) => {
    return dhttpCallback(options, (err, data) => {
      if (err) return reject(err);
      else return resolve(data);
    });
  });
function broadcast(txHex) {
  return dhttp({
    method: 'POST',
    url: APIURL + '/t/push',
    body: txHex,
  });
}
exports.broadcast = broadcast;
function mine(count) {
  return dhttp({
    method: 'POST',
    url: `${APIURL}/r/generate?count=${count}&key=${APIPASS}`,
  });
}
exports.mine = mine;
function height() {
  return dhttp({
    method: 'GET',
    url: APIURL + '/b/best/height',
  });
}
exports.height = height;
function fetch(txId) {
  return dhttp({
    method: 'GET',
    url: `${APIURL}/t/${txId}/json`,
  });
}
exports.fetch = fetch;
function unspents(address) {
  return dhttp({
    method: 'GET',
    url: `${APIURL}/a/${address}/unspents`,
  });
}
exports.unspents = unspents;
function _faucetRequest(address, value) {
  return dhttp({
    method: 'POST',
    url: `${APIURL}/r/faucet?address=${address}&value=${value}&key=${APIPASS}`,
  });
}
async function faucet(address, value) {
  let count = 0;
  let _unspents = [];
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const randInt = (min, max) =>
    min + Math.floor((max - min + 1) * Math.random());
  while (_unspents.length === 0) {
    if (count > 0) {
      if (count >= 5) throw new Error('Missing Inputs');
      console.log('Missing Inputs, retry #' + count);
      await sleep(randInt(150, 250));
    }
    const txId = await _faucetRequest(address, value).then(
      v => v, // Pass success value as is
      async err => {
        // Bad Request error is fixed by making sure height is >= 432
        const currentHeight = await height();
        if (err.message === 'Bad Request' && currentHeight < 432) {
          await mine(432 - currentHeight);
          return _faucetRequest(address, value);
        } else if (err.message === 'Bad Request' && currentHeight >= 432) {
          return _faucetRequest(address, value);
        } else {
          throw err;
        }
      },
    );
    await sleep(randInt(50, 150));
    const results = await unspents(address);
    _unspents = results.filter(x => x.txId === txId);
    count++;
  }
  return _unspents.pop();
}
exports.faucet = faucet;
async function faucetComplex(output, value) {
  checkLib('faucetComplex');
  const keyPair = bitcoin.ECPair.makeRandom({ network: NETWORK });
  const p2pkh = bitcoin.payments.p2pkh({
    pubkey: keyPair.publicKey,
    network: NETWORK,
  });
  const unspent = await faucet(p2pkh.address, value * 2);
  const txvb = new bitcoin.TransactionBuilder(NETWORK);
  txvb.addInput(unspent.txId, unspent.vout, undefined, p2pkh.output);
  txvb.addOutput(output, value);
  txvb.sign(0, keyPair);
  const txv = txvb.build();
  await broadcast(txv.toHex());
  return {
    height: -1,
    txId: txv.getId(),
    vout: 0,
    value,
  };
}
exports.faucetComplex = faucetComplex;
async function verify(txo) {
  const tx = await fetch(txo.txId);
  const txoActual = tx.outs[txo.vout];
  if (txo.address) assert.strictEqual(txoActual.address, txo.address);
  if (txo.value) assert.strictEqual(txoActual.value, txo.value);
}
exports.verify = verify;
function getAddress(node, myNetwork) {
  return bitcoin.payments.p2pkh({ pubkey: node.publicKey, network: myNetwork })
    .address;
}
function randomAddress() {
  checkLib('randomAddress');
  return getAddress(
    bitcoin.ECPair.makeRandom({
      network: bitcoin.networks.regtest,
    }),
    bitcoin.networks.regtest,
  );
}
exports.randomAddress = randomAddress;
let APIPASS = process.env.APIPASS || 'satoshi';
let APIURL = process.env.APIURL || 'http://127.0.0.1:8080/1';
let bitcoin = bitcoinjs;
let NETWORK = bitcoin.networks.regtest;
exports.RANDOM_ADDRESS = randomAddress();
exports.network = NETWORK;
function checkLib(funcName) {
  if (
    !bitcoin ||
    !bitcoin.networks ||
    !bitcoin.networks.regtest ||
    !bitcoin.ECPair ||
    !bitcoin.ECPair.makeRandom ||
    !bitcoin.payments ||
    !bitcoin.TransactionBuilder
  ) {
    throw new Error(
      'bitcoinjs-lib is not loaded correctly. Make sure >=4.0.0 ' +
        'is installed as a peerDependency in order to run ' +
        funcName,
    );
  }
}
function injectBitcoinJsLib(newLib) {
  bitcoin = newLib;
  NETWORK = bitcoin.networks.regtest;
  exports.network = NETWORK;
  exports.RANDOM_ADDRESS = randomAddress();
}
exports.injectBitcoinJsLib = injectBitcoinJsLib;
function changeUrl(newUrl) {
  APIURL = newUrl;
}
exports.changeUrl = changeUrl;
function changePass(newPass) {
  APIPASS = newPass;
}
exports.changePass = changePass;
