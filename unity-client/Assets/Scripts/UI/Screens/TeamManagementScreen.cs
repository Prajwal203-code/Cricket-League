using System.Collections.Generic;
using TMPro;
using UnityEngine;
using UnityEngine.UI;
using CricketStrike.Data;
using CricketStrike.UI.Components;
using CricketStrike.UI.Core;

namespace CricketStrike.UI.Screens
{
    public class TeamManagementScreen : UIScreen
    {
        [Header("Header & Tabs")]
        [SerializeField] private Button bowlersTabBtn;
        [SerializeField] private Button batsmenTabBtn;
        [SerializeField] private Button ballsTabBtn;

        [Header("Active Team Container")]
        [SerializeField] private Transform activeCardsContainer;
        [SerializeField] private PlayerCardView cardPrefab;

        [Header("Reserve Cards Container")]
        [SerializeField] private Transform reserveCardsContainer;

        [Header("Upgrade Modal Panel")]
        [SerializeField] private GameObject upgradeModal;
        [SerializeField] private TextMeshProUGUI modalCardNameText;
        [SerializeField] private TextMeshProUGUI modalPowerText;
        [SerializeField] private TextMeshProUGUI modalCopiesProgressText;
        [SerializeField] private Button modalUpgradeBtn;
        [SerializeField] private TextMeshProUGUI modalUpgradeCostText;
        [SerializeField] private Button modalCloseBtn;

        [Header("Navigation")]
        [SerializeField] private Button backButton;
        [SerializeField] private Button navHomeBtn;
        [SerializeField] private Button navShopBtn;
        [SerializeField] private Button navLeaguesBtn;

        private UserPlayerData _user;
        private PlayerCardData _selectedCard;

        protected override void Awake()
        {
            base.Awake();

            if (backButton != null) backButton.onClick.AddListener(() => UIManager.Instance.Pop());
            if (navHomeBtn != null) navHomeBtn.onClick.AddListener(() => UIManager.Instance.Replace(ScreenType.Home));
            if (navShopBtn != null) navShopBtn.onClick.AddListener(() => UIManager.Instance.Replace(ScreenType.Shop));
            if (navLeaguesBtn != null) navLeaguesBtn.onClick.AddListener(() => UIManager.Instance.Replace(ScreenType.Leaderboard));
            if (ballsTabBtn != null) ballsTabBtn.onClick.AddListener(() => UIManager.Instance.Push(ScreenType.BallSkin));

            if (modalCloseBtn != null) modalCloseBtn.onClick.AddListener(() => upgradeModal.SetActive(false));
            if (modalUpgradeBtn != null) modalUpgradeBtn.onClick.AddListener(ExecuteCardUpgrade);
        }

        public override void OnShow(object data = null)
        {
            base.OnShow(data);
            _user = UserPlayerData.CreateDefaultProfile();
            RefreshTeamCards();
            if (upgradeModal != null) upgradeModal.SetActive(false);
        }

        private void RefreshTeamCards()
        {
            if (activeCardsContainer != null)
            {
                foreach (Transform child in activeCardsContainer) Destroy(child.gameObject);

                foreach (var bowler in _user.activeBowlers)
                {
                    if (cardPrefab != null)
                    {
                        var cardView = Instantiate(cardPrefab, activeCardsContainer);
                        cardView.Bind(bowler);
                        cardView.OnCardClicked += OpenCardUpgradeModal;
                    }
                }
            }

            if (reserveCardsContainer != null)
            {
                foreach (Transform child in reserveCardsContainer) Destroy(child.gameObject);

                foreach (var resCard in _user.reserveCards)
                {
                    if (cardPrefab != null)
                    {
                        var cardView = Instantiate(cardPrefab, reserveCardsContainer);
                        cardView.Bind(resCard);
                        cardView.OnCardClicked += OpenCardUpgradeModal;
                    }
                }
            }
        }

        private void OpenCardUpgradeModal(PlayerCardData card)
        {
            _selectedCard = card;
            if (upgradeModal == null || card == null) return;

            upgradeModal.SetActive(true);
            if (modalCardNameText != null) modalCardNameText.text = $"{card.cardName} (Lv.{card.currentLevel})";
            if (modalPowerText != null) modalPowerText.text = $"Power: {card.CurrentPower} (+{(int)(card.basePower * 0.06f)})";
            if (modalCopiesProgressText != null) modalCopiesProgressText.text = $"Cards: {card.currentCopies}/{card.CopiesRequiredForNextLevel}";

            if (modalUpgradeBtn != null)
            {
                modalUpgradeBtn.interactable = card.CanUpgrade;
            }
            if (modalUpgradeCostText != null)
            {
                int cost = card.currentLevel * 500;
                modalUpgradeCostText.text = $"Upgrade • {cost:N0} 🪙";
            }
        }

        private void ExecuteCardUpgrade()
        {
            if (_selectedCard == null || !_selectedCard.CanUpgrade) return;

            _selectedCard.currentCopies -= _selectedCard.CopiesRequiredForNextLevel;
            _selectedCard.currentLevel++;

            OpenCardUpgradeModal(_selectedCard);
            RefreshTeamCards();
        }
    }
}
