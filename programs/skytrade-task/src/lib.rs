use anchor_lang::prelude::*;
use mpl_bubblegum::accounts::TreeConfig;
use anchor_spl::{
    associated_token::AssociatedToken,
    metadata::{
        create_master_edition_v3, create_metadata_accounts_v3,
        set_and_verify_sized_collection_item, sign_metadata, CreateMasterEditionV3,
        CreateMetadataAccountsV3, Metadata, SignMetadata,
    },
    token::{mint_to, Mint, MintTo, Token, TokenAccount},
};
use mpl_token_metadata::{
    pda::{find_master_edition_account, find_metadata_account},
    state::{CollectionDetails, Creator, DataV2},
};
declare_id!("29nNP89hXMhh4FkQiAaRv8vNUucaUzjURQC4sbm4F6Ax");

#[program]
pub mod skytrade_task {
    

    use super::*;
    pub fn create_nft_collection(ctx: Context<CreateCollection>, data:MintData) -> Result<()> {
      

        // mint collection nft
        mint_to(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                MintTo {
                    mint: ctx.accounts.collection_mint.to_account_info(),
                    to: ctx.accounts.token_account.to_account_info(),
                    authority: ctx.accounts.authority.to_account_info(),
                }
            
            ),
            1,
        )?;


        // create metadata account for collection nft
        let metadata_cpi_ctx=       CpiContext::new(
            ctx.accounts.token_metadata_program.to_account_info(),
            CreateMetadataAccountsV3 {
                metadata: ctx.accounts.metadata_account.to_account_info(),
                mint: ctx.accounts.collection_mint.to_account_info(),
                mint_authority: ctx.accounts.authority.to_account_info(), // use pda mint address as mint authority
                update_authority: ctx.accounts.authority.to_account_info(), // use pda mint as update authority
                payer: ctx.accounts.authority.to_account_info(),
                system_program: ctx.accounts.system_program.to_account_info(),
                rent: ctx.accounts.rent.to_account_info(),
            }
            
        );
        create_metadata_accounts_v3(
           metadata_cpi_ctx,
            DataV2 {
                name: data.name,
                symbol: data.symbol,
                uri: data.uri,
                seller_fee_basis_points: data.seller_basis_points,
                creators: Some(vec![Creator {
                    address: ctx.accounts.authority.key(),
                    verified: false,
                    share: 100,
                }]),
                collection: None,
                uses: None,
            },
            true,
            true,
            Some(CollectionDetails::V1 { size: 0 }), // set as collection nft
        )?;

