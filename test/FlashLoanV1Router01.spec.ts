import chai, { expect } from 'chai'
import { Contract } from 'ethers'
import { AddressZero, Zero, MaxUint256 } from 'ethers/constants'
import { BigNumber, defaultAbiCoder } from 'ethers/utils'
import { solidity, MockProvider, createFixtureLoader } from 'ethereum-waffle'
import { ecsign } from 'ethereumjs-util'

import { expandTo18Decimals, getApprovalDigest, mineBlock, MINIMUM_LIQUIDITY } from './shared/utilities'
import { V1Fixture } from './shared/fixtures'

chai.use(solidity)

const overrides = {
  gasLimit: 9999999
}

enum RouterVersion {
  DeerfiFlashLoanRouter01 = 'DeerfiFlashLoanRouter01',
  DeerfiFlashLoanRouter02 = 'DeerfiFlashLoanRouter02'
}

describe('FlashLoanV1Router01', () => {
  for (const routerVersion of Object.keys(RouterVersion)) {
    const provider = new MockProvider({
      hardfork: 'istanbul',
      mnemonic: 'horn horn horn horn horn horn horn horn horn horn horn horn',
      gasLimit: 9999999
    })
    const [wallet] = provider.getWallets()
    const loadFixture = createFixtureLoader(provider, [wallet])

    let token: Contract
    let WETH: Contract
    let factory: Contract
    let router: Contract
    let router01: Contract
    let pool: Contract
    let WETHPool: Contract
    let receiver: Contract
    beforeEach(async function() {
      const fixture = await loadFixture(V1Fixture)
      token = fixture.token
      WETH = fixture.WETH
      factory = fixture.factory
      router = {
        [RouterVersion.DeerfiFlashLoanRouter01]: fixture.router01,
        [RouterVersion.DeerfiFlashLoanRouter02]: fixture.router02
      }[routerVersion as RouterVersion]
      router01 = fixture.router01
      pool = fixture.pool
      WETHPool = fixture.WETHPool
      receiver = fixture.receiver01
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
        const tokenAmount = expandTo18Decimals(1)

        const expectedLiquidity = expandTo18Decimals(1)
        await token.approve(router.address, MaxUint256)
        await expect(
          router.addLiquidity(
            token.address,
            tokenAmount,
            wallet.address,
            MaxUint256,
            overrides
          )
        )
          .to.emit(token, 'Transfer')
          .withArgs(wallet.address, pool.address, tokenAmount)
          .to.emit(pool, 'Transfer')
          .withArgs(AddressZero, AddressZero, MINIMUM_LIQUIDITY)
          .to.emit(pool, 'Transfer')
          .withArgs(AddressZero, wallet.address, expectedLiquidity.sub(MINIMUM_LIQUIDITY))
          .to.emit(pool, 'Sync')
          .withArgs(tokenAmount)
          .to.emit(pool, 'Mint')
          .withArgs(router.address, tokenAmount)

        expect(await pool.balanceOf(wallet.address)).to.eq(expectedLiquidity.sub(MINIMUM_LIQUIDITY))
      })

      it('addLiquidityETH', async () => {
        const ETHAmount = expandTo18Decimals(1)

        const expectedLiquidity = expandTo18Decimals(1)
        await expect(
          router.addLiquidityETH(
            wallet.address,
            MaxUint256,
            { ...overrides, value: ETHAmount }
          )
        )
          .to.emit(WETHPool, 'Transfer')
          .withArgs(AddressZero, AddressZero, MINIMUM_LIQUIDITY)
          .to.emit(WETHPool, 'Transfer')
          .withArgs(AddressZero, wallet.address, expectedLiquidity.sub(MINIMUM_LIQUIDITY))
          .to.emit(WETHPool, 'Sync')
          .withArgs(ETHAmount)
          .to.emit(WETHPool, 'Mint')
          .withArgs(
            router.address,
            ETHAmount
          )

        expect(await WETHPool.balanceOf(wallet.address)).to.eq(expectedLiquidity.sub(MINIMUM_LIQUIDITY))
      })

      async function addLiquidity(tokenAmount: BigNumber) {
        await token.transfer(pool.address, tokenAmount)
        await pool.mint(wallet.address, overrides)
      }
      it('removeLiquidity', async () => {
        const tokenAmount = expandTo18Decimals(1)
        await addLiquidity(tokenAmount)

        const expectedLiquidity = expandTo18Decimals(1)
        await pool.approve(router.address, MaxUint256)
        await expect(
          router.removeLiquidity(
            token.address,
            expectedLiquidity.sub(MINIMUM_LIQUIDITY),
            wallet.address,
            MaxUint256,
            overrides
          )
        )
          .to.emit(pool, 'Transfer')
          .withArgs(wallet.address, pool.address, expectedLiquidity.sub(MINIMUM_LIQUIDITY))
          .to.emit(pool, 'Transfer')
          .withArgs(pool.address, AddressZero, expectedLiquidity.sub(MINIMUM_LIQUIDITY))
          .to.emit(token, 'Transfer')
          .withArgs(pool.address, wallet.address, tokenAmount.sub(1000))
          .to.emit(pool, 'Sync')
          .withArgs(1000)
          .to.emit(pool, 'Burn')
          .withArgs(router.address, tokenAmount.sub(1000), wallet.address)

        expect(await pool.balanceOf(wallet.address)).to.eq(0)
        const totalSupplyToken = await token.totalSupply()
        expect(await token.balanceOf(wallet.address)).to.eq(totalSupplyToken.sub(1000))
      })

      it('removeLiquidityETH', async () => {
        const ETHAmount = expandTo18Decimals(1)
        await WETH.deposit({ value: ETHAmount })
        await WETH.transfer(WETHPool.address, ETHAmount)
        await WETHPool.mint(wallet.address, overrides)

        const expectedLiquidity = expandTo18Decimals(1)
        await WETHPool.approve(router.address, MaxUint256)
        await expect(
          router.removeLiquidityETH(
            expectedLiquidity.sub(MINIMUM_LIQUIDITY),
            wallet.address,
            MaxUint256,
            overrides
          )
        )
          .to.emit(WETHPool, 'Transfer')
          .withArgs(wallet.address, WETHPool.address, expectedLiquidity.sub(MINIMUM_LIQUIDITY))
          .to.emit(WETHPool, 'Transfer')
          .withArgs(WETHPool.address, AddressZero, expectedLiquidity.sub(MINIMUM_LIQUIDITY))
          .to.emit(WETH, 'Transfer')
          .withArgs(WETHPool.address, router.address, ETHAmount.sub(1000))
          .to.emit(WETHPool, 'Sync')
          .withArgs(1000)
          .to.emit(WETHPool, 'Burn')
          .withArgs(
            router.address,
            ETHAmount.sub(1000),
            router.address
          )

        expect(await WETHPool.balanceOf(wallet.address)).to.eq(0)
        const totalSupplyWETH = await WETH.totalSupply()
        expect(await WETH.balanceOf(wallet.address)).to.eq(totalSupplyWETH.sub(1000))
      })

      it('removeLiquidityWithPermit', async () => {
        const tokenAmount = expandTo18Decimals(1)
        await addLiquidity(tokenAmount)

        const expectedLiquidity = expandTo18Decimals(1)

        const nonce = await pool.nonces(wallet.address)
        const digest = await getApprovalDigest(
          pool,
          { owner: wallet.address, spender: router.address, value: expectedLiquidity.sub(MINIMUM_LIQUIDITY) },
          nonce,
          MaxUint256
        )

        const { v, r, s } = ecsign(Buffer.from(digest.slice(2), 'hex'), Buffer.from(wallet.privateKey.slice(2), 'hex'))

        await router.removeLiquidityWithPermit(
          token.address,
          expectedLiquidity.sub(MINIMUM_LIQUIDITY),
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
        const ETHAmount = expandTo18Decimals(1)
        await WETH.deposit({ value: ETHAmount })
        await WETH.transfer(WETHPool.address, ETHAmount)
        await WETHPool.mint(wallet.address, overrides)

        const expectedLiquidity = expandTo18Decimals(1)

        const nonce = await WETHPool.nonces(wallet.address)
        const digest = await getApprovalDigest(
          WETHPool,
          { owner: wallet.address, spender: router.address, value: expectedLiquidity.sub(MINIMUM_LIQUIDITY) },
          nonce,
          MaxUint256
        )

        const { v, r, s } = ecsign(Buffer.from(digest.slice(2), 'hex'), Buffer.from(wallet.privateKey.slice(2), 'hex'))

        await router.removeLiquidityETHWithPermit(
          expectedLiquidity.sub(MINIMUM_LIQUIDITY),
          wallet.address,
          MaxUint256,
          false,
          v,
          r,
          s,
          overrides
        )
      })

      it('gas', async () => {
        const loanAmount = expandTo18Decimals(10000)
    
        // ensure that setting price{0,1}CumulativeLast for the first time doesn't affect our gas math
        await mineBlock(provider, (await provider.getBlock('latest')).timestamp + 1)
        await pool.sync(overrides)

        await token.approve(router.address, MaxUint256)

        await mineBlock(provider, (await provider.getBlock('latest')).timestamp + 1)
        const tx = await router.addLiquidity(token.address, loanAmount, wallet.address, MaxUint256, overrides)
        const receipt = await tx.wait()
        expect(receipt.gasUsed).to.eq(
          {
            [RouterVersion.DeerfiFlashLoanRouter01]: 163132,
            [RouterVersion.DeerfiFlashLoanRouter02]: 163177
          }[routerVersion as RouterVersion]
        )
      }).retries(3)

      describe('flashLoan', () => {
        it('flashLoan: token', async () => {
          const loanAmount = expandTo18Decimals(10000)
          const premiumAmount = expandTo18Decimals(5)
      
          const data = defaultAbiCoder.encode(
            ['address'],
            [pool.address]
          )
      
          await token.transfer(pool.address, loanAmount)
          await token.transfer(receiver.address, premiumAmount)
          await expect(router01.flashLoan(token.address, receiver.address, loanAmount, MaxUint256, data))
            .to.emit(token, 'Transfer')
            .withArgs(pool.address, receiver.address, loanAmount)
            .to.emit(token, 'Transfer')
            .withArgs(receiver.address, pool.address, loanAmount.add(premiumAmount))
            .to.emit(pool, 'Sync')
            .withArgs(loanAmount.add(premiumAmount))
            .to.emit(pool, 'FlashLoan')
            .withArgs(receiver.address, router01.address, token.address, loanAmount, premiumAmount)
      
            const reserve = await pool.reserve()
            expect(reserve).to.eq(loanAmount.add(premiumAmount))
            expect(await token.balanceOf(pool.address)).to.eq(loanAmount.add(premiumAmount))
            expect(await token.balanceOf(receiver.address)).to.eq(0)
            const totalSupplyToken = await token.totalSupply()
            expect(await token.balanceOf(wallet.address)).to.eq(totalSupplyToken.sub(loanAmount).sub(premiumAmount))
        })

        it('flashLoan: eth', async () => {
          const loanAmount = expandTo18Decimals(10000)
          const premiumAmount = expandTo18Decimals(5)
          const ETHAmount = expandTo18Decimals(10005)

          const data = defaultAbiCoder.encode(
            ['address'],
            [WETHPool.address]
          )

          await WETH.deposit({ value: ETHAmount })
          await WETH.transfer(WETHPool.address, loanAmount)
          await WETH.transfer(receiver.address, premiumAmount)
          
          await expect(router01.flashLoan(WETH.address, receiver.address, loanAmount, MaxUint256, data))
            .to.emit(WETH, 'Transfer')
            .withArgs(WETHPool.address, receiver.address, loanAmount)
            .to.emit(WETH, 'Transfer')
            .withArgs(receiver.address, WETHPool.address, loanAmount.add(premiumAmount))
            .to.emit(WETHPool, 'Sync')
            .withArgs(loanAmount.add(premiumAmount))
            .to.emit(WETHPool, 'FlashLoan')
            .withArgs(receiver.address, router01.address, WETH.address, loanAmount, premiumAmount)
      
            const reserve = await WETHPool.reserve()
            expect(reserve).to.eq(loanAmount.add(premiumAmount))
            expect(await WETH.balanceOf(WETHPool.address)).to.eq(loanAmount.add(premiumAmount))
            expect(await WETH.balanceOf(receiver.address)).to.eq(0)
            const totalSupplyToken = await WETH.totalSupply()
            expect(await WETH.balanceOf(wallet.address)).to.eq(totalSupplyToken.sub(loanAmount).sub(premiumAmount))
        })
      
        it('flashloan:gas', async () => {
          const loanAmount = expandTo18Decimals(10000)
          const premiumAmount = expandTo18Decimals(5)
      
          // ensure that setting price{0,1}CumulativeLast for the first time doesn't affect our gas math
          await mineBlock(provider, (await provider.getBlock('latest')).timestamp + 1)
          await pool.sync(overrides)
      
          const data = defaultAbiCoder.encode(
            ['address'],
            [pool.address]
          )
      
          await token.transfer(pool.address, loanAmount)
          await token.transfer(receiver.address, premiumAmount)
          await mineBlock(provider, (await provider.getBlock('latest')).timestamp + 1)
          const tx = await router01.flashLoan(token.address, receiver.address, loanAmount, MaxUint256, data)
          const receipt = await tx.wait()
          expect(receipt.gasUsed).to.eq(73325)
        })
      })
    })
  }
})
