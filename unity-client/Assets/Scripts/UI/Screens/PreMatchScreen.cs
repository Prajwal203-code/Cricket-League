using System.Collections;
using TMPro;
using UnityEngine;
using UnityEngine.UI;
using CricketStrike.Data;
using CricketStrike.UI.Components;
using CricketStrike.UI.Core;

namespace CricketStrike.UI.Screens
{
    public class PreMatchScreen : UIScreen
    {
        [Header("Opponent UI")]
        [SerializeField] private TextMeshProUGUI opponentNameText;
        [SerializeField] private Transform opponentCardsContainer;

        [Header("Local Player UI")]
        [SerializeField] private TextMeshProUGUI localPlayerNameText;
        [SerializeField] private PlayerCardView activeBatsmanCardView;
        [SerializeField] private Button starterBatButton;
        [SerializeField] private Button starBatButton;

        [Header("Countdown & Match Start")]
        [SerializeField] private TextMeshProUGUI matchRoleBannerText; // "YOU BAT FIRST"
        [SerializeField] private TextMeshProUGUI countdownText;
        [SerializeField] private RectTransform countdownTransform;

        private UserPlayerData _user;

        public override void OnShow(object data = null)
        {
            base.OnShow(data);
            _user = UserPlayerData.CreateDefaultProfile();

            if (localPlayerNameText != null) localPlayerNameText.text = $"{_user.username} 🇮🇳";
            if (opponentNameText != null) opponentNameText.text = "Guest_434660435 🇵🇰";

            if (activeBatsmanCardView != null && _user.activeBatsman != null)
            {
                activeBatsmanCardView.Bind(_user.activeBatsman);
            }

            if (matchRoleBannerText != null)
            {
                matchRoleBannerText.text = "YOU BAT FIRST";
            }

            StartCoroutine(CountdownSequence());
        }

        private IEnumerator CountdownSequence()
        {
            int count = 3;
            while (count > 0)
            {
                if (countdownText != null)
                {
                    countdownText.text = $"Match starts in: {count}";
                }
                yield return StartCoroutine(PulseCountdownNumber());
                count--;
            }

            if (countdownText != null)
            {
                countdownText.text = "GO!";
                countdownText.color = GameConstants.AccentGold;
            }

            yield return new WaitForSeconds(0.6f);

            // Hide pre-match screen and enable in-match overlay
            UIManager.Instance.SetHudVisibility(true);
            UIManager.Instance.Push(ScreenType.BattingHUD);
        }

        private IEnumerator PulseCountdownNumber()
        {
            float elapsed = 0f;
            float duration = 1.0f;

            while (elapsed < duration)
            {
                elapsed += Time.deltaTime;
                float t = elapsed / duration;
                float scale = 1f + 0.4f * (1f - t);

                if (countdownTransform != null)
                {
                    countdownTransform.localScale = new Vector3(scale, scale, 1f);
                }
                yield return null;
            }

            if (countdownTransform != null) countdownTransform.localScale = Vector3.one;
        }
    }
}
