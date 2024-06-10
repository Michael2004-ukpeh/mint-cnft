import * as anchor from '@coral-xyz/anchor';
import { Program } from '@coral-xyz/anchor';
import {
  NONCE_ACCOUNT_LENGTH,
  Keypair,
  SYSVAR_RENT_PUBKEY,
  SystemProgram,
  Transaction,
  Connection,
  sendAndConfirmTransaction,
  NonceAccount,
} from '@solana/web3.js';
import {
  findMasterEditionPda,
  findMetadataPda,
  mplTokenMetadata,
  MPL_TOKEN_METADATA_PROGRAM_ID,
} from '@metaplex-foundation/mpl-token-metadata';
import { PROGRAM_ID as BUBBLEGUM_PROGRAM_ID } from '@metaplex-foundation/mpl-bubblegum';
import { walletAdapterIdentity } from '@metaplex-foundation/umi-signer-wallet-adapters';
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import { publicKey } from '@metaplex-foundation/umi';
import { SkytradeTask } from '../target/types/skytrade_task';
import { SystemInstructionCoder } from '@coral-xyz/anchor/dist/cjs/coder/system/instruction';
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddress,
} from '@solana/spl-token';
import {
  ConcurrentMerkleTreeAccount,
  SPL_ACCOUNT_COMPRESSION_PROGRAM_ID,
  SPL_NOOP_PROGRAM_ID,
  ValidDepthSizePair,
  createAllocTreeIx,
} from '@solana/spl-account-compression';
import { PublicKey } from '@metaplex-foundation/js';
import { assert } from 'chai';

