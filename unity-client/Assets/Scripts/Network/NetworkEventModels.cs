using System;
using CricketStrike.Match;

namespace CricketStrike.Network
{
    [Serializable]
    public class FindMatchRequest
    {
        public int tourId;
        public long playerId;
        public int playerLevel;
    }

    [Serializable]
    public class MatchFoundEvent
    {
        public long matchId;
        public string socketRoom;
        public string opponentUsername;
        public string opponentCountry;
        public int opponentLevel;
        public bool youBatFirst;
    }

    [Serializable]
    public class BowlActionPayload
    {
        public long matchId;
        public float speedKmh;
        public float timing; // 0.0 to 1.0
        public float line;   // -1.0 to 1.0
        public float length; // -1.0 to 1.0
    }

    [Serializable]
    public class BatActionPayload
    {
        public long matchId;
        public float timing;
        public string direction; // straight, cover, leg, loft, defensive
    }

    [Serializable]
    public class BallResultEvent
    {
        public int ballNumber;
        public int runs;
        public bool isWicket;
        public int p1TotalRuns;
        public int p2TotalRuns;
    }

    [Serializable]
    public class MatchEndEvent
    {
        public long winnerId;
        public int p1Score;
        public int p2Score;
        public int coinsAwarded;
    }
}
