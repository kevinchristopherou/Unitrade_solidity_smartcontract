import { BigNumber } from "ethers"

export const UNISWAP_V2_FACTORY_ADDRESS = "0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f"
export const UNISWAP_V2_ROUTER_ADDRESS = "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D"
export const ROCKET_V2_ADDRESS = "0x78571acCAf24052795F98B11F093b488a2d9EAA4"
export const USDC_ADDRESS = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48"
export const WETH_ADDRESS = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2"
export const DAI_ADDRESS = "0x6B175474E89094C44Da98b954EedeAC495271d0F"
export const UNITRADE_TOKEN_ADDRESS = "0x6f87d756daf0503d08eb8993686c7fc01dc44fb1"

export enum SwapType {
  TokensForTokens = 0,
  EthForTokens = 1,
  TokensForEth = 2,
  Invalid = 3,
}

export enum OrderType {
  Limit = 0,
  Stop = 1,
  Invalid = 2,
}

export interface PlaceOrderProps {
  orderType: OrderType
  swapType: SwapType
  tokenIn: string
  tokenOut: string
  amountInOffered: BigNumber
  amountOutExpected: BigNumber
  executorFee: BigNumber
}
