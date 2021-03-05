import { Wallet, Contract } from 'ethers'
import { Web3Provider } from 'ethers/providers'
import { deployContract } from 'ethereum-waffle'

import { expandTo18Decimals } from './utilities'

import FlashLoanV1Factory from './FlashLoanV1Factory.json'
import IFlashLoanV1Pool from '../../build/IFlashLoanV1Pool.json'

import ERC20 from '../../build/ERC20.json'
import WETH9 from '../../build/WETH9.json'
import FlashLoanV1Router01 from '../../build/FlashLoanV1Router01.json'
import FlashLoanV1Router02 from '../../build/FlashLoanV1Router02.json'
import FlashLoanReceiver from '../../build/FlashLoanReceiver.json'
import FlashLoanReceiver02 from '../../build/FlashLoanReceiver02.json'

const overrides = {
  gasLimit: 9999999
}

interface Router01Fixture {
  token: Contract
  WETH: Contract
  factory: Contract
  router01: Contract
  router02: Contract
  router: Contract
  pool: Contract
  WETHPool: Contract
  receiver01: Contract
  receiver02: Contract
}

export async function V1Fixture(provider: Web3Provider, [wallet]: Wallet[]): Promise<Router01Fixture> {
  // deploy tokens
  const token = await deployContract(wallet, ERC20, [expandTo18Decimals(10005)])
  const WETH = await deployContract(wallet, WETH9)

  // deploy receiver
  const receiver01 = await deployContract(wallet, FlashLoanReceiver)
  const receiver02 = await deployContract(wallet, FlashLoanReceiver02)

  // deploy factory
  const factory = await deployContract(wallet, FlashLoanV1Factory, [wallet.address])

  // deploy router
  const router01 = await deployContract(wallet, FlashLoanV1Router01, [factory.address, WETH.address], overrides)
  const router02 = await deployContract(wallet, FlashLoanV1Router02, [factory.address, WETH.address], overrides)

  // initialize V1
  await factory.createPool(token.address)
  const tokenAddress = await factory.getPool(token.address)
  const pool = new Contract(tokenAddress, JSON.stringify(IFlashLoanV1Pool.abi), provider).connect(wallet)

  await factory.createPool(WETH.address)
  const WETHAddress = await factory.getPool(WETH.address)
  const WETHPool = new Contract(WETHAddress, JSON.stringify(IFlashLoanV1Pool.abi), provider).connect(wallet)

  return {
    token,
    WETH,
    factory,
    router01,
    router02,
    router: router01, // the default router
    pool,
    WETHPool,
    receiver01,
    receiver02
  }
}
