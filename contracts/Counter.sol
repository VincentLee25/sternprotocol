// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// Kontrak ini SENGAJA sepolos mungkin, gak nyentuh SternEscrow/IDRT sama sekali.
// Tujuannya cuma 1: buktiin Particle Paymaster beneran nyokong gas Smart Account
// di Amoy, tanpa ketutup variabel lain (role, saldo token, dsb). Siapa pun boleh
// manggil increment(), gak ada require apa pun.
contract Counter {
    uint256 public count;

    event Incremented(address indexed by, uint256 newCount);

    function increment() external {
        count += 1;
        emit Incremented(msg.sender, count);
    }
}
