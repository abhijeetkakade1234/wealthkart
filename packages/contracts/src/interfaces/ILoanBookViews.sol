// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {LoanBook} from "../modules/LoanBook.sol";

/// @title ILoanBookViews
/// @notice The real return types of the vault's loan views that return structs.
/// @dev `CircleVault` declares these three without return types and forwards the LoanBook
///      library's ABI output unchanged (`_loanView`), which saves about 1 KB of runtime code
///      (ADR 0038). Call them through this interface from Solidity. The SDK's `gen-abi.mjs` copies
///      these outputs into the vault ABI, so viem decodes them with full types.
interface ILoanBookViews {
    /// @notice `borrower`'s loan (principal 0 = no loan).
    function loanOf(address borrower) external view returns (LoanBook.Loan memory);

    /// @notice Loan or settle request `id` (ids start at 1).
    function loanRequest(uint256 id) external view returns (LoanBook.Request memory);

    /// @notice Paginated open loan and settle requests (order changes as requests close).
    function openLoanRequestsPage(uint256 offset, uint256 limit)
        external
        view
        returns (uint256[] memory ids, LoanBook.Request[] memory page);
}
