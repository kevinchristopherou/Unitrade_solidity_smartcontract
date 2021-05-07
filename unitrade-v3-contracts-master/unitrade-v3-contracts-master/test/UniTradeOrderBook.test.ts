import { expect } from "chai"
import { ethers, deployments } from "hardhat"
import { BigNumber, Signer } from "ethers"
import { parseEther } from "ethers/lib/utils"
import { IUniswapV2Router02, UniTradeStaker, UniTradeOrderBook, UniTradeIncinerator, UniTradeStaker__factory, IERC20, abi } from "../typechain"
import {
  DAI_ADDRESS,
  ROCKET_V2_ADDRESS,
  UNISWAP_V2_ROUTER_ADDRESS,
  UNITRADE_TOKEN_ADDRESS,
  USDC_ADDRESS,
  WETH_ADDRESS,
  OrderType,
  SwapType,
  PlaceOrderProps,
} from "./helpers"

describe("UniTradeOrderBook", () => {
  let wallet: Signer
  let wallet2: Signer
  let uniswapV2Router: IUniswapV2Router02
  let incinerator: UniTradeIncinerator
  let staker: UniTradeStaker
  let weth: IERC20
  let dai: IERC20
  let unitrade: IERC20
  let orderBook: UniTradeOrderBook
  let snapshotId: string

  const zeroAddress: string = ethers.constants.AddressZero
  const deadline = ethers.constants.MaxUint256

  beforeEach(async () => {
    snapshotId = await ethers.provider.send("evm_snapshot", [])
    ;[wallet, wallet2] = await ethers.getSigners()

    weth = (await ethers.getContractAt(abi.IERC20, WETH_ADDRESS, wallet)) as IERC20
    dai = (await ethers.getContractAt(abi.IERC20, DAI_ADDRESS, wallet)) as IERC20
    unitrade = (await ethers.getContractAt(abi.IERC20, UNITRADE_TOKEN_ADDRESS, wallet)) as IERC20
    uniswapV2Router = (await ethers.getContractAt("IUniswapV2Router02", UNISWAP_V2_ROUTER_ADDRESS, wallet)) as IUniswapV2Router02

    const { UniTradeStakerProxy, UniTradeIncineratorProxy, UniTradeOrderBookProxy } = await deployments.fixture([
      "UniTradeStaker",
      "UniTradeIncinerator",
      "UniTradeOrderBook",
    ])

    staker = <UniTradeStaker>await ethers.getContractAt("UniTradeStaker", UniTradeStakerProxy.address)
    incinerator = <UniTradeIncinerator>await ethers.getContractAt("UniTradeIncinerator", UniTradeIncineratorProxy.address)
    orderBook = <UniTradeOrderBook>await ethers.getContractAt("UniTradeOrderBook", UniTradeOrderBookProxy.address)

    // getting some TRADE
    await uniswapV2Router.swapExactETHForTokens(0, [WETH_ADDRESS, UNITRADE_TOKEN_ADDRESS], await wallet.getAddress(), deadline, {
      value: parseEther("10"),
    })
    await unitrade.approve(staker.address, ethers.constants.MaxUint256)
    await staker.stake(await unitrade.balanceOf(await wallet.getAddress()))

    // getting some rocket
    await uniswapV2Router.swapExactETHForTokens(0, [WETH_ADDRESS, ROCKET_V2_ADDRESS], await wallet.getAddress(), deadline, {
      value: parseEther("10"),
    })

    // getting some dai
    await uniswapV2Router.swapExactETHForTokens(0, [WETH_ADDRESS, DAI_ADDRESS], await wallet.getAddress(), deadline, {
      value: parseEther("10"),
    })

    // getting some usdc
    await uniswapV2Router.swapExactETHForTokens(0, [WETH_ADDRESS, USDC_ADDRESS], await wallet.getAddress(), deadline, {
      value: parseEther("10"),
    })
  })

  afterEach(async () => {
    await ethers.provider.send("evm_revert", [snapshotId])
  })

  // ownership test
  describe("renounce ownership", () => {
    it("has owner", async () => {
      expect(await orderBook.callStatic.owner()).to.equal(await wallet.getAddress())
    })

    it("without ownership", async () => {
      await expect(orderBook.connect(wallet2).callStatic.renounceOwnership()).to.be.revertedWith("Ownable: caller is not the owner")
    })

    it("renounced ownership", async () => {
      await orderBook.renounceOwnership()
      expect(await orderBook.callStatic.owner()).to.equal(zeroAddress)
    })
  })

  // getOrder() tests

  describe("get order data", () => {
    let response: any
    const orderParams: PlaceOrderProps = {
      orderType: OrderType.Limit,
      swapType: SwapType.TokensForTokens,
      tokenIn: DAI_ADDRESS,
      tokenOut: USDC_ADDRESS,
      amountInOffered: parseEther("1000"),
      amountOutExpected: BigNumber.from("950000"),
      executorFee: parseEther("0.5"),
    }
    const { orderType, swapType, tokenIn, tokenOut, amountInOffered, amountOutExpected, executorFee } = orderParams

    describe("for invalid order", () => {
      it("should be reverted", async () => {
        await expect(orderBook.callStatic.getOrder(0)).to.be.revertedWith("Order not found")
      })
    })

    describe("for valid order", () => {
      beforeEach(async () => {
        await dai.approve(orderBook.address, amountInOffered)
        await orderBook.placeOrder(orderType, swapType, tokenIn, tokenOut, amountInOffered, amountOutExpected, executorFee, { value: executorFee })
        response = await orderBook.callStatic.getOrder(0)
      })

      it("has expected order structure", async () => {
        expect(response.orderType).to.equal(orderType)
        expect(response.swapType).to.equal(swapType)
        expect(response.maker).to.equal(await wallet.getAddress())
        expect(response.tokenIn).to.equal(tokenIn)
        expect(response.tokenOut).to.equal(tokenOut)
        expect(response.amountInOffered).to.equal(amountInOffered)
        expect(response.amountOutExpected).to.equal(amountOutExpected)
        expect(response.executorFee).to.equal(executorFee)
        expect(response.totalEthDeposited).to.equal(executorFee)
        expect(response.orderState).to.equal(0)
        expect(response.deflationary).to.be.false
      })
    })
  })

  // update staker tests

  describe("updates the staker", () => {
    it("without ownership", async () => {
      expect(await orderBook.callStatic.owner()).to.equal(await wallet.getAddress())
      expect(await orderBook.callStatic.staker()).to.equal(staker.address)
      await expect(orderBook.connect(wallet2).callStatic.updateStaker(staker.address)).to.be.revertedWith("Ownable: caller is not the owner")
    })

    it("with ownership", async () => {
      const UniTradeStaker = (await ethers.getContractFactory("UniTradeStaker")) as UniTradeStaker__factory
      const newStaker = (await UniTradeStaker.deploy()) as UniTradeStaker
      await newStaker.initialize(UNITRADE_TOKEN_ADDRESS)
      await newStaker.deployed()

      expect(await orderBook.callStatic.updateStaker(newStaker.address)).to.be.empty
      await expect(orderBook.updateStaker(newStaker.address)).to.emit(orderBook, "StakerUpdated").withArgs(newStaker.address)
      expect(await orderBook.callStatic.staker()).to.equal(newStaker.address)
    })

    it("with renounced ownership", async () => {
      await orderBook.renounceOwnership()
      await expect(orderBook.callStatic.updateStaker(staker.address)).to.be.revertedWith("Ownable: caller is not the owner")
      expect(await orderBook.callStatic.owner()).to.equal(zeroAddress)
    })
  })

  // fee values tests

  describe("updates the fee", () => {
    it("without ownership", async () => {
      await expect(orderBook.connect(wallet2).callStatic.updateFee(1, 500)).to.be.revertedWith("Ownable: caller is not the owner")
    })

    it("with ownership", async () => {
      expect(await orderBook.callStatic.updateFee(1, 500)).to.be.empty
    })

    it("with renounced ownership", async () => {
      await orderBook.renounceOwnership()
      await expect(orderBook.callStatic.updateFee(1, 500)).to.be.revertedWith("Ownable: caller is not the owner")
    })
  })

  describe("updates the burn/stake split", () => {
    it("without ownership", async () => {
      await expect(orderBook.connect(wallet2).callStatic.updateSplit(1, 2)).to.be.revertedWith("Ownable: caller is not the owner")
    })

    it("with ownership", async () => {
      expect(await orderBook.callStatic.updateSplit(1, 2)).to.be.empty
    })

    it("with renounced ownership", async () => {
      await orderBook.renounceOwnership()
      await expect(orderBook.callStatic.updateSplit(1, 2)).to.be.revertedWith("Ownable: caller is not the owner")
    })
  })

  // stop order margin tests

  describe("updates the stopMargin percent", () => {
    it("without ownership", async () => {
      await expect(orderBook.connect(wallet2).callStatic.updateStopMargin(10)).to.be.revertedWith("Ownable: caller is not the owner")
    })

    it("with ownership", async () => {
      expect(await orderBook.stopMargin()).to.eq(25)
      expect(await orderBook.callStatic.updateStopMargin(10)).to.be.empty
      await orderBook.updateStopMargin(10)
      expect(await orderBook.stopMargin()).to.eq(10)
    })
  })
})
