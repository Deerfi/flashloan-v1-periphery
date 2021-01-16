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
                hex'f1412df70981bb89e61badace884157e67dd6da0ad170e18ea50c7771cc0f9b0' // init code hash
            ))));
    }
}
