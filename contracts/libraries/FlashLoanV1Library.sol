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
                hex'7c0c5a194933970257adc66811df810a896111d2d7fec6325552868c7f8bdb53' // init code hash
            ))));
    }
}
