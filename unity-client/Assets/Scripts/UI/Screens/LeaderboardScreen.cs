using System;
using System.Collections.Generic;
using TMPro;
using UnityEngine;
using UnityEngine.UI;
using CricketStrike.Data;
using CricketStrike.UI.Core;

namespace CricketStrike.UI.Screens
{
    public class LeaderboardScreen : UIScreen
    {
        [Header("Tabs")]
        [SerializeField] private Button leagueTabBtn;
        [SerializeField] private Button countryTabBtn;
        [SerializeField] private Button worldTabBtn;

        [Header("Season Info")]
        [SerializeField] private TextMeshProUGUI seasonCountdownText;
        [SerializeField] private TextMeshProUGUI prizesSummaryText;

        [Header("Sticky Local Player Rank Row")]
        [SerializeField] private TextMeshProUGUI myRankText;
        [SerializeField] private TextMeshProUGUI myNameText;
        [SerializeField] private TextMeshProUGUI myScoreText;
        [SerializeField] private TextMeshProUGUI myTrendBadgeText;

        [Header("Navigation")]
        [SerializeField] private Button backButton;
        [SerializeField] private Button navHomeBtn;
        [SerializeField] private Button navTeamBtn;
        [SerializeField] private Button navShopBtn;

        private void Awake()
        {
            base.Awake();
            if (backButton != null) backButton.onClick.AddListener(() => UIManager.Instance.Pop());
            if (navHomeBtn != null) navHomeBtn.onClick.AddListener(() => UIManager.Instance.Replace(ScreenType.Home));
            if (navTeamBtn != null) navTeamBtn.onClick.AddListener(() => UIManager.Instance.Replace(ScreenType.TeamManagement));
            if (navShopBtn != null) navShopBtn.onClick.AddListener(() => UIManager.Instance.Replace(ScreenType.Shop));
        }

        public override void OnShow(object data = null)
        {
            base.OnShow(data);

            if (seasonCountdownText != null) seasonCountdownText.text = "🌍 Season Ends: 6d 2h";
            if (prizesSummaryText != null) prizesSummaryText.text = "1st: 1,500💎 • 2nd: 1,000💎 • 3-10: 500💎";

            if (myRankText != null) myRankText.text = "#418,924";
            if (myNameText != null) myNameText.text = "Prajwal 🇮🇳";
            if (myScoreText != null) myScoreText.text = "29,680 🪙";
            if (myTrendBadgeText != null)
            {
                myTrendBadgeText.text = "+6% ▲";
                myTrendBadgeText.color = GameConstants.AccentGreen;
            }
        }
    }
}
