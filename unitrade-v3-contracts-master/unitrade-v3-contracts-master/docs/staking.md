# Staker 01

## Stake

Call `stake(unitradeIn)` function with amount of TRADE to stake as uint256, denominated in it's smallest unit, e.g. `1` refers to `0.000000000000000001 TRADE`. This amount must be pre approved by the staker in order for the staker address to move the tokens into the staking pool.

Stakes are timelocked for at least 30 days. During this time stakes accrue dividends in ETH based on proportion of total stake held and amount of staking dividends coming from order execution. After 30 days, stakes can be withdrawn with an automatic payout. Requesting dividend payout without token withdrawal will restake TRADE for another 30 days from the moment of payout. See `payout()` for details

## Payout

Call `payout()` function with no arguments to receive payout for currently staked tokens. Payout can be called at any time but stake timelock is reset to 30days from moment of payout. ETH dividend is paid to stake owner address.

Stakes can be increased, but doing so resets the stake period to 30 days from the point of stake addition.

## Withdraw

Call `withdraw()` function with no arguments to receive payout for currently staked tokens and return staked token to stake owner. ETH dividend is paid to stake owner address. Withdraw cannot be called until the stake period is elapsed ie. 30 days from last stake or payout
