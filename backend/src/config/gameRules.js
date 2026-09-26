/**
 * Central game balance and rules.
 *
 * Every gameplay/economy number the server treats as authoritative lives here.
 * Previously these were literals scattered across the socket layer, the route
 * handlers, the DB seed and the browser client — which meant the client could
 * disagree with the server about what a match was worth.
 */

const MATCH = {
    /** Deliveries per innings. The match HUD renders one dot per ball. */
    ballsPerInnings: 6,
    /** Innings ends early once this many wickets fall. */
    wicketsPerInnings: 2,
    inningsPerMatch: 2,

    /**
     * How long a player has to act on a delivery before the server resolves it
     * for them. Stops one player hanging a match by walking away mid-over.
     */
    ballTimeoutMs: 15000,
    /** Countdown shown to both clients between the toss and the first ball. */
    preMatchCountdownMs: 3000,

    /**
     * A disconnected player has this long to reconnect before forfeiting.
     * Covers a backgrounded browser tab or a phone changing networks.
     */
    reconnectGraceMs: 30000
};

const MATCHMAKING = {
    /** Two players pair only if their levels are within this range. */
    levelRange: 5,
    /**
     * Give up and refund after this long with no opponent. This game is pure
     * PvP by design — there is no bot fallback, so an empty queue is a real
     * outcome the player is told about honestly.
     */
    queueTimeoutMs: 45000,
    /** Widen the level range after this long so lone players still pair up. */
    levelRangeRelaxAfterMs: 20000,
    relaxedLevelRange: 25
};

const ECONOMY = {
    /**
     * Balances a brand-new account starts with. These preserve the values the
     * game already shipped with (they were duplicated across the DB seed and
     * the social-signin INSERT); centralised here so they can be tuned in one
     * place rather than silently rebalanced.
     */
    startingCoins: 25870,
    startingGems: 60,
    startingTrophies: 120,
    startingLevel: 1,

    /** Paid to the loser so a defeat is not a pure loss of the entry fee. */
    consolationCoins: 20,

    /** Trophy movement per ranked match. */
    trophiesPerWin: 8,
    trophiesPerLoss: -5,

    /** XP awards. Match XP scales with the tour's difficulty tier. */
    xpPerWinPerTour: 15,
    xpPerLoss: 5,
    xpPerSix: 2,

    /** Coins granted on level-up, multiplied by the new level. */
    levelUpCoinsPerLevel: 100
};

/**
 * XP needed to advance *from* the given level. Mirrored in the client for the
 * progress bar; the server value is the one that counts.
 */
function xpForLevel(level) {
    return Math.round(50 * Math.pow(level, 1.35));
}

/** Free/ad reward claims. Cooldowns are enforced server-side. */
const REWARDS = {
    freeCoins: 100,
    freeXp: 10,
    /** Minimum gap between two free claims. */
    freeCooldownMs: 24 * 60 * 60 * 1000,
    /** Rewarded-ad ladder: step N pays adStepCoins[N - 1]. */
    adStepCoins: [150, 250, 400, 700, 1200],
    adStepCooldownMs: 5 * 60 * 1000
};

/** Invite rewards. Paid to the invitee on claim and to the inviter once. */
const REFERRAL = {
    inviteeCoins: 1500,
    inviteeXp: 50,
    inviterCoins: 1500,
    inviterXp: 25
};

/** Squad card progression. */
const SQUAD = {
    /** Cost to take a card from its current level to the next. */
    upgradeCostPerLevel: 400,
    powerPerUpgrade: 5,
    maxCopiesIncrease: 5,
    xpPerUpgrade: 50,
    /** Players in a starting eleven, and therefore batting_order 1..11. */
    playingEleven: 11
};

function cardUpgradeCost(cardLevel) {
    return Math.max(1, Math.round(cardLevel * SQUAD.upgradeCostPerLevel));
}

/**
 * Lucky spin. `weight` values are relative probabilities and are never sent to
 * the client — only the prize faces are, so the wheel can render without
 * revealing the odds table.
 */
