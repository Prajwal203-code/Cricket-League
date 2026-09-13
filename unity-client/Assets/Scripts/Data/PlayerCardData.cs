using System;
using UnityEngine;

namespace CricketStrike.Data
{
    public enum PlayerRole
    {
        Batsman,
        FastBowler,
        MediumFast,
        LegSpinner,
        OffSpinner
    }

    public enum CardRarity
    {
        Starter,
        Common,
        Rare,
        Epic,
        Legendary
    }

    [Serializable]
    public class PlayerCardData
    {
        public int id;
        public string cardName;
        public PlayerRole role;
        public CardRarity rarity;
        public int basePower;
        public int currentLevel = 1;
        public int maxLevel = 10;
        public int currentCopies = 0;
        public string specialAbility;
        public int unlockTour = 1;
        public string avatarIconPath;
        public string description;
        public bool isEquipped;

        public int CurrentPower
        {
            get
            {
                int lvlIndex = Mathf.Clamp(currentLevel - 1, 0, GameConstants.LevelPowerMultipliers.Length - 1);
                return Mathf.RoundToInt(basePower * GameConstants.LevelPowerMultipliers[lvlIndex]);
            }
        }

        public int CopiesRequiredForNextLevel
        {
            get
            {
                if (currentLevel >= maxLevel) return int.MaxValue;
                return GameConstants.UpgradeCopiesRequired[currentLevel];
            }
        }

        public bool CanUpgrade => currentLevel < maxLevel && currentCopies >= CopiesRequiredForNextLevel;

        public Color RarityColor
        {
            get
            {
                switch (rarity)
                {
                    case CardRarity.Starter: return GameConstants.RarityStarter;
                    case CardRarity.Common: return GameConstants.RarityCommon;
                    case CardRarity.Rare: return GameConstants.RarityRare;
                    case CardRarity.Epic: return GameConstants.RarityEpic;
                    case CardRarity.Legendary: return GameConstants.RarityLegendary;
                    default: return GameConstants.RarityCommon;
                }
            }
        }
    }
}
