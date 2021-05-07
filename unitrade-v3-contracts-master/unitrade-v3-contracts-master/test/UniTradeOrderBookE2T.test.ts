import { expect } from "chai"
import { ethers, deployments } from "hardhat"
import { BigNumber, Signer } from "ethers"
import { parseEther } from "ethers/lib/utils"
import { IUniswapV2Factory, IUniswapV2Router02, UniTradeStaker, UniTradeOrderBook, IERC20, abi } from "../typechain"
import {
  DAI_ADDRESS,
  ROCKET_V2_ADDRESS,
  UNISWAP_V2_FACTORY_ADDRESS,
  UNISWAP_V2_ROUTER_ADDRESS,
  UNITRADE_TOKEN_ADDRESS,
  USDC_ADDRESS,
  WETH_ADDRESS,
  OrderType,
  SwapType,
  PlaceOrderProps,
} from "./helpers"

const { provider } = ethers

describe("UniTradeOrderBook E2T", () => {
  let wallet: Signer
  let wallet2: Signer
  let uniswapV2Factory: IUniswapV2Factory
  let uniswapV2Router: IUniswapV2Router02
  let staker: UniTradeStaker
  let weth: IERC20
  let dai: IERC20
  let usdc: IERC20
  let unitrade: IERC20
  let orderBook: UniTradeOrderBook
  let snapshotId: string

  const deadline = ethers.constants.MaxUint256

  beforeEach(async () => {
    snapshotId = await ethers.provider.send("evm_snapshot", [])
    ;[wallet, wallet2] = await ethers.getSigners()

    weth = (await ethers.getContractAt(abi.IERC20, WETH_ADDRESS, wallet)) as IERC20
    dai = (await ethers.getContractAt(abi.IERC20, DAI_ADDRESS, wallet)) as IERC20
    usdc = (await ethers.getContractAt(abi.IERC20, USDC_ADDRESS, wallet)) as IERC20
    unitrade = (await ethers.getContractAt(abi.IERC20, UNITRADE_TOKEN_ADDRESS, wallet)) as IERC20
    uniswapV2Factory = (await ethers.getContractAt("IUniswapV2Factory", UNISWAP_V2_FACTORY_ADDRESS, wallet)) as IUniswapV2Factory
    uniswapV2Router = (await ethers.getContractAt("IUniswapV2Router02", UNISWAP_V2_ROUTER_ADDRESS, wallet)) as IUniswapV2Router02

    const { UniTradeStakerProxy, UniTradeOrderBookProxy } = await deployments.fixture(["UniTradeStaker", "UniTradeOrderBook"])

    staker = <UniTradeStaker>await ethers.getContractAt("UniTradeStaker", UniTradeStakerProxy.address)
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

  // eth 2 token scenario

  describe("places an eth order for tokens", () => {
    let ret: any
    let response: any
    let receipt: Promise<any>
    let pairAddress: string
    let params1: PlaceOrderProps = {
      orderType: OrderType.Limit,
      swapType: SwapType.EthForTokens,
      tokenIn: WETH_ADDRESS,
      tokenOut: USDC_ADDRESS,
      amountInOffered: parseEther("1"),
      amountOutExpected: BigNumber.from("950000"),
      executorFee: parseEther("0.5"),
    }
    const { orderType, swapType, tokenIn, tokenOut, amountInOffered, amountOutExpected, executorFee } = params1

    beforeEach(async () => {
      pairAddress = await uniswapV2Factory.getPair(weth.address, usdc.address)
    })

    describe("places an invalid order", () => {
      it("without an executor fee", async () => {
        await expect(
          orderBook.callStatic.placeOrder(orderType, swapType, tokenIn, tokenOut, amountInOffered, amountOutExpected, executorFee)
        ).to.be.revertedWith("Transaction value must match offer and fee")
      })

      it("with an executor fee that is not equal to committed eth", async () => {
        await expect(
          orderBook.callStatic.placeOrder(orderType, swapType, tokenIn, tokenOut, amountInOffered, amountOutExpected, executorFee, { value: 5001 })
        ).to.be.revertedWith("Transaction value must match offer and fee")
      })

      it.skip("with an output token that has no liquidity pool", async () => {
        await expect(
          orderBook.callStatic.placeOrder(orderType, swapType, tokenIn, tokenOut, amountInOffered, amountOutExpected, executorFee, { value: 6000 })
        ).to.be.revertedWith("Unavailable pair address")
      })
    })

    // place order

    describe("places a valid order", () => {
      beforeEach(async () => {
        await dai.approve(orderBook.address, params1.amountInOffered)
      })

      describe("getting readonly callstatic data", () => {
        beforeEach(async () => {
          const { amountInOffered, executorFee } = params1
          const value = amountInOffered.add(executorFee)
          response = await orderBook.callStatic.placeOrder(orderType, swapType, tokenIn, tokenOut, amountInOffered, amountOutExpected, executorFee, {
            value,
          })
        })

        it("returns expected order id", async () => {
          expect(response).to.equal(0)
        })
      })

      describe("places order", () => {
        beforeEach(async () => {
          const { amountInOffered, executorFee } = params1
          const value = amountInOffered.add(executorFee)
          receipt = orderBook.placeOrder(orderType, swapType, tokenIn, tokenOut, amountInOffered, amountOutExpected, executorFee, { value })
          await receipt
        })

        it("emits an event", async () => {
          const { orderType, swapType, tokenIn, tokenOut, amountInOffered, amountOutExpected, executorFee } = params1
          const totalEthDeposited = amountInOffered.add(executorFee)
          await expect(receipt)
            .to.emit(orderBook, "OrderPlaced")
            .withArgs(
              0,
              orderType,
              swapType,
              await wallet.getAddress(),
              tokenIn,
              tokenOut,
              amountInOffered,
              amountOutExpected,
              executorFee,
              totalEthDeposited
            )
        })

        it("has expected ether balance", async () => {
          const { amountInOffered, executorFee } = params1
          const totalEthDeposited = amountInOffered.add(executorFee)
          expect(await provider.getBalance(orderBook.address)).to.equal(totalEthDeposited)
        })

        it("has expected active orders length", async () => {
          expect(await orderBook.callStatic.getActiveOrdersLength()).to.equal(1)
        })

        it("has expected orders length for trader address", async () => {
          expect(await orderBook.callStatic.getOrdersForAddressLength(await wallet.getAddress())).to.equal(1)
        })

        it("has expected orders length for pair address", async () => {
          expect(await orderBook.callStatic.getOrdersForAddressLength(pairAddress)).to.equal(1)
        })

        it("has expected order id for trader address", async () => {
          expect(await orderBook.callStatic.getOrderIdForAddress(await wallet.getAddress(), 0)).to.equal(0)
        })

        it("has expected order id for pair address", async () => {
          expect(await orderBook.callStatic.getOrderIdForAddress(pairAddress, 0)).to.equal(0)
        })

        it("has expected order state", async () => {
          const { orderType, swapType, amountInOffered, executorFee } = params1
          const totalEthDeposited = amountInOffered.add(executorFee)

          response = await orderBook.callStatic.getOrder(0)
          expect(response.orderType).to.equal(orderType)
          expect(response.swapType).to.equal(swapType)
          expect(response.maker).to.equal(await wallet.getAddress())
          expect(response.tokenIn).to.equal(weth.address)
          expect(response.tokenOut).to.equal(usdc.address)
          expect(response.amountInOffered).to.equal(parseEther("1"))
          expect(response.amountOutExpected).to.equal(950000)
          expect(response.executorFee).to.equal(parseEther("0.5"))
          expect(response.totalEthDeposited).to.equal(totalEthDeposited)
          expect(response.orderState).to.equal(0)
          expect(response.deflationary).to.be.false
        })

        // cancel order

        describe("cancels an order", () => {
          describe("without permission", () => {
            it("should be reverted", async () => {
              await expect(orderBook.connect(wallet2).callStatic.cancelOrder(0)).to.be.revertedWith("Permission denied")
            })
          })

          describe("with permission", () => {
            beforeEach(async () => {
              receipt = orderBook.cancelOrder(0)
              await receipt
            })

            it("emits an event", async () => {
              await expect(receipt).to.emit(orderBook, "OrderCancelled").withArgs(0)
            })

            it("token has correct balance for order book", async () => {
              expect(await dai.callStatic.balanceOf(orderBook.address)).to.equal(0)
            })

            it("has expected ether balance", async () => {
              expect(await provider.getBalance(orderBook.address)).to.equal(0)
            })

            it("has expected active orders length", async () => {
              expect(await orderBook.callStatic.getActiveOrdersLength()).to.equal(0)
            })

            it("has expected orders length for trader address", async () => {
              expect(await orderBook.callStatic.getOrdersForAddressLength(await wallet.getAddress())).to.equal(1)
            })

            it("has expected orders length for pair address", async () => {
              expect(await orderBook.callStatic.getOrdersForAddressLength(pairAddress)).to.equal(1)
            })

            it("has cancelled order state", async () => {
              response = await orderBook.callStatic.getOrder(0)
              expect(response.orderState).to.equal(1)
            })
          })
        })

        // update order

        describe("updates an order", () => {
          describe("without permission", () => {
            it("should be reverted", async () => {
              await expect(orderBook.connect(wallet2).callStatic.updateOrder(0, 2000, 400, 6000)).to.be.revertedWith("Permission denied")
            })
          })

          describe("with insufficient value", () => {
            it("should be reverted", async () => {
              await expect(
                orderBook.callStatic.updateOrder(0, parseEther("2"), 400, parseEther("0.6"), { value: parseEther("0.05") })
              ).to.be.revertedWith("Additional deposit must match")
            })
          })

          describe("with additional deposit", () => {
            beforeEach(async () => {
              receipt = orderBook.updateOrder(0, 2000, 400, 6000, { value: 2000 })
              await receipt
            })

            it("emits an event", async () => {
              await expect(receipt).to.emit(orderBook, "OrderUpdated").withArgs(0, 2000, 400, 6000)
            })

            it("has expected ether balance", async () => {
              expect(await provider.getBalance(orderBook.address)).to.equal(10000)
            })

            it("has expected active orders length", async () => {
              expect(await orderBook.callStatic.getActiveOrdersLength()).to.equal(1)
            })

            it("has expected order state", async () => {
              response = await orderBook.callStatic.getOrder(0)
              expect(response.swapType).to.equal(1)
              expect(response.maker).to.equal(await wallet.getAddress())
              expect(response.tokenIn).to.equal(weth.address)
              expect(response.tokenOut).to.equal(usdc.address)
              expect(response.amountInOffered).to.equal(2000)
              expect(response.amountOutExpected).to.equal(400)
              expect(response.executorFee).to.equal(6000)
              expect(response.totalEthDeposited).to.equal(8000)
              expect(response.orderState).to.equal(0)
              expect(response.deflationary).to.be.false
            })
          })

          describe("with refundable amount", () => {
            let tokensBeforeUpdate: BigNumber
            let balanceBeforeUpdate: BigNumber

            beforeEach(async () => {
              tokensBeforeUpdate = await dai.callStatic.balanceOf(await wallet.getAddress())
              balanceBeforeUpdate = await provider.getBalance(await wallet.getAddress())
              receipt = orderBook.updateOrder(0, parseEther("0.5"), 100, parseEther("0.2"))
              ret = await receipt
            })

            it("emits an event", async () => {
              await expect(receipt).to.emit(orderBook, "OrderUpdated").withArgs(0, parseEther("0.5"), 100, parseEther("0.2"))
            })

            it("has expected ether balance", async () => {
              expect(await provider.getBalance(orderBook.address)).to.equal(parseEther("0.7"))
            })

            it("returns ether to trader", async () => {
              const gasUsed = (await provider.getTransactionReceipt(ret.hash)).gasUsed
              const balanceAfterUpdate = await provider.getBalance(await wallet.getAddress())
              expect(balanceBeforeUpdate.sub(gasUsed.mul(ret.gasPrice)).add(parseEther("0.8"))).to.equal(balanceAfterUpdate)
            })

            it("has expected active orders length", async () => {
              expect(await orderBook.callStatic.getActiveOrdersLength()).to.equal(1)
            })

            it("has expected order state", async () => {
              response = await orderBook.callStatic.getOrder(0)
              expect(response.swapType).to.equal(1)
              expect(response.maker).to.equal(await wallet.getAddress())
              expect(response.tokenIn).to.equal(weth.address)
              expect(response.tokenOut).to.equal(usdc.address)
              expect(response.amountInOffered).to.equal(parseEther("0.5"))
              expect(response.amountOutExpected).to.equal(100)
              expect(response.executorFee).to.equal(parseEther("0.2"))
              expect(response.totalEthDeposited).to.equal(parseEther("0.7"))
              expect(response.orderState).to.equal(0)
              expect(response.deflationary).to.be.false
            })
          })
        })

        // execute order

        describe("executes an order", () => {
          let balanceBeforeExecute: BigNumber

          beforeEach(async () => {
            balanceBeforeExecute = await provider.getBalance(await wallet2.getAddress())
          })

          describe("calling statically", () => {
            it("returns swap amounts", async () => {
              response = await orderBook.connect(wallet2).callStatic.executeOrder(0)
              expect(response[0]).to.equal(parseEther("0.998"))
              expect(response[1]).to.equal("734844508")
            })
          })

          describe("executing order", () => {
            beforeEach(async () => {
              receipt = orderBook.connect(wallet2).executeOrder(0)
              ret = await receipt
            })

            it("emits an event", async () => {
              await expect(receipt)
                .to.emit(orderBook, "OrderExecuted")
                .withArgs(0, await wallet2.getAddress(), [parseEther("0.998"), "734844508"], parseEther("0.002"))
            })

            it("incinerator has balance", async () => {
              expect(await provider.getBalance(uniswapV2Router.address)).to.equal(0)
            })

            it("staker has balance", async () => {
              expect(await provider.getBalance(staker.address)).to.equal(parseEther("0.0008"))
            })

            it("executor receives ether fee", async () => {
              const gasUsed = (await provider.getTransactionReceipt(ret.hash)).gasUsed
              const balanceAfterExecute = await provider.getBalance(await wallet2.getAddress())
              expect(balanceBeforeExecute.sub(gasUsed.mul(ret.gasPrice)).add(parseEther("0.5"))).to.equal(balanceAfterExecute)
            })

            it("has expected ether balance", async () => {
              expect(await provider.getBalance(orderBook.address)).to.equal(0)
            })

            it("has expected active orders length", async () => {
              expect(await orderBook.callStatic.getActiveOrdersLength()).to.equal(0)
            })

            it("has expected order state", async () => {
              response = await orderBook.callStatic.getOrder(0)
              expect(response.orderState).to.equal(2)
            })
          })
        })
      })
    })
  })
})
