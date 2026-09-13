using System.Collections;
using TMPro;
using UnityEngine;
using UnityEngine.UI;

namespace CricketStrike.UI.Components
{
    public class CoinDisplayBadge : MonoBehaviour
    {
        [SerializeField] private TextMeshProUGUI valueText;
        [SerializeField] private Image iconImage;

        private int _currentDisplayedValue;
        private Coroutine _countCoroutine;

        public void SetValueImmediate(int value)
        {
            _currentDisplayedValue = value;
            if (valueText != null)
            {
                valueText.text = value.ToString("N0");
            }
        }

        public void AnimateToValue(int targetValue, float duration = 0.8f)
        {
            if (_countCoroutine != null) StopCoroutine(_countCoroutine);
            _countCoroutine = StartCoroutine(CountUpRoutine(targetValue, duration));
        }

        private IEnumerator CountUpRoutine(int targetValue, float duration)
        {
            int startValue = _currentDisplayedValue;
            float elapsed = 0f;

            while (elapsed < duration)
            {
                elapsed += Time.unscaledDeltaTime;
                float t = Mathf.Clamp01(elapsed / duration);
                // Ease out cubic
                float ease = 1f - Mathf.Pow(1f - t, 3);
                _currentDisplayedValue = Mathf.RoundToInt(Mathf.Lerp(startValue, targetValue, ease));

                if (valueText != null)
                {
                    valueText.text = _currentDisplayedValue.ToString("N0");
                }
                yield return null;
            }

            _currentDisplayedValue = targetValue;
            if (valueText != null)
            {
                valueText.text = _currentDisplayedValue.ToString("N0");
            }
        }
    }
}
