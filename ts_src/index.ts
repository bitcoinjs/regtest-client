import * as assert from 'assert';
import * as rng from 'randombytes';
const bs58check = require('bs58check');

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

interface RegUtilOpts {
  APIPASS?: string;
  APIURL?: string;
}

const dhttpCallback = require('dhttp/200');

let RANDOM_ADDRESS: string | undefined;

export class RegtestUtils {
  network: Network;
  private _APIURL: string;
  private _APIPASS: string;

  constructor(_opts?: RegUtilOpts) {
    this._APIURL =
      (_opts || {}).APIURL || process.env.APIURL || 'http://127.0.0.1:8080/1';
    this._APIPASS = (_opts || {}).APIPASS || process.env.APIPASS || 'satoshi';
    // regtest network parameters
    this.network = {
      messagePrefix: '\x18Bitcoin Signed Message:\n',
      bech32: 'bcrt',
      bip32: {
        public: 0x043587cf,
        private: 0x04358394,
      },
      pubKeyHash: 0x6f,
      scriptHash: 0xc4,
      wif: 0xef,
    };
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
    const requester = _faucetRequestMaker(
      'faucet',
      'address',
      this.dhttp,
      this._APIURL,
      this._APIPASS,
    );
    const faucet = _faucetMaker(this, requester);
    return faucet(address, value);
  }

  async faucetComplex(output: Buffer, value: number): Promise<Unspent> {
    const outputString = output.toString('hex');
    const requester = _faucetRequestMaker(
      'faucetScript',
      'script',
      this.dhttp,
      this._APIURL,
      this._APIPASS,
    );
    const faucet = _faucetMaker(this, requester);
    return faucet(outputString, value);
  }

  async verify(txo: Unspent): Promise<void> {
    const tx = await this.fetch(txo.txId);

    const txoActual = tx.outs[txo.vout];
    if (txo.address) assert.strictEqual(txoActual.address, txo.address);
    if (txo.value) assert.strictEqual(txoActual.value, txo.value);
  }

  randomAddress(): string {
    // Fake P2PKH address with regtest/testnet version byte
    return bs58check.encode(Buffer.concat([Buffer.from([0x6f]), rng(20)]));
  }
}

function _faucetRequestMaker(
  name: string,
  paramName: string,
  dhttp: any,
  url: string,
  pass: string,
): (address: string, value: number) => Promise<string> {
  return async (address: string, value: number): Promise<string> =>
    dhttp({
      method: 'POST',
      url: `${url}/r/${name}?${paramName}=${address}&value=${value}&key=${pass}`,
    }) as Promise<string>;
}

function _faucetMaker(
  self: RegtestUtils,
  _requester: (address: string, value: number) => Promise<string>,
): (address: string, value: number) => Promise<Unspent> {
  return async (address: string, value: number): Promise<Unspent> => {
    let count = 0;
    let _unspents: Unspent[] = [];
    const sleep = (ms: number): Promise<void> =>
      new Promise((resolve): number => setTimeout(resolve, ms));
    const randInt = (min: number, max: number): number =>
      min + Math.floor((max - min + 1) * Math.random());
    const txId = await _requester(address, value).then(
      v => v, // Pass success value as is
      async err => {
        // Bad Request error is fixed by making sure height is >= 432
        const currentHeight = (await self.height()) as number;
        if (err.message === 'Bad Request' && currentHeight < 432) {
          await self.mine(432 - currentHeight);
          return _requester(address, value);
        } else if (err.message === 'Bad Request' && currentHeight >= 432) {
          return _requester(address, value);
        } else {
          throw err;
        }
      },
    );
    while (_unspents.length === 0) {
      if (count > 0) {
        if (count >= 5) {
          // Sometimes indexd takes more than 60 secs to sync.
          console.log('WARNING: Indexd is busy. Using getrawtransaction RPC.');
          const tx = await self.fetch(txId);
          const outs = tx.outs.filter(x => x.address === address);
          const out = outs.pop();
          if (out) {
            const vout = tx.outs.indexOf(out);
            const v = out.value;
            return { txId, vout, value: v };
          } else {
            throw new Error('Missing Inputs');
          }
        }
        console.log('Missing Inputs, retry #' + count);
        await sleep(randInt(150, 250));
      }

      await sleep(randInt(50, 150));

      const results = await self.unspents(address);

      _unspents = results.filter(x => x.txId === txId);

      count++;
    }

    return _unspents.pop()!;
  };
}
