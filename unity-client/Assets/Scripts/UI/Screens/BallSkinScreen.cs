using System.Collections.Generic;
using TMPro;
using UnityEngine;
using UnityEngine.UI;
using CricketStrike.Data;
using CricketStrike.UI.Core;

namespace CricketStrike.UI.Screens
{
    public class BallSkinScreen : UIScreen
    {
        [Header("Header & Navigation")]
        [SerializeField] private Button backButton;
        [SerializeField] private Button navHomeBtn;
        [SerializeField] private Button navTeamBtn;
        [SerializeField] private Button navShopBtn;

        [Header("Equip Action Panel")]
        [SerializeField] private TextMeshProUGUI selectedSkinNameText;
        [SerializeField] private TextMeshProUGUI selectedSkinQuantityText;
        [SerializeField] private Button equipButton;
        [SerializeField] private TextMeshProUGUI equipBtnLabel;

        [Header("Ball Grid Container")]
        [SerializeField] private Transform ballGridContainer;

        private List<BallSkinData> _ballSkins;
        private BallSkinData _selectedSkin;

        protected override void Awake()
        {
            base.Awake();

            if (backButton != null) backButton.onClick.AddListener(() => UIManager.Instance.Pop());
            if (navHomeBtn != null) navHomeBtn.onClick.AddListener(() => UIManager.Instance.Replace(ScreenType.Home));
            if (navTeamBtn != null) navTeamBtn.onClick.AddListener(() => UIManager.Instance.Replace(ScreenType.TeamManagement));
            if (navShopBtn != null) navShopBtn.onClick.AddListener(() => UIManager.Instance.Replace(ScreenType.Shop));

            if (equipButton != null) equipButton.onClick.AddListener(EquipSelectedSkin);
        }

        public override void OnShow(object data = null)
        {
            base.OnShow(data);
            _ballSkins = new List<BallSkinData>(BallSkinData.GetDefaultSkins());
            SelectSkin(_ballSkins[0]);
        }

        public void SelectSkin(BallSkinData skin)
        {
            _selectedSkin = skin;
            if (skin == null) return;

            if (selectedSkinNameText != null) selectedSkinNameText.text = skin.skinName;
            if (selectedSkinQuantityText != null)
            {
                selectedSkinQuantityText.text = skin.quantity < 0 ? "Quantity: Unlimited" : $"Remaining: {skin.quantity} Balls";
            }

            if (equipButton != null)
            {
                equipButton.interactable = (skin.quantity != 0);
            }
            if (equipBtnLabel != null)
            {
                equipBtnLabel.text = skin.isEquipped ? "EQUIPPED ✓" : "EQUIP BALL";
            }
        }

        private void EquipSelectedSkin()
        {
            if (_selectedSkin == null || _selectedSkin.quantity == 0) return;

            foreach (var skin in _ballSkins)
            {
                skin.isEquipped = (skin.id == _selectedSkin.id);
            }

            SelectSkin(_selectedSkin);
        }
    }
}