const SPIN = {
    cooldownMs: 3 * 24 * 60 * 60 * 1000,
    /** Cost of an extra spin while the free one is on cooldown. */
    rerollGems: 25,
    prizes: [
        { id: 0, label: '1,000 🪙', type: 'coins', amount: 1000, icon: '🪙', color: '#0284c7', weight: 30 },
        { id: 1, label: '15 💎', type: 'gems', amount: 15, icon: '💎', color: '#10b981', weight: 20 },
        { id: 2, label: 'Elite Pack 🎁', type: 'pack', name: 'Elite Pack', icon: '🎁', color: '#8b5cf6', weight: 15 },
        { id: 3, label: '2,500 🪙', type: 'coins', amount: 2500, icon: '🪙', color: '#f59e0b', weight: 15 },
        { id: 4, label: '50 💎 MEGA', type: 'gems', amount: 50, icon: '💎', color: '#06b6d4', weight: 8 },
        { id: 5, label: '⚡ Neon Ball', type: 'skin', name: 'Neon Thunderball ⚡', icon: '⚡', color: '#3b82f6', weight: 5 },
        { id: 6, label: '5,000 🪙', type: 'coins', amount: 5000, icon: '🪙', color: '#eab308', weight: 5 },
        { id: 7, label: '🏆 100 💎 JACKPOT', type: 'gems', amount: 100, icon: '🏆', color: '#f43f5e', weight: 2 }
    ]
};

/**
 * Seven-day login streak. A day's gem reward scales with player level by
 * `gemBonusPerLevels`, so the table holds base values only.
 */
const STREAK = {
    cycleDays: 7,
    gemBonusPerLevels: 3,
    days: [
        { day: 1, baseCoins: 500, baseGems: 0, pack: null, icon: '🪙', label: '500 Coins', pill: '+500 🪙' },
        { day: 2, baseCoins: 0, baseGems: 5, pack: null, icon: '💎', label: '5 Diamonds', pill: '+5 💎' },
        { day: 3, baseCoins: 1000, baseGems: 0, pack: 'Basic Pack', icon: '🎁', label: '1,000 Coins', pill: '+1,000 🪙' },
        { day: 4, baseCoins: 0, baseGems: 10, pack: null, icon: '💎', label: '10 Diamonds', pill: '+10 💎' },
        { day: 5, baseCoins: 2000, baseGems: 10, pack: null, icon: '⚡', label: '2,000 Coins + 10 💎', pill: '+2k 🪙 • +10 💎' },
        { day: 6, baseCoins: 0, baseGems: 15, pack: 'Elite Pack', icon: '👑', label: '15 Diamonds + Pack', pill: '+15 💎 • Pack' },
        { day: 7, baseCoins: 5000, baseGems: 25, pack: 'Mega God Vault', icon: '🏆', label: '5,000 🪙 + 25 💎 + 3D Skin', pill: '5k 🪙 • 25 💎 • 3D Ball', isMega: true }
    ]
};

/**
 * Picks one entry from a `[{ weight }]` table. Shared by the spin wheel and the
 * match engine's shot outcomes so both draw from the same, tested code path.
 */
function weightedPick(table) {
    const total = table.reduce((sum, entry) => sum + entry.weight, 0);
    let roll = Math.random() * total;
    for (let i = 0; i < table.length; i++) {
        roll -= table[i].weight;
        if (roll < 0) return { entry: table[i], index: i };
    }
    return { entry: table[table.length - 1], index: table.length - 1 };
}

/**
 * Outcome table for a delivery, given how well the batsman timed it and which
 * shot they played. Returns runs, or -1 for a wicket.
 *
 * Kept as data rather than branching logic so balance can be tuned without
 * touching the resolution code in matchEngine.
 *
 * `weight` values within a bucket are relative probabilities.
 */
