using TMPro;
using UnityEngine;
using UnityEngine.UI;
using CricketStrike.Data;
using CricketStrike.UI.Components;
using CricketStrike.UI.Core;

namespace CricketStrike.UI.Screens
{
    public class ShopScreen : UIScreen
    {
        [Header("Top HUD")]
        [SerializeField] private CoinDisplayBadge coinBadge;
        [SerializeField] private CoinDisplayBadge gemBadge;

        [Header("Featured Pack Section")]
        [SerializeField] private TextMeshProUGUI featuredPackTitle;
        [SerializeField] private TextMeshProUGUI featuredPackContents;
        [SerializeField] private Button buyFeaturedPackBtn;
        [SerializeField] private TextMeshProUGUI featuredPackPriceText;

        [Header("Piggy Bank Component")]
        [SerializeField] private PiggyBankView piggyBankView;

        [Header("Navigation")]
        [SerializeField] private Button backButton;
        [SerializeField] private Button navHomeBtn;
        [SerializeField] private Button navTeamBtn;
        [SerializeField] private Button navLeaguesBtn;

        private UserPlayerData _user;

        protected override void Awake()
        {
            base.Awake();

            if (backButton != null) backButton.onClick.AddListener(() => UIManager.Instance.Pop());
            if (navHomeBtn != null) navHomeBtn.onClick.AddListener(() => UIManager.Instance.Replace(ScreenType.Home));
            if (navTeamBtn != null) navTeamBtn.onClick.AddListener(() => UIManager.Instance.Replace(ScreenType.TeamManagement));
            if (navLeaguesBtn != null) navLeaguesBtn.onClick.AddListener(() => UIManager.Instance.Replace(ScreenType.Leaderboard));

            if (buyFeaturedPackBtn != null) buyFeaturedPackBtn.onClick.AddListener(PurchaseFeaturedPack);
            if (piggyBankView != null) piggyBankView.OnOpenRequested += HandlePiggyBankOpen;
        }

        public override void OnShow(object data = null)
        {
            base.OnShow(data);
            _user = UserPlayerData.CreateDefaultProfile();

            if (coinBadge != null) coinBadge.SetValueImmediate(_user.coins);
            if (gemBadge != null) gemBadge.SetValueImmediate(_user.gems);

            if (featuredPackTitle != null) featuredPackTitle.text = "Epic Bowler Pack";
            if (featuredPackContents != null) featuredPackContents.text = "20,000🪙 + Mike (Epic) + 200💎";
            if (featuredPackPriceText != null) featuredPackPriceText.text = "₹199.00";

            if (piggyBankView != null)
            {
                piggyBankView.Bind(_user.piggyBankFill, _user.piggyBankMax, 350, 385, 4000, 2);
            }
        }

        private void PurchaseFeaturedPack()
        {
            _user.coins += 20000;
            _user.gems += 200;
            if (coinBadge != null) coinBadge.AnimateToValue(_user.coins);
            if (gemBadge != null) gemBadge.AnimateToValue(_user.gems);
        }

        private void HandlePiggyBankOpen()
        {
            if (_user.gems >= 350)
            {
                _user.gems -= 350;
                _user.gems += 385;
                _user.coins += 4000;
                _user.piggyBankFill = 0;

                if (coinBadge != null) coinBadge.AnimateToValue(_user.coins);
                if (gemBadge != null) gemBadge.AnimateToValue(_user.gems);

                if (piggyBankView != null)
                {
                    piggyBankView.Bind(_user.piggyBankFill, _user.piggyBankMax, 350, 385, 4000, 2);
                }
            }
        }
    }
}
