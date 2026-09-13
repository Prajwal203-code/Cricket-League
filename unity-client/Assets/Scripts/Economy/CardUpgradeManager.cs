using System;
using UnityEngine;
using CricketStrike.Data;

namespace CricketStrike.Economy
{
    public class CardUpgradeManager : MonoBehaviour
    {
        public static CardUpgradeManager Instance { get; private set; }

        public event Action<PlayerCardData> OnCardUpgraded;

        private void Awake()
        {
            if (Instance == null) Instance = this;
            else Destroy(gameObject);
        }

        public bool TryUpgradeCard(UserPlayerData user, PlayerCardData card)
        {
            if (user == null || card == null) return false;
            if (!card.CanUpgrade) return false;

            int coinCost = CalculateUpgradeCost(card.currentLevel);
            if (user.coins < coinCost) return false;

            // Deduct currencies & copies
            user.coins -= coinCost;
            card.currentCopies -= card.CopiesRequiredForNextLevel;
            card.currentLevel++;

            OnCardUpgraded?.Invoke(card);
            return true;
        }

        public int CalculateUpgradeCost(int currentLevel)
        {
            return currentLevel * 500; // Lv.1 -> 500, Lv.2 -> 1,000, etc.
        }
    }
}
