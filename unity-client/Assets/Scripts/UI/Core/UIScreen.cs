using System;
using System.Collections;
using UnityEngine;

namespace CricketStrike.UI.Core
{
    [RequireComponent(typeof(CanvasGroup))]
    public abstract class UIScreen : MonoBehaviour
    {
        [SerializeField] private ScreenType screenType;
        [SerializeField] private bool isModal = false;

        private CanvasGroup _canvasGroup;
        private RectTransform _rectTransform;
        private Coroutine _animationCoroutine;

        public ScreenType Type => screenType;
        public bool IsModal => isModal;

        protected virtual void Awake()
        {
            _canvasGroup = GetComponent<CanvasGroup>();
            _rectTransform = GetComponent<RectTransform>();
        }

        public virtual void OnShow(object data = null)
        {
            gameObject.SetActive(true);
            if (_animationCoroutine != null) StopCoroutine(_animationCoroutine);
            _animationCoroutine = StartCoroutine(AnimateInRoutine());
        }

        public virtual void OnHide(Action onComplete = null)
        {
            if (_animationCoroutine != null) StopCoroutine(_animationCoroutine);
            _animationCoroutine = StartCoroutine(AnimateOutRoutine(() =>
            {
                gameObject.SetActive(false);
                onComplete?.Invoke();
            }));
        }

        protected virtual IEnumerator AnimateInRoutine()
        {
            if (_canvasGroup == null) _canvasGroup = GetComponent<CanvasGroup>();
            if (_rectTransform == null) _rectTransform = GetComponent<RectTransform>();

            float duration = isModal ? 0.35f : 0.28f;
            float elapsed = 0f;

            _canvasGroup.alpha = 0f;
            _canvasGroup.interactable = false;
            _canvasGroup.blocksRaycasts = false;

            Vector2 startPos = isModal ? new Vector2(0, -Screen.height * 0.4f) : new Vector2(Screen.width * 0.4f, 0);
            Vector2 endPos = Vector2.zero;

            _rectTransform.anchoredPosition = startPos;

            while (elapsed < duration)
            {
                elapsed += Time.unscaledDeltaTime;
                float t = Mathf.Clamp01(elapsed / duration);

                // Cubic ease-out
                float ease = 1f - Mathf.Pow(1f - t, 3);

                _canvasGroup.alpha = Mathf.Lerp(0f, 1f, t * 1.5f);
                _rectTransform.anchoredPosition = Vector2.Lerp(startPos, endPos, ease);

                yield return null;
            }

            _canvasGroup.alpha = 1f;
            _canvasGroup.interactable = true;
            _canvasGroup.blocksRaycasts = true;
            _rectTransform.anchoredPosition = endPos;
        }

        protected virtual IEnumerator AnimateOutRoutine(Action onComplete)
        {
            if (_canvasGroup == null) _canvasGroup = GetComponent<CanvasGroup>();
            if (_rectTransform == null) _rectTransform = GetComponent<RectTransform>();

            float duration = 0.25f;
            float elapsed = 0f;

            _canvasGroup.interactable = false;
            _canvasGroup.blocksRaycasts = false;

            Vector2 startPos = _rectTransform.anchoredPosition;
            Vector2 endPos = isModal ? new Vector2(0, -Screen.height * 0.4f) : new Vector2(-Screen.width * 0.3f, 0);

            while (elapsed < duration)
            {
                elapsed += Time.unscaledDeltaTime;
                float t = Mathf.Clamp01(elapsed / duration);

                // Cubic ease-in
                float ease = t * t * t;

                _canvasGroup.alpha = Mathf.Lerp(1f, 0f, t);
                _rectTransform.anchoredPosition = Vector2.Lerp(startPos, endPos, ease);

                yield return null;
            }

            _canvasGroup.alpha = 0f;
            onComplete?.Invoke();
        }
    }
}
