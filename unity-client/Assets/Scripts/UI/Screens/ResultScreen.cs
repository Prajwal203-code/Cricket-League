using System.Collections;
using TMPro;
using UnityEngine;
using UnityEngine.UI;
using CricketStrike.Data;
using CricketStrike.UI.Components;
using CricketStrike.UI.Core;

namespace CricketStrike.UI.Screens
{
    public class ResultScreen : UIScreen
    {
        [Header("Header & Challenge")]
        [SerializeField] private TextMeshProUGUI tourBadgeText;
        [SerializeField] private Slider challengeSlider;
        [SerializeField] private TextMeshProUGUI challengeText;

        [Header("Winner Announcement")]
        [SerializeField] private TextMeshProUGUI winnerBannerText;
        [SerializeField] private GameObject goldCrownIcon;
        [SerializeField] private ParticleSystem confettiParticles;

        [Header("Score Breakdown")]
        [SerializeField] private TextMeshProUGUI p1NameText;
        [SerializeField] private TextMeshProUGUI p2NameText;
        [SerializeField] private TextMeshProUGUI p1ScoreText;
        [SerializeField] private TextMeshProUGUI p2ScoreText;
        [SerializeField] private TextMeshProUGUI coinsEarnedText;

        [Header("Action Buttons")]
        [SerializeField] private Button continueBtn;
        [SerializeField] private Button rematchBtn;
        [SerializeField] private Button chatEmojiBtn;

        protected override void Awake()
        {
            base.Awake();

            if (continueBtn != null)
            {
                continueBtn.onClick.AddListener(() =>
                {
                    UIManager.Instance.SetHudVisibility(false);
                    UIManager.Instance.Replace(ScreenType.Home);
                });
            }

            if (rematchBtn != null)
            {
                rematchBtn.onClick.AddListener(() =>
                {
                    UIManager.Instance.Replace(ScreenType.Matchmaking);
                });
            }
        }

        public void BindResult(bool isPlayerWinner, int p1Score, int p2Score, int prizeCoins)
        {
            OnShow();

            if (p1NameText != null) p1NameText.text = "Prajwal 🇮🇳 ⭐30";
            if (p2NameText != null) p2NameText.text = "Guest_434660 🇵🇰 ⭐32";

            if (p1ScoreText != null) p1ScoreText.text = p1Score.ToString();
            if (p2ScoreText != null) p2ScoreText.text = p2Score.ToString();

            if (isPlayerWinner)
            {
                if (winnerBannerText != null)
                {
                    winnerBannerText.text = "YOU WIN!";
                    winnerBannerText.color = GameConstants.AccentGold;
                }
                if (goldCrownIcon != null) goldCrownIcon.SetActive(true);
                if (confettiParticles != null) confettiParticles.Play();
                if (coinsEarnedText != null) coinsEarnedText.text = $"+{prizeCoins:N0} 🪙";
            }
            else
            {
                if (winnerBannerText != null)
                {
                    winnerBannerText.text = "MATCH LOST";
                    winnerBannerText.color = GameConstants.AccentRed;
                }
                if (goldCrownIcon != null) goldCrownIcon.SetActive(false);
                if (coinsEarnedText != null) coinsEarnedText.text = "+50 🪙 (Consolation)";
            }

            if (challengeSlider != null)
            {
                challengeSlider.maxValue = 500000;
                challengeSlider.value = 251700 + prizeCoins;
            }
            if (challengeText != null)
            {
                challengeText.text = $"Earn 500,000 coins • {251700 + prizeCoins:N0}/500,000";
            }
        }
    }
}
