pragma solidity >=0.5.0;

import "./SafeMath.sol";

library FlashLoanV1Library {
    using SafeMath for uint;

    // calculates the CREATE2 address for a pool without making any external calls
    function poolFor(address factory, address token) internal pure returns (address pool) {
        pool = address(uint(keccak256(abi.encodePacked(
                hex'ff',
                factory,
                keccak256(abi.encodePacked(token)),
                hex'6c57ed802dc5d4d6ce04dc39f66e6d2a6cebf8b7efbc068ce7b0419f5ee4ade1' // init code hash
            ))));
    }
}
