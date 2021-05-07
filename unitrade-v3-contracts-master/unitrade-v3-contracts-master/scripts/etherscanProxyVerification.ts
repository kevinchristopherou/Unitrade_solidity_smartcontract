import { deployments, network } from "hardhat"
import axios, { AxiosRequestConfig } from "axios"
import qs from "qs"
import chalk from "chalk"

const { ETHERSCAN_API_KEY } = process.env

const blockScanUrl: { [network: string]: string } = {
  mainnet: `https://api.etherscan.io`,
  goerli: `https://api-goerli.etherscan.io`,
  "bsc-testnet": `https://api-testnet.bscscan.com`,
  bsc: `https://api.bscscan.com`,
}

const verifyProxy = async (proxyContract: string, implementationContract: string) => {
  const { name: networkName } = network
  if (!blockScanUrl[networkName]) {
    throw Error(`Network ${networkName} isn't supported. Please amend the proxy verification script code.`)
  }

  console.log(chalk.yellow(`Sending proxy verification request for ${proxyContract} -> ${implementationContract}...`))
  const proxy = await deployments.get(proxyContract)
  const implementation = await deployments.get(implementationContract)

  const url = `${blockScanUrl[networkName]}/api?module=contract&action=verifyproxycontract&apikey=${ETHERSCAN_API_KEY}`
  const options: AxiosRequestConfig = {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    data: qs.stringify({ address: proxy.address, expectedimplementation: implementation.address }),
    url,
  }
  const {
    data: { message: okOrNotOk, result: guidOrError },
  } = await axios(options)

  if (okOrNotOk === "NOTOK") {
    console.log(chalk.red(`Verification failed. Reason: ${guidOrError}`))
  } else {
    console.log(
      `Use ${chalk.blue(
        `${blockScanUrl[networkName]}/api?module=contract&action=checkproxyverification&guid=${guidOrError}&apikey=${ETHERSCAN_API_KEY}`
      )} to check request status`
    )
  }
}

const main = async () => {
  const allDeployments = await deployments.all()
  const allNames = Object.entries(allDeployments).map(([key]) => key)
  const proxiesNames = allNames.filter((name) => name.match(/Proxy$/g))

  for (const proxyName of proxiesNames) {
    const firstImplementation = proxyName.replace("Proxy", "")
    const implementations = allNames.filter((name) => name.match(new RegExp(`(${firstImplementation}$|${firstImplementation}V[0-9])`)))
    const [lastImplementation] = implementations.sort((a, b) => a.localeCompare(b)).slice(-1)
    await verifyProxy(proxyName, lastImplementation)
  }
}

main()
