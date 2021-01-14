pragma solidity =0.6.6;

import './interfaces/IFlashLoanV1Factory.sol';
import './interfaces/IFlashLoanV1Pool.sol';
import '@uniswap/lib/contracts/libraries/TransferHelper.sol';

import './interfaces/IFlashLoanV1Router01.sol';
import './libraries/FlashLoanV1Library.sol';
import './libraries/SafeMath.sol';
import './interfaces/IERC20.sol';
import './interfaces/IWETH.sol';

contract FlashLoanV1Router01 is IFlashLoanV1Router01 {
    using SafeMath for uint;

    address public immutable override factory;
    address public immutable override WETH;

    modifier ensure(uint deadline) {
        require(deadline >= block.timestamp, 'FlashLoanV1Router: EXPIRED');
        _;
    }

    constructor(address _factory, address _WETH) public {
        factory = _factory;
        WETH = _WETH;
    }

    receive() external payable {
        assert(msg.sender == WETH); // only accept ETH via fallback from the WETH contract
    }

    // **** ADD LIQUIDITY ****
    function _checkPair(address token) internal virtual {
        // create the pool if it doesn't exist yet
        if (IFlashLoanV1Factory(factory).getPool(token) == address(0)) {
            IFlashLoanV1Factory(factory).createPool(token);
        }
    }
    function addLiquidity(
        address token,
        uint amount,
        address to,
        uint deadline
    ) external virtual override ensure(deadline) returns (uint liquidity) {
        if (IFlashLoanV1Factory(factory).getPool(token) == address(0)) {
            IFlashLoanV1Factory(factory).createPool(token);
        }
        address pool = FlashLoanV1Library.poolFor(factory, token);
        TransferHelper.safeTransferFrom(token, msg.sender, pool, amount);
        liquidity = IFlashLoanV1Pool(pool).mint(to);
    }
    function addLiquidityETH(
        address to,
        uint deadline
    ) external virtual override payable ensure(deadline) returns (uint liquidity) {
        if (IFlashLoanV1Factory(factory).getPool(WETH) == address(0)) {
            IFlashLoanV1Factory(factory).createPool(WETH);
        }
        address pool = FlashLoanV1Library.poolFor(factory, WETH);
        IWETH(WETH).deposit{value: msg.value}();
        assert(IWETH(WETH).transfer(pool, msg.value));
        liquidity = IFlashLoanV1Pool(pool).mint(to);
    }

    // **** REMOVE LIQUIDITY ****
    function removeLiquidity(
        address token,
        uint liquidity,
        address to,
        uint deadline
    ) public virtual override ensure(deadline) returns (uint amount) {
        address pool = FlashLoanV1Library.poolFor(factory, token);
        IFlashLoanV1Pool(pool).transferFrom(msg.sender, pool, liquidity); // send liquidity to pool
        amount = IFlashLoanV1Pool(pool).burn(to);
    }
    function removeLiquidityETH(
        uint liquidity,
        address to,
        uint deadline
    ) public virtual override ensure(deadline) returns (uint amountETH) {
        amountETH = removeLiquidity(WETH, liquidity, address(this), deadline);
        IWETH(WETH).withdraw(amountETH);
        TransferHelper.safeTransferETH(to, amountETH);
    }
    function removeLiquidityWithPermit(
        address token,
        uint liquidity,
        address to,
        uint deadline,
        bool approveMax, uint8 v, bytes32 r, bytes32 s
    ) external virtual override returns (uint amount) {
        address pool = FlashLoanV1Library.poolFor(factory, token);
        uint value = approveMax ? uint(-1) : liquidity;
        IFlashLoanV1Pool(pool).permit(msg.sender, address(this), value, deadline, v, r, s);
        amount = removeLiquidity(token, liquidity, to, deadline);
    }
    function removeLiquidityETHWithPermit(
        uint liquidity,
        address to,
        uint deadline,
        bool approveMax, uint8 v, bytes32 r, bytes32 s
    ) external virtual override returns (uint amountETH) {
        address pool = FlashLoanV1Library.poolFor(factory, WETH);
        uint value = approveMax ? uint(-1) : liquidity;
        IFlashLoanV1Pool(pool).permit(msg.sender, address(this), value, deadline, v, r, s);
        amountETH = removeLiquidityETH(liquidity, to, deadline);
    }

    // **** FLASH LOAN ****
    function flashLoan(
        address token,
        address target,
        uint amount,
        uint deadline,
        bytes calldata data
    ) external virtual override ensure(deadline) {
        address pool = FlashLoanV1Library.poolFor(factory, token);
        TransferHelper.safeTransferFrom(token, msg.sender, pool, amount);
        IFlashLoanV1Pool(pool).flashLoan(target, amount, data);
    }
}
