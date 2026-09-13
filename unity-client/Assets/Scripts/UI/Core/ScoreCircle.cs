using System.Collections;
using TMPro;
using UnityEngine;
using UnityEngine.UI;
using CricketStrike.Data;

namespace CricketStrike.UI.Core
{
    public class ScoreCircle : MonoBehaviour
    {
        [Header("UI References")]
        [SerializeField] private Image backgroundCircle;
        [SerializeField] private TextMeshProUGUI scoreText;
        [SerializeField] private RectTransform rectTransform;

        private void Awake()
        {
            if (rectTransform == null) rectTransform = GetComponent<RectTransform>();
        }

        public void ResetCircle()
        {
            if (backgroundCircle != null)
            {
                backgroundCircle.color = new Color(1f, 1f, 1f, 0.15f); // Empty transparent circle
            }
            if (scoreText != null)
            {
                scoreText.text = "";
            }
            transform.localScale = Vector3.one;
        }

        public void SetResult(int runs)
        {
            StopAllCoroutines();
            StartCoroutine(AnimateScorePop(runs));
        }

        private IEnumerator AnimateScorePop(int runs)
        {
            // Initial spring scale up
            float elapsed = 0f;
            float duration = 0.3f;

            if (runs < 0) // Wicket
            {
                if (backgroundCircle != null) backgroundCircle.color = GameConstants.AccentRed;
                if (scoreText != null)
                {
                    scoreText.text = "W";
                    scoreText.color = Color.white;
                }
            }
            else if (runs == 0) // Dot Ball
            {
                if (backgroundCircle != null) backgroundCircle.color = GameConstants.TextMuted;
                if (scoreText != null)
                {
                    scoreText.text = "•";
                    scoreText.color = Color.white;
                }
            }
            else if (runs == 6)
            {
                if (backgroundCircle != null) backgroundCircle.color = GameConstants.AccentGold;
                if (scoreText != null)
                {
                    scoreText.text = "6";
                    scoreText.color = Color.white;
                }
            }
            else if (runs == 4)
            {
                if (backgroundCircle != null) backgroundCircle.color = GameConstants.AccentGreen;
                if (scoreText != null)
                {
                    scoreText.text = "4";
                    scoreText.color = Color.white;
                }
            }
            else
            {
                if (backgroundCircle != null) backgroundCircle.color = GameConstants.AccentBlue;
                if (scoreText != null)
                {
                    scoreText.text = runs.ToString();
                    scoreText.color = Color.white;
                }
            }

            // Spring bounce 1.4 -> 1.0
            while (elapsed < duration)
            {
                elapsed += Time.deltaTime;
                float t = elapsed / duration;
                // Spring overshoot formula
                float scale = 1f + 0.4f * Mathf.Sin(t * Mathf.PI);
                transform.localScale = new Vector3(scale, scale, 1f);
                yield return null;
            }

            transform.localScale = Vector3.one;
        }
    }
}