describe('skytrade-task', async () => {
  // Configure the client to use the local cluster.
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const wallet = provider.wallet as anchor.Wallet;
  const connection = new Connection(
    provider.connection.rpcEndpoint,
    'confirmed'
  );

  const program = anchor.workspace.SkytradeTask as Program<SkytradeTask>;
  const umi = createUmi(provider.connection.rpcEndpoint)
    .use(walletAdapterIdentity(provider.wallet))
    .use(mplTokenMetadata());

  //  NONCE ACCOUNT SETUP
  let nonceKeypair = Keypair.generate();
  console.log(`nonce account: ${nonceKeypair.publicKey.toBase58()}`);
  let initNonceTx = new Transaction().add(
    // create nonce account
    SystemProgram.createAccount({
      fromPubkey: wallet.publicKey,
      newAccountPubkey: nonceKeypair.publicKey,
      lamports: await provider.connection.getMinimumBalanceForRentExemption(
        NONCE_ACCOUNT_LENGTH
      ),
      space: NONCE_ACCOUNT_LENGTH,
      programId: SystemProgram.programId,
    }),
    // init nonce account
    SystemProgram.nonceInitialize({
      noncePubkey: nonceKeypair.publicKey, // nonce account pubkey
      authorizedPubkey: wallet.publicKey, // nonce account authority (for advance and close)
    })
  );

  console.log(
    `txhash: ${await sendAndConfirmTransaction(connection, initNonceTx, [
      wallet.payer,
      nonceKeypair,
    ])}`
  );
  // Fetch Nonce Details
  let nonceAccountInfo = await connection.getAccountInfo(
    nonceKeypair.publicKey
  );
  let nonceAccount = NonceAccount.fromAccountData(nonceAccountInfo.data);
  // Advance Nonce Ix
  let nonceIx = SystemProgram.nonceAdvance({
    noncePubkey: nonceKeypair.publicKey,
    authorizedPubkey: wallet.publicKey,
  });

  // NFT DETAILS
  const collectionUri =
    'https://raw.githubusercontent.com/Michael2004-ukpeh/assets/master/collection-metadata.json';
  const nftUri =
    'https://raw.githubusercontent.com/Michael2004-ukpeh/assets/master/nft-metadata.json';

  // ---COLLECTION DATA ---
  // Mint Keypair
  const collectionMintKeypair = Keypair.generate();

  // Metadata Account
  const collectionMetadata = findMetadataPda(umi, {
    mint: publicKey(collectionMintKeypair.publicKey),
  })[0];

  // Master Edition Account
  const collectionMasterEdition = findMasterEditionPda(umi, {
    mint: publicKey(collectionMintKeypair.publicKey),
  })[0];

  // Derive Collection Mint ATA
  const collectionATA = await getAssociatedTokenAddress(
    collectionMintKeypair.publicKey,
    wallet.publicKey
  );

  // ---TREE DATA---
  // Keypair for tree
  const merkleTreeKeypair = Keypair.generate();

  // Tree authority
  const [treeAuthority] = PublicKey.findProgramAddressSync(
    [merkleTreeKeypair.publicKey.toBuffer()],
    BUBBLEGUM_PROGRAM_ID
  );

  const [bubblegumSigner] = PublicKey.findProgramAddressSync(
    [Buffer.from('collection_cpi', 'utf8')],
    BUBBLEGUM_PROGRAM_ID
  );
  const maxDepthSizePair: ValidDepthSizePair = {
    maxDepth: 14,
    maxBufferSize: 64,
  };
  const canopyDepth = maxDepthSizePair.maxDepth - 5;
  before(async function (done) {
    // STEP 1 - mint collection via cpi
    // @ts-ignore
    const mintCollectionIx = await program.methods
      .createNftCollection({
        uri: collectionUri,
        name: 'Holy Collection',
        symbol: 'HOLY',
      })
      .accounts({
        authority: wallet.publicKey,
        collection_mint: collectionMintKeypair.publicKey,
        metadataAccount: collectionMetadata,
        masterEdition: collectionMasterEdition,
        tokenAccount: collectionATA,
        systemProgram: SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        tokenMetadaProgram: MPL_TOKEN_METADATA_PROGRAM_ID,
        rent: SYSVAR_RENT_PUBKEY,
      })
      .instruction();
    //  Propagate collection nft mint tx
    const collectionMintTx = new Transaction().add(nonceIx, mintCollectionIx);
    collectionMintTx.recentBlockhash = nonceAccount.nonce;
    const collectionMintTxSig = await sendAndConfirmTransaction(
      connection,
      collectionMintTx,
      [wallet.payer, collectionMintKeypair],
      { skipPreflight: false }
    );
    console.log(`Collection NFT minted : ${collectionMintTxSig}`);

    // STEP 2 - Initialize Merkle Trees
    // Instruction to allocate space to Merkle tree
    const allocTreeIx = await createAllocTreeIx(
      provider.connection,
      merkleTreeKeypair.publicKey,
      wallet.publicKey,
      maxDepthSizePair,
      canopyDepth
    );
    // @ts-ignore
    const initTreeIx = await program.methods
      .initializeMerkleTree(
        maxDepthSizePair.maxDepth,
        maxDepthSizePair.maxBufferSize
      )
      .accounts({
        authority: wallet.publicKey,
        treeAuthority: treeAuthority,
        merkleTree: merkleTreeKeypair.publicKey,
        logWrapper: SPL_NOOP_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        bubblegumProgram: BUBBLEGUM_PROGRAM_ID,
        compressionProgram: SPL_ACCOUNT_COMPRESSION_PROGRAM_ID,
      })
      .instruction();

    // Propagate Transaction creating tree
    const initTreeTx = new Transaction().add(nonceIx, allocTreeIx, initTreeIx);
    initTreeTx.recentBlockhash = nonceAccount.nonce;
    const initTreeTxSig = await sendAndConfirmTransaction(
      connection,
      collectionMintTx,
      [wallet.payer, merkleTreeKeypair],
      { skipPreflight: false }
    );
    console.log(`Merkle tree created: ${initTreeTxSig}`);

    // Fetch tree account
    const treeAccount = await ConcurrentMerkleTreeAccount.fromAccountAddress(
      connection,
      merkleTreeKeypair.publicKey
    );

    console.log('MaxBufferSize', treeAccount.getMaxBufferSize());
    console.log('MaxDepth', treeAccount.getMaxDepth());
    console.log('Tree Authority', treeAccount.getAuthority().toString());

    assert.strictEqual(
      treeAccount.getMaxBufferSize(),
      maxDepthSizePair.maxBufferSize
    );
    assert.strictEqual(treeAccount.getMaxDepth(), maxDepthSizePair.maxDepth);
    assert.isTrue(treeAccount.getAuthority().equals(treeAuthority));
    done();
  });

  it('Mint CNFT to collection', async () => {
    // STEP 3 - Mint CNFT
    // @ts-ignore
    const mintCNFTIx = await program.methods
      .mintCnftToCollection({
        uri: nftUri,
        name: 'Holy #001',
        symbol: 'HOLY #001',
      })
      .accounts({
        authority: wallet.publicKey,
        treeAuthority: treeAuthority,
        merkleTree: merkleTreeKeypair.publicKey,
        leafOwner: wallet.publicKey,
        leafDelegate: wallet.publicKey,
        treeDelegate: wallet.publicKey,
        collectionAuthority: wallet.publicKey,
        collectionAuthorityRecordPda: BUBBLEGUM_PROGRAM_ID,
        collectionMint: collectionMintKeypair.publicKey,
        collectionMetadata: collectionMetadata,
        editionAccount: collectionMasterEdition,
        bubblegumSigner: bubblegumSigner,
        logWrapper: SPL_NOOP_PROGRAM_ID,
        compressionProgram: SPL_ACCOUNT_COMPRESSION_PROGRAM_ID,
        tokenMetadaProgram: MPL_TOKEN_METADATA_PROGRAM_ID,
        bubblegumProgram: BUBBLEGUM_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .instruction();

    // Propagate minting CNFT transaction
    const mintCNFT_Tx = new Transaction().add(nonceIx, mintCNFTIx);
    mintCNFT_Tx.recentBlockhash = nonceAccount.nonce;
    const mintCNFT_TxSig = await sendAndConfirmTransaction(
      connection,
      mintCNFT_Tx,
      [wallet.payer],
      { skipPreflight: false }
    );
    console.log(`Merkle tree created: ${mintCNFT_TxSig}`);
  });
});