const SHOT_OUTCOMES = {
    perfect: {
        loft: [{ runs: 6, weight: 65 }, { runs: 4, weight: 30 }, { runs: -1, weight: 5 }],
        drive: [{ runs: 4, weight: 60 }, { runs: 6, weight: 25 }, { runs: 2, weight: 15 }],
        defensive: [{ runs: 2, weight: 55 }, { runs: 1, weight: 45 }]
    },
    good: {
        loft: [{ runs: 4, weight: 40 }, { runs: 2, weight: 40 }, { runs: -1, weight: 20 }],
        drive: [{ runs: 2, weight: 50 }, { runs: 4, weight: 25 }, { runs: 1, weight: 25 }],
        defensive: [{ runs: 1, weight: 80 }, { runs: 0, weight: 20 }]
    },
    early: {
        loft: [{ runs: 0, weight: 55 }, { runs: -1, weight: 45 }],
        drive: [{ runs: 0, weight: 70 }, { runs: 1, weight: 10 }, { runs: -1, weight: 20 }],
        defensive: [{ runs: 0, weight: 88 }, { runs: -1, weight: 12 }]
    },
    late: {
        loft: [{ runs: 0, weight: 50 }, { runs: -1, weight: 50 }],
        drive: [{ runs: 0, weight: 68 }, { runs: 1, weight: 10 }, { runs: -1, weight: 22 }],
        defensive: [{ runs: 0, weight: 86 }, { runs: -1, weight: 14 }]
    },
    /** No shot offered before the ball timed out. */
    missed: {
        none: [{ runs: 0, weight: 70 }, { runs: -1, weight: 30 }]
    }
};

/** Shot types a client is allowed to send. Anything else is rejected. */
const VALID_SHOTS = ['loft', 'drive', 'defensive'];
/** Timing buckets a client is allowed to claim. */
const VALID_TIMINGS = ['perfect', 'good', 'early', 'late'];
/** Delivery attributes a bowler may set. */
const VALID_LINES = ['off', 'middle', 'leg'];
const VALID_LENGTHS = ['full', 'good', 'short'];

/**
 * Venues offered in the custom-room picker. Validated server-side so the
 * stadium name cannot be an arbitrary string echoed back to the other player.
 */
const VALID_STADIUMS = ['Adelaide Oval', 'Dubai Stadium', 'Melbourne Arena'];

const CUSTOM_ROOM = {
    /** Digits in a room code. Short enough to read aloud to a friend. */
    codeLength: 4,
    /** Unclaimed rooms expire so codes can be reused and the map stays small. */
    lifetimeMs: 10 * 60 * 1000,
    /** Tour whose entry fee and prize a custom-room match settles against. */
    tourId: 1,
    /** Give up generating a unique code after this many attempts. */
    maxCodeAttempts: 40
};

const BOWLING = {
    minSpeedKmh: 100,
    maxSpeedKmh: 155,
    /**
     * A well-directed delivery shifts the batsman's effective timing one bucket
     * worse. Applied server-side from the stored delivery, so the bowler's
     * choices actually matter instead of being cosmetic.
     */
    goodLengthPenaltyChance: 0.35
};

/**
 * Server-side shot timing.
 *
 * The client cannot simply tell the server "that was a perfect shot" — it
 * reports *when* it tapped, and the server decides which bucket that lands in.
 *
 * The ball is live for `flightMs`, derived from the delivery speed. The ideal
 * contact point sits at `perfectAtRatio` through that flight. The client
 * animates its timing needle from the same numbers, so what the player sees
 * matches what the server scores.
 */
const TIMING = {
    /** Flight time at the slowest and fastest legal deliveries. */
    flightMsAtMinSpeed: 1900,
    flightMsAtMaxSpeed: 1150,
    /** Ideal contact point, as a fraction of total flight time. */
    perfectAtRatio: 0.5,
    /** Half-width of each bucket, in ms either side of the ideal moment. */
    perfectWindowMs: 90,
    goodWindowMs: 260,

    /**
     * The client reports its own measured tap offset because the round trip
     * would otherwise punish every player for their latency. The server still
     * measures independently and rejects a reported offset that disagrees with
     * its own clock by more than this — enough slack for a bad mobile
     * connection, not enough to fake a perfect shot on every ball.
     */
    clientOffsetToleranceMs: 1500
};

