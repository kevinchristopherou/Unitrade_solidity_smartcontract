import dotenv from "dotenv"
import { HardhatUserConfig } from "hardhat/types/config"
import { parseEther } from "@ethersproject/units"
import "hardhat-deploy"
import "hardhat-deploy-ethers"
import "hardhat-gas-reporter"
import "@nomiclabs/hardhat-waffle"
import "@typechain/hardhat"
import "@nomiclabs/hardhat-etherscan"
import "hardhat-etherscan-abi"
import "hardhat-spdx-license-identifier"
import "@openzeppelin/hardhat-upgrades"

require("./plugins/ozUpgrade.js")

dotenv.config()

const { DEPLOYER_PRIVATE_KEY, ALCHEMY_API_KEY, REPORT_GAS, COINMARKETCAP_API_KEY, ETHERSCAN_API_KEY, HARDHAT_NETWORK } = process.env

export default {
  solidity: {
    version: "0.7.6",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  defaultNetwork: HARDHAT_NETWORK || "hardhat",
  networks: {
    hardhat: {
      forking: {
        url: `https://eth-mainnet.alchemyapi.io/v2/${ALCHEMY_API_KEY}`,
        blockNumber: 11543930,
      },
      accounts: {
        accountsBalance: parseEther("1000000000").toString(),
      },
    },
    mainnet: {
      url: `https://eth-mainnet.alchemyapi.io/v2/${ALCHEMY_API_KEY}`,
      accounts: DEPLOYER_PRIVATE_KEY ? [DEPLOYER_PRIVATE_KEY] : undefined,
    },
    goerli: {
      url: `https://eth-goerli.alchemyapi.io/v2/${ALCHEMY_API_KEY}`,
      accounts: DEPLOYER_PRIVATE_KEY ? [DEPLOYER_PRIVATE_KEY] : undefined,
    },
    bsc: {
      url: `https://bsc-dataseed.binance.org/`,
      accounts: DEPLOYER_PRIVATE_KEY ? [DEPLOYER_PRIVATE_KEY] : undefined,
    },
    "bsc-testnet": {
      url: `https://data-seed-prebsc-1-s1.binance.org:8545/`,
      accounts: DEPLOYER_PRIVATE_KEY ? [DEPLOYER_PRIVATE_KEY] : undefined,
    },
  },
  namedAccounts: {
    deployer: {
      default: 0,
    },
  },
  gasReporter: {
    enabled: REPORT_GAS === "true",
    currency: "USD",
    coinmarketcap: COINMARKETCAP_API_KEY,
    noColors: true,
    outputFile: "gas-report.txt",
  },
  etherscan: {
    apiKey: ETHERSCAN_API_KEY,
  },
  mocha: {
    timeout: 60000,
  },
  spdxLicenseIdentifier: {
    overwrite: true,
    runOnCompile: true,
  },
  typechain: {
    outDir: "./typechain/hardhat",
  },
} as HardhatUserConfig
