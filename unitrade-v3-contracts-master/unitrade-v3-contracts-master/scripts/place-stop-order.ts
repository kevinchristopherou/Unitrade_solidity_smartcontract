import { ethers } from "hardhat"
import { IUniswapV2Router02__factory, UniTradeOrderBook__factory } from "../typechain"
import { address as GOERLI_ORDERBOOK_ADDRESS } from "../deployments/goerli/UniTradeOrderBook.json"
import { UNISWAP_V2_ROUTER_ADDRESS, OrderType, SwapType, PlaceOrderProps } from "../test/helpers"
import { formatEther, formatUnits, parseEther } from "@ethersproject/units"

const GOERLI_UNI_ADDRESS = "0x1f9840a85d5af5bf1d1762f925bdaddc4201f984"
const GOERLI_WETH_ADDRESS = "0xb4fbf271143f4fbf7b91a5ded31805e42b2208d6"
const GOERLI_UNI_WETH_PAIR_ADDRESS = "0x28cee28a7C4b4022AC92685C07d2f33Ab1A0e122"

const { DEPLOYER_PRIVATE_KEY } = process.env

const main = async () => {
  // setup
  const provider = ethers.providers.getDefaultProvider("goerli")
  const wallet = new ethers.Wallet(DEPLOYER_PRIVATE_KEY!, provider)
  const uniTradeOrderBook = UniTradeOrderBook__factory.connect(GOERLI_ORDERBOOK_ADDRESS!, wallet)
  const uniswapV2Router = IUniswapV2Router02__factory.connect(UNISWAP_V2_ROUTER_ADDRESS, wallet)
  // // @ts-ignore
  // const uniswapPair = await ethers.getVerifiedContractAt(GOERLI_UNI_WETH_PAIR_ADDRESS)

  // get some UNI
  const tx = await uniswapV2Router.swapExactETHForTokens(0, [GOERLI_WETH_ADDRESS, GOERLI_UNI_ADDRESS], wallet.address, ethers.constants.MaxUint256, {
    value: parseEther("10"),
    gasLimit: 500000,
  })
  console.log(tx.hash)
  await tx.wait()

  // // get current price
  // const [reserve0, reserve1] = await uniswapPair.getReserves()
  // console.log(formatEther(reserve0))
  // console.log(formatEther(reserve1))

  const [, price] = await uniswapV2Router.getAmountsOut(parseEther("1"), [GOERLI_WETH_ADDRESS, GOERLI_UNI_ADDRESS])
  console.log(`price = ${formatEther(price)}`)

  // placing a new order
  // const orderParams: PlaceOrderProps = {
  //   orderType: OrderType.Stop,
  //   swapType: SwapType.EthForTokens,
  //   tokenIn: GOERLI_WETH_ADDRESS,
  //   tokenOut: GOERLI_UNI_ADDRESS,
  //   amountInOffered: parseEther("1"),
  //   amountOutExpected: parseEther("10.05"),
  //   executorFee: parseEther("0.05"),
  // }
  // const { orderType, swapType, tokenIn, tokenOut, amountInOffered, amountOutExpected: target, executorFee } = orderParams
  // const tx = await uniTradeOrderBook.placeOrder(orderType, swapType, tokenIn, tokenOut, amountInOffered, target, executorFee, {
  //   value: amountInOffered.add(executorFee),
  // })
  // console.log(tx.hash)
  // await tx.wait()
}

main()
