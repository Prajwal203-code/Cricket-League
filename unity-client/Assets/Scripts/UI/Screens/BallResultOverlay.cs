using System.Collections;
using TMPro;
using UnityEngine;
using UnityEngine.UI;
using CricketStrike.Data;
using CricketStrike.UI.Core;

namespace CricketStrike.UI.Screens
{
    public class BallResultOverlay : UIScreen
    {
        [Header("UI Elements")]
        [SerializeField] private TextMeshProUGUI resultMainText; // "6", "4", "OUT!", "1"
        [SerializeField] private TextMeshProUGUI resultSubText;  // "SIX!", "FOUR!", "BOWLED!"
        [SerializeField] private Image bannerBackground;
        [SerializeField] private Image screenEdgeFlash;
        [SerializeField] private RectTransform bannerTransform;
        [SerializeField] private ParticleSystem goldParticleBurst;

        public void ShowBallResult(int runs, bool isWicket)
        {
            OnShow();
            StopAllCoroutines();
            StartCoroutine(ResultAnimationRoutine(runs, isWicket));
        }

        private IEnumerator ResultAnimationRoutine(int runs, bool isWicket)
        {
            if (isWicket)
            {
                if (resultMainText != null)
                {
                    resultMainText.text = "OUT!";
                    resultMainText.color = GameConstants.AccentRed;
                }
                if (resultSubText != null)
                {
                    resultSubText.text = "WICKET!";
                    resultSubText.color = Color.white;
                }
                if (screenEdgeFlash != null)
                {
                    screenEdgeFlash.color = new Color(1f, 0f, 0f, 0.4f);
                    screenEdgeFlash.gameObject.SetActive(true);
                }
            }
            else if (runs == 6)
            {
                if (resultMainText != null)
                {
                    resultMainText.text = "6";
                    resultMainText.color = GameConstants.AccentGold;
                }
                if (resultSubText != null)
                {
                    resultSubText.text = "MAXIMUM SIX!";
                    resultSubText.color = Color.white;
                }
                if (goldParticleBurst != null)
                {
                    goldParticleBurst.Play();
                }
            }
            else if (runs == 4)
            {
                if (resultMainText != null)
                {
                    resultMainText.text = "4";
                    resultMainText.color = GameConstants.AccentGreen;
                }
                if (resultSubText != null)
                {
                    resultSubText.text = "FOUR RUNS!";
                    resultSubText.color = Color.white;
                }
            }
            else if (runs == 0)
            {
                if (resultMainText != null)
                {
                    resultMainText.text = "•";
                    resultMainText.color = GameConstants.TextMuted;
                }
                if (resultSubText != null)
                {
                    resultSubText.text = "DOT BALL";
                    resultSubText.color = GameConstants.TextSecondary;
                }
            }
            else
            {
                if (resultMainText != null)
                {
                    resultMainText.text = runs.ToString();
                    resultMainText.color = GameConstants.AccentBlue;
                }
                if (resultSubText != null)
                {
                    resultSubText.text = runs == 1 ? "SINGLE" : $"{runs} RUNS";
                    resultSubText.color = Color.white;
                }
            }

            // Spring scale-in
            float elapsed = 0f;
            float duration = 1.2f;

            while (elapsed < duration)
            {
                elapsed += Time.unscaledDeltaTime;
                float t = Mathf.Clamp01(elapsed / 0.3f);
                float scale = 1f + 0.35f * Mathf.Sin(t * Mathf.PI);

                if (bannerTransform != null)
                {
                    bannerTransform.localScale = new Vector3(scale, scale, 1f);
                }

                if (screenEdgeFlash != null && screenEdgeFlash.gameObject.activeSelf)
                {
                    screenEdgeFlash.color = Color.Lerp(screenEdgeFlash.color, Color.clear, Time.unscaledDeltaTime * 4f);
                }

                yield return null;
            }

            if (screenEdgeFlash != null) screenEdgeFlash.gameObject.SetActive(false);
            OnHide();
        }
    }
}
