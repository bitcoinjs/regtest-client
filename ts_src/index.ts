import * as assert from 'assert';

interface ECPairInterface {
  compressed: boolean;
  network: Network;
  privateKey?: Buffer;
  publicKey?: Buffer;
  toWIF(): string;
  sign(hash: Buffer): Buffer;
  verify(hash: Buffer, signature: Buffer): boolean;
  getPublicKey?(): Buffer;
}

interface Network {
  messagePrefix: string;
  bech32: string;
  bip32: Bip32;
  pubKeyHash: number;
  scriptHash: number;
  wif: number;
}

interface Bip32 {
  public: number;
  private: number;
}

type DhttpResponse = Unspent[] | Request | string | number | void | null;

interface Unspent {
  value: number;
  txId: string;
  vout: number;
  address?: string;
  height?: number;
}

interface Input {
  txId: string;
  vout: number;
  script: string;
  sequence: string;
}

interface Output {
  value: number;
  script: string;
  address?: string;
}

interface Request {
  method?: string;
  url?: string;
  body?: string;
}

interface Transaction {
  txId: string;
  txHex: string;
  vsize: number;
  version: number;
  locktime: number;
  ins: Input[];
  outs: Output[];
}

const dhttpCallback = require('dhttp/200');

let RANDOM_ADDRESS: string | undefined;

export class RegtestUtils {
  network: Network;

  constructor(
    private bitcoinjs: any,
    private _APIPASS: string = process.env.APIPASS || 'satoshi',
    private _APIURL: string = process.env.APIURL || 'http://127.0.0.1:8080/1',
  ) {
    if (this.bitcoinjs === undefined) {
      throw new Error(
        'You must create an instance by passing bitcoinjs-lib >=4.0.3',
      );
    }
    this.network = (this.bitcoinjs.networks || {}).regtest;
  }

  get RANDOM_ADDRESS(): string {
    if (RANDOM_ADDRESS === undefined) {
      RANDOM_ADDRESS = this.randomAddress();
    }
    return RANDOM_ADDRESS;
  }

  // use Promises
  async dhttp(options: Request): Promise<DhttpResponse> {
    return new Promise((resolve, reject): void => {
      return dhttpCallback(options, (err: Error, data: DhttpResponse) => {
        if (err) return reject(err);
        else return resolve(data);
      });
    });
  }

  async broadcast(txHex: string): Promise<null> {
    return this.dhttp({
      method: 'POST',
      url: this._APIURL + '/t/push',
      body: txHex,
    }) as Promise<null>;
  }

  async mine(count: number): Promise<string[]> {
    return this.dhttp({
      method: 'POST',
      url: `${this._APIURL}/r/generate?count=${count}&key=${this._APIPASS}`,
    }) as Promise<string[]>;
  }

  async height(): Promise<number> {
    return this.dhttp({
      method: 'GET',
      url: this._APIURL + '/b/best/height',
    }) as Promise<number>;
  }

  async fetch(txId: string): Promise<Transaction> {
    return this.dhttp({
      method: 'GET',
      url: `${this._APIURL}/t/${txId}/json`,
    }) as Promise<Transaction>;
  }

  async unspents(address: string): Promise<Unspent[]> {
    return this.dhttp({
      method: 'GET',
      url: `${this._APIURL}/a/${address}/unspents`,
    }) as Promise<Unspent[]>;
  }

  async faucet(address: string, value: number): Promise<Unspent> {
    let count = 0;
    let _unspents: Unspent[] = [];
    const sleep = (ms: number): Promise<void> =>
      new Promise((resolve): number => setTimeout(resolve, ms));
    const randInt = (min: number, max: number): number =>
      min + Math.floor((max - min + 1) * Math.random());
    const _faucetRequest = _faucetRequestMaker(
      this.dhttp,
      this._APIURL,
      this._APIPASS,
    );
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
          const currentHeight = (await this.height()) as number;
          if (err.message === 'Bad Request' && currentHeight < 432) {
            await this.mine(432 - currentHeight);
            return _faucetRequest(address, value);
          } else if (err.message === 'Bad Request' && currentHeight >= 432) {
            return _faucetRequest(address, value);
          } else {
            throw err;
          }
        },
      );

      await sleep(randInt(50, 150));

      const results = await this.unspents(address);

      _unspents = results.filter(x => x.txId === txId);

      count++;
    }

    return _unspents.pop()!;
  }

  async faucetComplex(output: Buffer, value: number): Promise<Unspent> {
    checkLib(this.bitcoinjs, 'faucetComplex');
    const keyPair = this.bitcoinjs.ECPair.makeRandom({ network: this.network });
    const p2pkh = this.bitcoinjs.payments.p2pkh({
      pubkey: keyPair.publicKey,
      network: this.network,
    });

    const unspent = await this.faucet(p2pkh.address!, value * 2);

    const txvb = new this.bitcoinjs.TransactionBuilder(this.network);
    txvb.addInput(unspent.txId, unspent.vout, undefined, p2pkh.output!);
    txvb.addOutput(output, value);
    txvb.sign(0, keyPair);
    const txv = txvb.build();

    await this.broadcast(txv.toHex());

    return {
      height: -1,
      txId: txv.getId(),
      vout: 0,
      value,
    };
  }

  async verify(txo: Unspent): Promise<void> {
    const tx = await this.fetch(txo.txId);

    const txoActual = tx.outs[txo.vout];
    if (txo.address) assert.strictEqual(txoActual.address, txo.address);
    if (txo.value) assert.strictEqual(txoActual.value, txo.value);
  }

  randomAddress(): string {
    checkLib(this.bitcoinjs, 'randomAddress');
    return getAddress(
      this.bitcoinjs,
      this.bitcoinjs.ECPair.makeRandom({
        network: this.bitcoinjs.networks.regtest,
      }),
      this.bitcoinjs.networks.regtest,
    );
  }
}

function getAddress(
  bitcoin: any,
  node: ECPairInterface,
  myNetwork: Network,
): string {
  return bitcoin.payments.p2pkh({ pubkey: node.publicKey, network: myNetwork })
    .address!;
}

function _faucetRequestMaker(
  dhttp: any,
  url: string,
  pass: string,
): (address: string, value: number) => Promise<string> {
  return async (address: string, value: number): Promise<string> =>
    dhttp({
      method: 'POST',
      url: `${url}/r/faucet?address=${address}&value=${value}&key=${pass}`,
    }) as Promise<string>;
}

function checkLib(bitcoin: any, funcName: string): void {
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
      'bitcoinjs-lib is not loaded correctly. Make sure >=4.0.3 ' +
        'is installed as a peerDependency in order to run ' +
        funcName,
    );
  }
}
