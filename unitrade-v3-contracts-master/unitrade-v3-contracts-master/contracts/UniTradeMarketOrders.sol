// SPDX-License-Identifier: UNLICENSED

pragma solidity 0.7.6;

import { SafeMathUpgradeable as SafeMath } from "@openzeppelin/contracts-upgradeable/math/SafeMathUpgradeable.sol";
import { OwnableUpgradeable as Ownable } from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import { ReentrancyGuardUpgradeable as ReentrancyGuard } from "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import { IERC20Upgradeable as IERC20 } from "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import "@uniswap/v2-core/contracts/interfaces/IUniswapV2Factory.sol";
import "@uniswap/v2-periphery/contracts/interfaces/IUniswapV2Router02.sol";
import "@uniswap/lib/contracts/libraries/TransferHelper.sol";
import "./interfaces/IUniTradeStaker.sol";
import "./UniTradeOrderBook.sol";
import "@openzeppelin/contracts-upgradeable/proxy/Initializable.sol";


contract UniTradeMarketOrders is Initializable, Ownable, ReentrancyGuard {
    using SafeMath for uint256;

    uint256 constant UINT256_MAX = ~uint256(0);
    IUniswapV2Router02 public uniswapV2Router;
    IUniswapV2Factory public uniswapV2Factory;
    UniTradeOrderBook public orderBook;

    enum SwapType {TokensForTokens, EthForTokens, TokensForEth}

    event OrderExecuted(
        address indexed taker,
        address[] path,
        uint256 amountInOffered,
        uint256 amountOutExpected,
        uint256[] amounts,
        uint256 unitradeFee
    );

    function initialize(
        UniTradeOrderBook _orderBook
    ) initializer public {
        __Ownable_init();
        uniswapV2Router = _orderBook.uniswapV2Router();
        uniswapV2Factory = _orderBook.uniswapV2Factory();
        orderBook = _orderBook;
    }

    receive() external payable {} // to receive ETH from Uniswap

    function executeOrder(
        SwapType swapType,
        address[] memory path,
        uint256 amountInOffered,
        uint256 amountOutExpected
    )
        external
        payable
        nonReentrant
        returns (uint256[] memory amounts)
    {       
        address _taker = msg.sender;
        address _wethAddress = uniswapV2Router.WETH();
        address tokenIn = path[0];
        address tokenOut = path[path.length-1];
        uint256 amountIn = amountInOffered;

        if (swapType != SwapType.EthForTokens) {
            if (swapType == SwapType.TokensForEth) {
                require(tokenOut == _wethAddress, "Token out must be WETH");
            }
            uint256 beforeBalance = IERC20(tokenIn).balanceOf(address(this));
            // transfer tokenIn funds in necessary for order execution
            TransferHelper.safeTransferFrom(
                tokenIn,
                msg.sender,
                address(this),
                amountIn
            );
            uint256 afterBalance = IERC20(tokenIn).balanceOf(address(this));
            if (afterBalance.sub(beforeBalance) != amountIn) {
                amountIn = afterBalance.sub(beforeBalance);
            }
            require(amountIn > 0, "Invalid final offered amount");
        } else {
            require(tokenIn == _wethAddress, "Token in must be WETH");
        }
        
        uint256 unitradeFee = 0;

        if (swapType != SwapType.EthForTokens) {
            TransferHelper.safeApprove(
                tokenIn,
                address(uniswapV2Router),
                amountIn
            );
        }

        if (swapType == SwapType.TokensForTokens) {
            // Note: Collects fee from input token then swap for ETH
            uint256 _tokenFee = amountIn.mul(orderBook.feeMul()).div(orderBook.feeDiv());

            uint256 beforeBalance = IERC20(tokenOut).balanceOf(_taker);
            uniswapV2Router.swapExactTokensForTokensSupportingFeeOnTransferTokens(
                amountIn.sub(_tokenFee),
                amountOutExpected,
                path,
                _taker,
                UINT256_MAX
            );
            uint256 afterBalance = IERC20(tokenOut).balanceOf(_taker);
            amounts = new uint256[](2);
            amounts[0] = amountIn.sub(_tokenFee);
            amounts[1] = afterBalance.sub(beforeBalance);

            if (_tokenFee > 0) {
                address[] memory _wethPair = createPair(tokenIn, uniswapV2Router.WETH());

                beforeBalance = IERC20(uniswapV2Router.WETH()).balanceOf(address(this));
                uniswapV2Router.swapExactTokensForETHSupportingFeeOnTransferTokens(
                    _tokenFee,
                    0, // take any
                    _wethPair,
                    address(this),
                    UINT256_MAX
                );
                afterBalance = IERC20(uniswapV2Router.WETH()).balanceOf(address(this));
                unitradeFee = afterBalance.sub(beforeBalance);
            }
        } else if (swapType == SwapType.TokensForEth) {
            uint256 beforeBalance = address(this).balance;
            uniswapV2Router.swapExactTokensForETHSupportingFeeOnTransferTokens(
                amountIn,
                amountOutExpected,
                path,
                address(this),
                UINT256_MAX
            );
            uint256 afterBalance = address(this).balance;
            amounts = new uint256[](2);
            amounts[0] = amountIn;
            amounts[1] = afterBalance.sub(beforeBalance);

            // Note: Collects ETH fee from output
            unitradeFee = amounts[1].mul(orderBook.feeMul()).div(orderBook.feeDiv());

            if (amounts[1].sub(unitradeFee) > 0) {
                // Transfer `output - fee` to the taker
                TransferHelper.safeTransferETH(
                    _taker,
                    amounts[1].sub(unitradeFee)
                );
            }
        } else if (swapType == SwapType.EthForTokens) {
            uint256 totalEthDeposited = msg.value;

            // Note: Collects ETH fee from input
            unitradeFee = totalEthDeposited.mul(orderBook.feeMul()).div(orderBook.feeDiv());

            uint256 beforeBalance = IERC20(tokenOut).balanceOf(_taker);
            uniswapV2Router.swapExactETHForTokensSupportingFeeOnTransferTokens{
                value: totalEthDeposited.sub(unitradeFee)
            }(
                amountOutExpected,
                path,
                _taker,
                UINT256_MAX
            );
            uint256 afterBalance = IERC20(tokenOut).balanceOf(_taker);
            amounts = new uint256[](2);
            amounts[0] = totalEthDeposited.sub(unitradeFee);
            amounts[1] = afterBalance.sub(beforeBalance);
        }

        emit OrderExecuted(_taker, path, amountInOffered, amountOutExpected, amounts, unitradeFee);
    }

    function stakeAndBurn() external {
        uint256 unitradeFee = address(this).balance;

        if (unitradeFee > 0) {
            uint256 burnAmount = unitradeFee.mul(orderBook.splitMul()).div(orderBook.splitDiv());
            if (burnAmount > 0) {
                orderBook.incinerator().burn{value: burnAmount}(); //no require
            }
            uint256 stakeAmount = unitradeFee.sub(burnAmount);
            if(stakeAmount > 0) {
                orderBook.staker().deposit{value: stakeAmount}(); //no require
            }
        }
    }

    function createPair(address tokenA, address tokenB)
        internal
        pure
        returns (address[] memory)
    {
        address[] memory _addressPair = new address[](2);
        _addressPair[0] = tokenA;
        _addressPair[1] = tokenB;
        return _addressPair;
    }
}