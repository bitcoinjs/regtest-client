/// <reference types="node" />
import * as bitcoinjs from 'bitcoinjs-lib';
declare type DhttpResponse = Unspent[] | Request | string | number | void | null;
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
export declare function dhttp(options: Request): Promise<DhttpResponse>;
export declare function broadcast(txHex: string): Promise<null>;
export declare function mine(count: number): Promise<string[]>;
export declare function height(): Promise<number>;
export declare function fetch(txId: string): Promise<Transaction>;
export declare function unspents(address: string): Promise<Unspent[]>;
export declare function faucet(address: string, value: number): Promise<Unspent>;
export declare function faucetComplex(output: Buffer, value: number): Promise<Unspent>;
export declare function verify(txo: Unspent): Promise<void>;
export declare function randomAddress(): string;
export declare let RANDOM_ADDRESS: string;
export declare let network: bitcoinjs.networks.Network;
export declare function injectBitcoinJsLib(newLib: any): void;
export declare function changeUrl(newUrl: string): void;
export declare function changePass(newPass: string): void;
export {};
