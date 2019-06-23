const { describe, it } = require('mocha')
const assert = require('assert')
const bitcoin = require('bitcoinjs-lib')
const { RegtestUtils } = require('..')
const regtestUtils = new RegtestUtils(bitcoin)
const { network } = regtestUtils

describe('regtest utils', () => {
  it('should get the current height', async () => {
    assert.strictEqual(typeof (await regtestUtils.height()), 'number')
  })
  it('should mine blocks', async () => {
    const results = await regtestUtils.mine(2)
    assert.strictEqual(Array.isArray(results), true)
    assert.strictEqual(!!results[0].match(/^[0-9a-f]+$/), true)
  })
  it('should get random address', async () => {
    assert.strictEqual(typeof regtestUtils.randomAddress(), 'string')
  })
  it('should have random address', async () => {
    assert.strictEqual(typeof regtestUtils.RANDOM_ADDRESS, 'string')
  })

  it('should get faucet, broadcast, verify', async () => {
    const keyPair = bitcoin.ECPair.makeRandom({ network })
    const p2pkh = bitcoin.payments.p2pkh({ pubkey: keyPair.publicKey, network })

    const unspent = await regtestUtils.faucet(p2pkh.address, 2e4)

    const unspentComplex = await regtestUtils.faucetComplex(p2pkh.output, 1e4)

    const unspents = await regtestUtils.unspents(p2pkh.address)

    const fetchedTx = await regtestUtils.fetch(unspent.txId)

    assert.strictEqual(fetchedTx.txId, unspent.txId)

    assert.deepStrictEqual(
      unspent,
      unspents.filter(v => v.value === unspent.value)[0],
      'unspents must be equal'
    )

    assert.deepStrictEqual(
      unspentComplex,
      unspents.filter(v => v.value === unspentComplex.value)[0],
      'unspents must be equal'
    )

    const txb = new bitcoin.TransactionBuilder(network)
    txb.addInput(unspent.txId, unspent.vout)
    txb.addInput(unspentComplex.txId, unspentComplex.vout)
    txb.addOutput(regtestUtils.RANDOM_ADDRESS, 1e4)

    txb.sign({
      prevOutScriptType: 'p2pkh',
      vin: 0,
      keyPair,
    })
    txb.sign({
      prevOutScriptType: 'p2pkh',
      vin: 1,
      keyPair,
    })
    const tx = txb.build()

    // build and broadcast to the Bitcoin RegTest network
    await regtestUtils.broadcast(tx.toHex())

    await regtestUtils.verify({
      txId: tx.getId(),
      address: regtestUtils.RANDOM_ADDRESS,
      vout: 0,
      value: 1e4
    })
  })
})
