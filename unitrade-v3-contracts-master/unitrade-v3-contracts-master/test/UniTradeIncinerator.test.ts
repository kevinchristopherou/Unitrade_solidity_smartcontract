import { expect } from "chai"
import { ethers, deployments } from "hardhat"
import { UniTradeIncinerator } from "../typechain"
import { ChainId, WETH } from "@uniswap/sdk"

describe("UniTradeIncinerator", () => {
  const chainId = ChainId.ROPSTEN
  let wallet
  let incinerator: UniTradeIncinerator
  let wethAddress: string
  let snapshotId: string

  beforeEach(async () => {
    snapshotId = await ethers.provider.send("evm_snapshot", [])
    ;[wallet] = await ethers.getSigners()
    wethAddress = WETH[chainId].address

    const { UniTradeIncineratorProxy } = await deployments.fixture(["UniTradeIncinerator"])
    incinerator = <UniTradeIncinerator>await ethers.getContractAt("UniTradeIncinerator", UniTradeIncineratorProxy.address)
  })

  afterEach(async () => {
    await ethers.provider.send("evm_revert", [snapshotId])
  })

  describe("burn unitrade tokens", () => {
    describe("with no value", () => {
      it("should fail", async () => {
        await expect(incinerator.callStatic.burn()).to.be.revertedWith("Nothing to burn")
      })
    })

    describe("before 1 day has passed", () => {
      it("check UniTradeToBurn event emitted", async () => {
        await expect(incinerator.burn({ value: 100 }))
          .to.emit(incinerator, "UniTradeToBurn")
          .withArgs(100)
      })
    })

    describe("after 2 days have passed since previous burn", () => {
      let tx: Promise<any>

      beforeEach(async () => {
        const twoDays = 60 * 60 * 24 * 2
        await ethers.provider.send("evm_increaseTime", [twoDays])
        await ethers.provider.send("evm_mine", [])
        tx = incinerator.burn({ value: 1000 })
        // await tx
      })

      it("swaps eth for unitrade tokens and emit event", async () => {
        await expect(tx).to.emit(incinerator, "UniTradeToBurn").withArgs(1000)
      })

      it("swaps eth for unitrade tokens and emit event", async () => {
        await expect(tx).to.emit(incinerator, "UniTradeBurned").withArgs(1000, 5146192)
      })
    })
  })
})