/**
 * How much a batsman's card power tilts outcomes. Power comes from the
 * player's squad in the database — never from the client.
 */
const POWER = {
    baseline: 25,
    /** Each point of power above baseline adds this to boundary weight. */
    boundaryWeightPerPoint: 1.5,
    maxPower: 100
};

/**
 * Strike Pass. Tokens are earned by playing matches — the pass previously
 * seeded every account at 380 tokens (tier 7) and displayed missions with
 * invented progress, so the whole track was decorative.
 */
const PASS = {
    tiers: 30,
    tokensPerTier: 50,
    premiumCostGems: 500,
    /** Tokens awarded at the end of a match. */
    tokensPerMatch: 10,
    tokensPerWin: 15,
    tokensPerSix: 2,
    /** Tier 30's premium grand chest. */
    grandChestCoins: 100000,
    grandChestGems: 1000,
    seasonDays: 60
};

/**
 * Mission definitions. Each is evaluated against aggregates of the player's
 * real match history — `metric` names a value computed in battlePassService,
 * never a stored "current" figure.
 */
const PASS_MISSIONS = [
    { id: 'daily_sixes', type: 'daily', metric: 'sixes', goal: 3, tokens: 30, desc: 'Hit 3 Sixes in live matches 💥' },
    { id: 'daily_wickets', type: 'daily', metric: 'wickets', goal: 2, tokens: 25, desc: 'Take 2 Wickets 🎯' },
    { id: 'daily_match', type: 'daily', metric: 'matches', goal: 1, tokens: 20, desc: 'Play a live match 🏏' },
    { id: 'weekly_wins', type: 'weekly', metric: 'wins', goal: 5, tokens: 100, desc: 'Win 5 Matches 🏟️' },
    { id: 'weekly_runs', type: 'weekly', metric: 'runs', goal: 150, tokens: 120, desc: 'Score 150 Total Runs 🏏' },
    { id: 'weekly_streak', type: 'weekly', metric: 'bestStreak', goal: 3, tokens: 150, desc: 'Achieve a 3 Win Streak 🔥' }
];

/**
 * Purchasable ball skins. The price list is authoritative here — the browser
 * holds the same ids for rendering, but what a ball costs is decided server
 * side. `classic` is the free default every account owns.
 */
const BALL_SKINS = {
    classic: { price: 0, name: 'Classic Brown Leather', free: true },
    cyber: { price: 800, name: 'Cyber Neon Matrix' },
    fireball: { price: 1000, name: 'Fireball Inferno' },
    rainbow: { price: 1000, name: 'Rainbow Disco Pop' },
    water: { price: 1200, name: 'Ocean Tsunami' },
    frostbite: { price: 1200, name: 'Frostbite Ice Dragon' },
    lightning: { price: 1500, name: 'Lightning Plasma' },
    bomb: { price: 1500, name: 'Comic BOOM Bomb' },
    magma: { price: 2000, name: 'Lava Magma Core' },
    galaxy: { price: 2500, name: 'Galaxy Cosmic' },
    gold_sun: { price: 3000, name: 'Golden Sun King' }
};

/** Quantity shown for the free default ball, which never depletes. */
const UNLIMITED_BALL_QUANTITY = 999999;

/**
 * Clubs: costs, limits and donation rewards.
 *
 * These were literals inside the route handlers — the 5,000 coin creation fee
 * was checked in one place and deducted in another, and the donation reward was
 * written three times (the SQL update, the column default, and the response).
 */
