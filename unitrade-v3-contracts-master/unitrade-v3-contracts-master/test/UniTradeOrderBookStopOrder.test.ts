import { expect } from "chai"
import { ethers, deployments } from "hardhat"
import { Signer } from "ethers"
import { parseEther } from "ethers/lib/utils"
import { IUniswapV2Router02, UniTradeStaker, UniTradeOrderBook, IERC20, abi } from "../typechain"
import { DAI_ADDRESS, UNISWAP_V2_ROUTER_ADDRESS, UNITRADE_TOKEN_ADDRESS, WETH_ADDRESS, OrderType, SwapType, PlaceOrderProps } from "./helpers"

describe("UniTradeOrderBook Stop Order", () => {
  let ownerWallet: Signer
  let traderWallet: Signer
  let executorWallet: Signer
  let uniswapV2Router: IUniswapV2Router02
  let staker: UniTradeStaker
  let dai: IERC20
  let trade: IERC20
  let orderBook: UniTradeOrderBook
  let snapshotId: string

  const deadline = ethers.constants.MaxUint256

  beforeEach(async () => {
    snapshotId = await ethers.provider.send("evm_snapshot", [])
    ;[ownerWallet, traderWallet, executorWallet] = await ethers.getSigners()

    dai = (await ethers.getContractAt(abi.IERC20, DAI_ADDRESS, traderWallet)) as IERC20
    trade = (await ethers.getContractAt(abi.IERC20, UNITRADE_TOKEN_ADDRESS, traderWallet)) as IERC20
    uniswapV2Router = (await ethers.getContractAt("IUniswapV2Router02", UNISWAP_V2_ROUTER_ADDRESS, traderWallet)) as IUniswapV2Router02

    const { UniTradeStakerProxy, UniTradeOrderBookProxy } = await deployments.fixture(["UniTradeStaker", "UniTradeOrderBook"])

    staker = <UniTradeStaker>await ethers.getContractAt("UniTradeStaker", UniTradeStakerProxy.address)
    orderBook = <UniTradeOrderBook>await ethers.getContractAt("UniTradeOrderBook", UniTradeOrderBookProxy.address, traderWallet)

    // Staking some TRADE
    await uniswapV2Router.swapExactETHForTokens(0, [WETH_ADDRESS, UNITRADE_TOKEN_ADDRESS], await traderWallet.getAddress(), deadline, {
      value: parseEther("10"),
    })
    await trade.approve(staker.address, ethers.constants.MaxUint256)
    await staker.connect(traderWallet).stake(await trade.balanceOf(await traderWallet.getAddress()))
  })

  afterEach(async () => {
    await ethers.provider.send("evm_revert", [snapshotId])
  })

  describe("EthForTokens", () => {
    let orderParams: PlaceOrderProps = {
      orderType: OrderType.Stop,
      swapType: SwapType.EthForTokens,
      tokenIn: WETH_ADDRESS,
      tokenOut: DAI_ADDRESS,
      amountInOffered: parseEther("1"),
      amountOutExpected: parseEther("720"),
      executorFee: parseEther("0.05"),
    }

    const { orderType, swapType, tokenIn, tokenOut, amountInOffered, amountOutExpected: target, executorFee } = orderParams
    const pair = [tokenIn, tokenOut]

    beforeEach(async () => {
      await orderBook.placeOrder(orderType, swapType, tokenIn, tokenOut, amountInOffered, target, executorFee, {
        value: amountInOffered.add(executorFee),
      })
    })

    it("should reject execution if price is > target", async () => {
      const [, amountOut] = await uniswapV2Router.getAmountsOut(amountInOffered, pair)
      expect(amountOut.gt(target)).to.be.true

      const tx = orderBook.connect(executorWallet).executeOrder(0)
      await expect(tx).to.be.revertedWith("Amount out is > target amount")
    })

    it("should execute if price <= target", async () => {
      // changing price
      await uniswapV2Router.swapExactETHForTokens(0, pair, await traderWallet.getAddress(), deadline, {
        value: parseEther("1000"),
      })

      const [, amountOut] = await uniswapV2Router.getAmountsOut(amountInOffered, pair)
      expect(amountOut.lte(target)).to.be.true

      const tx = await orderBook.connect(executorWallet).executeOrder(0)

      await expect(tx)
        .to.emit(orderBook, "OrderExecuted")
        .withArgs(0, await executorWallet.getAddress(), [parseEther("0.998"), "717210527617065770895"], parseEther("0.002"))
    })

    it("should reject execution if price is < target margin", async () => {
      // changing price
      await uniswapV2Router.swapExactETHForTokens(0, pair, await traderWallet.getAddress(), deadline, {
        value: parseEther("20000"),
      })

      const [, amountOut] = await uniswapV2Router.getAmountsOut(amountInOffered, pair)

      const min = target.sub(target.mul(await orderBook.stopMargin()).div(100))
      expect(amountOut.lt(min)).to.be.true

      const tx = orderBook.connect(executorWallet).executeOrder(0)
      await expect(tx).to.be.revertedWith("Amount out is < target's amount margin")
    })
  })

  describe("TokensForTokens", () => {
    let orderParams: PlaceOrderProps = {
      orderType: OrderType.Stop,
      swapType: SwapType.TokensForTokens,
      tokenIn: UNITRADE_TOKEN_ADDRESS,
      tokenOut: DAI_ADDRESS,
      amountInOffered: parseEther("1"),
      amountOutExpected: parseEther("0.45"),
      executorFee: parseEther("0.05"),
    }

    const { orderType, swapType, tokenIn, tokenOut, amountInOffered, amountOutExpected: target, executorFee } = orderParams
    const pair = [tokenIn, tokenOut]

    beforeEach(async () => {
      // Getting some DAI
      await uniswapV2Router.swapExactETHForTokens(0, [WETH_ADDRESS, DAI_ADDRESS], await traderWallet.getAddress(), deadline, {
        value: parseEther("100"),
      })
      // Getting some TRADE
      await uniswapV2Router.swapExactETHForTokens(0, [WETH_ADDRESS, UNITRADE_TOKEN_ADDRESS], await traderWallet.getAddress(), deadline, {
        value: parseEther("100"),
      })

      // Creating TRADE-DAI pair
      await trade.approve(uniswapV2Router.address, ethers.constants.MaxUint256)
      await dai.approve(uniswapV2Router.address, ethers.constants.MaxUint256)

      await uniswapV2Router.addLiquidity(
        trade.address,
        dai.address,
        parseEther("2000"),
        parseEther("1000"),
        0,
        0,
        await ownerWallet.getAddress(),
        deadline
      )

      await trade.approve(orderBook.address, amountInOffered)
      await orderBook.placeOrder(orderType, swapType, tokenIn, tokenOut, amountInOffered, target, executorFee, { value: executorFee })
    })

    it("should reject execution if price is > target", async () => {
      const [, amountOut] = await uniswapV2Router.getAmountsOut(amountInOffered, pair)
      expect(amountOut.gt(target)).to.be.true

      const tx = orderBook.connect(executorWallet).executeOrder(0)
      await expect(tx).to.be.revertedWith("Amount out is > target amount")
    })

    it("should execute if price <= target", async () => {
      // changing price
      await uniswapV2Router.swapExactTokensForTokens(parseEther("125"), 0, pair, await traderWallet.getAddress(), deadline)

      const [, amountOut] = await uniswapV2Router.getAmountsOut(amountInOffered, pair)
      expect(amountOut.lte(target)).to.be.true

      const tx = await orderBook.connect(executorWallet).executeOrder(0)

      await expect(tx)
        .to.emit(orderBook, "OrderExecuted")
        .withArgs(0, await executorWallet.getAddress(), [parseEther("0.998"), "440566192456519621"], "505298106932")
    })

    it("should reject execution if price is < target margin", async () => {
      // changing price
      await uniswapV2Router.swapExactTokensForTokens(parseEther("500"), 0, pair, await traderWallet.getAddress(), deadline)

      const [, amountOut] = await uniswapV2Router.getAmountsOut(amountInOffered, pair)

      const min = target.sub(target.mul(await orderBook.stopMargin()).div(100))
      expect(amountOut.lt(min)).to.be.true

      const tx = orderBook.connect(executorWallet).executeOrder(0)
      await expect(tx).to.be.revertedWith("Amount out is < target's amount margin")
    })
  })

  describe("TokensForEth", () => {
    let orderParams: PlaceOrderProps = {
      orderType: OrderType.Stop,
      swapType: SwapType.TokensForEth,
      tokenIn: UNITRADE_TOKEN_ADDRESS,
      tokenOut: WETH_ADDRESS,
      amountInOffered: parseEther("100"),
      amountOutExpected: parseEther("0.095"),
      executorFee: parseEther("0.05"),
    }

    const { orderType, swapType, tokenIn, tokenOut, amountInOffered, amountOutExpected: target, executorFee } = orderParams
    const pair = [tokenIn, tokenOut]

    beforeEach(async () => {
      // Getting some TRADE
      await uniswapV2Router.swapExactETHForTokens(0, [WETH_ADDRESS, UNITRADE_TOKEN_ADDRESS], await traderWallet.getAddress(), deadline, {
        value: parseEther("1000"),
      })

      await trade.approve(orderBook.address, amountInOffered)
      await orderBook.placeOrder(orderType, swapType, tokenIn, tokenOut, amountInOffered, target, executorFee, { value: executorFee })
    })

    it("should reject execution if price is > target", async () => {
      const [, amountOut] = await uniswapV2Router.getAmountsOut(amountInOffered, pair)
      expect(amountOut.gt(target)).to.be.true

      const tx = orderBook.connect(executorWallet).executeOrder(0)
      await expect(tx).to.be.revertedWith("Amount out is > target amount")
    })

    it("should execute if price <= target", async () => {
      // changing price
      await trade.approve(uniswapV2Router.address, ethers.constants.MaxUint256)
      await uniswapV2Router.swapExactTokensForETH(parseEther("100000"), 0, pair, await traderWallet.getAddress(), deadline)

      const [, amountOut] = await uniswapV2Router.getAmountsOut(amountInOffered, pair)
      expect(amountOut.lte(target)).to.be.true

      const tx = await orderBook.connect(executorWallet).executeOrder(0)

      await expect(tx)
        .to.emit(orderBook, "OrderExecuted")
        .withArgs(0, await executorWallet.getAddress(), [amountInOffered, "92702703857201561"], "185405407714403")
    })

    it("should reject execution if price is < target margin", async () => {
      // changing price
      await trade.approve(uniswapV2Router.address, ethers.constants.MaxUint256)
      await uniswapV2Router.swapExactTokensForETH(parseEther("400000"), 0, pair, await traderWallet.getAddress(), deadline)

      const [, amountOut] = await uniswapV2Router.getAmountsOut(amountInOffered, pair)

      const min = target.sub(target.mul(await orderBook.stopMargin()).div(100))
      expect(amountOut.lt(min)).to.be.true

      const tx = orderBook.connect(executorWallet).executeOrder(0)
      await expect(tx).to.be.revertedWith("Amount out is < target's amount margin")
    })
  })
})
