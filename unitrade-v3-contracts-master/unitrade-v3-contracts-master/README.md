# Unitrade

[![CI](https://github.com/UniTradeApp/unitrade-contracts/actions/workflows/main.yml/badge.svg)](https://github.com/UniTradeApp/unitrade-contracts/actions/workflows/main.yml)

This repository contains the smart contract code and deployment scripts for the UniTrade system.

## Ethereum Mainnet Deployments

### V1

_UniTradeOrderBook_

- `0xce96c75b5b2252efb6d22770c7d7a3567c4c30f1`
- https://etherscan.io/address/0xce96c75b5b2252efb6d22770c7d7a3567c4c30f1#code

_UniTradeStaker00_

- `0x5b32cdda19ea68f8e3a8511455ef39a9d178c5ca`
- https://etherscan.io/address/0x5b32cdda19ea68f8e3a8511455ef39a9d178c5ca#code

### V2

_UniTradeOrderBook_

- `0xC1bF1B4929DA9303773eCEa5E251fDEc22cC6828`
- https://etherscan.io/address/0xC1bF1B4929DA9303773eCEa5E251fDEc22cC6828#code

_UniTradeStaker01_

- `0x6e6a543D755448fc256cfc54EcCEaD4E589477b7`
- https://etherscan.io/address/0x6e6a543D755448fc256cfc54EcCEaD4E589477b7#code

### Shared

_UniTradeIncinerator_

- `0xc54fa7403b020e78828886becd99b6caaa1433cb`
- https://etherscan.io/address/0xc54fa7403b020e78828886becd99b6caaa1433cb#code

### V3

For the latest version of the contracts, check the `deployments` folder.



## Development

To either do local development, you'll need to set some configuration values.

```sh
$ cp .env.example .env
```

Then open up `.env` and edit as you see fit. For local development, you have to set the `ALCHEMY_API_KEY` since tests run against a Ethereum mainnet fork.

**Tip:** Save a copy of the development file (e.g. `.env.hardhat`), it'll be useful when dealing with more than one network.

Next, install the project's dependencies

```sh
$ npm i
```

Finally, you'll need to compile the contracts and generate [TypeChain](https://github.com/ethereum-ts/TypeChain) files.

```sh
$ npm run compile
```



## Testing

To run the tests, run

```sh
$ npm test
```

Make sure that you're using the correct `.env` file before running tests.



## Deployment

There is a deployment script which can execute deployments onto any EVM-like chain. For proceed with the deployment, make sure that you have the `.env.<network>` file filled and then run:

```sh
$ npm run <network>:deploy
```

The project supports `mainnet`, `goerli`, `bsc` and `bsc-testnet` chains.

If you want to deploy to another chain, these files should be changed: 

- `hardhat.config.ts` (network setup)
- `package.json` (deploy-related scripts)
- `./scripts/etherscanProxyVerification.ts` (etherscan-like api endpoint)



## Verifying Contracts

After the deployment, you can run:

```sh
$ npm run <network>:verify
```

That will verify the implementation contracts and will also perform the proxy verification (i.e. `Read as Proxy` and `Write as Proxy` Etherscan features).

Note: On the moment of writing BSCScan testnet proxy verification thru API isn't working. If it occurs with you, you can do the verification manually.
This URL will also work for other networks: [https://testnet.bscscan.com/proxyContractChecker?a=<PROXY_CONTRACT_ADDRESS>](https://testnet.bscscan.com/proxyContractChecker?a=<PROXY_CONTRACT_ADDRESS>)



## Solidfied security audit report

Audit Report prepared by Solidified covering the Unitrade smart contracts
https://github.com/solidified-platform/audits/blob/master/Audit%20Report%20-%20%20Unitrade%20%5B06.10.2020%5D.pdf
