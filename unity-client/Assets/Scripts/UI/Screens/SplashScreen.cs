using System.Collections;
using TMPro;
using UnityEngine;
using UnityEngine.UI;
using CricketStrike.UI.Core;

namespace CricketStrike.UI.Screens
{
    public class SplashScreen : UIScreen
    {
        [Header("Splash Elements")]
        [SerializeField] private RectTransform ballIcon;
        [SerializeField] private Slider loadingBar;
        [SerializeField] private TextMeshProUGUI titleText;
        [SerializeField] private TextMeshProUGUI loadingStatusText;

        [Header("Settings")]
        [SerializeField] private float minimumDuration = 2.5f;

        public override void OnShow(object data = null)
        {
            base.OnShow(data);
            StartCoroutine(SplashLoadingSequence());
        }

        private IEnumerator SplashLoadingSequence()
        {
            if (loadingBar != null) loadingBar.value = 0f;

            float elapsed = 0f;
            while (elapsed < minimumDuration)
            {
                elapsed += Time.deltaTime;
                float progress = Mathf.Clamp01(elapsed / minimumDuration);

                // Rotate cricket ball icon
                if (ballIcon != null)
                {
                    ballIcon.Rotate(0, 0, -360f * Time.deltaTime * 2f);
                }

                if (loadingBar != null)
                {
                    loadingBar.value = progress;
                }

                if (loadingStatusText != null)
                {
                    if (progress < 0.35f) loadingStatusText.text = "Loading Stadium Assets...";
                    else if (progress < 0.70f) loadingStatusText.text = "Connecting to Game Server...";
                    else loadingStatusText.text = "Synchronizing Player Cards...";
                }

                yield return null;
            }

            // Transition to Home Screen
            if (UIManager.Instance != null)
            {
                UIManager.Instance.Replace(ScreenType.Home);
            }
        }
    }
}
