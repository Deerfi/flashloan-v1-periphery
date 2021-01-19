import { Wallet, Contract } from 'ethers'
import { Web3Provider } from 'ethers/providers'
import { deployContract } from 'ethereum-waffle'

import { expandTo18Decimals } from './utilities'

import FlashLoanV1Factory from './FlashLoanV1Factory.json'
import IFlashLoanV1Pool from '../../build/IFlashLoanV1Pool.json'

import ERC20 from '../../build/ERC20.json'
import WETH9 from '../../build/WETH9.json'
import FlashLoanV1Router01 from '../../build/FlashLoanV1Router01.json'
import FlashLoanReceiver from '../../build/FlashLoanReceiver.json'

const overrides = {
  gasLimit: 9999999
}

interface Router01Fixture {
  token: Contract
  WETH: Contract
  factory: Contract
  router: Contract
  pool: Contract
  WETHPool: Contract
  receiver: Contract
}

export async function router01Fixture(provider: Web3Provider, [wallet]: Wallet[]): Promise<Router01Fixture> {
  // deploy tokens
  const token = await deployContract(wallet, ERC20, [expandTo18Decimals(10005)])
  const WETH = await deployContract(wallet, WETH9)

  // deploy receiver
  const receiver = await deployContract(wallet, FlashLoanReceiver)

  // deploy factory
  const factory = await deployContract(wallet, FlashLoanV1Factory, [wallet.address])

  // deploy router
  const router01 = await deployContract(wallet, FlashLoanV1Router01, [factory.address, WETH.address], overrides)

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
    router: router01, // the default router, 01 had a minor bug
    pool,
    WETHPool,
    receiver
  }
}
