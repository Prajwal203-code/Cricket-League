using System;
using System.Collections.Generic;
using UnityEngine;
using CricketStrike.Data;

namespace CricketStrike.Economy
{
    [Serializable]
    public class LedgerEntry
    {
        public string type;
        public int amount;
        public string currency;
        public int balanceAfter;
        public string note;
        public DateTime timestamp;
    }

    public class EconomyManager : MonoBehaviour
    {
        public static EconomyManager Instance { get; private set; }

        private UserPlayerData _user;
        private readonly List<LedgerEntry> _ledger = new List<LedgerEntry>();

        public event Action<int, int> OnBalanceChanged; // (coins, gems)

        private void Awake()
        {
            if (Instance == null) Instance = this;
            else Destroy(gameObject);

            _user = UserPlayerData.CreateDefaultProfile();
        }

        public bool CanAffordTour(TourData tour)
        {
            return _user != null && _user.coins >= tour.entryFee;
        }

        public bool DeductEntryFee(TourData tour)
        {
            if (!CanAffordTour(tour)) return false;

            _user.coins -= tour.entryFee;
            RecordTransaction("entry_fee", -tour.entryFee, "coins", _user.coins, $"Entered Tour {tour.tourName}");
            OnBalanceChanged?.Invoke(_user.coins, _user.gems);
            return true;
        }

        public void AwardMatchPrize(TourData tour, bool isWinner)
        {
            if (isWinner)
            {
                // House rake: 10% deducted
                int prize = Mathf.RoundToInt(tour.entryFee * 1.8f);
                _user.coins += prize;
                RecordTransaction("match_win", prize, "coins", _user.coins, $"Won Tour {tour.tourName}");
            }
            else
            {
                int consolation = 50;
                _user.coins += consolation;
                RecordTransaction("match_loss", consolation, "coins", _user.coins, "Consolation reward");
            }

            OnBalanceChanged?.Invoke(_user.coins, _user.gems);
        }

        public void AddCurrencies(int coinsDelta, int gemsDelta, string reason)
        {
            _user.coins += coinsDelta;
            _user.gems += gemsDelta;

            if (coinsDelta != 0) RecordTransaction("credit", coinsDelta, "coins", _user.coins, reason);
            if (gemsDelta != 0) RecordTransaction("credit", gemsDelta, "gems", _user.gems, reason);

            OnBalanceChanged?.Invoke(_user.coins, _user.gems);
        }

        private void RecordTransaction(string type, int amount, string currency, int balanceAfter, string note)
        {
            _ledger.Add(new LedgerEntry
            {
                type = type,
                amount = amount,
                currency = currency,
                balanceAfter = balanceAfter,
                note = note,
                timestamp = DateTime.UtcNow
            });
        }
    }
}
