using UnityEngine;

namespace CricketStrike.Data
{
    public static class GameConstants
    {
        // Design System Colors (Hex & Color instances)
        public static readonly Color NavyDeep = new Color32(0x0A, 0x16, 0x28, 0xFF);     // #0A1628
        public static readonly Color NavyMid = new Color32(0x14, 0x20, 0x38, 0xFF);      // #142038
        public static readonly Color NavyLight = new Color32(0x1E, 0x30, 0x50, 0xFF);    // #1E3050
        public static readonly Color AccentGold = new Color32(0xF5, 0xA6, 0x23, 0xFF);   // #F5A623
        public static readonly Color AccentBlue = new Color32(0x2A, 0x78, 0xD6, 0xFF);   // #2A78D6
        public static readonly Color AccentGreen = new Color32(0x1D, 0xAF, 0x7A, 0xFF);  // #1DAF7A
        public static readonly Color AccentRed = new Color32(0xE2, 0x4B, 0x4A, 0xFF);    // #E24B4A
        public static readonly Color TextPrimary = new Color32(0xFF, 0xFF, 0xFF, 0xFF);  // #FFFFFF
        public static readonly Color TextSecondary = new Color32(0xB0, 0xBF, 0xD8, 0xFF);// #B0BFD8
        public static readonly Color TextMuted = new Color32(0x60, 0x70, 0x90, 0xFF);    // #607090

        // Rarity Colors
        public static readonly Color RarityStarter = new Color32(0x2A, 0x78, 0xD6, 0xFF);
        public static readonly Color RarityCommon = new Color32(0x60, 0x70, 0x90, 0xFF);
        public static readonly Color RarityRare = new Color32(0xF5, 0xA6, 0x23, 0xFF);
        public static readonly Color RarityEpic = new Color32(0x9B, 0x59, 0xE8, 0xFF);
        public static readonly Color RarityLegendary = new Color32(0xFF, 0x6B, 0x1A, 0xFF);

        // Match Settings
        public const int BallsPerInnings = 6;
        public const float DeliveryTimeDefault = 1.2f;
        public const float SwipeTimeThreshold = 0.35f;
        public const float SwipeDistanceThreshold = 50f;

        // Level Multipliers & Upgrade Copies Table
        public static readonly float[] LevelPowerMultipliers = new float[]
        {
            1.00f, // Lv 1
            1.05f, // Lv 2
            1.11f, // Lv 3
            1.17f, // Lv 4
            1.23f, // Lv 5
            1.30f, // Lv 6
            1.37f, // Lv 7
            1.44f, // Lv 8
            1.52f, // Lv 9
            1.60f  // Lv 10
        };

        public static readonly int[] UpgradeCopiesRequired = new int[]
        {
            0,  // Lv 1
            4,  // Lv 2
            8,  // Lv 3
            12, // Lv 4
            16, // Lv 5
            20, // Lv 6
            24, // Lv 7
            30, // Lv 8
            40, // Lv 9
            50  // Lv 10
        };
    }
}
