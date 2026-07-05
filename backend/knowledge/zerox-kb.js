// ZEROX Knowledge Base — Wealth, Markets & Crypto (conceptual / evergreen only)
// Local, zero-dependency, no network. Holds definitions, how-things-work, strategies
// and best practices. Does NOT contain live prices or live market data.

const STOP = new Set([
  'the','a','an','of','to','is','in','on','and','or','for','what','whats','how',
  'do','does','are','be','by','with','as','it','this','that','me','my','you','your',
  'i','we','can','tell','about','explain','define','definition','meaning','vs','versus',
  'between','difference','when','why','which','into','from','at','so','if','then'
]);

function words(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter(w => w && !STOP.has(w));
}

const entries = [
  // ---- Crypto fundamentals ----
  { keys: ['bitcoin', 'btc'], title: 'Bitcoin (BTC)',
    text: 'Bitcoin is the first decentralized cryptocurrency, launched in 2009 by the pseudonymous Satoshi Nakamoto. It is a peer-to-peer digital money secured by a proof-of-work blockchain, with a fixed maximum supply of 21 million coins that makes it deflationary by design. It is often called "digital gold" because it is used as a store of value and hedge against fiat inflation.' },
  { keys: ['ethereum', 'eth'], title: 'Ethereum (ETH)',
    text: 'Ethereum is a programmable blockchain that introduced smart contracts, enabling decentralized applications (dApps), DeFi, and NFTs. ETH is its native token, used to pay gas fees for computation. Ethereum transitioned from proof-of-work to proof-of-stake in 2022 (The Merge), cutting energy use by ~99.9%.' },
  { keys: ['blockchain', 'distributed ledger', 'ledger'], title: 'Blockchain',
    text: 'A blockchain is a distributed, append-only ledger where transactions are grouped into blocks and cryptographically chained together. Because copies are held across many nodes and secured by consensus, the record is tamper-resistant and does not require a central authority. Changing past data would require redoing all subsequent blocks and overpowering the network.' },
  { keys: ['consensus', 'consensus mechanism'], title: 'Consensus Mechanism',
    text: 'Consensus is how a decentralized network agrees on the single valid state of the ledger without trusting a central party. The two dominant models are Proof of Work (miners spend energy solving puzzles) and Proof of Stake (validators lock up capital as collateral). Consensus prevents double-spending and keeps all honest nodes in sync.' },
  { keys: ['proof of work', 'pow', 'mining', 'miner'], title: 'Proof of Work (PoW)',
    text: 'Proof of Work secures a chain by making miners expend real computational energy to find a valid block hash; the first to succeed earns the block reward. It is battle-tested and highly secure (Bitcoin uses it) but energy-intensive and slow. Attacking the chain requires controlling >50% of total hash power (a 51% attack).' },
  { keys: ['proof of stake', 'pos', 'validator', 'staking consensus'], title: 'Proof of Stake (PoS)',
    text: 'Proof of Stake replaces energy-burning miners with validators who lock ("stake") the native token as collateral and are chosen to propose/attest blocks. Misbehavior is punished by "slashing" part of the stake. PoS is far more energy-efficient than PoW and is used by Ethereum, Solana, and Cardano.' },
  { keys: ['wallet', 'crypto wallet', 'hot wallet', 'cold wallet'], title: 'Crypto Wallet',
    text: 'A wallet stores the private keys that control on-chain assets; the coins live on the blockchain, not "inside" the wallet. Hot wallets are internet-connected (convenient, higher risk); cold wallets (hardware/paper) stay offline for maximum security. "Not your keys, not your coins" — custodial exchange balances are controlled by the exchange, not you.' },
  { keys: ['private key', 'public key', 'seed phrase', 'keys', 'mnemonic'], title: 'Keys & Seed Phrase',
    text: 'A private key is a secret number that authorizes spending; the public key/address is derived from it and can be shared to receive funds. A seed phrase (12–24 words) is a human-readable backup that regenerates all private keys in a wallet. Anyone with the private key or seed phrase has full control of the funds, so they must never be shared.' },
  { keys: ['gas', 'gas fee', 'transaction fee', 'gwei'], title: 'Gas / Transaction Fees',
    text: 'Gas is the fee paid to have the network process and validate a transaction or smart-contract call, compensating validators/miners for computation. On Ethereum gas is priced in gwei (a billionth of an ETH) and rises when the network is congested. Complex operations cost more gas than simple transfers.' },
  { keys: ['layer 1', 'l1', 'layer 2', 'l2', 'rollup', 'scaling'], title: 'Layer 1 vs Layer 2',
    text: 'A Layer 1 (L1) is a base blockchain like Bitcoin, Ethereum, or Solana that settles transactions and provides security. A Layer 2 (L2) is a protocol built on top (e.g. Arbitrum, Optimism, Base) that processes transactions off-chain and posts compressed proofs back to the L1, giving far cheaper and faster transactions while inheriting L1 security. Rollups are the leading L2 design.' },
  { keys: ['smart contract', 'contract'], title: 'Smart Contract',
    text: 'A smart contract is self-executing code deployed on a blockchain that runs exactly as written when conditions are met, without intermediaries. It powers tokens, DeFi protocols, NFTs, and DAOs. Because code is immutable once deployed and controls real money, bugs can be catastrophic and irreversible.' },
  { keys: ['token', 'coin', 'altcoin', 'token vs coin'], title: 'Coin vs Token',
    text: 'A coin is the native asset of its own blockchain (BTC on Bitcoin, ETH on Ethereum, SOL on Solana) and typically pays gas. A token is issued by a smart contract on top of an existing chain (e.g. ERC-20 tokens on Ethereum) and does not have its own base layer. "Altcoin" loosely means any crypto other than Bitcoin.' },
  { keys: ['stablecoin', 'usdc', 'usdt', 'dai', 'peg'], title: 'Stablecoins',
    text: 'A stablecoin is a token pegged to a stable asset, usually the US dollar, to avoid crypto volatility. Fiat-backed types (USDC, USDT) hold real reserves; crypto-collateralized types (DAI) are over-collateralized on-chain; algorithmic types use supply mechanics and are the riskiest (see the 2022 UST collapse). They are the main medium of exchange and settlement in DeFi.' },
  { keys: ['node', 'full node', 'nodes'], title: 'Node',
    text: 'A node is a computer running the blockchain software that stores and validates the ledger. Full nodes independently verify every transaction and block against the protocol rules, enforcing consensus and decentralization. The more independent nodes, the more censorship-resistant the network.' },

  // ---- DeFi ----
  { keys: ['defi', 'decentralized finance'], title: 'DeFi (Decentralized Finance)',
    text: 'DeFi is financial services — lending, borrowing, trading, earning yield — rebuilt as open smart contracts with no banks or brokers. Anyone with a wallet can access it permissionlessly, and protocols are composable ("money legos") so they stack together. Trade-offs are smart-contract risk, volatility, and no customer support or reversals.' },
  { keys: ['dex', 'decentralized exchange', 'uniswap'], title: 'DEX (Decentralized Exchange)',
    text: 'A DEX lets users swap tokens directly from their wallet via smart contracts, without a custodial intermediary holding funds. Most DEXs (Uniswap, Raydium) use automated market makers instead of order books. Benefits are self-custody and permissionless listing; downsides are gas costs, slippage, and MEV.' },
  { keys: ['amm', 'automated market maker', 'constant product'], title: 'AMM (Automated Market Maker)',
    text: 'An AMM prices assets algorithmically from the ratio of tokens in a liquidity pool instead of matching buyers and sellers on an order book. The classic formula is x*y=k (constant product), so large trades move the price (slippage). Liquidity providers deposit pairs and earn a share of trading fees.' },
  { keys: ['liquidity pool', 'lp', 'pool', 'liquidity provider'], title: 'Liquidity Pool',
    text: 'A liquidity pool is a smart contract holding a pair of tokens that traders swap against on a DEX. Liquidity providers (LPs) deposit both tokens and receive LP tokens representing their share, earning a cut of swap fees. Deeper pools mean lower slippage; LPs face impermanent loss risk.' },
  { keys: ['impermanent loss', 'il', 'divergence loss'], title: 'Impermanent Loss',
    text: 'Impermanent loss is the opportunity cost an AMM liquidity provider suffers when the two pooled tokens diverge in price versus simply holding them. Arbitrageurs rebalance the pool, leaving the LP with more of the falling asset and less of the rising one. The loss becomes permanent if you withdraw while prices are diverged; fee income can offset it.' },
  { keys: ['yield farming', 'liquidity mining', 'farming'], title: 'Yield Farming',
    text: 'Yield farming means moving crypto between DeFi protocols to maximize returns from trading fees, lending interest, and token rewards ("liquidity mining" incentives). APYs can be high but are often inflationary emissions that decay, and farmers stack smart-contract, impermanent-loss, and rug-pull risks. High advertised APY usually signals high risk.' },
  { keys: ['staking', 'stake', 'stake rewards', 'liquid staking'], title: 'Staking',
    text: 'Staking locks tokens to help secure a proof-of-stake network (or a protocol) in exchange for rewards, similar to earning interest. It can be done solo, via a pool, or through an exchange, and rewards come from issuance and fees. Risks include lock-up/unbonding periods, slashing, and price drops during the lock. Liquid staking (e.g. Lido stETH) issues a tradeable receipt token so staked capital stays usable.' },
  { keys: ['lending', 'borrowing', 'aave', 'compound', 'collateral', 'liquidation'], title: 'DeFi Lending & Borrowing',
    text: 'DeFi lending protocols (Aave, Compound) let users supply assets to earn interest and borrow against collateral, with rates set algorithmically by supply and demand. Loans are over-collateralized: you must post more value than you borrow. If your collateral value falls below a threshold, it is automatically liquidated to repay the loan.' },
  { keys: ['tvl', 'total value locked'], title: 'TVL (Total Value Locked)',
    text: 'Total Value Locked is the dollar value of all assets deposited in a DeFi protocol or chain, used as a rough measure of adoption and trust. Rising TVL suggests growing usage, but it can be inflated by token price and by mercenary capital chasing rewards. It should be read alongside real revenue and users.' },
  { keys: ['bridge', 'cross chain', 'wrapped', 'wrapped token'], title: 'Bridges & Wrapped Tokens',
    text: 'A bridge moves value between blockchains, typically by locking an asset on the source chain and minting a wrapped representation on the destination chain. Wrapped tokens (e.g. WBTC, wETH) are IOUs redeemable for the original asset. Bridges concentrate large amounts of locked value and have been among the biggest hack targets in crypto.' },
  { keys: ['dao', 'governance', 'decentralized autonomous organization'], title: 'DAO',
    text: 'A DAO (Decentralized Autonomous Organization) is a member-owned community that governs a protocol or treasury through on-chain voting, usually weighted by governance-token holdings. Proposals and fund movements execute via smart contracts once approved. DAOs aim to decentralize control but face low voter turnout and whale dominance.' },
  { keys: ['oracle', 'chainlink', 'price feed'], title: 'Oracle',
    text: 'An oracle feeds off-chain data (like asset prices) into smart contracts, which cannot access the outside world on their own. Decentralized oracle networks such as Chainlink aggregate many sources to resist manipulation. A compromised or laggy oracle can be exploited to drain lending and derivatives protocols.' },
  { keys: ['mev', 'front running', 'sandwich attack', 'maximal extractable value'], title: 'MEV (Maximal Extractable Value)',
    text: 'MEV is the profit validators/searchers can extract by reordering, inserting, or censoring transactions within a block. Common forms are front-running, back-running, and sandwich attacks around large DEX trades. It effectively taxes ordinary users through worse execution and is an active research area (e.g. private mempools, MEV-Boost).' },

  // ---- Tokenomics ----
  { keys: ['tokenomics', 'token economics'], title: 'Tokenomics',
    text: 'Tokenomics is the economic design of a crypto token — its supply schedule, distribution, incentives, and utility — that drives whether value accrues over time. Key factors are total/circulating supply, emission and vesting schedules, demand sinks, and who holds what. Poor tokenomics (heavy insider allocation, high inflation) can sink an otherwise good project.' },
  { keys: ['supply', 'circulating supply', 'total supply', 'max supply'], title: 'Token Supply',
    text: 'Circulating supply is the number of tokens currently tradeable; total supply includes locked/reserved tokens; max supply is the hard cap (if any). A low circulating vs total supply signals future dilution as locked tokens unlock. Always compare price against fully diluted value, not just circulating market cap.' },
  { keys: ['inflation', 'deflation', 'inflationary', 'deflationary', 'burn', 'token burn'], title: 'Inflationary vs Deflationary Tokens',
    text: 'An inflationary token increases supply over time (staking rewards, emissions), which can dilute holders unless demand grows faster. A deflationary token reduces supply, often via burns (permanently destroying tokens) or fee buy-backs, creating scarcity pressure. Bitcoin is disinflationary (issuance halves every ~4 years toward a 21M cap).' },
  { keys: ['vesting', 'cliff', 'unlock', 'token unlock', 'lockup'], title: 'Vesting & Unlocks',
    text: 'Vesting releases team, investor, and treasury tokens gradually instead of all at once, usually with a "cliff" (an initial no-unlock period) followed by linear unlocks. Large scheduled unlocks add sell pressure and often precede price weakness. Reviewing the vesting/unlock schedule is essential before buying a new token.' },
  { keys: ['market cap', 'marketcap', 'fdv', 'fully diluted valuation', 'mcap'], title: 'Market Cap vs FDV',
    text: 'Market cap = price × circulating supply and reflects the value of tokens in the market today. Fully Diluted Valuation (FDV) = price × max supply and shows the valuation if every token were in circulation. A huge gap between market cap and FDV warns of heavy future dilution from unlocks.' },
  { keys: ['utility token', 'governance token', 'utility vs governance'], title: 'Utility vs Governance Tokens',
    text: 'A utility token grants access to a product or service (paying fees, unlocking features, gas). A governance token confers voting power over a protocol\'s decisions and treasury. Many tokens are both; the key question for value is whether real demand or fee revenue flows back to the token rather than pure speculation.' },
  { keys: ['airdrop', 'airdrops'], title: 'Airdrop',
    text: 'An airdrop distributes free tokens to users, often to reward early adopters, bootstrap a community, or decentralize governance. Recipients are usually chosen by past on-chain activity ("farming" an airdrop means qualifying in advance). Beware scam airdrops that ask you to connect a wallet and sign malicious approvals.' },
  { keys: ['ico', 'ido', 'token sale', 'presale'], title: 'Token Sales (ICO/IDO)',
    text: 'A token sale raises capital by selling a new token to the public — an ICO (initial coin offering) sells directly, while an IDO launches through a decentralized exchange or launchpad. They enable early funding but are high-risk and historically rife with scams and failed projects. Scrutinize the team, allocation, and vesting before participating.' },

  // ---- Trading concepts ----
  { keys: ['order types', 'market order', 'limit order', 'stop loss', 'stop limit'], title: 'Order Types',
    text: 'A market order executes immediately at the best available price (fast, but you accept slippage). A limit order executes only at your specified price or better (price control, may not fill). A stop-loss triggers a sell once price falls to a set level to cap losses; a take-profit does the reverse. Stop-limit combines a trigger with a limit price.' },
  { keys: ['support', 'resistance', 'support and resistance'], title: 'Support & Resistance',
    text: 'Support is a price level where buying tends to halt a decline; resistance is where selling tends to cap a rise. They form because traders remember these levels and act around them. A decisive break above resistance or below support often signals a new trend, and broken resistance can become new support (and vice versa).' },
  { keys: ['rsi', 'relative strength index', 'overbought', 'oversold'], title: 'RSI (Relative Strength Index)',
    text: 'RSI is a momentum oscillator (0–100) measuring the speed of recent price changes. Readings above 70 are considered overbought (possible pullback) and below 30 oversold (possible bounce). Divergence between RSI and price can foreshadow reversals, but RSI can stay extreme during strong trends, so it is best used with other signals.' },
  { keys: ['macd', 'moving average convergence divergence'], title: 'MACD',
    text: 'MACD tracks the relationship between two moving averages (typically 12- and 26-period EMAs) plus a signal line. A bullish crossover (MACD crossing above signal) hints at upward momentum, a bearish crossover the reverse, and the histogram shows momentum strength. It is a lagging trend/momentum indicator best confirmed with price action.' },
  { keys: ['moving average', 'sma', 'ema', 'golden cross', 'death cross'], title: 'Moving Averages',
    text: 'A moving average smooths price into an average over a window (e.g. 50-day, 200-day) to reveal trend direction and act as dynamic support/resistance. SMA weights all periods equally; EMA weights recent prices more heavily. A "golden cross" (short MA crossing above long MA) is bullish; a "death cross" is bearish.' },
  { keys: ['volatility', 'volatile', 'standard deviation'], title: 'Volatility',
    text: 'Volatility measures how sharply and quickly a price swings, usually via standard deviation of returns. High volatility means larger, faster moves — more opportunity but more risk — and crypto is far more volatile than most traditional assets. Position sizing and stop placement should scale with volatility.' },
  { keys: ['liquidity', 'illiquid', 'slippage', 'depth'], title: 'Liquidity & Slippage',
    text: 'Liquidity is how easily an asset can be bought or sold without moving its price, driven by order-book depth or pool size. Low liquidity causes slippage — your trade executes at a worse average price than quoted — and makes exits difficult. Thinly traded tokens are also easier to manipulate (pump and dump).' },
  { keys: ['spread', 'bid ask spread', 'bid', 'ask'], title: 'Bid-Ask Spread',
    text: 'The spread is the gap between the highest price buyers will pay (bid) and the lowest price sellers will accept (ask). A tight spread signals a liquid, efficient market; a wide spread signals low liquidity and higher round-trip trading cost. Market makers profit from the spread.' },
  { keys: ['volume', 'trading volume'], title: 'Trading Volume',
    text: 'Volume is the total amount of an asset traded over a period and confirms the conviction behind a price move. Breakouts on high volume are more reliable than those on low volume, which often fail. Suspiciously round or wash-traded volume on obscure venues can be faked to lure buyers.' },
  { keys: ['candlestick', 'candle', 'ohlc', 'candlestick chart'], title: 'Candlestick Charts',
    text: 'A candlestick shows open, high, low, and close (OHLC) for a period: the body spans open-to-close and the wicks show the extremes. Green/white candles close above their open (buyers won); red/black close below (sellers won). Patterns like doji, engulfing, and hammer are read as momentum or reversal signals.' },
  { keys: ['leverage', 'margin', 'liquidation trading', 'perpetual', 'futures'], title: 'Leverage & Margin',
    text: 'Leverage borrows capital to control a larger position than your own funds (e.g. 10x), amplifying both gains and losses. Margin is the collateral backing the position; if the trade moves against you past the maintenance level, you get liquidated and lose it. High leverage is the fastest way to be wiped out in volatile crypto markets.' },
  { keys: ['dca', 'dollar cost averaging'], title: 'Dollar-Cost Averaging (DCA)',
    text: 'Dollar-cost averaging invests a fixed amount at regular intervals regardless of price, smoothing out the average entry and removing the pressure to time the market. It reduces the risk of buying a top all at once and enforces discipline. The trade-off is potentially lower returns than a well-timed lump sum in a rising market.' },
  { keys: ['diversification', 'portfolio', 'risk management', 'position sizing'], title: 'Risk Management & Diversification',
    text: 'Risk management is protecting capital first: size positions so no single loss is catastrophic, use stop-losses, and never risk more than you can afford to lose. Diversification spreads capital across uncorrelated assets so one blow-up does not sink the portfolio. The core rule is that surviving drawdowns matters more than maximizing any single trade.' },
  { keys: ['arbitrage', 'arb'], title: 'Arbitrage',
    text: 'Arbitrage exploits the same asset trading at different prices across venues by buying low on one and selling high on another for a near risk-free profit. It keeps markets efficient by closing price gaps. In practice speed, fees, slippage, and transfer times eat most of the edge, so it favors bots and market makers.' },

  // ---- Market sentiment ----
  { keys: ['fear and greed', 'fear greed index', 'sentiment'], title: 'Fear & Greed Index',
    text: 'The Fear & Greed Index summarizes market emotion on a 0–100 scale from Extreme Fear to Extreme Greed, blending volatility, momentum, volume, and social signals. Contrarians read Extreme Fear as a potential buying zone and Extreme Greed as a caution/selling zone ("be greedy when others are fearful"). It is a mood gauge, not a precise timing tool.' },
  { keys: ['bull market', 'bull', 'bullish'], title: 'Bull Market',
    text: 'A bull market is a sustained period of rising prices and optimism, often with new highs, strong volume, and fresh capital inflows. Sentiment, leverage, and speculation build over time. Bull markets end when euphoria and overextension give way to exhaustion.' },
  { keys: ['bear market', 'bear', 'bearish', 'capitulation'], title: 'Bear Market',
    text: 'A bear market is a prolonged decline (commonly 20%+ off highs) marked by pessimism, falling volume, and forced selling. Capitulation — a final panic sell-off — often marks the bottom. Bear markets clear out excess leverage and weak projects, setting up the next cycle.' },
  { keys: ['on chain', 'onchain', 'on-chain metrics', 'active addresses', 'nvt'], title: 'On-Chain Metrics',
    text: 'On-chain metrics analyze public blockchain data to gauge real network health beyond price. Examples include active addresses (usage), exchange in/outflows (accumulation vs sell pressure), realized cap and MVRV (holder cost basis), and hash rate (security). They offer fundamentals-style insight unique to crypto\'s transparent ledgers.' },
  { keys: ['halving', 'bitcoin halving', 'cycle', 'market cycle'], title: 'Halving & Market Cycles',
    text: 'The Bitcoin halving cuts the block reward paid to miners in half roughly every four years, slowing new supply and historically preceding major bull cycles. Crypto tends to move in multi-year cycles of accumulation, markup, distribution, and markdown. Cycles are patterns, not guarantees, and past performance does not ensure future results.' },
  { keys: ['fomo', 'fud', 'hodl'], title: 'FOMO, FUD & HODL',
    text: 'FOMO (Fear Of Missing Out) is emotional buying into a rally, often near tops. FUD (Fear, Uncertainty, Doubt) is negative narrative that pressures prices, sometimes spread to shake out holders. HODL (a misspelled "hold") means keeping assets through volatility rather than trading — a long-term conviction stance.' },

  // ---- Economics basics ----
  { keys: ['inflation economics', 'cpi', 'purchasing power', 'monetary inflation'], title: 'Inflation (Economics)',
    text: 'Inflation is the general rise in prices over time, which erodes the purchasing power of money — a dollar buys less next year. It is driven by money-supply growth, demand outpacing supply, or rising costs. Assets with capped or slow-growing supply (like Bitcoin or gold) are often held as inflation hedges.' },
  { keys: ['supply and demand', 'supply demand', 'equilibrium', 'price discovery'], title: 'Supply & Demand',
    text: 'Price is set where supply meets demand: scarce supply with strong demand pushes prices up, while abundant supply or weak demand pushes them down. Markets constantly seek equilibrium through this tug-of-war ("price discovery"). Understanding a token\'s supply schedule against real demand is the heart of valuation.' },
  { keys: ['unit economics', 'contribution margin', 'cost per unit'], title: 'Unit Economics',
    text: 'Unit economics measures the direct revenue and cost of a single unit — one customer, one transaction, one subscription. The core question is whether each unit is profitable after variable costs (contribution margin) before overhead. Healthy unit economics are the foundation of a scalable business; negative ones mean you lose more the more you grow.' },
  { keys: ['ltv', 'cac', 'ltv cac', 'lifetime value', 'customer acquisition cost'], title: 'LTV & CAC',
    text: 'Customer Acquisition Cost (CAC) is the total sales/marketing spend to win one customer. Lifetime Value (LTV) is the total profit that customer generates before churning. A healthy SaaS benchmark is LTV:CAC of about 3:1 or better, with CAC recovered ("payback") within roughly 12 months. If CAC exceeds LTV, growth destroys value.' },
  { keys: ['mrr', 'arr', 'recurring revenue', 'monthly recurring revenue'], title: 'MRR & ARR',
    text: 'Monthly Recurring Revenue (MRR) is predictable subscription revenue billed each month; ARR (Annual Recurring Revenue) is MRR × 12. They exclude one-off fees and are the core health metric for subscription businesses. Growth is tracked via new, expansion, contraction, and churned MRR.' },
  { keys: ['roi', 'return on investment'], title: 'ROI (Return on Investment)',
    text: 'ROI measures profit relative to cost: (gain − cost) / cost, expressed as a percentage. It is a simple way to compare the efficiency of investments, but plain ROI ignores time — a 50% return in one month is far better than 50% over five years (use annualized or IRR for that). Always account for risk, not just headline return.' },
  { keys: ['churn', 'churn rate', 'retention'], title: 'Churn & Retention',
    text: 'Churn is the rate at which customers or revenue leave over a period; retention is its inverse (who stays). High churn forces constant expensive acquisition just to stand still, while low churn compounds MRR. Net revenue retention above 100% means existing customers expand faster than others leave — a hallmark of strong SaaS.' },
  { keys: ['gross margin', 'net margin', 'margin', 'profit margin'], title: 'Margins',
    text: 'Gross margin is revenue minus the direct cost of delivering the product, as a percent of revenue; net margin is what remains after all expenses. Software typically has high gross margins (70–90%) because copies cost almost nothing to serve. Margins reveal how much of each dollar of sales actually becomes profit.' },
  { keys: ['burn rate', 'runway', 'cash flow'], title: 'Burn Rate & Runway',
    text: 'Burn rate is how fast a company spends cash beyond its income each month; runway is how many months of cash remain before it runs out (cash ÷ net burn). Founders manage runway to reach the next milestone or raise before zero. Positive cash flow ends the burn and makes a business self-sustaining.' },
  { keys: ['compound interest', 'compounding'], title: 'Compound Interest',
    text: 'Compounding is earning returns on your prior returns, so growth accelerates over time — the single most powerful force in long-term investing. The Rule of 72 estimates doubling time: 72 ÷ annual % return. Small edges in rate or time produce enormous differences over decades.' },

  // ---- Solana / x402 / NFT ----
  { keys: ['solana', 'sol', 'sealevel', 'proof of history'], title: 'Solana (SOL)',
    text: 'Solana is a high-throughput Layer 1 blockchain optimized for speed and low fees, using Proof of History (a verifiable clock) alongside Proof of Stake and parallel execution (Sealevel). It targets tens of thousands of transactions per second with sub-cent fees, making it popular for DeFi, NFTs, payments, and consumer apps. Trade-offs have historically included network outages under load.' },
  { keys: ['spl token', 'spl', 'solana token'], title: 'SPL Tokens',
    text: 'SPL is Solana\'s token standard, the equivalent of Ethereum\'s ERC-20, used for both fungible tokens and NFTs. SPL tokens are cheap and fast to mint and transfer thanks to Solana\'s low fees. Wallets like Phantom and Solflare manage SPL assets natively.' },
  { keys: ['x402', 'http 402', 'payment required', 'agent payments', 'machine payments'], title: 'x402 Payment Protocol',
    text: 'x402 revives the dormant HTTP "402 Payment Required" status into an open standard for machine-native, pay-per-request payments over the web. A server responds 402 with payment terms, the client (often an AI agent) pays in stablecoins on-chain, and the request completes — no accounts or manual checkout. It enables agents and APIs to transact autonomously in tiny amounts (micropayments/metering), which SHADDAI uses for per-action agent billing.' },
  { keys: ['nft', 'non fungible token', 'nfts'], title: 'NFT (Non-Fungible Token)',
    text: 'An NFT is a unique, non-interchangeable token on a blockchain that proves ownership of a specific digital (or tokenized physical) item — art, collectibles, in-game assets, memberships, or identity. Unlike fungible coins, each NFT has distinct metadata and is one-of-a-kind or part of a limited set. Value comes from verifiable scarcity, provenance, and utility, though liquidity is often thin.' },
  { keys: ['minting', 'mint', 'nft mint'], title: 'Minting',
    text: 'Minting is the act of creating a new token or NFT on-chain by executing a smart-contract function, which writes it to the ledger and assigns ownership. For NFTs, buyers often mint directly from a project at launch, paying gas plus a mint price. Once minted, the asset can be transferred, sold, or used across compatible apps.' },
  { keys: ['royalties', 'creator royalties', 'nft royalties'], title: 'NFT Royalties',
    text: 'Royalties are an optional percentage of each secondary sale routed back to the original creator, encoded in NFT metadata or enforced by marketplaces. They give creators ongoing revenue as their work trades hands. Enforcement is not guaranteed at the protocol level, and some marketplaces have made royalties optional.' },
  { keys: ['gas fees solana', 'transaction cost', 'fees comparison'], title: 'Fees: Ethereum vs Solana',
    text: 'Transaction fees vary widely by chain and congestion. Ethereum L1 fees can spike to dollars during heavy demand, which is why L2 rollups exist. Solana and many L2s keep fees at fractions of a cent, enabling micropayments and high-frequency on-chain activity that would be uneconomical on Ethereum L1.' },
  { keys: ['custody', 'custodial', 'non custodial', 'self custody'], title: 'Custodial vs Non-Custodial',
    text: 'Custodial means a third party (an exchange) holds your private keys and assets for you — convenient, recoverable, but you trust them and can be frozen or hacked (see FTX). Non-custodial means you hold your own keys and have full control, with the responsibility that lost keys mean lost funds. The choice trades convenience against sovereignty.' },
];

