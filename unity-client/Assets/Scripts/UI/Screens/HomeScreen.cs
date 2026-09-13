using TMPro;
using UnityEngine;
using UnityEngine.UI;
using CricketStrike.Data;
using CricketStrike.UI.Components;
using CricketStrike.UI.Core;

namespace CricketStrike.UI.Screens
{
    public class HomeScreen : UIScreen
    {
        [Header("Top HUD")]
        [SerializeField] private CoinDisplayBadge coinBadge;
        [SerializeField] private CoinDisplayBadge gemBadge;
        [SerializeField] private TextMeshProUGUI playerNameText;
        [SerializeField] private Image playerAvatar;

        [Header("Center CTA & Hero")]
        [SerializeField] private Button playGoldButton;
        [SerializeField] private Animator heroBatsmanAnimator;
        [SerializeField] private ParticleSystem swingParticleTrail;

        [Header("Quick Access Banners")]
        [SerializeField] private Button worldTourButton;
        [SerializeField] private Button freeCoinsButton;
        [SerializeField] private Button challengesButton;
        [SerializeField] private Button spinWinButton;
        [SerializeField] private Slider challengeProgressBar;

        [Header("Bottom Nav Buttons")]
        [SerializeField] private Button navHomeBtn;
        [SerializeField] private Button navClubsBtn;
        [SerializeField] private Button navTeamBtn;
        [SerializeField] private Button navShopBtn;
        [SerializeField] private Button navLeaguesBtn;

        [Header("Badges")]
        [SerializeField] private GameObject teamNotificationDot;
        [SerializeField] private GameObject shopNotificationDot;

        private UserPlayerData _userData;

        protected override void Awake()
        {
            base.Awake();
            BindButtons();
        }

        private void BindButtons()
        {
            if (playGoldButton != null)
            {
                playGoldButton.onClick.AddListener(() => UIManager.Instance.Push(ScreenType.Matchmaking));
            }
            if (navTeamBtn != null)
            {
                navTeamBtn.onClick.AddListener(() => UIManager.Instance.Push(ScreenType.TeamManagement));
            }
            if (navShopBtn != null)
            {
                navShopBtn.onClick.AddListener(() => UIManager.Instance.Push(ScreenType.Shop));
            }
            if (navLeaguesBtn != null)
            {
                navLeaguesBtn.onClick.AddListener(() => UIManager.Instance.Push(ScreenType.Leaderboard));
            }
        }

        public override void OnShow(object data = null)
        {
            base.OnShow(data);
            _userData = UserPlayerData.CreateDefaultProfile();

            if (coinBadge != null) coinBadge.SetValueImmediate(_userData.coins);
            if (gemBadge != null) gemBadge.SetValueImmediate(_userData.gems);
            if (playerNameText != null) playerNameText.text = _userData.username;

            if (challengeProgressBar != null)
            {
                challengeProgressBar.maxValue = _userData.challengeTargetCoins;
                challengeProgressBar.value = _userData.challengeCurrentCoins;
            }

            if (teamNotificationDot != null) teamNotificationDot.SetActive(true);
            if (shopNotificationDot != null) shopNotificationDot.SetActive(true);
        }

        public void OnHeroBatsmanTapped()
        {
            if (heroBatsmanAnimator != null)
            {
                heroBatsmanAnimator.SetTrigger("Drive");
            }
            if (swingParticleTrail != null)
            {
                swingParticleTrail.Play();
            }
        }
    }
}
