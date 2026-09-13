namespace CricketStrike.UI.Core
{
    public enum ScreenType
    {
        Splash,          // Screen 1: Splash / Loading
        Home,            // Screen 2: Home Screen (Hero 3D batsman + quick access)
        Matchmaking,     // Screen 3: Tour Selection & Matchmaking Search
        PreMatch,        // Screen 4: Pre-Match Preview (3-2-1 countdown)
        BattingHUD,      // Screen 5: Batting In-Match Overlay
        BowlingHUD,      // Screen 6: Bowling In-Match Overlay
        BallResult,      // Screen 7: Ball Result Overlay (6s / 4s / Out)
        MatchResult,     // Screen 8: Match Summary & Winner Crown
        Leaderboard,     // Screen 9: League / Country / World Rankings
        TeamManagement,  // Screen 10: Active Team vs Reserve Card Management
        Shop,            // Screen 11: Featured Packs, Piggy Bank, Deals
        BallSkin         // Screen 12: Ball Skins Collection & Equip
    }
}
