import { HardhatRuntimeEnvironment } from "hardhat/types"
import { DeployFunction } from "hardhat-deploy/types"
import {
  UNITRADE_TOKEN_ADDRESS as UNITRADE_TOKEN_ADDRESS_MAINNET,
  UNISWAP_V2_ROUTER_ADDRESS as UNISWAP_V2_ROUTER_ADDRESS_MAINNET,
} from "../test/helpers"

const { UNISWAP_V2_ROUTER, UNITRADE_TOKEN_ADDRESS } = process.env

const ContractName = "UniTradeIncinerator"

// @ts-ignore
const func: DeployFunction = async ({ getNamedAccounts, network, ozUpgrade }: HardhatRuntimeEnvironment) => {
  const { deployer } = await getNamedAccounts()

  const uniswapV2RouterAddress = network.name === "hardhat" ? UNISWAP_V2_ROUTER_ADDRESS_MAINNET : UNISWAP_V2_ROUTER
  const unitradeTokenAddress = network.name === "hardhat" ? UNITRADE_TOKEN_ADDRESS_MAINNET : UNITRADE_TOKEN_ADDRESS

  await ozUpgrade.deployOrUpgrade(
    ContractName,
    { from: deployer, log: true },
    {
      initializer: { method: "initialize", args: [uniswapV2RouterAddress, unitradeTokenAddress] },
      // bellow attributes for upgrading
      // postUpgrade: { method: "postUpgrade", args: [] }, // method to  exec after upgrade
      upgrades: [], // you should keep the list of upgrades and add the new one at the last
    }
  )
}

export default func

func.tags = [ContractName]
