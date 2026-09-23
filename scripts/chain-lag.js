// How far the chain's clock trails this machine's.
//
//   node scripts/chain-lag.js
//
// Every challenge deadline the contract sets is block.timestamp + the window,
// and the contract judges against block.timestamp. If the chain's clock trails
// this machine by more than the challenge window, a deadline is already in the
// past by local time at the instant it is created — so a countdown run on the
// local clock shows the window as closed before it has been used at all.
require("dotenv").config();
const { ethers } = require("ethers");

async function main() {
  const rpc = process.env.RPC_URL;
  if (!rpc) {
    console.error("RPC_URL belum diisi di .env");
    process.exit(2);
  }

  const provider = new ethers.JsonRpcProvider(rpc);
  const block = await provider.getBlock("latest");
  const local = Math.floor(Date.now() / 1000);
  const lag = local - Number(block.timestamp);

  let window = null;
  try {
    if (process.env.CONTRACT_ADDRESS) {
      const escrow = new ethers.Contract(
        process.env.CONTRACT_ADDRESS,
        ["function challengeWindowSeconds() view returns (uint256)"],
        provider
      );
      window = Number(await escrow.challengeWindowSeconds());
    }
  } catch {
    // Not fatal: the lag on its own is the number that matters.
  }

  console.log(`blok terakhir   : #${block.number}`);
  console.log(`jam rantai      : ${block.timestamp}  (${new Date(Number(block.timestamp) * 1000).toLocaleString("id-ID")})`);
  console.log(`jam komputer    : ${local}  (${new Date(local * 1000).toLocaleString("id-ID")})`);
  console.log(`rantai tertinggal: ${lag} detik`);
  if (window != null) console.log(`jendela tantangan: ${window} detik`);

  console.log("");
  if (window != null && lag >= window) {
    console.log("TERBUKTI. Rantai tertinggal lebih jauh daripada panjang jendelanya,");
    console.log("jadi setiap tenggat sudah lewat menurut jam komputer pada detik dia dibuat.");
    console.log("Itu sebabnya tombol sengketa tidak pernah muncul. Terapkan chain-clock.bundle.");
  } else if (lag > 20) {
    console.log(`Rantai tertinggal ${lag} detik. Itu memakan ${lag} detik dari jendela Anda`);
    console.log("menurut jam komputer, walaupun belum sampai menutupnya sepenuhnya.");
  } else {
    console.log("Selisihnya kecil. Kalau tombolnya masih tidak muncul, sebabnya bukan ini —");
    console.log("kirim output ini ke saya.");
  }
}

main().catch((error) => {
  console.error(`Gagal membaca rantai: ${error.shortMessage || error.message}`);
  console.error("Cek RPC_URL di .env.");
  process.exit(2);
});
