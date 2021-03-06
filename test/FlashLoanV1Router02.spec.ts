import chai, { expect } from 'chai'
import { Contract } from 'ethers'
import { Zero } from 'ethers/constants'
import { bigNumberify } from 'ethers/utils'
import { solidity, MockProvider, createFixtureLoader } from 'ethereum-waffle'

import { expandTo18Decimals, mineBlock } from './shared/utilities'
import { V1Fixture } from './shared/fixtures'

chai.use(solidity)

const overrides = {
  gasLimit: 9999999
}

describe('FlashLoanV1Router02', () => {
  const provider = new MockProvider({
    hardfork: 'istanbul',
    mnemonic: 'horn horn horn horn horn horn horn horn horn horn horn horn',
    gasLimit: 9999999
  })
  const [wallet] = provider.getWallets()
  const loadFixture = createFixtureLoader(provider, [wallet])

  let token: Contract
  let WETH: Contract
  let router: Contract
  let pool: Contract
  let WETHPool: Contract
  let receiver: Contract
  beforeEach(async function() {
    const fixture = await loadFixture(V1Fixture)
    token = fixture.token
    WETH = fixture.WETH
    router = fixture.router02
    pool = fixture.pool
    WETHPool = fixture.WETHPool
    receiver = fixture.receiver02
  })

  afterEach(async function() {
    expect(await provider.getBalance(router.address)).to.eq(Zero)
  })

  describe('Router02', () => {
    it('flashLoan: token', async () => {
      const loanAmount = expandTo18Decimals(10000)
      const premiumAmount = await router.flashFee(token.address, loanAmount)

      await token.transfer(pool.address, loanAmount)
      await token.transfer(receiver.address, premiumAmount)

      await expect(receiver.flashBorrow(router.address, token.address, loanAmount))
        .to.emit(token, 'Transfer')
        .withArgs(pool.address, router.address, loanAmount)
        .to.emit(token, 'Transfer')
        .withArgs(router.address, receiver.address, loanAmount)
        .to.emit(token, 'Transfer')
        .withArgs(receiver.address, pool.address, loanAmount.add(premiumAmount))
        .to.emit(pool, 'Sync')
        .withArgs(loanAmount.add(premiumAmount))
        .to.emit(pool, 'FlashLoan')
        .withArgs(router.address, router.address, token.address, loanAmount, premiumAmount)

        const reserve = await pool.reserve()
        expect(reserve).to.eq(loanAmount.add(premiumAmount))
        expect(await token.balanceOf(pool.address)).to.eq(loanAmount.add(premiumAmount))
        expect(await token.balanceOf(receiver.address)).to.eq(0)
        const totalSupplyToken = await token.totalSupply()
        expect(await token.balanceOf(wallet.address)).to.eq(totalSupplyToken.sub(loanAmount).sub(premiumAmount))
    })

    it('flashLoan: eth', async () => {
      const loanAmount = expandTo18Decimals(10000)
      const premiumAmount = await router.flashFee(token.address, loanAmount)
      const ETHAmount = expandTo18Decimals(10005)

      await WETH.deposit({ value: ETHAmount })
      await WETH.transfer(WETHPool.address, loanAmount)
      await WETH.transfer(receiver.address, premiumAmount)

      await expect(receiver.flashBorrow(router.address, WETH.address, loanAmount))
        .to.emit(WETH, 'Transfer')
        .withArgs(WETHPool.address, router.address, loanAmount)
        .to.emit(WETH, 'Transfer')
        .withArgs(router.address, receiver.address, loanAmount)
        .to.emit(WETH, 'Transfer')
        .withArgs(receiver.address, WETHPool.address, loanAmount.add(premiumAmount))
        .to.emit(WETHPool, 'Sync')
        .withArgs(loanAmount.add(premiumAmount))
        .to.emit(WETHPool, 'FlashLoan')
        .withArgs(router.address, router.address, WETH.address, loanAmount, premiumAmount)
  
        const reserve = await WETHPool.reserve()
        expect(reserve).to.eq(loanAmount.add(premiumAmount))
        expect(await WETH.balanceOf(WETHPool.address)).to.eq(loanAmount.add(premiumAmount))
        expect(await WETH.balanceOf(receiver.address)).to.eq(0)
        const totalSupplyToken = await WETH.totalSupply()
        expect(await WETH.balanceOf(wallet.address)).to.eq(totalSupplyToken.sub(loanAmount).sub(premiumAmount))
    })

    it('flashloan: maxFlashLoan', async () => {
      const loanAmount = expandTo18Decimals(10000)
      const premiumAmount = await router.flashFee(token.address, loanAmount)
      const one = bigNumberify(1)
      const maxFlashLoanAmountAfter = expandTo18Decimals(10005)

      await mineBlock(provider, (await provider.getBlock('latest')).timestamp + 1)
      await pool.sync(overrides)

      await token.transfer(pool.address, loanAmount)
      await token.transfer(receiver.address, premiumAmount)

      const maxFlashLoanAmount = await router.maxFlashLoan(token.address)

      await mineBlock(provider, (await provider.getBlock('latest')).timestamp + 1)
      expect(await token.balanceOf(pool.address)).to.eq(loanAmount)
      expect(await token.balanceOf(pool.address)).to.eq(maxFlashLoanAmount.add(one))

      await receiver.flashBorrow(router.address, token.address, loanAmount)
      expect(await token.balanceOf(pool.address)).to.eq(maxFlashLoanAmountAfter)
    })

    it('flashloan: flashFee', async () => {
      const loanAmount = expandTo18Decimals(10000)
      const premiumAmount = router.flashFee(token.address, loanAmount)
  
      await mineBlock(provider, (await provider.getBlock('latest')).timestamp + 1)
      await pool.sync(overrides)

      expect(await premiumAmount).to.eq(expandTo18Decimals(5))
    })

    it('flashloan: gas', async () => {
      const loanAmount = expandTo18Decimals(10000)
      const premiumAmount = router.flashFee(token.address, loanAmount)

      await mineBlock(provider, (await provider.getBlock('latest')).timestamp + 1)
      await pool.sync(overrides)

      await token.transfer(pool.address, loanAmount)
      await token.transfer(receiver.address, premiumAmount)
      await mineBlock(provider, (await provider.getBlock('latest')).timestamp + 1)
      const tx = await receiver.flashBorrow(router.address, token.address, loanAmount)
      const receipt = await tx.wait()
      expect(receipt.gasUsed).to.eq(206785)
    })
  })
})