const CLUB = {
    createCostCoins: 5000,
    maxMembers: 50,

    nameMinLength: 3,
    nameMaxLength: 30,
    tagMaxLength: 12,
    badgeMaxLength: 8,
    descriptionMaxLength: 200,

    /** Chat limits. The old endpoint accepted a message of any length. */
    chatMessageMaxLength: 200,
    chatHistoryLimit: 50,

    /** Paid to the donor, not the requester — donating is the contribution. */
    donationCoins: 50,
    donationXp: 10,
    /** Copies a single card request can collect before it is full. */
    cardCopiesPerRequest: 5,

    /**
     * Weekly club chest.
     *
     * `weekly_chest_score/goal/tier` are columns on `clubs` that nothing ever
     * updated — every club sat at the seeded 1250/2500, tier 3, forever, and
     * the claim button called an endpoint that did not exist. Score is now
     * derived from matches club members actually won this week.
     */
    chest: {
        tiers: 10,
        /**
         * Weekly trophy target contributed per member, so a five-player club
         * has a reachable goal and a full one still has to work for it.
         */
        goalTrophiesPerMember: 40,
        minGoalTrophies: 200,
        coinsPerTier: 1000,
        gemsPerTier: 10,
        xpPerClaim: 150
    }
};

/**
 * Friends and daily gifting.
 *
 * The gift reward was previously written in three places that disagreed: the
 * client credited itself 50 coins per gift and a flat 350 for "collect all",
 * while the server's `/collect-all` returned a hardcoded 350 without touching
 * any wallet. Nothing was ever actually paid, and nothing capped it.
 */
const FRIENDS = {
    maxFriends: 100,
    /** Results returned by player search. */
    searchLimit: 20,
    searchMinLength: 2,

    /** Paid to the friend who receives the gift. */
    giftCoinsToRecipient: 50,
    /** Paid to the sender as thanks, so gifting is worth doing. */
    giftCoinsToSender: 50,
    giftXpToSender: 5,
    /**
     * Gifts one player may send per day. Without a cap, a player with many
     * accounts could mint coins by gifting themselves in a loop.
     */
    maxGiftsPerDay: 10
};

/**
 * Rank labels shown beside a player's level, strongest first.
 *
 * These were a SQL `CASE` ladder in one query and the bare string 'Virtuoso' in
 * another, so the same player ranked differently depending on which list they
 * appeared in.
 */
const RANK_TIERS = [
    { minLevel: 25, label: 'Virtuoso' },
    { minLevel: 18, label: 'Expert' },
    { minLevel: 10, label: 'Hotshot' },
    { minLevel: 0, label: 'Trainee' }
];

function rankForLevel(level) {
    const lvl = Number(level) || 0;
    return (RANK_TIERS.find(tier => lvl >= tier.minLevel) || RANK_TIERS[RANK_TIERS.length - 1]).label;
}

/** Weekend club war scoring. Dog tags are awarded by the server on a win. */
const CLUB_WAR = {
    dogTagsPerWin: 10,
    /** Length of a war, used when the server opens a new one. */
    durationDays: 4,
    prizes: [
        { rank: '1st 🥇', reward: '50,000 💎 + Gold Trophy 🏆' },
        { rank: '2nd 🥈', reward: '25,000 💎 + Silver Trophy 🥈' },
        { rank: '3rd 🥉', reward: '10,000 💎 + Bronze Trophy 🥉' },
        { rank: 'Top 10', reward: '5,000 💎 + Master Chests 🎁' }
    ]
};

module.exports = {
    MATCH,
    MATCHMAKING,
    ECONOMY,
    REWARDS,
    REFERRAL,
    SQUAD,
    SPIN,
    STREAK,
    PASS,
    PASS_MISSIONS,
    BALL_SKINS,
    UNLIMITED_BALL_QUANTITY,
    CLUB,
    CLUB_WAR,
    FRIENDS,
    RANK_TIERS,
    rankForLevel,
    weightedPick,
    cardUpgradeCost,
    SHOT_OUTCOMES,
    VALID_SHOTS,
    VALID_TIMINGS,
    VALID_LINES,
    VALID_LENGTHS,
    VALID_STADIUMS,
    CUSTOM_ROOM,
    BOWLING,
    TIMING,
    POWER,
    xpForLevel
};