        // create master edition account for collection nft
        let master_edition_cpi_ctx=        CpiContext::new(
            ctx.accounts.token_metadata_program.to_account_info(),
            CreateMasterEditionV3 {
                payer: ctx.accounts.authority.to_account_info(),
                mint: ctx.accounts.collection_mint.to_account_info(),
                edition: ctx.accounts.master_edition.to_account_info(),
                mint_authority: ctx.accounts.authority.to_account_info(),
                update_authority: ctx.accounts.authority.to_account_info(),
                metadata: ctx.accounts.metadata_account.to_account_info(),
                token_program: ctx.accounts.token_program.to_account_info(),
                system_program: ctx.accounts.system_program.to_account_info(),
                rent: ctx.accounts.rent.to_account_info(),
            }
            
        );
        create_master_edition_v3(
            master_edition_cpi_ctx,
            Some(0),
        )?;
        // verify creator on metadata account
        sign_metadata(CpiContext::new(
         ctx.accounts.token_metadata_program.to_account_info(),
            SignMetadata {
                    creator: ctx.accounts.authority.to_account_info(),
                    metadata: ctx.accounts.metadata_account.to_account_info(),
                },
            ))?;
        Ok(())
    }
    pub fn initialze_merkle_tree(ctx: Context<InitMerkle>, max_depth:u32, max_buffer_size:u32) -> Result<()> {
        let tree_cpi_ctx = CpiContext::new(
            ctx.accounts.bubblegum_program.to_account_info(),
            CreateTree {
                tree_authority: ctx.accounts.tree_authority.to_account_info(),
                merkle_tree: ctx.accounts.merkle_tree.to_account_info(),
                payer: ctx.accounts.authority.to_account_info(),
                tree_creator: ctx.accounts.authority.to_account_info(), // set creator as pda
                log_wrapper: ctx.accounts.log_wrapper.to_account_info(),
                compression_program: ctx.accounts.compression_program.to_account_info(),
                system_program: ctx.accounts.system_program.to_account_info(),
            }
           
        );
        create_tree(tree_cpi_ctx,max_depth, max_buffer_size, Option::from(false))?;
        Ok(())
    }
    pub fn mint_cnft_to_collection(ctx: Context<MintCNFT>, data: MintData) -> Result<()> {
        let metadata = MetadataArgs{
            name: data.name,
            symbol:data.symbol,
            collection: Some(Collection {
                key: ctx.accounts.collection_mint.key(),
                verified: false,
            }),
            primary_sale_happened: false,
            is_mutable: true,
            edition_nonce: None,
            token_standard: Some(TokenStandard::NonFungible),
            uses: None,
            token_program_version: TokenProgramVersion::Original,
            creators: vec![Creator {
                address: ctx.accounts.authority.key(), // set creator as pda
                verified: true,
                share: 100,
            }],
            seller_fee_basis_points: 0,

        };
        let mint_cnft_to_collection_accounts = MintToCollectionV1{
            tree_authority: ctx.accounts.tree_authority.to_account_info(),
            leaf_owner: ctx.accounts.authority.to_account_info(),
            leaf_delegate: ctx.accounts.authority.to_account_info(),
            merkle_tree: ctx.accounts.merkle_tree.to_account_info(),
            payer: ctx.accounts.payer.to_account_info(),
            tree_delegate: ctx.accounts.authority.to_account_info(), // tree delegate is pda, required as a signer
            collection_authority: ctx.accounts.authority.to_account_info(), // collection authority is pda (nft metadata update authority)
            collection_authority_record_pda: ctx.accounts.bubblegum_program.to_account_info(),
            collection_mint: ctx.accounts.collection_mint.to_account_info(), // collection nft mint account
            collection_metadata: ctx.accounts.collection_metadata.to_account_info(), // collection nft metadata account
            edition_account: ctx.accounts.edition_account.to_account_info(), // collection nft master edition account
            bubblegum_signer: ctx.accounts.bubblegum_signer.to_account_info(),
            log_wrapper: ctx.accounts.log_wrapper.to_account_info(),
            compression_program: ctx.accounts.compression_program.to_account_info(),
            token_metadata_program: ctx.accounts.token_metadata_program.to_account_info(),
            system_program: ctx.accounts.system_program.to_account_info(),
        };
        let mint_cnft_to_collection_ctx = CpiContext::new(
            ctx.accounts.bubblegum_program.to_account_info(),
            mint_cnft_to_collection_accounts
        );
        mint_to_collection(mint_cnft_to_collection_ctx,metadata)?;
        msg!("Nft Minted to collection");
        Ok(())
    }
}
#[derive(Accounts)]
pub struct CreateCollection<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        init,
        payer = authority,
        mint::decimals = 0,
        mint::authority = authority,
        mint::freeze_authority = authority
    )]
    pub collection_mint: Account<'info, Mint>,

    /// CHECK:
    #[account(
        mut,
        address=find_metadata_account(&collection_mint.key()).0
    )]
    pub metadata_account: UncheckedAccount<'info>,
    /// CHECK:
    #[account(
        mut,
        address=find_master_edition_account(&collection_mint.key()).0
    )]
    pub master_edition: UncheckedAccount<'info>,
    #[account(
        init_if_needed,
        payer = authority,
        associated_token::mint = collection_mint,
        associated_token::authority = authority
    )]
    pub token_account: Account<'info, TokenAccount>,
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub token_metadata_program: Program<'info, Metadata>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct InitMerkle<'info> {
    #[account(mut)]
    authority:Signer<'info>,
    /// CHECK:
    #[account(
        mut,
        seeds = [merkle_tree.key().as_ref()],
        bump,
        seeds::program = bubblegum_program.key()
    )]
    pub tree_authority: UncheckedAccount<'info>,
    /// CHECK:
    #[account(mut)]
    pub merkle_tree: UncheckedAccount<'info>,
    pub log_wrapper: Program<'info, Noop>,
    pub system_program: Program<'info, System>,
    pub bubblegum_program: Program<'info, Bubblegum>,
    pub compression_program: Program<'info, SplAccountCompression>,
}

#[derive(Accounts)]
pub struct MintCNFT<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(
        mut,
        seeds = [merkle_tree.key().as_ref()],
        seeds::program = bubblegum_program.key(),
        bump,
    )]
    pub tree_authority: Box<Account<'info, TreeConfig>>,
    #[account(mut)]
    /// CHECK: unsafe
    pub merkle_tree: UncheckedAccount<'info>,

    /// CHECK: This account is neither written to nor read from.
    pub leaf_owner: AccountInfo<'info>,

    /// CHECK: This account is neither written to nor read from.
    pub leaf_delegate: AccountInfo<'info>,


    pub tree_delegate: Signer<'info>,
    pub collection_authority: Signer<'info>,

    /// CHECK: Optional collection authority record PDA.
    /// If there is no collecton authority record PDA then
    /// this must be the Bubblegum program address.
    pub collection_authority_record_pda: UncheckedAccount<'info>,

    /// CHECK: This account is checked in  the instruction
    pub collection_mint: Account<'info, Mint>,

    #[account(mut)]
    pub collection_metadata: Box<Account<'info, TokenMetadata>>,

    /// CHECK: This account is checked in the instruction
    pub edition_account: UncheckedAccount<'info>,

    /// CHECK: This is just used as a signing PDA.
    #[account(
        seeds = ["collection_cpi".as_bytes()],
        seeds::program = bubblegum_program.key(),
        bump,
    )]
    pub bubblegum_signer: UncheckedAccount<'info>,

    pub log_wrapper: Program<'info, Noop>,
    pub compression_program: Program<'info, SplAccountCompression>,
    pub token_metadata_program: Program<'info, MplTokenMetadata>,
    pub bubblegum_program: Program<'info, MplBubblegum>,
    pub system_program: Program<'info, System>,
}

#[derive(AnchorDeserialize, AnchorSerialize, Debug)]
struct MintData {
    uri: String,
    name: String,
    symbol: String,
}
