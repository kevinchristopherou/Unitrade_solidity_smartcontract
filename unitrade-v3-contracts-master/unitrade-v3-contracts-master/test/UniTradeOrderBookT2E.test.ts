import { expect } from "chai"
import { ethers, deployments } from "hardhat"
import { BigNumber, Signer } from "ethers"
import { parseEther } from "ethers/lib/utils"
import { IUniswapV2Factory, IUniswapV2Router02, UniTradeStaker, UniTradeOrderBook, UniTradeIncinerator, IERC20, abi } from "../typechain"
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

describe("UniTradeOrderBook T2E", () => {
  let wallet: Signer
  let wallet2: Signer
  let uniswapV2Factory: IUniswapV2Factory
  let uniswapV2Router: IUniswapV2Router02
  let incinerator: UniTradeIncinerator
  let staker: UniTradeStaker
  let weth: IERC20
  let dai: IERC20
  let usdc: IERC20
  let rocket: IERC20
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
    rocket = (await ethers.getContractAt(abi.IERC20, ROCKET_V2_ADDRESS, wallet)) as IERC20
    unitrade = (await ethers.getContractAt(abi.IERC20, UNITRADE_TOKEN_ADDRESS, wallet)) as IERC20
    uniswapV2Factory = (await ethers.getContractAt("IUniswapV2Factory", UNISWAP_V2_FACTORY_ADDRESS, wallet)) as IUniswapV2Factory
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

  // token 2 eth scenario

  describe("places a regular token order for eth", () => {
    let ret: any
    let response: any
    let receipt: Promise<any>
    let pairAddress: string
    let params1: PlaceOrderProps = {
      orderType: OrderType.Limit,
      swapType: SwapType.TokensForEth,
      tokenIn: DAI_ADDRESS,
      tokenOut: WETH_ADDRESS,
      amountInOffered: parseEther("1000"),
      amountOutExpected: parseEther("0.01"),
      executorFee: parseEther("0.5"),
    }
    const { orderType, swapType, tokenIn, tokenOut, amountInOffered, amountOutExpected, executorFee } = params1

    beforeEach(async () => {
      pairAddress = await uniswapV2Factory.getPair(dai.address, weth.address)
    })

    describe("places an invalid order", () => {
      it("without an executor fee", async () => {
        await expect(
          orderBook.callStatic.placeOrder(orderType, swapType, tokenIn, tokenOut, amountInOffered, amountOutExpected, executorFee)
        ).to.be.revertedWith("Transaction value must match executor fee")
      })

      it("with an executor fee that is not equal to committed eth", async () => {
        await expect(
          orderBook.callStatic.placeOrder(orderType, swapType, tokenIn, tokenOut, amountInOffered, amountOutExpected, executorFee, { value: 5001 })
        ).to.be.revertedWith("Transaction value must match executor fee")
      })

      it("with an output token that is not acceptable", async () => {
        await expect(
          orderBook.callStatic.placeOrder(OrderType.Limit, SwapType.TokensForEth, dai.address, usdc.address, 1000, 2000, 5000, { value: 5000 })
        ).to.be.revertedWith("Token out must be WETH")
      })

      it("without token pre-approval", async () => {
        const { executorFee } = params1
        await expect(
          orderBook.callStatic.placeOrder(orderType, swapType, tokenIn, tokenOut, amountInOffered, amountOutExpected, executorFee, {
            value: executorFee,
          })
        ).to.be.revertedWith("TransferHelper: TRANSFER_FROM_FAILED")
      })
    })

    // place order

    describe("places a valid order", () => {
      beforeEach(async () => {
        await dai.approve(orderBook.address, params1.amountInOffered)
      })

      describe("getting readonly callstatic data", () => {
        beforeEach(async () => {
          const { executorFee } = params1
          response = await orderBook.callStatic.placeOrder(orderType, swapType, tokenIn, tokenOut, amountInOffered, amountOutExpected, executorFee, {
            value: executorFee,
          })
        })

        it("returns expected order id", async () => {
          expect(response).to.equal(0)
        })
      })

      describe("places order", () => {
        beforeEach(async () => {
          const { executorFee } = params1
          receipt = orderBook.placeOrder(orderType, swapType, tokenIn, tokenOut, amountInOffered, amountOutExpected, executorFee, {
            value: executorFee,
          })
          await receipt
        })

        it("emits an event", async () => {
          const totalEthDeposited = executorFee
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

        it("token has correct balance for order book", async () => {
          const { amountInOffered } = params1
          expect(await dai.callStatic.balanceOf(orderBook.address)).to.equal(amountInOffered)
        })

        it("has expected ether balance", async () => {
          const { executorFee } = params1
          expect(await provider.getBalance(orderBook.address)).to.equal(executorFee)
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
          const totalEthDeposited = executorFee

          response = await orderBook.callStatic.getOrder(0)
          expect(response.orderType).to.equal(orderType)
          expect(response.swapType).to.equal(swapType)
          expect(response.maker).to.equal(await wallet.getAddress())
          expect(response.tokenIn).to.equal(tokenIn)
          expect(response.tokenOut).to.equal(tokenOut)
          expect(response.amountInOffered).to.equal(amountInOffered)
          expect(response.amountOutExpected).to.equal(amountOutExpected)
          expect(response.executorFee).to.equal(executorFee)
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
              await expect(orderBook.connect(wallet2).callStatic.updateOrder(0, 2000, 4000, 6000)).to.be.revertedWith("Permission denied")
            })
          })

          describe("with insufficient value", () => {
            it("should be reverted", async () => {
              await expect(orderBook.callStatic.updateOrder(0, 2000, 4000, parseEther("0.6"), { value: parseEther("0.05") })).to.be.revertedWith(
                "Additional fee must match"
              )
            })
          })

          describe("without token pre-approval", () => {
            it("should be reverted", async () => {
              await expect(orderBook.callStatic.updateOrder(0, parseEther("2000"), 4000, 6000, { value: 1000 })).to.be.revertedWith(
                "TransferHelper: TRANSFER_FROM_FAILED"
              )
            })
          })

          describe("with additional deposit", () => {
            beforeEach(async () => {
              await dai.approve(orderBook.address, 1000)
              receipt = orderBook.updateOrder(0, 2000, 4000, 6000, { value: 1000 })
              await receipt
            })

            it("emits an event", async () => {
              await expect(receipt).to.emit(orderBook, "OrderUpdated").withArgs(0, 2000, 4000, 6000)
            })

            it("token has correct balance for order book", async () => {
              expect(await dai.callStatic.balanceOf(orderBook.address)).to.equal(2000)
            })

            it("has expected ether balance", async () => {
              expect(await provider.getBalance(orderBook.address)).to.equal(7000)
            })

            it("has expected active orders length", async () => {
              expect(await orderBook.callStatic.getActiveOrdersLength()).to.equal(1)
            })

            it("has expected order state", async () => {
              response = await orderBook.callStatic.getOrder(0)
              expect(response.swapType).to.equal(2)
              expect(response.maker).to.equal(await wallet.getAddress())
              expect(response.tokenIn).to.equal(dai.address)
              expect(response.tokenOut).to.equal(weth.address)
              expect(response.amountInOffered).to.equal(2000)
              expect(response.amountOutExpected).to.equal(4000)
              expect(response.executorFee).to.equal(6000)
              expect(response.totalEthDeposited).to.equal(6000)
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
              receipt = orderBook.updateOrder(0, parseEther("500"), 1000, parseEther("0.3"))
              ret = await receipt
            })

            it("emits an event", async () => {
              await expect(receipt).to.emit(orderBook, "OrderUpdated").withArgs(0, parseEther("500"), 1000, parseEther("0.3"))
            })

            it("token has correct balance for order book", async () => {
              expect(await dai.callStatic.balanceOf(orderBook.address)).to.equal(parseEther("500"))
            })

            it("token has correct balance for trader", async () => {
              const tokensAfterUpdate = await dai.callStatic.balanceOf(await wallet.getAddress())
              expect(tokensAfterUpdate.sub(tokensBeforeUpdate)).to.equal(parseEther("500"))
            })

            it("has expected ether balance", async () => {
              expect(await provider.getBalance(orderBook.address)).to.equal(parseEther("0.3"))
            })

            it("returns ether to trader", async () => {
              const gasUsed = (await provider.getTransactionReceipt(ret.hash)).gasUsed
              const balanceAfterUpdate = await provider.getBalance(await wallet.getAddress())
              expect(balanceBeforeUpdate.sub(gasUsed.mul(ret.gasPrice)).add(parseEther("0.2"))).to.equal(balanceAfterUpdate)
            })

            it("has expected active orders length", async () => {
              expect(await orderBook.callStatic.getActiveOrdersLength()).to.equal(1)
            })

            it("has expected order state", async () => {
              response = await orderBook.callStatic.getOrder(0)
              expect(response.swapType).to.equal(2)
              expect(response.maker).to.equal(await wallet.getAddress())
              expect(response.tokenIn).to.equal(dai.address)
              expect(response.tokenOut).to.equal(weth.address)
              expect(response.amountInOffered).to.equal(parseEther("500"))
              expect(response.amountOutExpected).to.equal(1000)
              expect(response.executorFee).to.equal(parseEther("0.3"))
              expect(response.totalEthDeposited).to.equal(parseEther("0.3"))
              expect(response.orderState).to.equal(0)
              expect(response.deflationary).to.be.false
            })
          })
        })

        // execute order

        describe("executes an order", () => {
          let balanceBeforeExecute: BigNumber

          beforeEach(async () => {
            //set different fees/splits
            await orderBook.updateFee(1, 500) // 0.2%
            await orderBook.updateSplit(1, 2) // 50/50
            balanceBeforeExecute = await provider.getBalance(await wallet2.getAddress())
          })

          describe("calling statically", () => {
            it("returns swap amounts", async () => {
              response = await orderBook.connect(wallet2).callStatic.executeOrder(0)
              expect(response[0]).to.equal(parseEther("1000"))
              expect(response[1]).to.equal("1354186354753848361")
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
                .withArgs(0, await wallet2.getAddress(), [parseEther("1000"), "1354186354753848361"], "2708372709507696")
            })

            it("incinerator has balance", async () => {
              expect(await provider.getBalance(incinerator.address)).to.equal("1354186354753848")
            })

            it("staker has balance", async () => {
              expect(await provider.getBalance(staker.address)).to.equal("1354186354753848")
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

  // fee token 2 eth scenario

  describe("places a fee charging token order for eth", () => {
    let ret: any
    let response: any
    let receipt: Promise<any>
    let pairAddress: string
    let params1: PlaceOrderProps = {
      orderType: OrderType.Limit,
      swapType: SwapType.TokensForEth,
      tokenIn: ROCKET_V2_ADDRESS,
      tokenOut: WETH_ADDRESS,
      amountInOffered: parseEther("1000"),
      amountOutExpected: parseEther("1"),
      executorFee: parseEther("0.5"),
    }
    const { orderType, swapType, tokenIn, tokenOut, amountInOffered, amountOutExpected, executorFee } = params1

    beforeEach(async () => {
      pairAddress = await uniswapV2Factory.getPair(rocket.address, weth.address)
    })

    describe("places an invalid order", () => {
      it("without an executor fee", async () => {
        await expect(
          orderBook.callStatic.placeOrder(orderType, swapType, tokenIn, tokenOut, amountInOffered, amountOutExpected, executorFee)
        ).to.be.revertedWith("Transaction value must match executor fee")
      })

      it("with an executor fee that is not equal to committed eth", async () => {
        await expect(
          orderBook.callStatic.placeOrder(orderType, swapType, tokenIn, tokenOut, amountInOffered, amountOutExpected, executorFee, { value: 4999 })
        ).to.be.revertedWith("Transaction value must match executor fee")
      })

      it("with an output token that is not acceptable", async () => {
        await expect(
          orderBook.callStatic.placeOrder(OrderType.Limit, SwapType.TokensForEth, rocket.address, usdc.address, 1000, 2000, 5000, { value: 5000 })
        ).to.be.revertedWith("Token out must be WETH")
      })

      it("without token pre-approval", async () => {
        const { executorFee } = params1
        await expect(
          orderBook.callStatic.placeOrder(orderType, swapType, tokenIn, tokenOut, amountInOffered, amountOutExpected, executorFee, {
            value: executorFee,
          })
        ).to.be.revertedWith("TransferHelper: TRANSFER_FROM_FAILED")
      })
    })

    // place order

    describe("places a valid order", () => {
      beforeEach(async () => {
        await rocket.approve(orderBook.address, params1.amountInOffered)
      })

      describe("getting readonly callstatic data", () => {
        beforeEach(async () => {
          const { executorFee } = params1
          response = await orderBook.callStatic.placeOrder(orderType, swapType, tokenIn, tokenOut, amountInOffered, amountOutExpected, executorFee, {
            value: executorFee,
          })
        })

        it("returns expected order id", async () => {
          expect(response).to.equal(0)
        })
      })

      describe("places order", () => {
        beforeEach(async () => {
          const { executorFee } = params1
          const value = executorFee
          receipt = orderBook.placeOrder(orderType, swapType, tokenIn, tokenOut, amountInOffered, amountOutExpected, executorFee, { value })
          await receipt
        })

        it("emits an event", async () => {
          await expect(receipt)
            .to.emit(orderBook, "OrderPlaced")
            .withArgs(
              0,
              OrderType.Limit,
              SwapType.TokensForEth,
              await wallet.getAddress(),
              rocket.address,
              weth.address,
              parseEther("970"),
              parseEther("1"),
              parseEther("0.5"),
              parseEther("0.5")
            )
        })

        it("token has correct balance for order book", async () => {
          expect(await rocket.callStatic.balanceOf(orderBook.address)).to.equal(parseEther("970"))
        })

        it("has expected ether balance", async () => {
          expect(await provider.getBalance(orderBook.address)).to.equal(parseEther("0.5"))
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
          response = await orderBook.callStatic.getOrder(0)
          expect(response.swapType).to.equal(2)
          expect(response.maker).to.equal(await wallet.getAddress())
          expect(response.tokenIn).to.equal(rocket.address)
          expect(response.tokenOut).to.equal(weth.address)
          expect(response.amountInOffered).to.equal(parseEther("970"))
          expect(response.amountOutExpected).to.equal(parseEther("1"))
          expect(response.executorFee).to.equal(parseEther("0.5"))
          expect(response.totalEthDeposited).to.equal(parseEther("0.5"))
          expect(response.orderState).to.equal(0)
          expect(response.deflationary).to.be.true
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
              expect(await rocket.callStatic.balanceOf(orderBook.address)).to.equal(0)
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
              await expect(orderBook.connect(wallet2).callStatic.updateOrder(0, 2000, 4000, 6000)).to.be.revertedWith("Permission denied")
            })
          })

          describe("with insufficient value", () => {
            it("should be reverted", async () => {
              await expect(orderBook.callStatic.updateOrder(0, 2000, 4000, parseEther("0.6"), { value: 500 })).to.be.revertedWith(
                "Additional fee must match"
              )
            })
          })

          describe("without token pre-approval", () => {
            it("should be reverted", async () => {
              await expect(orderBook.callStatic.updateOrder(0, parseEther("2000"), 4000, 6000, { value: 1000 })).to.be.revertedWith(
                "TransferHelper: TRANSFER_FROM_FAILED"
              )
            })
          })

          describe("with additional deposit", () => {
            beforeEach(async () => {
              await rocket.approve(orderBook.address, 1010) // this includes the difference in actual received
              receipt = orderBook.updateOrder(0, 2000, 4000, 6000, { value: 1000 })
              await receipt
            })

            it("emits an event", async () => {
              await expect(receipt).to.emit(orderBook, "OrderUpdated").withArgs(0, 2000, 4000, 6000)
            })

            it("token has correct balance for order book", async () => {
              expect(await rocket.callStatic.balanceOf(orderBook.address)).to.equal(2000)
            })

            it("has expected ether balance", async () => {
              expect(await provider.getBalance(orderBook.address)).to.equal(7000)
            })

            it("has expected active orders length", async () => {
              expect(await orderBook.callStatic.getActiveOrdersLength()).to.equal(1)
            })

            it("has expected order state", async () => {
              response = await orderBook.callStatic.getOrder(0)
              expect(response.swapType).to.equal(2)
              expect(response.maker).to.equal(await wallet.getAddress())
              expect(response.tokenIn).to.equal(rocket.address)
              expect(response.tokenOut).to.equal(weth.address)
              expect(response.amountInOffered).to.equal(2000)
              expect(response.amountOutExpected).to.equal(4000)
              expect(response.executorFee).to.equal(6000)
              expect(response.totalEthDeposited).to.equal(6000)
              expect(response.orderState).to.equal(0)
              expect(response.deflationary).to.be.true
            })
          })

          describe("with refundable amount", () => {
            let tokensBeforeUpdate: BigNumber
            let balanceBeforeUpdate: BigNumber

            beforeEach(async () => {
              tokensBeforeUpdate = await rocket.callStatic.balanceOf(await wallet.getAddress())
              balanceBeforeUpdate = await provider.getBalance(await wallet.getAddress())
              await rocket.approve(orderBook.address, parseEther("1000"))
              receipt = orderBook.updateOrder(0, parseEther("1000"), parseEther("0.01"), parseEther("0.3"))
              ret = await receipt
            })

            it("emits an event", async () => {
              await expect(receipt).to.emit(orderBook, "OrderUpdated").withArgs(0, parseEther("999.1"), parseEther("0.01"), parseEther("0.3"))
            })

            it("token has correct balance for order book", async () => {
              expect(await rocket.callStatic.balanceOf(orderBook.address)).to.equal(parseEther("999.1"))
            })

            it("token has correct balance for trader", async () => {
              const tokensAfterUpdate = await rocket.callStatic.balanceOf(await wallet.getAddress())
              expect(tokensAfterUpdate.sub(tokensBeforeUpdate)).to.equal("-30000000000000000000")
            })

            it("has expected ether balance", async () => {
              expect(await provider.getBalance(orderBook.address)).to.equal(parseEther("0.3"))
            })

            // FIX-ME
            it.skip("returns ether to trader", async () => {
              const gasUsed = (await provider.getTransactionReceipt(ret.hash)).gasUsed
              const balanceAfterUpdate = await provider.getBalance(await wallet.getAddress())
              expect(balanceBeforeUpdate.sub(gasUsed.mul(ret.gasPrice)).add(parseEther("0.2"))).to.equal(balanceAfterUpdate)
            })

            it("has expected active orders length", async () => {
              expect(await orderBook.callStatic.getActiveOrdersLength()).to.equal(1)
            })

            it("has expected order state", async () => {
              response = await orderBook.callStatic.getOrder(0)
              expect(response.swapType).to.equal(2)
              expect(response.maker).to.equal(await wallet.getAddress())
              expect(response.tokenIn).to.equal(rocket.address)
              expect(response.tokenOut).to.equal(weth.address)
              expect(response.amountInOffered).to.equal(parseEther("999.1"))
              expect(response.amountOutExpected).to.equal(parseEther("0.01"))
              expect(response.executorFee).to.equal(parseEther("0.3"))
              expect(response.totalEthDeposited).to.equal(parseEther("0.3"))
              expect(response.orderState).to.equal(0)
              expect(response.deflationary).to.be.true
            })
          })
        })

        // execute order

        describe("executes an order", () => {
          let balanceBeforeExecute: BigNumber

          beforeEach(async () => {
            //@todo check whether WETH token balance or contract ether balance used for result
            balanceBeforeExecute = await provider.getBalance(await wallet2.getAddress())
          })

          describe("calling statically", () => {
            it("returns swap amounts", async () => {
              response = await orderBook.connect(wallet2).callStatic.executeOrder(0)
              expect(response[0]).to.equal(parseEther("970"))
              expect(response[1]).to.equal("2257966611490873838")
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
                .withArgs(0, await wallet2.getAddress(), [parseEther("970"), "2257966611490873838"], "4515933222981747")
            })

            it("incinerator has balance", async () => {
              expect(await provider.getBalance(incinerator.address)).to.equal("2709559933789048")
            })

            it("staker has balance", async () => {
              expect(await provider.getBalance(staker.address)).to.equal("1806373289192699")
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
