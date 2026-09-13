using System;
using UnityEngine;

namespace CricketStrike.Data
{
    [Serializable]
    public class TourData
    {
        public int id;
        public string tourName;
        public string countryCode;
        public int tourNumber;
        public int entryFee;
        public int prize;
        public string colorHex;
        public int minLevel;
        public int onlinePlayersCount;
        public bool isUnlocked;

        public Color ThemeColor
        {
            get
            {
                if (ColorUtility.TryParseHtmlString(colorHex, out Color color))
                {
                    return color;
                }
                return GameConstants.AccentBlue;
            }
        }

        public static TourData[] GetDefaultTours()
        {
            return new TourData[]
            {
                new TourData { id = 1, tourName = "Mumbai", countryCode = "IN", tourNumber = 1, entryFee = 100, prize = 200, colorHex = "#E07020", minLevel = 1, onlinePlayersCount = 2210, isUnlocked = true },
                new TourData { id = 2, tourName = "Karachi", countryCode = "PK", tourNumber = 2, entryFee = 250, prize = 500, colorHex = "#1A8A6A", minLevel = 2, onlinePlayersCount = 22816, isUnlocked = true },
                new TourData { id = 3, tourName = "Adelaide", countryCode = "AU", tourNumber = 3, entryFee = 1000, prize = 2000, colorHex = "#1A72C4", minLevel = 3, onlinePlayersCount = 1942, isUnlocked = true },
                new TourData { id = 4, tourName = "Dubai", countryCode = "AE", tourNumber = 4, entryFee = 3000, prize = 6000, colorHex = "#0E9B9B", minLevel = 5, onlinePlayersCount = 1526, isUnlocked = true },
                new TourData { id = 5, tourName = "Johannesburg", countryCode = "ZA", tourNumber = 5, entryFee = 10000, prize = 20000, colorHex = "#2E8B2E", minLevel = 7, onlinePlayersCount = 890, isUnlocked = false },
                new TourData { id = 6, tourName = "Cape Town", countryCode = "ZA", tourNumber = 6, entryFee = 50000, prize = 100000, colorHex = "#C41A1A", minLevel = 10, onlinePlayersCount = 326, isUnlocked = false },
                new TourData { id = 7, tourName = "Melbourne", countryCode = "AU", tourNumber = 7, entryFee = 105000, prize = 200000, colorHex = "#6A1A9B", minLevel = 15, onlinePlayersCount = 110, isUnlocked = false },
                new TourData { id = 8, tourName = "London", countryCode = "GB", tourNumber = 8, entryFee = 260000, prize = 500000, colorHex = "#C41A30", minLevel = 20, onlinePlayersCount = 125, isUnlocked = false }
            };
        }
    }
}
