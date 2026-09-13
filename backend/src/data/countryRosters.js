/**
 * Country Definitions and Starting 11 Squad Templates
 * Authentic, recognizable cricket star names tailored to each country.
 */

const COUNTRY_ROSTERS = {
    // 1. INDIA
    IN: {
        code: 'IN',
        name: 'India',
        flag: '🇮🇳',
        isMajor: true,
        description: 'Subcontinent giants with world-class batting depth and lethal spin-pace balance.',
        players: [
            { order: 1, name: 'R. Sharma', type: 'batsman', role: 'RHB Opener', rarity: 'common', power: 28, level: 3, copies: 12, maxCopies: 20 },
            { order: 2, name: 'S. Gill', type: 'batsman', role: 'Aggressive Batsman', rarity: 'rare', power: 34, level: 4, copies: 8, maxCopies: 16 },
            { order: 3, name: 'V. Kohli', type: 'batsman', role: 'Anchor Batsman', rarity: 'epic', power: 42, level: 4, copies: 4, maxCopies: 10 },
            { order: 4, name: 'S. Yadav', type: 'batsman', role: 'Power Hitter', rarity: 'rare', power: 33, level: 3, copies: 6, maxCopies: 12 },
            { order: 5, name: 'R. Pant', type: 'wicket_keeper', role: 'WK Batsman', rarity: 'common', power: 29, level: 3, copies: 15, maxCopies: 20 },
            { order: 6, name: 'H. Pandya', type: 'all_rounder', role: 'Batting All-Rounder', rarity: 'rare', power: 35, level: 4, copies: 9, maxCopies: 16 },
            { order: 7, name: 'R. Jadeja', type: 'all_rounder', role: 'Bowling All-Rounder', rarity: 'common', power: 30, level: 3, copies: 10, maxCopies: 15 },
            { order: 8, name: 'J. Bumrah', type: 'bowler', role: 'Express Fast', rarity: 'epic', power: 44, level: 5, copies: 5, maxCopies: 10 },
            { order: 9, name: 'M. Shami', type: 'bowler', role: 'Right-arm Fast', rarity: 'rare', power: 36, level: 4, copies: 11, maxCopies: 16 },
            { order: 10, name: 'K. Yadav', type: 'bowler', role: 'Mystery Spinner', rarity: 'common', power: 31, level: 4, copies: 18, maxCopies: 25 },
            { order: 11, name: 'Y. Chahal', type: 'bowler', role: 'Leg Spinner', rarity: 'common', power: 27, level: 3, copies: 7, maxCopies: 15 }
        ]
    },

    // 2. AUSTRALIA
    AU: {
        code: 'AU',
        name: 'Australia',
        flag: '🇦🇺',
        isMajor: true,
        description: 'Hard-hitting aggressive squad with fiery pace bowling and sharp leg-spin.',
        players: [
            { order: 1, name: 'T. Head', type: 'batsman', role: 'RHB Opener', rarity: 'common', power: 28, level: 3, copies: 12, maxCopies: 20 },
            { order: 2, name: 'D. Warner', type: 'batsman', role: 'Aggressive Batsman', rarity: 'rare', power: 34, level: 4, copies: 8, maxCopies: 16 },
            { order: 3, name: 'S. Smith', type: 'batsman', role: 'Anchor Batsman', rarity: 'epic', power: 42, level: 4, copies: 4, maxCopies: 10 },
            { order: 4, name: 'G. Maxwell', type: 'batsman', role: 'Power Hitter', rarity: 'rare', power: 33, level: 3, copies: 6, maxCopies: 12 },
            { order: 5, name: 'A. Carey', type: 'wicket_keeper', role: 'WK Batsman', rarity: 'common', power: 29, level: 3, copies: 15, maxCopies: 20 },
            { order: 6, name: 'M. Marsh', type: 'all_rounder', role: 'Batting All-Rounder', rarity: 'rare', power: 35, level: 4, copies: 9, maxCopies: 16 },
            { order: 7, name: 'C. Green', type: 'all_rounder', role: 'Bowling All-Rounder', rarity: 'common', power: 30, level: 3, copies: 10, maxCopies: 15 },
            { order: 8, name: 'M. Starc', type: 'bowler', role: 'Express Fast', rarity: 'epic', power: 44, level: 5, copies: 5, maxCopies: 10 },
            { order: 9, name: 'P. Cummins', type: 'bowler', role: 'Right-arm Fast', rarity: 'rare', power: 36, level: 4, copies: 11, maxCopies: 16 },
            { order: 10, name: 'A. Zampa', type: 'bowler', role: 'Leg Spinner', rarity: 'common', power: 31, level: 4, copies: 18, maxCopies: 25 },
            { order: 11, name: 'J. Hazlewood', type: 'bowler', role: 'Line & Length Fast', rarity: 'common', power: 27, level: 3, copies: 7, maxCopies: 15 }
        ]
    },

    // 3. PAKISTAN
    PK: {
        code: 'PK',
        name: 'Pakistan',
        flag: '🇵🇰',
        isMajor: true,
        description: 'Unpredictable flair with lethal reverse swingers, express pacers and mystery spinners.',
        players: [
            { order: 1, name: 'B. Azam', type: 'batsman', role: 'RHB Opener', rarity: 'common', power: 28, level: 3, copies: 12, maxCopies: 20 },
            { order: 2, name: 'M. Rizwan', type: 'batsman', role: 'Aggressive Batsman', rarity: 'rare', power: 34, level: 4, copies: 8, maxCopies: 16 },
            { order: 3, name: 'F. Zaman', type: 'batsman', role: 'Anchor Batsman', rarity: 'epic', power: 42, level: 4, copies: 4, maxCopies: 10 },
            { order: 4, name: 'I. Ahmed', type: 'batsman', role: 'Power Hitter', rarity: 'rare', power: 33, level: 3, copies: 6, maxCopies: 12 },
            { order: 5, name: 'S. Khan', type: 'wicket_keeper', role: 'WK Batsman', rarity: 'common', power: 29, level: 3, copies: 15, maxCopies: 20 },
            { order: 6, name: 'S. Malik', type: 'all_rounder', role: 'Batting All-Rounder', rarity: 'rare', power: 35, level: 4, copies: 9, maxCopies: 16 },
            { order: 7, name: 'I. Wasim', type: 'all_rounder', role: 'Bowling All-Rounder', rarity: 'common', power: 30, level: 3, copies: 10, maxCopies: 15 },
            { order: 8, name: 'S. Afridi', type: 'bowler', role: 'Express Fast', rarity: 'epic', power: 44, level: 5, copies: 5, maxCopies: 10 },
            { order: 9, name: 'H. Rauf', type: 'bowler', role: 'Right-arm Fast', rarity: 'rare', power: 36, level: 4, copies: 11, maxCopies: 16 },
            { order: 10, name: 'S. Shadab', type: 'bowler', role: 'Leg Spinner', rarity: 'common', power: 31, level: 4, copies: 18, maxCopies: 25 },
            { order: 11, name: 'N. Shah', type: 'bowler', role: 'Seam Bowler', rarity: 'common', power: 27, level: 3, copies: 7, maxCopies: 15 }
        ]
    },

    // 4. ENGLAND
    GB: {
        code: 'GB',
        name: 'England',
        flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿',
        isMajor: true,
        description: 'Modern dynamic attacking cricket with deep batting and disciplined swing bowling.',
        players: [
            { order: 1, name: 'J. Buttler', type: 'batsman', role: 'RHB Opener', rarity: 'common', power: 28, level: 3, copies: 12, maxCopies: 20 },
            { order: 2, name: 'P. Salt', type: 'batsman', role: 'Aggressive Batsman', rarity: 'rare', power: 34, level: 4, copies: 8, maxCopies: 16 },
            { order: 3, name: 'J. Root', type: 'batsman', role: 'Anchor Batsman', rarity: 'epic', power: 42, level: 4, copies: 4, maxCopies: 10 },
            { order: 4, name: 'H. Brook', type: 'batsman', role: 'Power Hitter', rarity: 'rare', power: 33, level: 3, copies: 6, maxCopies: 12 },
            { order: 5, name: 'J. Bairstow', type: 'wicket_keeper', role: 'WK Batsman', rarity: 'common', power: 29, level: 3, copies: 15, maxCopies: 20 },
            { order: 6, name: 'B. Stokes', type: 'all_rounder', role: 'Batting All-Rounder', rarity: 'rare', power: 35, level: 4, copies: 9, maxCopies: 16 },
            { order: 7, name: 'S. Curran', type: 'all_rounder', role: 'Bowling All-Rounder', rarity: 'common', power: 30, level: 3, copies: 10, maxCopies: 15 },
            { order: 8, name: 'J. Archer', type: 'bowler', role: 'Express Fast', rarity: 'epic', power: 44, level: 5, copies: 5, maxCopies: 10 },
            { order: 9, name: 'M. Wood', type: 'bowler', role: 'Right-arm Fast', rarity: 'rare', power: 36, level: 4, copies: 11, maxCopies: 16 },
            { order: 10, name: 'A. Rashid', type: 'bowler', role: 'Leg Spinner', rarity: 'common', power: 31, level: 4, copies: 18, maxCopies: 25 },
            { order: 11, name: 'C. Woakes', type: 'bowler', role: 'Swing Bowler', rarity: 'common', power: 27, level: 3, copies: 7, maxCopies: 15 }
        ]
    },

    // 5. SOUTH AFRICA
    ZA: {
        code: 'ZA',
        name: 'South Africa',
        flag: '🇿🇦',
        isMajor: true,
        description: 'Power-packed athletes with high-velocity fast bowling and athletic middle-order.',
        players: [
            { order: 1, name: 'Q. de Kock', type: 'batsman', role: 'RHB Opener', rarity: 'common', power: 28, level: 3, copies: 12, maxCopies: 20 },
            { order: 2, name: 'R. Hendricks', type: 'batsman', role: 'Aggressive Batsman', rarity: 'rare', power: 34, level: 4, copies: 8, maxCopies: 16 },
            { order: 3, name: 'A. Markram', type: 'batsman', role: 'Anchor Batsman', rarity: 'epic', power: 42, level: 4, copies: 4, maxCopies: 10 },
            { order: 4, name: 'H. Klaasen', type: 'batsman', role: 'Power Hitter', rarity: 'rare', power: 33, level: 3, copies: 6, maxCopies: 12 },
            { order: 5, name: 'D. Miller', type: 'wicket_keeper', role: 'WK Batsman', rarity: 'common', power: 29, level: 3, copies: 15, maxCopies: 20 },
            { order: 6, name: 'M. Jansen', type: 'all_rounder', role: 'Batting All-Rounder', rarity: 'rare', power: 35, level: 4, copies: 9, maxCopies: 16 },
            { order: 7, name: 'K. Maharaj', type: 'all_rounder', role: 'Bowling All-Rounder', rarity: 'common', power: 30, level: 3, copies: 10, maxCopies: 15 },
            { order: 8, name: 'K. Rabada', type: 'bowler', role: 'Express Fast', rarity: 'epic', power: 44, level: 5, copies: 5, maxCopies: 10 },
            { order: 9, name: 'A. Nortje', type: 'bowler', role: 'Right-arm Fast', rarity: 'rare', power: 36, level: 4, copies: 11, maxCopies: 16 },
            { order: 10, name: 'T. Shamsi', type: 'bowler', role: 'Left-arm Spinner', rarity: 'common', power: 31, level: 4, copies: 18, maxCopies: 25 },
            { order: 11, name: 'L. Ngidi', type: 'bowler', role: 'Fast Bowler', rarity: 'common', power: 27, level: 3, copies: 7, maxCopies: 15 }
        ]
    },

    // 6. NEW ZEALAND
    NZ: {
        code: 'NZ',
        name: 'New Zealand',
        flag: '🇳🇿',
        isMajor: true,
        description: 'Tactical discipline, superb running between wickets and swinging pace combinations.',
        players: [
            { order: 1, name: 'D. Conway', type: 'batsman', role: 'RHB Opener', rarity: 'common', power: 28, level: 3, copies: 12, maxCopies: 20 },
            { order: 2, name: 'F. Allen', type: 'batsman', role: 'Aggressive Batsman', rarity: 'rare', power: 34, level: 4, copies: 8, maxCopies: 16 },
            { order: 3, name: 'K. Williamson', type: 'batsman', role: 'Anchor Batsman', rarity: 'epic', power: 42, level: 4, copies: 4, maxCopies: 10 },
            { order: 4, name: 'G. Phillips', type: 'batsman', role: 'Power Hitter', rarity: 'rare', power: 33, level: 3, copies: 6, maxCopies: 12 },
            { order: 5, name: 'T. Latham', type: 'wicket_keeper', role: 'WK Batsman', rarity: 'common', power: 29, level: 3, copies: 15, maxCopies: 20 },
            { order: 6, name: 'D. Mitchell', type: 'all_rounder', role: 'Batting All-Rounder', rarity: 'rare', power: 35, level: 4, copies: 9, maxCopies: 16 },
            { order: 7, name: 'M. Santner', type: 'all_rounder', role: 'Bowling All-Rounder', rarity: 'common', power: 30, level: 3, copies: 10, maxCopies: 15 },
            { order: 8, name: 'T. Boult', type: 'bowler', role: 'Express Fast', rarity: 'epic', power: 44, level: 5, copies: 5, maxCopies: 10 },
            { order: 9, name: 'T. Southee', type: 'bowler', role: 'Right-arm Fast', rarity: 'rare', power: 36, level: 4, copies: 11, maxCopies: 16 },
            { order: 10, name: 'M. Henry', type: 'bowler', role: 'Fast Bowler', rarity: 'common', power: 31, level: 4, copies: 18, maxCopies: 25 },
            { order: 11, name: 'I. Sodhi', type: 'bowler', role: 'Leg Spinner', rarity: 'common', power: 27, level: 3, copies: 7, maxCopies: 15 }
        ]
    },

    // 7. WEST INDIES
    WI: {
        code: 'WI',
        name: 'West Indies',
        flag: '🌴',
        isMajor: true,
        description: 'Explosive Caribbean power hitters and fiery bounce bowling.',
        players: [
            { order: 1, name: 'S. Hope', type: 'batsman', role: 'RHB Opener', rarity: 'common', power: 28, level: 3, copies: 12, maxCopies: 20 },
            { order: 2, name: 'B. King', type: 'batsman', role: 'Aggressive Batsman', rarity: 'rare', power: 34, level: 4, copies: 8, maxCopies: 16 },
            { order: 3, name: 'N. Pooran', type: 'batsman', role: 'Anchor Batsman', rarity: 'epic', power: 42, level: 4, copies: 4, maxCopies: 10 },
            { order: 4, name: 'S. Hetmyer', type: 'batsman', role: 'Power Hitter', rarity: 'rare', power: 33, level: 3, copies: 6, maxCopies: 12 },
            { order: 5, name: 'R. Powell', type: 'wicket_keeper', role: 'WK Batsman', rarity: 'common', power: 29, level: 3, copies: 15, maxCopies: 20 },
            { order: 6, name: 'A. Russell', type: 'all_rounder', role: 'Power All-Rounder', rarity: 'rare', power: 35, level: 4, copies: 9, maxCopies: 16 },
            { order: 7, name: 'J. Holder', type: 'all_rounder', role: 'Bowling All-Rounder', rarity: 'common', power: 30, level: 3, copies: 10, maxCopies: 15 },
            { order: 8, name: 'A. Joseph', type: 'bowler', role: 'Express Fast', rarity: 'epic', power: 44, level: 5, copies: 5, maxCopies: 10 },
            { order: 9, name: 'O. Thomas', type: 'bowler', role: 'Right-arm Fast', rarity: 'rare', power: 36, level: 4, copies: 11, maxCopies: 16 },
            { order: 10, name: 'A. Hosein', type: 'bowler', role: 'Left-arm Spinner', rarity: 'common', power: 31, level: 4, copies: 18, maxCopies: 25 },
            { order: 11, name: 'G. Motie', type: 'bowler', role: 'Spin Bowler', rarity: 'common', power: 27, level: 3, copies: 7, maxCopies: 15 }
        ]
    },

    // 8. SRI LANKA
    LK: {
        code: 'LK',
        name: 'Sri Lanka',
        flag: '🇱🇰',
        isMajor: true,
        description: 'Crafty wrist-spinners, mystery slingers and deft touch strokeplay.',
        players: [
            { order: 1, name: 'P. Nissanka', type: 'batsman', role: 'RHB Opener', rarity: 'common', power: 28, level: 3, copies: 12, maxCopies: 20 },
            { order: 2, name: 'K. Mendis', type: 'batsman', role: 'Aggressive Batsman', rarity: 'rare', power: 34, level: 4, copies: 8, maxCopies: 16 },
            { order: 3, name: 'C. Asalanka', type: 'batsman', role: 'Anchor Batsman', rarity: 'epic', power: 42, level: 4, copies: 4, maxCopies: 10 },
            { order: 4, name: 'B. Rajapaksa', type: 'batsman', role: 'Power Hitter', rarity: 'rare', power: 33, level: 3, copies: 6, maxCopies: 12 },
            { order: 5, name: 'D. Shanaka', type: 'wicket_keeper', role: 'WK Batsman', rarity: 'common', power: 29, level: 3, copies: 15, maxCopies: 20 },
            { order: 6, name: 'W. Hasaranga', type: 'all_rounder', role: 'Leg-Spin All-Rounder', rarity: 'rare', power: 35, level: 4, copies: 9, maxCopies: 16 },
            { order: 7, name: 'D. de Silva', type: 'all_rounder', role: 'Bowling All-Rounder', rarity: 'common', power: 30, level: 3, copies: 10, maxCopies: 15 },
            { order: 8, name: 'M. Theekshana', type: 'bowler', role: 'Mystery Spinner', rarity: 'epic', power: 44, level: 5, copies: 5, maxCopies: 10 },
            { order: 9, name: 'D. Madushanka', type: 'bowler', role: 'Left-arm Fast', rarity: 'rare', power: 36, level: 4, copies: 11, maxCopies: 16 },
            { order: 10, name: 'M. Pathirana', type: 'bowler', role: 'Express Slinger', rarity: 'common', power: 31, level: 4, copies: 18, maxCopies: 25 },
            { order: 11, name: 'N. Thushara', type: 'bowler', role: 'Sling Pacer', rarity: 'common', power: 27, level: 3, copies: 7, maxCopies: 15 }
        ]
    },

    // 9. BANGLADESH
    BD: {
        code: 'BD',
        name: 'Bangladesh',
        flag: '🇧🇩',
        isMajor: true,
        description: 'Tenacious fighting spirit with cunning slow-left-arm spinners and deceptive cutters.',
        players: [
            { order: 1, name: 'L. Das', type: 'batsman', role: 'RHB Opener', rarity: 'common', power: 28, level: 3, copies: 12, maxCopies: 20 },
            { order: 2, name: 'T. Hasan', type: 'batsman', role: 'Aggressive Batsman', rarity: 'rare', power: 34, level: 4, copies: 8, maxCopies: 16 },
            { order: 3, name: 'N. Shanto', type: 'batsman', role: 'Anchor Batsman', rarity: 'epic', power: 42, level: 4, copies: 4, maxCopies: 10 },
            { order: 4, name: 'T. Hridoy', type: 'batsman', role: 'Power Hitter', rarity: 'rare', power: 33, level: 3, copies: 6, maxCopies: 12 },
            { order: 5, name: 'M. Rahim', type: 'wicket_keeper', role: 'WK Batsman', rarity: 'common', power: 29, level: 3, copies: 15, maxCopies: 20 },
            { order: 6, name: 'S. Al Hasan', type: 'all_rounder', role: 'Batting All-Rounder', rarity: 'rare', power: 35, level: 4, copies: 9, maxCopies: 16 },
            { order: 7, name: 'Mahmudullah', type: 'all_rounder', role: 'Off-Spin All-Rounder', rarity: 'common', power: 30, level: 3, copies: 10, maxCopies: 15 },
            { order: 8, name: 'T. Ahmed', type: 'bowler', role: 'Express Fast', rarity: 'epic', power: 44, level: 5, copies: 5, maxCopies: 10 },
            { order: 9, name: 'M. Rahman', type: 'bowler', role: 'Left-arm Cutter', rarity: 'rare', power: 36, level: 4, copies: 11, maxCopies: 16 },
            { order: 10, name: 'S. Islam', type: 'bowler', role: 'Left-arm Fast', rarity: 'common', power: 31, level: 4, copies: 18, maxCopies: 25 },
            { order: 11, name: 'R. Hossain', type: 'bowler', role: 'Leg Spinner', rarity: 'common', power: 27, level: 3, copies: 7, maxCopies: 15 }
        ]
    },

    // 10. AFGHANISTAN
    AF: {
        code: 'AF',
        name: 'Afghanistan',
        flag: '🇦🇫',
        isMajor: true,
        description: 'Sensational world-class spin wizards and fearless boundary clearing hitters.',
        players: [
            { order: 1, name: 'R. Gurbaz', type: 'batsman', role: 'RHB Opener', rarity: 'common', power: 28, level: 3, copies: 12, maxCopies: 20 },
            { order: 2, name: 'I. Zadran', type: 'batsman', role: 'Aggressive Batsman', rarity: 'rare', power: 34, level: 4, copies: 8, maxCopies: 16 },
            { order: 3, name: 'G. Naib', type: 'batsman', role: 'Anchor Batsman', rarity: 'epic', power: 42, level: 4, copies: 4, maxCopies: 10 },
            { order: 4, name: 'N. Zadran', type: 'batsman', role: 'Power Hitter', rarity: 'rare', power: 33, level: 3, copies: 6, maxCopies: 12 },
            { order: 5, name: 'M. Nabi', type: 'wicket_keeper', role: 'WK Batsman', rarity: 'common', power: 29, level: 3, copies: 15, maxCopies: 20 },
            { order: 6, name: 'A. Omarzai', type: 'all_rounder', role: 'Batting All-Rounder', rarity: 'rare', power: 35, level: 4, copies: 9, maxCopies: 16 },
            { order: 7, name: 'K. Janat', type: 'all_rounder', role: 'Medium-Pace All-Rounder', rarity: 'common', power: 30, level: 3, copies: 10, maxCopies: 15 },
            { order: 8, name: 'R. Khan', type: 'bowler', role: 'Magical Leg Spin', rarity: 'epic', power: 44, level: 5, copies: 5, maxCopies: 10 },
            { order: 9, name: 'N. Ahmad', type: 'bowler', role: 'Left-arm Wrist Spin', rarity: 'rare', power: 36, level: 4, copies: 11, maxCopies: 16 },
            { order: 10, name: 'F. Farooqi', type: 'bowler', role: 'Left-arm Swing Pacer', rarity: 'common', power: 31, level: 4, copies: 18, maxCopies: 25 },
            { order: 11, name: 'N. Ul Haq', type: 'bowler', role: 'Right-arm Fast', rarity: 'common', power: 27, level: 3, copies: 7, maxCopies: 15 }
        ]
    }
};

