import chai, { expect } from 'chai'
import { Contract } from 'ethers'
import { AddressZero, Zero, MaxUint256 } from 'ethers/constants'
import { BigNumber, bigNumberify } from 'ethers/utils'
import { solidity, MockProvider, createFixtureLoader } from 'ethereum-waffle'
import { ecsign } from 'ethereumjs-util'

import { expandTo18Decimals, getApprovalDigest, mineBlock, MINIMUM_LIQUIDITY } from './shared/utilities'
import { v2Fixture } from './shared/fixtures'

chai.use(solidity)

const overrides = {
  gasLimit: 9999999
}

describe('FlashLoanV1Router01', () => {
  const provider = new MockProvider({
    hardfork: 'istanbul',
    mnemonic: 'horn horn horn horn horn horn horn horn horn horn horn horn',
    gasLimit: 9999999
  })
  const [wallet] = provider.getWallets()
  const loadFixture = createFixtureLoader(provider, [wallet])

  let token0: Contract
  let token1: Contract
  let WETH: Contract
  let WETHPartner: Contract
  let factory: Contract
  let router: Contract
  let pool: Contract
  let WETHPair: Contract
  beforeEach(async function() {
    const fixture = await loadFixture(v2Fixture)
    token0 = fixture.token0
    token1 = fixture.token1
    WETH = fixture.WETH
    WETHPartner = fixture.WETHPartner
    factory = fixture.factory
    router = fixture.router
    pool = fixture.pool
    WETHPair = fixture.WETHPair
  })

  afterEach(async function() {
    expect(await provider.getBalance(router.address)).to.eq(Zero)
  })

  describe('Router01', () => {
    it('factory, WETH', async () => {
      expect(await router.factory()).to.eq(factory.address)
      expect(await router.WETH()).to.eq(WETH.address)
    })

    it('addLiquidity', async () => {
      const token0Amount = expandTo18Decimals(1)
      const token1Amount = expandTo18Decimals(4)

      const expectedLiquidity = expandTo18Decimals(2)
      await token0.approve(router.address, MaxUint256)
      await token1.approve(router.address, MaxUint256)
      await expect(
        router.addLiquidity(
          token0.address,
          token1.address,
          token0Amount,
          token1Amount,
          0,
          0,
          wallet.address,
          MaxUint256,
          overrides
        )
      )
        .to.emit(token0, 'Transfer')
        .withArgs(wallet.address, pool.address, token0Amount)
        .to.emit(token1, 'Transfer')
        .withArgs(wallet.address, pool.address, token1Amount)
        .to.emit(pool, 'Transfer')
        .withArgs(AddressZero, AddressZero, MINIMUM_LIQUIDITY)
        .to.emit(pool, 'Transfer')
        .withArgs(AddressZero, wallet.address, expectedLiquidity.sub(MINIMUM_LIQUIDITY))
        .to.emit(pool, 'Sync')
        .withArgs(token0Amount, token1Amount)
        .to.emit(pool, 'Mint')
        .withArgs(router.address, token0Amount, token1Amount)

      expect(await pool.balanceOf(wallet.address)).to.eq(expectedLiquidity.sub(MINIMUM_LIQUIDITY))
    })

    it('addLiquidityETH', async () => {
      const WETHPartnerAmount = expandTo18Decimals(1)
      const ETHAmount = expandTo18Decimals(4)

      const expectedLiquidity = expandTo18Decimals(2)
      const WETHPairToken0 = await WETHPair.token0()
      await WETHPartner.approve(router.address, MaxUint256)
      await expect(
        router.addLiquidityETH(
          WETHPartner.address,
          WETHPartnerAmount,
          WETHPartnerAmount,
          ETHAmount,
          wallet.address,
          MaxUint256,
          { ...overrides, value: ETHAmount }
        )
      )
        .to.emit(WETHPair, 'Transfer')
        .withArgs(AddressZero, AddressZero, MINIMUM_LIQUIDITY)
        .to.emit(WETHPair, 'Transfer')
        .withArgs(AddressZero, wallet.address, expectedLiquidity.sub(MINIMUM_LIQUIDITY))
        .to.emit(WETHPair, 'Sync')
        .withArgs(
          WETHPairToken0 === WETHPartner.address ? WETHPartnerAmount : ETHAmount,
          WETHPairToken0 === WETHPartner.address ? ETHAmount : WETHPartnerAmount
        )
        .to.emit(WETHPair, 'Mint')
        .withArgs(
          router.address,
          WETHPairToken0 === WETHPartner.address ? WETHPartnerAmount : ETHAmount,
          WETHPairToken0 === WETHPartner.address ? ETHAmount : WETHPartnerAmount
        )

      expect(await WETHPair.balanceOf(wallet.address)).to.eq(expectedLiquidity.sub(MINIMUM_LIQUIDITY))
    })

    async function addLiquidity(token0Amount: BigNumber, token1Amount: BigNumber) {
      await token0.transfer(pool.address, token0Amount)
      await token1.transfer(pool.address, token1Amount)
      await pool.mint(wallet.address, overrides)
    }
    it('removeLiquidity', async () => {
      const token0Amount = expandTo18Decimals(1)
      const token1Amount = expandTo18Decimals(4)
      await addLiquidity(token0Amount, token1Amount)

      const expectedLiquidity = expandTo18Decimals(2)
      await pool.approve(router.address, MaxUint256)
      await expect(
        router.removeLiquidity(
          token0.address,
          token1.address,
          expectedLiquidity.sub(MINIMUM_LIQUIDITY),
          0,
          0,
          wallet.address,
          MaxUint256,
          overrides
        )
      )
        .to.emit(pool, 'Transfer')
        .withArgs(wallet.address, pool.address, expectedLiquidity.sub(MINIMUM_LIQUIDITY))
        .to.emit(pool, 'Transfer')
        .withArgs(pool.address, AddressZero, expectedLiquidity.sub(MINIMUM_LIQUIDITY))
        .to.emit(token0, 'Transfer')
        .withArgs(pool.address, wallet.address, token0Amount.sub(500))
        .to.emit(token1, 'Transfer')
        .withArgs(pool.address, wallet.address, token1Amount.sub(2000))
        .to.emit(pool, 'Sync')
        .withArgs(500, 2000)
        .to.emit(pool, 'Burn')
        .withArgs(router.address, token0Amount.sub(500), token1Amount.sub(2000), wallet.address)

      expect(await pool.balanceOf(wallet.address)).to.eq(0)
      const totalSupplyToken0 = await token0.totalSupply()
      const totalSupplyToken1 = await token1.totalSupply()
      expect(await token0.balanceOf(wallet.address)).to.eq(totalSupplyToken0.sub(500))
      expect(await token1.balanceOf(wallet.address)).to.eq(totalSupplyToken1.sub(2000))
    })

    it('removeLiquidityETH', async () => {
      const WETHPartnerAmount = expandTo18Decimals(1)
      const ETHAmount = expandTo18Decimals(4)
      await WETHPartner.transfer(WETHPair.address, WETHPartnerAmount)
      await WETH.deposit({ value: ETHAmount })
      await WETH.transfer(WETHPair.address, ETHAmount)
      await WETHPair.mint(wallet.address, overrides)

      const expectedLiquidity = expandTo18Decimals(2)
      const WETHPairToken0 = await WETHPair.token0()
      await WETHPair.approve(router.address, MaxUint256)
      await expect(
        router.removeLiquidityETH(
          WETHPartner.address,
          expectedLiquidity.sub(MINIMUM_LIQUIDITY),
          0,
          0,
          wallet.address,
          MaxUint256,
          overrides
        )
      )
        .to.emit(WETHPair, 'Transfer')
        .withArgs(wallet.address, WETHPair.address, expectedLiquidity.sub(MINIMUM_LIQUIDITY))
        .to.emit(WETHPair, 'Transfer')
        .withArgs(WETHPair.address, AddressZero, expectedLiquidity.sub(MINIMUM_LIQUIDITY))
        .to.emit(WETH, 'Transfer')
        .withArgs(WETHPair.address, router.address, ETHAmount.sub(2000))
        .to.emit(WETHPartner, 'Transfer')
        .withArgs(WETHPair.address, router.address, WETHPartnerAmount.sub(500))
        .to.emit(WETHPartner, 'Transfer')
        .withArgs(router.address, wallet.address, WETHPartnerAmount.sub(500))
        .to.emit(WETHPair, 'Sync')
        .withArgs(
          WETHPairToken0 === WETHPartner.address ? 500 : 2000,
          WETHPairToken0 === WETHPartner.address ? 2000 : 500
        )
        .to.emit(WETHPair, 'Burn')
        .withArgs(
          router.address,
          WETHPairToken0 === WETHPartner.address ? WETHPartnerAmount.sub(500) : ETHAmount.sub(2000),
          WETHPairToken0 === WETHPartner.address ? ETHAmount.sub(2000) : WETHPartnerAmount.sub(500),
          router.address
        )

      expect(await WETHPair.balanceOf(wallet.address)).to.eq(0)
      const totalSupplyWETHPartner = await WETHPartner.totalSupply()
      const totalSupplyWETH = await WETH.totalSupply()
      expect(await WETHPartner.balanceOf(wallet.address)).to.eq(totalSupplyWETHPartner.sub(500))
      expect(await WETH.balanceOf(wallet.address)).to.eq(totalSupplyWETH.sub(2000))
    })

    it('removeLiquidityWithPermit', async () => {
      const token0Amount = expandTo18Decimals(1)
      const token1Amount = expandTo18Decimals(4)
      await addLiquidity(token0Amount, token1Amount)

      const expectedLiquidity = expandTo18Decimals(2)

      const nonce = await pool.nonces(wallet.address)
      const digest = await getApprovalDigest(
        pool,
        { owner: wallet.address, spender: router.address, value: expectedLiquidity.sub(MINIMUM_LIQUIDITY) },
        nonce,
        MaxUint256
      )

      const { v, r, s } = ecsign(Buffer.from(digest.slice(2), 'hex'), Buffer.from(wallet.privateKey.slice(2), 'hex'))

      await router.removeLiquidityWithPermit(
        token0.address,
        token1.address,
        expectedLiquidity.sub(MINIMUM_LIQUIDITY),
        0,
        0,
        wallet.address,
        MaxUint256,
        false,
        v,
        r,
        s,
        overrides
      )
    })

    it('removeLiquidityETHWithPermit', async () => {
      const WETHPartnerAmount = expandTo18Decimals(1)
      const ETHAmount = expandTo18Decimals(4)
      await WETHPartner.transfer(WETHPair.address, WETHPartnerAmount)
      await WETH.deposit({ value: ETHAmount })
      await WETH.transfer(WETHPair.address, ETHAmount)
      await WETHPair.mint(wallet.address, overrides)

      const expectedLiquidity = expandTo18Decimals(2)

      const nonce = await WETHPair.nonces(wallet.address)
      const digest = await getApprovalDigest(
        WETHPair,
        { owner: wallet.address, spender: router.address, value: expectedLiquidity.sub(MINIMUM_LIQUIDITY) },
        nonce,
        MaxUint256
      )

      const { v, r, s } = ecsign(Buffer.from(digest.slice(2), 'hex'), Buffer.from(wallet.privateKey.slice(2), 'hex'))

      await router.removeLiquidityETHWithPermit(
        WETHPartner.address,
        expectedLiquidity.sub(MINIMUM_LIQUIDITY),
        0,
        0,
        wallet.address,
        MaxUint256,
        false,
        v,
        r,
        s,
        overrides
      )
    })

    describe('swapExactTokensForTokens', () => {
      const token0Amount = expandTo18Decimals(5)
      const token1Amount = expandTo18Decimals(10)
      const swapAmount = expandTo18Decimals(1)
      const expectedOutputAmount = bigNumberify('1662497915624478906')

      beforeEach(async () => {
        await addLiquidity(token0Amount, token1Amount)
        await token0.approve(router.address, MaxUint256)
      })

      it('happy path', async () => {
        await expect(
          router.swapExactTokensForTokens(
            swapAmount,
            0,
            [token0.address, token1.address],
            wallet.address,
            MaxUint256,
            overrides
          )
        )
          .to.emit(token0, 'Transfer')
          .withArgs(wallet.address, pool.address, swapAmount)
          .to.emit(token1, 'Transfer')
          .withArgs(pool.address, wallet.address, expectedOutputAmount)
          .to.emit(pool, 'Sync')
          .withArgs(token0Amount.add(swapAmount), token1Amount.sub(expectedOutputAmount))
          .to.emit(pool, 'Swap')
          .withArgs(router.address, swapAmount, 0, 0, expectedOutputAmount, wallet.address)
      })

      it('amounts', async () => {
        await token0.approve(router.address, MaxUint256)
        await expect(
          router.swapExactTokensForTokens(
            router.address,
            swapAmount,
            0,
            [token0.address, token1.address],
            wallet.address,
            MaxUint256,
            overrides
          )
        )
          .to.emit(router, 'Amounts')
          .withArgs([swapAmount, expectedOutputAmount])
      })

      it('gas', async () => {
        // ensure that setting price{0,1}CumulativeLast for the first time doesn't affect our gas math
        await mineBlock(provider, (await provider.getBlock('latest')).timestamp + 1)
        await pool.sync(overrides)

        await token0.approve(router.address, MaxUint256)
        await mineBlock(provider, (await provider.getBlock('latest')).timestamp + 1)
        const tx = await router.swapExactTokensForTokens(
          swapAmount,
          0,
          [token0.address, token1.address],
          wallet.address,
          MaxUint256,
          overrides
        )
        const receipt = await tx.wait()
        expect(receipt.gasUsed).to.eq(101876)
      }).retries(3)
    })

    describe('swapExactETHForTokens', () => {
      const WETHPartnerAmount = expandTo18Decimals(10)
      const ETHAmount = expandTo18Decimals(5)
      const swapAmount = expandTo18Decimals(1)
      const expectedOutputAmount = bigNumberify('1662497915624478906')

      beforeEach(async () => {
        await WETHPartner.transfer(WETHPair.address, WETHPartnerAmount)
        await WETH.deposit({ value: ETHAmount })
        await WETH.transfer(WETHPair.address, ETHAmount)
        await WETHPair.mint(wallet.address, overrides)

        await token0.approve(router.address, MaxUint256)
      })

      it('happy path', async () => {
        const WETHPairToken0 = await WETHPair.token0()
        await expect(
          router.swapExactETHForTokens(0, [WETH.address, WETHPartner.address], wallet.address, MaxUint256, {
            ...overrides,
            value: swapAmount
          })
        )
          .to.emit(WETH, 'Transfer')
          .withArgs(router.address, WETHPair.address, swapAmount)
          .to.emit(WETHPartner, 'Transfer')
          .withArgs(WETHPair.address, wallet.address, expectedOutputAmount)
          .to.emit(WETHPair, 'Sync')
          .withArgs(
            WETHPairToken0 === WETHPartner.address
              ? WETHPartnerAmount.sub(expectedOutputAmount)
              : ETHAmount.add(swapAmount),
            WETHPairToken0 === WETHPartner.address
              ? ETHAmount.add(swapAmount)
              : WETHPartnerAmount.sub(expectedOutputAmount)
          )
          .to.emit(WETHPair, 'Swap')
          .withArgs(
            router.address,
            WETHPairToken0 === WETHPartner.address ? 0 : swapAmount,
            WETHPairToken0 === WETHPartner.address ? swapAmount : 0,
            WETHPairToken0 === WETHPartner.address ? expectedOutputAmount : 0,
            WETHPairToken0 === WETHPartner.address ? 0 : expectedOutputAmount,
            wallet.address
          )
      })

      it('amounts', async () => {
        await expect(
          router.swapExactETHForTokens(
            router.address,
            0,
            [WETH.address, WETHPartner.address],
            wallet.address,
            MaxUint256,
            {
              ...overrides,
              value: swapAmount
            }
          )
        )
          .to.emit(router, 'Amounts')
          .withArgs([swapAmount, expectedOutputAmount])
      })

      it('gas', async () => {
        const WETHPartnerAmount = expandTo18Decimals(10)
        const ETHAmount = expandTo18Decimals(5)
        await WETHPartner.transfer(WETHPair.address, WETHPartnerAmount)
        await WETH.deposit({ value: ETHAmount })
        await WETH.transfer(WETHPair.address, ETHAmount)
        await WETHPair.mint(wallet.address, overrides)

        // ensure that setting price{0,1}CumulativeLast for the first time doesn't affect our gas math
        await mineBlock(provider, (await provider.getBlock('latest')).timestamp + 1)
        await pool.sync(overrides)

        const swapAmount = expandTo18Decimals(1)
        await mineBlock(provider, (await provider.getBlock('latest')).timestamp + 1)
        const tx = await router.swapExactETHForTokens(
          0,
          [WETH.address, WETHPartner.address],
          wallet.address,
          MaxUint256,
          {
            ...overrides,
            value: swapAmount
          }
        )
        const receipt = await tx.wait()
        expect(receipt.gasUsed).to.eq(138770)
      }).retries(3)
    })
  })
})
