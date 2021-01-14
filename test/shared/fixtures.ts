import { Wallet, Contract } from 'ethers'
import { Web3Provider } from 'ethers/providers'
import { deployContract } from 'ethereum-waffle'

import { expandTo18Decimals } from './utilities'

import FlashLoanV1Factory from './FlashLoanV1Factory.json'
import IFlashLoanV1Pool from './IFlashLoanV1Pool.json'

import ERC20 from '../../build/ERC20.json'
import WETH9 from '../../build/WETH9.json'
import FlashLoanV1Router01 from '../../build/FlashLoanV1Router01.json'

const overrides = {
  gasLimit: 9999999
}

interface V2Fixture {
  token0: Contract
  token1: Contract
  WETH: Contract
  WETHPartner: Contract
  factory: Contract
  router: Contract
  pool: Contract
  WETHPair: Contract
}

export async function v2Fixture(provider: Web3Provider, [wallet]: Wallet[]): Promise<V2Fixture> {
  // deploy tokens
  const tokenA = await deployContract(wallet, ERC20, [expandTo18Decimals(10000)])
  const tokenB = await deployContract(wallet, ERC20, [expandTo18Decimals(10000)])
  const WETH = await deployContract(wallet, WETH9)
  const WETHPartner = await deployContract(wallet, ERC20, [expandTo18Decimals(10000)])

  // deploy factory
  const factory = await deployContract(wallet, FlashLoanV1Factory, [wallet.address])

  // deploy router
  const router01 = await deployContract(wallet, FlashLoanV1Router01, [factory.address, WETH.address], overrides)

  // initialize V1
  await factory.createPool(tokenA.address)
  const pairAddress = await factory.getPool(tokenA.address, tokenB.address)
  const pool = new Contract(pairAddress, JSON.stringify(IFlashLoanV1Pool.abi), provider).connect(wallet)

  const token0Address = await pool.token0()
  const token0 = tokenA.address === token0Address ? tokenA : tokenB
  const token1 = tokenA.address === token0Address ? tokenB : tokenA

  await factory.createPool(WETH.address, WETHPartner.address)
  const WETHPairAddress = await factory.getPool(WETH.address, WETHPartner.address)
  const WETHPair = new Contract(WETHPairAddress, JSON.stringify(IFlashLoanV1Pool.abi), provider).connect(wallet)

  return {
    token0,
    token1,
    WETH,
    WETHPartner,
    factory,
    router: router01, // the default router, 01 had a minor bug
    pool,
    WETHPair
  }
}
