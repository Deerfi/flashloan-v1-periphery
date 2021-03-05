pragma solidity >=0.6.2;

interface IFlashLoanV1Router01 {
    function factory() external pure returns (address);
    function WETH() external pure returns (address);

    function addLiquidity(
        address token,
        uint amount,
        address to,
        uint deadline
    ) external returns (uint liquidity);
    function addLiquidityETH(
        address to,
        uint deadline
    ) external payable returns (uint liquidity);
    function removeLiquidity(
        address token,
        uint liquidity,
        address to,
        uint deadline
    ) external returns (uint amount);
    function removeLiquidityETH(
        uint liquidity,
        address to,
        uint deadline
    ) external returns (uint amountETH);
    function removeLiquidityWithPermit(
        address token,
        uint liquidity,
        address to,
        uint deadline,
        bool approveMax, uint8 v, bytes32 r, bytes32 s
    ) external returns (uint amount);
    function removeLiquidityETHWithPermit(
        uint liquidity,
        address to,
        uint deadline,
        bool approveMax, uint8 v, bytes32 r, bytes32 s
    ) external returns (uint amountETH);
    function flashLoan(
        address token,
        address target,
        uint amount,
        uint deadline,
        bytes calldata data
    ) external;
}
