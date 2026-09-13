using System;
using UnityEngine;
using UnityEngine.UI;

namespace CricketStrike.Match
{
    public class TimingBar : MonoBehaviour
    {
        [Header("UI References")]
        [SerializeField] private RectTransform barRect;
        [SerializeField] private RectTransform markerRect;
        [SerializeField] private Image markerImage;
        [SerializeField] private Image perfectZoneImg;
        [SerializeField] private Image goodZoneImg;

        [Header("Settings")]
        [SerializeField] private float baseMarkerSpeed = 600f; // px/sec
        [SerializeField] private bool bounceAtEdges = true;

        [Header("Zone Thresholds (Normalized 0.0 top to 1.0 bottom)")]
        [SerializeField] private float perfectZoneMin = 0.44f;
        [SerializeField] private float perfectZoneMax = 0.56f;
        [SerializeField] private float goodZoneMin = 0.30f;
        [SerializeField] private float goodZoneMax = 0.70f;

        private float _currentSpeed;
        private bool _isMoving;
        private float _markerNormalizedPos = 0f; // 0.0 (top) to 1.0 (bottom)
        private int _direction = 1;

        public event Action<TimingResult, float> OnTimingStopped;
        public event Action OnPerfectHit;

        public bool IsMoving => _isMoving;
        public float CurrentNormalizedPos => _markerNormalizedPos;

        private void Awake()
        {
            if (barRect == null) barRect = GetComponent<RectTransform>();
        }

        public void StartTiming(float speedMultiplier = 1.0f)
        {
            _currentSpeed = baseMarkerSpeed * speedMultiplier;
            _markerNormalizedPos = 0f;
            _direction = 1;
            _isMoving = true;
            gameObject.SetActive(true);
            UpdateMarkerVisuals();
        }

        private void Update()
        {
            if (!_isMoving || barRect == null || markerRect == null) return;

            float barHeight = barRect.rect.height;
            if (barHeight <= 0) barHeight = 240f;

            _markerNormalizedPos += (_currentSpeed / barHeight) * _direction * Time.deltaTime;

            if (_markerNormalizedPos >= 1f)
            {
                if (bounceAtEdges)
                {
                    _markerNormalizedPos = 1f;
                    _direction = -1;
                }
                else
                {
                    StopTiming();
                    return;
                }
            }
            else if (_markerNormalizedPos <= 0f)
            {
                if (bounceAtEdges)
                {
                    _markerNormalizedPos = 0f;
                    _direction = 1;
                }
                else
                {
                    _markerNormalizedPos = 0f;
                }
            }

            UpdateMarkerVisuals();
        }

        private void UpdateMarkerVisuals()
        {
            if (barRect == null || markerRect == null) return;
            float barHeight = barRect.rect.height;
            if (barHeight <= 0) barHeight = 240f;

            markerRect.anchoredPosition = new Vector2(0, -(_markerNormalizedPos * barHeight));
        }

        public TimingResult StopTiming()
        {
            if (!_isMoving) return TimingResult.Late;

            _isMoving = false;
            TimingResult result = EvaluateZone(_markerNormalizedPos);

            if (result == TimingResult.Perfect)
            {
                OnPerfectHit?.Invoke();
            }

            OnTimingStopped?.Invoke(result, _markerNormalizedPos);
            return result;
        }

        public TimingResult EvaluateZone(float pos)
        {
            // 0.0 = Top (Early), 0.5 = Center (Perfect), 1.0 = Bottom (Late)
            if (pos >= perfectZoneMin && pos <= perfectZoneMax)
                return TimingResult.Perfect;

            if (pos >= goodZoneMin && pos <= goodZoneMax)
                return TimingResult.Good;

            if (pos < goodZoneMin)
                return TimingResult.Early;

            return TimingResult.Late;
        }

        public void Hide()
        {
            _isMoving = false;
            gameObject.SetActive(false);
        }
    }
}
