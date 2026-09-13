using System;
using TMPro;
using UnityEngine;
using UnityEngine.UI;
using CricketStrike.Data;

namespace CricketStrike.UI.Components
{
    public class TourCardView : MonoBehaviour
    {
        [Header("UI References")]
        [SerializeField] private Image cardBackground;
        [SerializeField] private TextMeshProUGUI tourTitleText;
        [SerializeField] private TextMeshProUGUI tourNumberBadgeText;
        [SerializeField] private TextMeshProUGUI prizeAmountText;
        [SerializeField] private TextMeshProUGUI entryFeeText;
        [SerializeField] private TextMeshProUGUI onlinePlayersText;
        [SerializeField] private Button playButton;
        [SerializeField] private GameObject lockOverlay;

        private TourData _tourData;

        public event Action<TourData> OnTourSelected;

        private void Awake()
        {
            if (playButton != null)
            {
                playButton.onClick.AddListener(() => OnTourSelected?.Invoke(_tourData));
            }
        }

        public void Bind(TourData data)
        {
            _tourData = data;
            if (data == null) return;

            if (tourTitleText != null) tourTitleText.text = data.tourName.ToUpper();
            if (tourNumberBadgeText != null) tourNumberBadgeText.text = $"TOUR {data.tourNumber}";
            if (prizeAmountText != null) prizeAmountText.text = $"{data.prize:N0} 🪙";
            if (entryFeeText != null) entryFeeText.text = $"Fee: {data.entryFee:N0} 🪙";
            if (onlinePlayersText != null) onlinePlayersText.text = $"Online: {data.onlinePlayersCount:N0}";

            if (cardBackground != null)
            {
                cardBackground.color = data.ThemeColor;
            }

            if (lockOverlay != null)
            {
                lockOverlay.SetActive(!data.isUnlocked);
            }

            if (playButton != null)
            {
                playButton.interactable = data.isUnlocked;
            }
        }
    }
}
