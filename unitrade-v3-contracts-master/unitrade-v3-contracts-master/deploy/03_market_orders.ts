import { HardhatRuntimeEnvironment } from "hardhat/types"
import { DeployFunction } from "hardhat-deploy/types"

const ContractName = "UniTradeMarketOrders"

// @ts-ignore
const func: DeployFunction = async ({ getNamedAccounts, deployments, ozUpgrade }: HardhatRuntimeEnvironment) => {
  const { get } = deployments
  const { deployer } = await getNamedAccounts()

  const UniTradeOrderBook = await get("UniTradeOrderBookProxy")

  await ozUpgrade.deployOrUpgrade(
    ContractName,
    { from: deployer, log: true },
    {
      initializer: {
        method: "initialize",
        args: [UniTradeOrderBook.address],
      },
      // bellow attributes for upgrading
      // postUpgrade: { method: "postUpgrade", args: [] }, // method to  exec after upgrade
      upgrades: [], // you should keep the list of upgrades and add the new one at  the last
    }
  )
}

export default func

func.tags = [ContractName]
func.dependencies = ["UniTradeOrderBook"]
