namespace CricketStrike.Match
{
    public enum MatchState
    {
        Connecting,
        PreMatch,
        Toss,
        BattingP1,
        BowlingP2,
        InningsBreak,
        BattingP2,
        BowlingP1,
        Result,
        Abandoned
    }

    public enum TimingResult
    {
        Perfect,
        Good,
        Early,
        Late
    }

    public enum ShotDirection
    {
        Straight,
        Cover,      // Off-side (Swipe Right)
        Leg,        // Leg-side (Swipe Left)
        Loft,       // Lofted over infield (Swipe Up)
        Defensive   // Tap only / Low power
    }

    public enum CameraMode
    {
        Bowling,
        Batting,
        Replay,
        Celebration
    }
}
