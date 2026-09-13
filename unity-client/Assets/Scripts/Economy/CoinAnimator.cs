using System;
using System.Collections;
using UnityEngine;
using UnityEngine.UI;

namespace CricketStrike.Economy
{
    public class CoinAnimator : MonoBehaviour
    {
        public static CoinAnimator Instance { get; private set; }

        [Header("Coin Prefab & Target")]
        [SerializeField] private GameObject coinSpritePrefab;
        [SerializeField] private RectTransform targetHudBadge;
        [SerializeField] private Canvas uiCanvas;

        private void Awake()
        {
            if (Instance == null) Instance = this;
            else Destroy(gameObject);
        }

        public void PlayCoinShower(Vector3 startScreenPos, int amount, Action onCoinLanded = null)
        {
            StartCoroutine(CoinShowerRoutine(startScreenPos, Mathf.Clamp(amount / 100, 5, 10), onCoinLanded));
        }

        private IEnumerator CoinShowerRoutine(Vector3 startScreenPos, int coinCount, Action onCoinLanded)
        {
            if (coinSpritePrefab == null || targetHudBadge == null || uiCanvas == null) yield break;

            Vector3 endPos = targetHudBadge.position;

            for (int i = 0; i < coinCount; i++)
            {
                var coin = Instantiate(coinSpritePrefab, uiCanvas.transform);
                coin.transform.position = startScreenPos + (Vector3)UnityEngine.Random.insideUnitCircle * 40f;

                StartCoroutine(FlyCoinRoutine(coin, endPos, 0.6f + UnityEngine.Random.Range(-0.1f, 0.1f), onCoinLanded));
                yield return new WaitForSeconds(0.06f);
            }
        }

        private IEnumerator FlyCoinRoutine(GameObject coin, Vector3 endPos, float duration, Action onCoinLanded)
        {
            Vector3 startPos = coin.transform.position;
            Vector3 controlPoint = (startPos + endPos) * 0.5f + Vector3.up * 120f + Vector3.right * UnityEngine.Random.Range(-50f, 50f);

            float elapsed = 0f;
            while (elapsed < duration)
            {
                elapsed += Time.unscaledDeltaTime;
                float t = Mathf.Clamp01(elapsed / duration);

                // Quadratic Bezier Curve
                Vector3 p0 = Vector3.Lerp(startPos, controlPoint, t);
                Vector3 p1 = Vector3.Lerp(controlPoint, endPos, t);
                coin.transform.position = Vector3.Lerp(p0, p1, t);

                yield return null;
            }

            onCoinLanded?.Invoke();
            Destroy(coin);
        }
    }
}
