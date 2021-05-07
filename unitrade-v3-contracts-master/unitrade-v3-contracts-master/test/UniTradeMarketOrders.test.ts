import { expect } from "chai"
import { ethers, deployments } from "hardhat"
import { BigNumber, Signer } from "ethers"
import { parseEther } from "ethers/lib/utils"
import { IUniswapV2Factory, IUniswapV2Router02, UniTradeMarketOrders, UniTradeStaker, UniTradeIncinerator, IERC20, abi } from "../typechain"
import {
  DAI_ADDRESS,
  ROCKET_V2_ADDRESS,
  UNISWAP_V2_FACTORY_ADDRESS,
  UNISWAP_V2_ROUTER_ADDRESS,
  UNITRADE_TOKEN_ADDRESS,
  USDC_ADDRESS,
  WETH_ADDRESS,
  SwapType,
} from "./helpers"

const { provider } = ethers

describe("UniTradeMarketOrders", () => {
  let wallet: Signer
  let uniswapV2Factory: IUniswapV2Factory
  let uniswapV2Router: IUniswapV2Router02
  let staker: UniTradeStaker
  let weth: IERC20
  let dai: IERC20
  let usdc: IERC20
  let rocket: IERC20
  let unitrade: IERC20
  let marketOrders: UniTradeMarketOrders
  let incinerator: UniTradeIncinerator
  let snapshotId: string

  const deadline = ethers.constants.MaxUint256

  beforeEach("setup contracts", async () => {
    snapshotId = await ethers.provider.send("evm_snapshot", [])
    ;[wallet] = await ethers.getSigners()

    weth = (await ethers.getContractAt(abi.IERC20, WETH_ADDRESS, wallet)) as IERC20
    dai = (await ethers.getContractAt(abi.IERC20, DAI_ADDRESS, wallet)) as IERC20
    usdc = (await ethers.getContractAt(abi.IERC20, USDC_ADDRESS, wallet)) as IERC20
    rocket = (await ethers.getContractAt(abi.IERC20, ROCKET_V2_ADDRESS, wallet)) as IERC20
    unitrade = (await ethers.getContractAt(abi.IERC20, UNITRADE_TOKEN_ADDRESS, wallet)) as IERC20
    uniswapV2Factory = (await ethers.getContractAt("IUniswapV2Factory", UNISWAP_V2_FACTORY_ADDRESS, wallet)) as IUniswapV2Factory
    uniswapV2Router = (await ethers.getContractAt("IUniswapV2Router02", UNISWAP_V2_ROUTER_ADDRESS, wallet)) as IUniswapV2Router02

    const { UniTradeStakerProxy, UniTradeIncineratorProxy, UniTradeMarketOrdersProxy } = await deployments.fixture([
      "UniTradeStaker",
      "UniTradeIncinerator",
      "UniTradeMarketOrders",
    ])

    staker = <UniTradeStaker>await ethers.getContractAt("UniTradeStaker", UniTradeStakerProxy.address)
    incinerator = <UniTradeIncinerator>await ethers.getContractAt("UniTradeIncinerator", UniTradeIncineratorProxy.address)
    marketOrders = <UniTradeMarketOrders>await ethers.getContractAt("UniTradeMarketOrders", UniTradeMarketOrdersProxy.address)

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

  describe("ETH->TOKEN - standard token", () => {
    const orderParams: { swapType: number; path: string[]; amountInOffered: BigNumber; amountOutExpected: BigNumber } = {
      swapType: SwapType.EthForTokens,
      path: [WETH_ADDRESS, DAI_ADDRESS],
      amountInOffered: parseEther("1"),
      amountOutExpected: parseEther("700"),
    }
    const { swapType, path, amountInOffered, amountOutExpected } = orderParams

    it("should return swap amounts", async () => {
      const [inAmount, outAmount] = await marketOrders.callStatic.executeOrder(swapType, path, amountInOffered, amountOutExpected, {
        value: amountInOffered,
      })
      expect(inAmount).to.equal(parseEther("0.998"))
      expect(outAmount).to.equal("732540183266330926563")
    })

    it("should execute an order", async () => {
      // when
      const tx = marketOrders.executeOrder(swapType, path, amountInOffered, amountOutExpected, { value: amountInOffered })

      // then
      await expect(tx)
        .to.emit(marketOrders, "OrderExecuted")
        .withArgs(
          await wallet.getAddress(),
          path,
          amountInOffered,
          amountOutExpected,
          [parseEther("0.998"), "732540183266330926563"],
          parseEther("0.002")
        )

      expect(await provider.getBalance(incinerator.address)).to.equal(0)
      expect(await provider.getBalance(staker.address)).to.equal(0)
      expect(await provider.getBalance(marketOrders.address)).to.equal(parseEther("0.002"))
    })

    it("should execute an order with routing", async () => {
      // given
      const routedPath = [WETH_ADDRESS, USDC_ADDRESS, DAI_ADDRESS]

      // when
      const tx = marketOrders.connect(wallet).executeOrder(swapType, routedPath, amountInOffered, 0, { value: amountInOffered })

      // then
      await expect(tx)
        .to.emit(marketOrders, "OrderExecuted")
        .withArgs(await wallet.getAddress(), routedPath, amountInOffered, 0, [parseEther("0.998"), "729252893198117059787"], "2000000000000000")

      expect(await provider.getBalance(incinerator.address)).to.equal(0)
      expect(await provider.getBalance(staker.address)).to.equal(0)
      expect(await provider.getBalance(marketOrders.address)).to.equal("2000000000000000")
    })

    it("should stake and burn", async () => {
      // given
      expect(await provider.getBalance(marketOrders.address)).to.equal(0)
      await marketOrders.executeOrder(swapType, path, amountInOffered, amountOutExpected, { value: amountInOffered })
      expect(await provider.getBalance(marketOrders.address)).to.equal(parseEther("0.002"))

      // when
      await marketOrders.stakeAndBurn()

      // then
      expect(await provider.getBalance(marketOrders.address)).to.equal(0)
    })
  })

  describe("ETH->TOKEN - token with fee", () => {
    const orderParams: { swapType: number; path: string[]; amountInOffered: BigNumber; amountOutExpected: BigNumber } = {
      swapType: SwapType.EthForTokens,
      path: [WETH_ADDRESS, DAI_ADDRESS],
      amountInOffered: parseEther("1"),
      amountOutExpected: BigNumber.from(`${200e6}`),
    }
    const { swapType, path, amountInOffered, amountOutExpected } = orderParams

    it("should return swap amounts", async () => {
      const response = await marketOrders
        .connect(wallet)
        .callStatic.executeOrder(swapType, path, amountInOffered, amountOutExpected, { value: amountInOffered })
      expect(response[0]).to.equal(parseEther("0.998"))
      expect(response[1]).to.equal("732540183266330926563")
    })

    it("should execute an order", async () => {
      // when
      const tx = marketOrders.connect(wallet).executeOrder(swapType, path, amountInOffered, amountOutExpected, { value: amountInOffered })

      // then
      await expect(tx)
        .to.emit(marketOrders, "OrderExecuted")
        .withArgs(
          await wallet.getAddress(),
          path,
          amountInOffered,
          amountOutExpected,
          [parseEther("0.998"), "732540183266330926563"],
          "2000000000000000"
        )

      expect(await provider.getBalance(incinerator.address)).to.equal(0)
      expect(await provider.getBalance(staker.address)).to.equal(0)
      expect(await provider.getBalance(marketOrders.address)).to.equal("2000000000000000")
    })
  })

  describe("TOKEN->ETH - standard token", () => {
    const orderParams: { swapType: number; path: string[]; amountInOffered: BigNumber; amountOutExpected: BigNumber } = {
      swapType: SwapType.TokensForEth,
      path: [DAI_ADDRESS, WETH_ADDRESS],
      amountInOffered: parseEther("1000"),
      amountOutExpected: parseEther("1.35"),
    }
    const { swapType, path, amountInOffered, amountOutExpected } = orderParams

    beforeEach(async () => {
      await dai.approve(marketOrders.address, amountInOffered)
    })

    it("should return swap amounts", async () => {
      const [inAmount, outAmount] = await marketOrders.connect(wallet).callStatic.executeOrder(swapType, path, amountInOffered, amountOutExpected)
      expect(inAmount).to.equal(amountInOffered)
      expect(outAmount).to.equal("1354186354753848361")
    })

    it("should execute an order", async () => {
      // when
      const tx = marketOrders.executeOrder(swapType, path, amountInOffered, amountOutExpected)

      // then
      const expectedFee = "2708372709507696"
      await expect(tx)
        .to.emit(marketOrders, "OrderExecuted")
        .withArgs(await wallet.getAddress(), path, amountInOffered, amountOutExpected, [amountInOffered, "1354186354753848361"], expectedFee)

      expect(await provider.getBalance(incinerator.address)).to.equal(0)
      expect(await provider.getBalance(staker.address)).to.equal(0)
      expect(await provider.getBalance(marketOrders.address)).to.equal(expectedFee)
    })

    it("should execute an order with routing", async () => {
      // given
      const routedPath = [DAI_ADDRESS, USDC_ADDRESS, WETH_ADDRESS]

      // when
      const tx = marketOrders.executeOrder(swapType, routedPath, amountInOffered, amountOutExpected)

      // then
      const expectedFee = "2703841413114220"
      await expect(tx)
        .to.emit(marketOrders, "OrderExecuted")
        .withArgs(await wallet.getAddress(), routedPath, amountInOffered, amountOutExpected, [parseEther("1000"), "1351920706557110105"], expectedFee)

      expect(await provider.getBalance(incinerator.address)).to.equal(0)
      expect(await provider.getBalance(staker.address)).to.equal(0)
      expect(await provider.getBalance(marketOrders.address)).to.equal(expectedFee)
    })

    it("should stake and burn", async () => {
      // given
      expect(await provider.getBalance(marketOrders.address)).to.equal(0)
      await marketOrders.executeOrder(swapType, path, amountInOffered, amountOutExpected, { value: amountInOffered })
      expect(await provider.getBalance(marketOrders.address)).to.equal("1000002708372709507696")

      // when
      await marketOrders.stakeAndBurn()

      // then
      expect(await provider.getBalance(marketOrders.address)).to.equal(0)
    })
  })

  describe("TOKEN->ETH - token with fee", () => {
    const orderParams: { swapType: number; path: string[]; amountInOffered: BigNumber; amountOutExpected: BigNumber } = {
      swapType: SwapType.TokensForEth,
      path: [ROCKET_V2_ADDRESS, WETH_ADDRESS],
      amountInOffered: parseEther("1"),
      amountOutExpected: parseEther("0.00000001"),
    }
    const { swapType, path, amountInOffered, amountOutExpected } = orderParams

    beforeEach(async () => {
      await dai.approve(marketOrders.address, amountInOffered)
      await rocket.approve(marketOrders.address, amountInOffered)
    })

    it("should return swap amounts", async () => {
      const [amountIn, amountOut] = await marketOrders.connect(wallet).callStatic.executeOrder(swapType, path, amountInOffered, amountOutExpected)
      expect(amountIn).to.equal(parseEther("0.97"))
      expect(amountOut).to.equal("2287076894288089")
    })

    it("should execute an order", async () => {
      // when
      const tx = marketOrders.executeOrder(swapType, path, amountInOffered, amountOutExpected)

      // then
      const expectedFee = "4574153788576"
      await expect(tx)
        .to.emit(marketOrders, "OrderExecuted")
        .withArgs(await wallet.getAddress(), path, amountInOffered, amountOutExpected, [parseEther("0.97"), "2287076894288089"], expectedFee)

      expect(await provider.getBalance(incinerator.address)).to.equal(0)
      expect(await provider.getBalance(staker.address)).to.equal(0)
      expect(await provider.getBalance(marketOrders.address)).to.equal(expectedFee)
    })
  })

  describe("TOKEN->TOKEN - standard token", () => {
    const orderParams: { swapType: number; path: string[]; amountInOffered: BigNumber; amountOutExpected: BigNumber } = {
      swapType: SwapType.TokensForTokens,
      path: [DAI_ADDRESS, USDC_ADDRESS],
      amountInOffered: parseEther("1"),
      amountOutExpected: BigNumber.from("991544"),
    }
    const { swapType, path, amountInOffered, amountOutExpected } = orderParams

    beforeEach(async () => {
      await dai.approve(marketOrders.address, amountInOffered)
    })

    it("should return swap amounts", async () => {
      const [amountIn, amountOut] = await marketOrders.callStatic.executeOrder(swapType, path, amountInOffered, amountOutExpected)
      expect(amountIn).to.equal(parseEther("0.998"))
      expect(amountOut).to.equal("999556")
    })

    it("should execute an order", async () => {
      // when
      const tx = marketOrders.executeOrder(swapType, path, amountInOffered, amountOutExpected)

      // then
      await expect(tx)
        .to.emit(marketOrders, "OrderExecuted")
        .withArgs(await wallet.getAddress(), path, amountInOffered, amountOutExpected, [parseEther("0.998"), "999556"], 0)

      expect(await provider.getBalance(incinerator.address)).to.equal(0)
      expect(await provider.getBalance(staker.address)).to.equal(0)
      expect(await provider.getBalance(marketOrders.address)).to.equal("2708412152040")
    })

    it("should execute an order with routing", async () => {
      // given
      const routedPath = [DAI_ADDRESS, WETH_ADDRESS, USDC_ADDRESS]

      // when
      const tx = marketOrders.executeOrder(swapType, routedPath, amountInOffered, amountOutExpected)

      // then
      await expect(tx)
        .to.emit(marketOrders, "OrderExecuted")
        .withArgs(await wallet.getAddress(), routedPath, amountInOffered, amountOutExpected, [parseEther("0.998"), "995139"], 0)

      expect(await provider.getBalance(incinerator.address)).to.equal(0)
      expect(await provider.getBalance(staker.address)).to.equal(0)
      expect(await provider.getBalance(marketOrders.address)).to.equal("2708412073193")
    })
  })

  describe("TOKEN->TOKEN - token with fee", () => {
    const orderParams: { swapType: number; path: string[]; amountInOffered: BigNumber; amountOutExpected: BigNumber } = {
      swapType: SwapType.TokensForTokens,
      path: [ROCKET_V2_ADDRESS, DAI_ADDRESS],
      amountInOffered: parseEther("1"),
      amountOutExpected: BigNumber.from(2000),
    }
    const { swapType, path, amountInOffered, amountOutExpected } = orderParams

    beforeEach(async () => {
      await rocket.approve(marketOrders.address, amountInOffered)

      // Creating ROCKET-USDC pair
      await dai.approve(uniswapV2Router.address, ethers.constants.MaxUint256)
      await rocket.approve(uniswapV2Router.address, ethers.constants.MaxUint256)
      await uniswapV2Router.addLiquidity(
        ROCKET_V2_ADDRESS,
        DAI_ADDRESS,
        parseEther("100"),
        parseEther("100"),
        0,
        0,
        await wallet.getAddress(),
        deadline
      )
    })

    it("should return swap amounts", async () => {
      const [amountIn, amountOut] = await marketOrders.callStatic.executeOrder(swapType, path, amountInOffered, amountOutExpected)
      expect(amountIn).to.equal(parseEther("0.96806"))
      expect(amountOut).to.equal("955929609736524645")
    })

    it("should execute an order", async () => {
      // when
      const tx = marketOrders.executeOrder(swapType, path, amountInOffered, amountOutExpected)

      // then
      await expect(tx)
        .to.emit(marketOrders, "OrderExecuted")
        .withArgs(await wallet.getAddress(), path, amountInOffered, amountOutExpected, [parseEther("0.96806"), "955929609736524645"], 0)

      expect(await provider.getBalance(incinerator.address)).to.equal(0)
      expect(await provider.getBalance(staker.address)).to.equal(0)
      expect(await provider.getBalance(marketOrders.address)).to.equal("4574212701464")
    })

    it("should execute an order with routing", async () => {
      // given
      const routedPath = [ROCKET_V2_ADDRESS, WETH_ADDRESS, DAI_ADDRESS]

      // when
      const tx = marketOrders.executeOrder(swapType, routedPath, amountInOffered, amountOutExpected)

      // then
      await expect(tx)
        .to.emit(marketOrders, "OrderExecuted")
        .withArgs(await wallet.getAddress(), routedPath, amountInOffered, amountOutExpected, [parseEther("0.96806"), "1675393656641944907"], 0)

      expect(await provider.getBalance(incinerator.address)).to.equal(0)
      expect(await provider.getBalance(staker.address)).to.equal(0)
      expect(await provider.getBalance(marketOrders.address)).to.equal("4574094699178")
    })
  })
})
