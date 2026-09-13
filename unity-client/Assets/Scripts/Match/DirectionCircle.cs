using System;
using UnityEngine;
using UnityEngine.EventSystems;

namespace CricketStrike.Match
{
    public class DirectionCircle : MonoBehaviour, IDragHandler, IPointerDownHandler, IPointerUpHandler
    {
        [Header("UI References")]
        [SerializeField] private RectTransform circleRect;
        [SerializeField] private RectTransform crosshairRect;
        [SerializeField] private float circleRadius = 55f;

        private Vector2 _normalizedPoint = Vector2.zero; // X: -1 (off) to 1 (leg), Y: -1 (short) to 1 (full)
        private bool _isDragging;

        public event Action<Vector2> OnTargetPositionChanged;
        public event Action<Vector2> OnTargetLocked;

        public Vector2 NormalizedTarget => _normalizedPoint;

        private void Awake()
        {
            if (circleRect == null) circleRect = GetComponent<RectTransform>();
        }

        public void ResetPosition()
        {
            _normalizedPoint = Vector2.zero;
            if (crosshairRect != null) crosshairRect.anchoredPosition = Vector2.zero;
        }

        public void OnPointerDown(PointerEventData eventData)
        {
            _isDragging = true;
            UpdateCrosshair(eventData);
        }

        public void OnDrag(PointerEventData eventData)
        {
            if (!_isDragging) return;
            UpdateCrosshair(eventData);
        }

        public void OnPointerUp(PointerEventData eventData)
        {
            _isDragging = false;
            OnTargetLocked?.Invoke(_normalizedPoint);
        }

        private void UpdateCrosshair(PointerEventData eventData)
        {
            if (circleRect == null || crosshairRect == null) return;

            Vector2 localPoint;
            RectTransformUtility.ScreenPointToLocalPointInRectangle(
                circleRect,
                eventData.position,
                eventData.pressEventCamera,
                out localPoint
            );

            // Clamp within circle boundary
            if (localPoint.magnitude > circleRadius)
            {
                localPoint = localPoint.normalized * circleRadius;
            }

            crosshairRect.anchoredPosition = localPoint;

            // Normalize between -1.0 and 1.0
            _normalizedPoint = new Vector2(localPoint.x / circleRadius, localPoint.y / circleRadius);
            OnTargetPositionChanged?.Invoke(_normalizedPoint);
        }

        public void SetInteractive(bool active)
        {
            gameObject.SetActive(active);
        }
    }
}