// Non-Major Cricket Nations / Global Mix Template
const INTERNATIONAL_MIX_TEMPLATE = [
    { order: 1, name: 'R. Sharma', countryOrigin: 'IN', originFlag: '🇮🇳', type: 'batsman', role: 'RHB Opener', rarity: 'common', power: 28, level: 3, copies: 12, maxCopies: 20 },
    { order: 2, name: 'T. Head', countryOrigin: 'AU', originFlag: '🇦🇺', type: 'batsman', role: 'Aggressive Batsman', rarity: 'rare', power: 34, level: 4, copies: 8, maxCopies: 16 },
    { order: 3, name: 'V. Kohli', countryOrigin: 'IN', originFlag: '🇮🇳', type: 'batsman', role: 'Anchor Batsman', rarity: 'epic', power: 42, level: 4, copies: 4, maxCopies: 10 },
    { order: 4, name: 'B. Azam', countryOrigin: 'PK', originFlag: '🇵🇰', type: 'batsman', role: 'Power Hitter', rarity: 'rare', power: 33, level: 3, copies: 6, maxCopies: 12 },
    { order: 5, name: 'J. Buttler', countryOrigin: 'GB', originFlag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿', type: 'wicket_keeper', role: 'WK Batsman', rarity: 'common', power: 29, level: 3, copies: 15, maxCopies: 20 },
    { order: 6, name: 'A. Russell', countryOrigin: 'WI', originFlag: '🌴', type: 'all_rounder', role: 'Batting All-Rounder', rarity: 'rare', power: 35, level: 4, copies: 9, maxCopies: 16 },
    { order: 7, name: 'W. Hasaranga', countryOrigin: 'LK', originFlag: '🇱🇰', type: 'all_rounder', role: 'Bowling All-Rounder', rarity: 'common', power: 30, level: 3, copies: 10, maxCopies: 15 },
    { order: 8, name: 'J. Bumrah', countryOrigin: 'IN', originFlag: '🇮🇳', type: 'bowler', role: 'Express Fast', rarity: 'epic', power: 44, level: 5, copies: 5, maxCopies: 10 },
    { order: 9, name: 'M. Starc', countryOrigin: 'AU', originFlag: '🇦🇺', type: 'bowler', role: 'Right-arm Fast', rarity: 'rare', power: 36, level: 4, copies: 11, maxCopies: 16 },
    { order: 10, name: 'S. Afridi', countryOrigin: 'PK', originFlag: '🇵🇰', type: 'bowler', role: 'Left-arm Fast', rarity: 'rare', power: 36, level: 4, copies: 10, maxCopies: 16 },
    { order: 11, name: 'K. Rabada', countryOrigin: 'ZA', originFlag: '🇿🇦', type: 'bowler', role: 'Fast Bowler', rarity: 'common', power: 31, level: 4, copies: 18, maxCopies: 25 }
];

// Additional popular non-major countries metadata
const NON_MAJOR_COUNTRIES = {
    US: { code: 'US', name: 'United States', flag: '🇺🇸', isMajor: false, description: 'All-Star International Squad representing USA.' },
    CA: { code: 'CA', name: 'Canada', flag: '🇨🇦', isMajor: false, description: 'All-Star International Squad representing Canada.' },
    AE: { code: 'AE', name: 'United Arab Emirates', flag: '🇦🇪', isMajor: false, description: 'All-Star International Squad representing UAE.' },
    DE: { code: 'DE', name: 'Germany', flag: '🇩🇪', isMajor: false, description: 'All-Star International Squad representing Germany.' },
    FR: { code: 'FR', name: 'France', flag: '🇫🇷', isMajor: false, description: 'All-Star International Squad representing France.' },
    BR: { code: 'BR', name: 'Brazil', flag: '🇧🇷', isMajor: false, description: 'All-Star International Squad representing Brazil.' },
    SG: { code: 'SG', name: 'Singapore', flag: '🇸🇬', isMajor: false, description: 'All-Star International Squad representing Singapore.' },
    GLOBAL: { code: 'GLOBAL', name: 'World / International', flag: '🌐', isMajor: false, description: 'All-Star International Squad featuring top players across the globe.' }
};

/**
 * Returns the starting 11 player squad for a given country code.
 */
function getStartingSquadForCountry(countryCode) {
    const code = (countryCode || 'IN').toUpperCase();
    if (COUNTRY_ROSTERS[code]) {
        const country = COUNTRY_ROSTERS[code];
        return {
            countryInfo: { code: country.code, name: country.name, flag: country.flag, isMajor: true, description: country.description },
            players: country.players.map(p => ({
                ...p,
                countryOrigin: country.code,
                originFlag: country.flag
            }))
        };
    }

    const nonMajor = NON_MAJOR_COUNTRIES[code] || {
        code: code,
        name: code,
        flag: '🌐',
        isMajor: false,
        description: 'All-Star International Squad featuring players from major cricket nations.'
    };

    return {
        countryInfo: nonMajor,
        players: INTERNATIONAL_MIX_TEMPLATE.map(p => ({ ...p }))
    };
}

/**
 * Returns a list of all selectable countries
 */
function getAllCountryOptions() {
    const majorList = Object.values(COUNTRY_ROSTERS).map(c => ({
        code: c.code,
        name: c.name,
        flag: c.flag,
        isMajor: true,
        description: c.description
    }));

    const otherList = Object.values(NON_MAJOR_COUNTRIES).map(c => ({
        code: c.code,
        name: c.name,
        flag: c.flag,
        isMajor: false,
        description: c.description
    }));

    return {
        majorCountries: majorList,
        otherCountries: otherList
    };
}

module.exports = {
    COUNTRY_ROSTERS,
    NON_MAJOR_COUNTRIES,
    INTERNATIONAL_MIX_TEMPLATE,
    getStartingSquadForCountry,
    getAllCountryOptions
};
