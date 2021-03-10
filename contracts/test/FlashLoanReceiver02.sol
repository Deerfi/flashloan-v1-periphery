pragma solidity >=0.6.2;

import '../libraries/SafeMath.sol';
import '../interfaces/IERC20.sol';
import "erc3156/contracts/interfaces/IERC3156FlashBorrower.sol";
import "erc3156/contracts/interfaces/IERC3156FlashLender.sol";

contract FlashLoanReceiver02 is IERC3156FlashBorrower {
  bytes32 public constant CALLBACK_SUCCESS = keccak256("ERC3156FlashBorrower.onFlashLoan");

  uint256 public flashBalance;
  address public flashSender;
  address public flashToken;
  uint256 public flashAmount;
  uint256 public flashFee;

  /// @dev ERC-3156 Flash loan callback
  function onFlashLoan(address sender, address token, uint256 amount, uint256 fee, bytes calldata data) external override returns(bytes32) {
    (address initiator) = abi.decode(data, (address)); // Use this to unpack arbitrary data
    flashSender = sender;
    flashToken = token;
    flashAmount = amount;
    flashFee = fee;
    IERC20(token).transfer(address(initiator), amount);
    return CALLBACK_SUCCESS;
  }

  function flashBorrow(IERC3156FlashLender lender, address token, uint256 amount) public {
    // Use this to pack arbitrary data to `onFlashLoan`
    bytes memory data = abi.encode(msg.sender);
    lender.flashLoan(this, token, amount, data);
  }
}
