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
                hex'2a2758c9028b7f3cfadabf6f41435096ac357e4df74c93c8e292644802e9b133' // init code hash
            ))));
    }
}
