using System;
using System.Collections.Generic;
using UnityEngine;

namespace CricketStrike.Data
{
    [Serializable]
    public class UserPlayerData
    {
        public long userId = 1001;
        public string username = "Prajwal";
        public string countryCode = "IN";
        public int starRating = 30;
        public int level = 4;
        public int currentXp = 58;
        public int maxXp = 100;
        public int coins = 27900;
        public int gems = 304;

        // Piggy Bank
        public int piggyBankFill = 500;
        public int piggyBankMax = 500;
        public int piggyBankTier = 1;

        // Challenge Progress
        public int challengeCurrentCoins = 251700;
        public int challengeTargetCoins = 500000;

        // Active Team
        public PlayerCardData activeBatsman;
        public List<PlayerCardData> activeBowlers = new List<PlayerCardData>();
        public List<PlayerCardData> reserveCards = new List<PlayerCardData>();
        public List<BallSkinData> ballSkins = new List<BallSkinData>();

        public static UserPlayerData CreateDefaultProfile()
        {
            var user = new UserPlayerData();

            // Batsmen
            user.activeBatsman = new PlayerCardData
            {
                id = 10,
                cardName = "Virudh",
                role = PlayerRole.Batsman,
                rarity = CardRarity.Epic,
                basePower = 30,
                currentLevel = 4,
                currentCopies = 14,
                specialAbility = "6s on short balls",
                isEquipped = true
            };

            // Active Bowlers
            user.activeBowlers.Add(new PlayerCardData
            {
                id = 1,
                cardName = "Bhaskar",
                role = PlayerRole.FastBowler,
                rarity = CardRarity.Common,
                basePower = 25,
                currentLevel = 6,
                currentCopies = 22,
                specialAbility = "Extra swing at high speed",
                isEquipped = true
            });

            user.activeBowlers.Add(new PlayerCardData
            {
                id = 2,
                cardName = "Lakshya",
                role = PlayerRole.FastBowler,
                rarity = CardRarity.Rare,
                basePower = 32,
                currentLevel = 4,
                currentCopies = 18,
                specialAbility = "Reverse swing",
                isEquipped = true
            });

            user.activeBowlers.Add(new PlayerCardData
            {
                id = 3,
                cardName = "James",
                role = PlayerRole.LegSpinner,
                rarity = CardRarity.Common,
                basePower = 25,
                currentLevel = 3,
                currentCopies = 58,
                specialAbility = "Sharp turn",
                isEquipped = true
            });

            // Reserves
            user.reserveCards.Add(new PlayerCardData
            {
                id = 4,
                cardName = "Suhas",
                role = PlayerRole.OffSpinner,
                rarity = CardRarity.Common,
                basePower = 25,
                currentLevel = 3,
                currentCopies = 95,
                specialAbility = "Drift + dip"
            });

            user.reserveCards.Add(new PlayerCardData
            {
                id = 5,
                cardName = "Brad",
                role = PlayerRole.FastBowler,
                rarity = CardRarity.Epic,
                basePower = 20,
                currentLevel = 2,
                currentCopies = 1,
                specialAbility = "Yorker specialist"
            });

            user.reserveCards.Add(new PlayerCardData
            {
                id = 6,
                cardName = "Saad",
                role = PlayerRole.MediumFast,
                rarity = CardRarity.Common,
                basePower = 15,
                currentLevel = 4,
                currentCopies = 16,
                specialAbility = "Economy bowler"
            });

            // Ball skins
            user.ballSkins.AddRange(BallSkinData.GetDefaultSkins());

            return user;
        }
    }
}
