import { HardhatRuntimeEnvironment } from "hardhat/types"
import { DeployFunction } from "hardhat-deploy/types"
import { UNISWAP_V2_ROUTER_ADDRESS as UNISWAP_V2_ROUTER_ADDRESS_MAINNET } from "../test/helpers"

const { UNISWAP_V2_ROUTER } = process.env

const ContractName = "UniTradeOrderBook"

// @ts-ignore
const func: DeployFunction = async ({ getNamedAccounts, deployments, ozUpgrade, network }: HardhatRuntimeEnvironment) => {
  const { get } = deployments
  const { deployer } = await getNamedAccounts()

  const uniswapV2RouterAddress = network.name === "hardhat" ? UNISWAP_V2_ROUTER_ADDRESS_MAINNET : UNISWAP_V2_ROUTER
  const UniTradeStaker = await get("UniTradeStakerProxy")
  const UniTradeIncinerator = await get("UniTradeIncineratorProxy")
  const feeMul = 2
  const feeDiv = 1000
  const splitMul = 6
  const splitDiv = 10
  const stopMargin = 25

  await ozUpgrade.deployOrUpgrade(
    ContractName,
    { from: deployer, log: true },
    {
      initializer: {
        method: "initialize",
        args: [uniswapV2RouterAddress, UniTradeIncinerator.address, UniTradeStaker.address, feeMul, feeDiv, splitMul, splitDiv, stopMargin],
      },
      // bellow attributes for upgrading
      // postUpgrade: { method: "postUpgrade", args: [] }, // method to  exec after upgrade
      upgrades: [], // you should keep the list of upgrades and add the new one at  the last
    }
  )
}

export default func

func.tags = [ContractName]
func.dependencies = ["UniTradeStaker", "UniTradeIncinerator"]
