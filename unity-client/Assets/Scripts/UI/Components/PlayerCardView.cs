using System;
using TMPro;
using UnityEngine;
using UnityEngine.UI;
using CricketStrike.Data;

namespace CricketStrike.UI.Components
{
    public class PlayerCardView : MonoBehaviour
    {
        [Header("UI Elements")]
        [SerializeField] private Image cardBackground;
        [SerializeField] private Image avatarImage;
        [SerializeField] private TextMeshProUGUI cardNameText;
        [SerializeField] private TextMeshProUGUI roleText;
        [SerializeField] private TextMeshProUGUI powerText;
        [SerializeField] private TextMeshProUGUI levelText;
        [SerializeField] private TextMeshProUGUI rarityBadgeText;
        [SerializeField] private Image rarityBadgeBg;
        [SerializeField] private GameObject upgradeArrow;
        [SerializeField] private Button selectButton;

        private PlayerCardData _cardData;

        public event Action<PlayerCardData> OnCardClicked;

        private void Awake()
        {
            if (selectButton != null)
            {
                selectButton.onClick.AddListener(() => OnCardClicked?.Invoke(_cardData));
            }
        }

        public void Bind(PlayerCardData data)
        {
            _cardData = data;
            if (data == null) return;

            if (cardNameText != null) cardNameText.text = data.cardName;
            if (roleText != null) roleText.text = FormatRoleName(data.role);
            if (powerText != null) powerText.text = data.CurrentPower.ToString();
            if (levelText != null) levelText.text = $"Lv.{data.currentLevel}";

            if (rarityBadgeText != null) rarityBadgeText.text = data.rarity.ToString();
            if (rarityBadgeBg != null) rarityBadgeBg.color = data.RarityColor;
            if (cardBackground != null) cardBackground.color = data.RarityColor * 0.4f + GameConstants.NavyMid * 0.6f;

            if (upgradeArrow != null)
            {
                upgradeArrow.SetActive(data.CanUpgrade);
            }
        }

        private string FormatRoleName(PlayerRole role)
        {
            switch (role)
            {
                case PlayerRole.FastBowler: return "Fast Bowler";
                case PlayerRole.MediumFast: return "Medium Fast";
                case PlayerRole.LegSpinner: return "Leg Spinner";
                case PlayerRole.OffSpinner: return "Off Spinner";
                default: return "Batsman";
            }
        }
    }
}
