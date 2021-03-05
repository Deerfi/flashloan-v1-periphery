pragma solidity =0.6.6;

import './interfaces/IFlashLoanV1Factory.sol';
import './interfaces/IFlashLoanV1Pool.sol';
import '@uniswap/lib/contracts/libraries/TransferHelper.sol';

import "erc3156/contracts/interfaces/IERC3156FlashBorrower.sol";
import "erc3156/contracts/interfaces/IERC3156FlashLender.sol";
import './interfaces/IFlashLoanReceiver.sol';
import './interfaces/IFlashLoanV1Router.sol';
import './libraries/FlashLoanV1Library.sol';
import './libraries/SafeMath.sol';
import './interfaces/IERC20.sol';
import './interfaces/IWETH.sol';

contract FlashLoanV1Router02 is IFlashLoanV1Router, IERC3156FlashLender, IFlashLoanReceiver {
    using SafeMath for uint;

    // CONSTANTS
    bytes32 public constant CALLBACK_SUCCESS = keccak256("ERC3156FlashBorrower.onFlashLoan");

    // ACCESS CONTROL
    // Only the `permissionedPairAddress` may call the `executeOperation` function
    address permissionedPoolAddress;

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
        IFlashLoanV1Pool(pool).transferFrom(msg.sender, pool, liquidity);
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

    /**
     * @dev From ERC-3156. The amount of currency available to be lended.
     * @param token The loan currency.
     * @return The amount of `token` that can be borrowed.
     */
    function maxFlashLoan(address token) external view override returns (uint256) {
        address poolAddress = FlashLoanV1Library.poolFor(factory, token);
        if (poolAddress != address(0)) {
            uint256 balance = IERC20(token).balanceOf(poolAddress);
            if (balance > 0) return balance - 1;
        }
        return 0;
    }

    /**
     * @dev From ERC-3156. The fee to be charged for a given loan.
     * @param token The loan currency.
     * @param amount The amount of tokens lent.
     * @return The amount of `token` to be charged for the loan, on top of the returned principal.
     */
    function flashFee(address token, uint256 amount) public view override returns (uint256) {
        require(FlashLoanV1Library.poolFor(factory, token) != address(0), "Unsupported currency");
        uint feeInBips = IFlashLoanV1Factory(factory).feeInBips();
        return amount.mul(feeInBips) / 10000;
    }

    /**
     * @dev From ERC-3156. Loan `amount` tokens to `receiver`, which needs to return them plus fee to this contract within the same transaction.
     * @param receiver The contract receiving the tokens, needs to implement the `onFlashLoan(address user, uint256 amount, uint256 fee, bytes calldata)` interface.
     * @param token The loan currency.
     * @param amount The amount of tokens lent.
     * @param userData A data parameter to be passed on to the `receiver` for any custom use.
     */
    function flashLoan(IERC3156FlashBorrower receiver, address token, uint256 amount, bytes calldata userData) external override virtual returns(bool) {
        address poolAddress = FlashLoanV1Library.poolFor(factory, token);
        require(poolAddress != address(0), "Unsupported currency");

        if (permissionedPoolAddress != poolAddress) permissionedPoolAddress = poolAddress; // access control

        bytes memory data = abi.encode(
          msg.sender,
          receiver,
          userData
        );
        IFlashLoanV1Pool(poolAddress).flashLoan(address(this), amount, data);
        return true;
    }

    /// @dev deerfi flash loan callback. It sends the amount borrowed to `receiver`, and takes it back plus a `flashFee` after the ERC3156 callback.
    function executeOperation(
        address token,
        uint256 amount,
        uint256 fee,
        address sender,
        bytes calldata data
    )
        external override returns (bool)
    {
        address poolAddress = FlashLoanV1Library.poolFor(factory, token);
        require(msg.sender == poolAddress, "Callbacks only allowed from deerfi V1 Pool");
        require(sender == address(this), "Callbacks only initiated from this contract");

        (address origin, IERC3156FlashBorrower receiver, bytes memory userData) = 
            abi.decode(data, (address, IERC3156FlashBorrower, bytes));

        // Send the tokens to the original receiver using the ERC-3156 interface
        IERC20(token).transfer(address(receiver), amount);
        // do whatever the user wants
        require(
            receiver.onFlashLoan(origin, token, amount, fee, userData) == CALLBACK_SUCCESS,
            "Callback failed"
        );
        // retrieve the borrowed amount plus fee from the receiver and send it to the deerfi pool
        IERC20(token).transferFrom(address(receiver), msg.sender, amount.add(fee));

        return true;
    }
}
