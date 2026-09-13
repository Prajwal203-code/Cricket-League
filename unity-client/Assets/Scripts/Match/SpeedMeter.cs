using System;
using TMPro;
using UnityEngine;
using UnityEngine.UI;

namespace CricketStrike.Match
{
    public class SpeedMeter : MonoBehaviour
    {
        [Header("UI References")]
        [SerializeField] private RectTransform barRect;
        [SerializeField] private RectTransform sliderHandle;
        [SerializeField] private TextMeshProUGUI speedText;
        [SerializeField] private Button lockSpeedButton;

        [Header("Settings")]
        [SerializeField] private float sliderSpeed = 500f;
        [SerializeField] private float minSpeedKmh = 70f;
        [SerializeField] private float maxSpeedKmh = 145f;

        private bool _isMoving;
        private float _sliderNormalizedPos = 0f; // 0.0 top to 1.0 bottom
        private int _direction = 1;
        private float _cardBasePower = 25f;

        public event Action<float, float> OnSpeedLocked; // (speedKmh, multiplier)

        public bool IsMoving => _isMoving;
        public float CurrentSpeedKmh => CalculateSpeedFromNormalizedPos(_sliderNormalizedPos);

        private void Awake()
        {
            if (barRect == null) barRect = GetComponent<RectTransform>();
            if (lockSpeedButton != null) lockSpeedButton.onClick.AddListener(LockSpeed);
        }

        public void StartMeter(float cardBasePower)
        {
            _cardBasePower = cardBasePower;
            _sliderNormalizedPos = 0f;
            _direction = 1;
            _isMoving = true;
            gameObject.SetActive(true);
            UpdateVisuals();
        }

        private void Update()
        {
            if (!_isMoving || barRect == null || sliderHandle == null) return;

            float barHeight = barRect.rect.height;
            if (barHeight <= 0) barHeight = 200f;

            _sliderNormalizedPos += (_sliderSpeed / barHeight) * _direction * Time.deltaTime;

            if (_sliderNormalizedPos >= 1f)
            {
                _sliderNormalizedPos = 1f;
                _direction = -1;
            }
            else if (_sliderNormalizedPos <= 0f)
            {
                _sliderNormalizedPos = 0f;
                _direction = 1;
            }

            UpdateVisuals();
        }

        private void UpdateVisuals()
        {
            if (barRect == null || sliderHandle == null) return;
            float barHeight = barRect.rect.height;
            if (barHeight <= 0) barHeight = 200f;

            sliderHandle.anchoredPosition = new Vector2(0, -(_sliderNormalizedPos * barHeight));

            float speedKmh = CalculateSpeedFromNormalizedPos(_sliderNormalizedPos);
            if (speedText != null)
            {
                speedText.text = $"{speedKmh:F1} km/h";
            }
        }

        public void LockSpeed()
        {
            if (!_isMoving) return;

            _isMoving = false;
            float multiplier = GetSpeedMultiplier(_sliderNormalizedPos);
            float speedKmh = CalculateSpeedFromNormalizedPos(_sliderNormalizedPos);

            OnSpeedLocked?.Invoke(speedKmh, multiplier);
        }

        private float CalculateSpeedFromNormalizedPos(float pos)
        {
            // Max speed in center (green zone ~0.45 - 0.55), lower towards edges
            float baseSpeed = _cardBasePower * 2.5f; // e.g. 30 * 2.5 = 75 km/h to 145 km/h with bonus
            float multiplier = GetSpeedMultiplier(pos);
            return Mathf.Clamp(baseSpeed * multiplier * 1.5f, minSpeedKmh, maxSpeedKmh);
        }

        private float GetSpeedMultiplier(float pos)
        {
            // Distance from center (0.5 is max power)
            float distFromCenter = Mathf.Abs(pos - 0.5f);
            if (distFromCenter <= 0.08f) return 1.0f;     // Perfect Green: 1.0
            if (distFromCenter <= 0.20f) return 0.85f;    // Good Cyan: 0.85
            if (distFromCenter <= 0.35f) return 0.70f;    // Yellow: 0.70
            return 0.55f;                                 // Red: 0.55
        }

        public void Hide()
        {
            _isMoving = false;
            gameObject.SetActive(false);
        }
    }
}