function lookup(query) {
  const raw = String(query || '').toLowerCase();
  const q = words(query);
  if (!q.length) return null;
  const qset = new Set(q);

  let best = null;
  let bestScore = 0;

  for (const e of entries) {
    let score = 0;
    // Key matches are strongest signal.
    for (const key of e.keys) {
      const kl = key.toLowerCase();
      const kws = kl.split(/\s+/);
      // strongest: the whole key phrase appears verbatim in the query string
      if (kws.length > 1 && raw.includes(kl)) score += 8 * kws.length;
      // all key words present (any order, stopwords in the key ignored)
      else if (kws.filter(w => !STOP.has(w)).every(w => qset.has(w))) score += 6 * kws.length;
      else {
        for (const w of kws) if (!STOP.has(w) && qset.has(w)) score += 3;
      }
    }
    // Title word matches.
    for (const w of words(e.title)) if (qset.has(w)) score += 2;
    // Body word overlap (light weight).
    const bodyWords = new Set(words(e.text));
    for (const w of q) if (bodyWords.has(w)) score += 0.4;

    if (score > bestScore) {
      bestScore = score;
      best = e;
    }
  }

  if (!best || bestScore < 2) return null;
  return { title: best.title, text: best.text };
}

module.exports = {
  agent: 'ZEROX',
  domains: [
    'crypto-fundamentals', 'defi', 'tokenomics', 'trading', 'market-sentiment',
    'economics', 'solana', 'x402', 'nft', 'risk-management'
  ],
  entries,
  lookup
};
